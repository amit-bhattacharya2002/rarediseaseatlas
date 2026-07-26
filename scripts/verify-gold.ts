/**
 * Reviewer-assisted gold-standard verification.
 *
 * Prepare evidence:
 *   npm run verify:gold
 *   npm run verify:gold -- --code 5
 *   npm run verify:gold -- --limit 5
 *
 * This writes tests/gold-review.json. A human must:
 *   1. mark each sampled candidate trial relevant=true|false|"uncertain"|"relevant-to-parent-category"
 *   2. add relevant NCT IDs found independently to additionalRelevantNctIds
 *   3. set publications.reviewedRange and publications.reviewed=true
 *   4. add reviewNotes and set reviewedBy
 *
 * Apply completed reviews:
 *   npm run verify:gold -- --apply
 *
 * The script never invents verdicts and refuses to apply incomplete packets.
 */

import fs from "node:fs";
import path from "node:path";
import { loadOrphanetDiseases } from "./lib/orphanet";
import { loadMondoHierarchy } from "./lib/mondo";
import { collectExactSynonyms, collectIdentifiers } from "./lib/identifiers";
import { resolveMeshLabels } from "./lib/mesh";
import {
  buildPhraseTerms,
  buildRecallExpansionTerms,
  isNameParentCollapse,
  novelRecallTerms,
  normalizeTerm,
  parentCategoryLabelForTrials,
  parentLabelsForRecall,
  phraseQueryFromTerms,
  uniqueTerms,
} from "./lib/query-build";
import {
  buildMeshQuery,
  fetchPublicationHitCount,
} from "./lib/europepmc";
import { fetchTrialSignals, phrasePresent } from "./lib/trials";
import { loadGenCC, lookupGenCC } from "./lib/gencc";
import { log } from "./lib/logger";
import {
  buildBenchmarkBroadTerms,
  normalizeBenchmarkText as normalize,
  uniqueBenchmarkTerms,
} from "./lib/automated-benchmark";
import type { TrialRecord } from "../src/lib/types";

type Verdict =
  | true
  | false
  | "uncertain"
  | "relevant-to-parent-category"
  | null;
const REVIEW_SAMPLE_PER_DISEASE = 15;
const BROAD_SAMPLE_PER_DISEASE = 10;
const ATTENTION_CHECKS = 10;

interface GoldEntry {
  orphaCode: string;
  name: string;
  manualAliases?: string[];
  verifiedOn: string;
  trueTrialCount: number;
  truePublicationRange: [number, number];
  knownDifficulty: string;
  notes: string;
  knownRelevantNctIds?: string[];
  knownIrrelevantNctIds?: string[];
  uncertainNctIds?: string[];
  /** Broader-category matches — not counted in trueTrialCount. */
  knownParentCategoryNctIds?: string[];
  reviewedBy?: string;
  verificationNotes?: string;
}

interface GoldFile {
  note: string;
  source: string;
  entries: GoldEntry[];
}

interface ReviewTrial {
  nctId: string;
  title: string;
  conditions: string[];
  studyType: string | null;
  status: string;
  matchedVia: "mesh" | "phrase" | "both" | null;
  url: string;
  relevant: Verdict;
  reason: string;
  discoveredVia: "pipeline" | "broad" | "both";
  /**
   * True when the study looks like a blocked name-parent match (subtype →
   * parent). Prefer relevant-to-parent-category over true/false when unsure.
   */
  likelyParentCategory?: boolean;
  /** Review in sittings of roughly 50 without changing the sample. */
  reviewSession: number;
  /** Set true only after a hidden-suggestion disagreement is rechecked. */
  disagreementReviewed?: boolean;
}

interface ReviewEntry {
  orphaCode: string;
  goldName: string;
  orphanetName: string;
  definition: string | null;
  knownDifficulty: string;
  queries: {
    phrase: string;
    mesh: string;
    clinicalTrials: string;
    broadTerms: string[];
    broadClinicalTrials: string;
    meshLabels: string[];
    /** Singular Mondo name-parent used for the parent-category tier, if any. */
    parentCategoryLabel: string | null;
  };
  publications: {
    phraseCount: number | null;
    meshCount: number | null;
    unionCount: number | null;
    previousRange: [number, number];
    reviewedRange: [number, number] | null;
    reviewed: boolean;
  };
  trials: {
    pipelineTotal: number | null;
    broadSearchTotal: number | null;
    broadOnlyPopulation: number;
    fullyScanned: boolean;
    excludedNonInterventional: number;
    reviewSampleSize: number;
    candidates: ReviewTrial[];
    /** NCT IDs discovered through independent/manual searches. */
    additionalRelevantNctIds: string[];
  };
  reviewNotes: string;
  reviewedBy: string;
  reviewedOn: string | null;
  fetchError: string | null;
}

interface ReviewFile {
  generatedAt: string;
  instructions: string[];
  entries: ReviewEntry[];
}

interface Args {
  apply: boolean;
  code: string | null;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, code: null, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--code") {
      args.code = argv[++i] ?? null;
      if (!args.code) throw new Error("--code requires an ORPHAcode");
    } else if (argv[i] === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      args.limit = n;
    }
  }
  return args;
}

function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function uniqueNctIds(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((id) => id.trim().toUpperCase())
        .filter((id) => /^NCT\d{8}$/.test(id))
    ),
  ].sort();
}

function hasExactConditionSuggestion(
  conditions: string[],
  labels: string[]
): boolean {
  const normalizedLabels = labels
    .map(normalize)
    .filter((label) => label.length >= 5);
  return conditions.some((condition) => {
    const candidate = normalize(condition);
    return normalizedLabels.some((label) => candidate === label);
  });
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicSample<T extends { nctId: string }>(
  values: T[],
  orphaCode: string,
  size = REVIEW_SAMPLE_PER_DISEASE
): T[] {
  return [...values]
    .sort(
      (a, b) =>
        stableHash(`${orphaCode}:${a.nctId}`) -
          stableHash(`${orphaCode}:${b.nctId}`) ||
        a.nctId.localeCompare(b.nctId)
    )
    .slice(0, size);
}

function applyReviews(goldPath: string, reviewPath: string): void {
  const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as GoldFile;
  if (!fs.existsSync(reviewPath)) {
    throw new Error(
      `Missing ${reviewPath}. Run npm run verify:gold before --apply.`
    );
  }
  const review = JSON.parse(
    fs.readFileSync(reviewPath, "utf8")
  ) as ReviewFile;
  const byCode = new Map(review.entries.map((entry) => [entry.orphaCode, entry]));
  const errors: string[] = [];
  let applied = 0;
  let attentionTotal = 0;
  let attentionCaught = 0;

  for (const entry of gold.entries) {
    if (!/^\d+$/.test(entry.orphaCode)) continue;
    const packet = byCode.get(entry.orphaCode);
    if (!packet) continue;

    if (packet.fetchError) {
      errors.push(
        `ORPHA:${entry.orphaCode}: evidence fetch failed (${packet.fetchError})`
      );
    }
    if (!packet.trials.fullyScanned) {
      errors.push(
        `ORPHA:${entry.orphaCode}: ClinicalTrials.gov result set was not fully scanned`
      );
    }
    const hiddenSuggestionLabels = [
      packet.orphanetName,
      packet.goldName,
      ...packet.queries.meshLabels,
      ...(entry.manualAliases ?? []),
    ];
    for (const trial of packet.trials.candidates) {
      if (trial.studyType !== "INTERVENTIONAL") {
        attentionTotal += 1;
        if (trial.relevant === false) attentionCaught += 1;
        continue;
      }
      const hiddenSuggestion = hasExactConditionSuggestion(
        trial.conditions,
        hiddenSuggestionLabels
      );
      if (
        hiddenSuggestion &&
        (trial.relevant === false || trial.relevant === "uncertain") &&
        !trial.disagreementReviewed
      ) {
        errors.push(
          `ORPHA:${entry.orphaCode} ${trial.nctId}: verdict disagrees with a hidden exact-condition suggestion; recheck and set disagreementReviewed=true to keep it`
        );
      }
    }
    const undecided = packet.trials.candidates.filter(
      (trial) => trial.relevant == null || !trial.reason.trim()
    );
    if (undecided.length > 0) {
      errors.push(
        `ORPHA:${entry.orphaCode}: ${undecided.length} trial verdict(s) or reasons missing`
      );
    }
    if (
      !packet.publications.reviewed ||
      packet.publications.reviewedRange == null
    ) {
      errors.push(`ORPHA:${entry.orphaCode}: publication range not reviewed`);
    }
    if (!packet.reviewedBy.trim() || !packet.reviewedOn) {
      errors.push(`ORPHA:${entry.orphaCode}: reviewer/date missing`);
    }
    if (undecided.length > 0 || !packet.publications.reviewedRange) continue;

    const relevant = uniqueNctIds([
      ...packet.trials.candidates
        .filter(
          (trial) =>
            trial.studyType === "INTERVENTIONAL" &&
            trial.relevant === true
        )
        .map((trial) => trial.nctId),
      ...packet.trials.additionalRelevantNctIds,
    ]);
    const irrelevant = uniqueNctIds(
      packet.trials.candidates
        .filter(
          (trial) =>
            trial.studyType === "INTERVENTIONAL" &&
            trial.discoveredVia !== "broad" &&
            trial.relevant === false
        )
        .map((trial) => trial.nctId)
    );
    const uncertain = uniqueNctIds(
      packet.trials.candidates
        .filter(
          (trial) =>
            trial.studyType === "INTERVENTIONAL" &&
            trial.relevant === "uncertain"
        )
        .map((trial) => trial.nctId)
    );
    const parentCategory = uniqueNctIds(
      packet.trials.candidates
        .filter(
          (trial) =>
            trial.studyType === "INTERVENTIONAL" &&
            trial.relevant === "relevant-to-parent-category"
        )
        .map((trial) => trial.nctId)
    );

    entry.knownRelevantNctIds = relevant;
    entry.knownIrrelevantNctIds = irrelevant;
    entry.uncertainNctIds = uncertain;
    entry.knownParentCategoryNctIds = parentCategory;
    // Uncertain / parent-category trials are not disease-true ground truth.
    entry.trueTrialCount = relevant.length;
    entry.truePublicationRange = packet.publications.reviewedRange;
    entry.verifiedOn = packet.reviewedOn ?? entry.verifiedOn;
    entry.reviewedBy = packet.reviewedBy;
    entry.verificationNotes = packet.reviewNotes;
    applied += 1;
  }

  if (attentionTotal < ATTENTION_CHECKS) {
    errors.push(
      `Review contains only ${attentionTotal}/${ATTENTION_CHECKS} attention checks; regenerate the full packet`
    );
  } else if (attentionCaught < 8) {
    errors.push(
      `Attention check score ${attentionCaught}/${attentionTotal} is below 8/${ATTENTION_CHECKS}; redo the review session`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Review file is incomplete; gold standard was not changed:\n- ${errors.join(
        "\n- "
      )}`
    );
  }

  writeJsonAtomic(goldPath, gold);
  log.info(`Applied ${applied} completed review packet(s) to ${goldPath}`);
}

async function prepareReviews(
  goldPath: string,
  reviewPath: string,
  args: Args
): Promise<void> {
  const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as GoldFile;
  const previous: ReviewFile | null = fs.existsSync(reviewPath)
    ? (JSON.parse(fs.readFileSync(reviewPath, "utf8")) as ReviewFile)
    : null;
  const previousByCode = new Map(
    (previous?.entries ?? []).map((entry) => [entry.orphaCode, entry])
  );

  const {
    diseases,
    orphaMondoByCode,
    allOrphaCodes,
  } = await loadOrphanetDiseases();
  const byCode = new Map(diseases.map((disease) => [disease.orphaCode, disease]));
  const mondo = await loadMondoHierarchy();
  const gencc = await loadGenCC();
  const attentionPool: Array<{ orphaCode: string; trial: TrialRecord }> = [];

  let selected = gold.entries.filter((entry) => /^\d+$/.test(entry.orphaCode));
  if (args.code) {
    selected = selected.filter((entry) => entry.orphaCode === args.code);
    if (selected.length === 0) {
      throw new Error(`ORPHA:${args.code} is not in tests/gold-standard.json`);
    }
  }
  if (args.limit != null) selected = selected.slice(0, args.limit);

  const prepared: ReviewEntry[] = [];
  for (let i = 0; i < selected.length; i += 1) {
    const goldEntry = selected[i];
    log.info(
      `[${i + 1}/${selected.length}] Preparing ORPHA:${goldEntry.orphaCode} ${goldEntry.name}`
    );
    if (!allOrphaCodes.has(goldEntry.orphaCode)) {
      throw new Error(
        `ORPHA:${goldEntry.orphaCode} (${goldEntry.name}) is absent from Orphanet`
      );
    }

    const od = byCode.get(goldEntry.orphaCode);
    const orphanetName = od?.name ?? goldEntry.name.split(" / ")[0];
    const synonyms = od?.synonyms ?? [];
    const mondoIds =
      od?.mondoIds ?? orphaMondoByCode.get(goldEntry.orphaCode) ?? [];
    const identifiers = collectIdentifiers(mondoIds, mondo);
    const mondoSynonyms = collectExactSynonyms(mondoIds, mondo);
    const meshLabels = await resolveMeshLabels(identifiers.mesh);
    const nameTerms = [
      orphanetName,
      goldEntry.name.split(" / ")[0],
      ...(goldEntry.manualAliases ?? []),
    ];
    const { terms: publicationTerms } = buildPhraseTerms(
      nameTerms,
      [...synonyms, ...mondoSynonyms]
    );
    const { terms: phraseTerms } = buildPhraseTerms(
      [orphanetName],
      [...synonyms, ...mondoSynonyms]
    );
    const parentLabels = parentLabelsForRecall(
      mondoIds,
      (id, maxDepth) => mondo.ancestors(id, maxDepth),
      (id) => mondo.label(id),
      orphanetName
    );
    const parentCategoryLabel = parentCategoryLabelForTrials(
      mondoIds,
      (id, maxDepth) => mondo.ancestors(id, maxDepth),
      (id) => mondo.label(id),
      orphanetName
    );
    const gene = lookupGenCC(gencc, mondoIds, goldEntry.orphaCode);
    const recallTerms = novelRecallTerms(
      phraseTerms,
      buildRecallExpansionTerms({
        name: orphanetName,
        synonyms,
        mondoSynonyms,
        parentLabels,
        genes: gene.genes,
      })
    );
    const pipelineTerms = uniqueTerms([...phraseTerms, ...recallTerms]);
    const broadTerms = buildBenchmarkBroadTerms({
      seed: goldEntry,
      orphanetName,
      synonyms,
      mondoSynonyms,
      parentLabels,
      genes: gene.genes,
    }).filter(
      (term) =>
        !pipelineTerms.some(
          (pipelineTerm) => normalize(pipelineTerm) === normalize(term)
        )
    );
    const phraseQuery = phraseQueryFromTerms(publicationTerms);
    const meshQuery = buildMeshQuery(meshLabels);
    const unionQuery = meshQuery
      ? `(${phraseQuery}) OR (${meshQuery})`
      : phraseQuery;

    const old = previousByCode.get(goldEntry.orphaCode);
    const oldTrialById = new Map(
      (old?.trials.candidates ?? []).map((trial) => [trial.nctId, trial])
    );

    const packet: ReviewEntry = {
      orphaCode: goldEntry.orphaCode,
      goldName: goldEntry.name,
      orphanetName,
      definition: od?.definition ?? null,
      knownDifficulty: goldEntry.knownDifficulty,
      queries: {
        phrase: phraseQuery,
        mesh: meshQuery,
        clinicalTrials: "",
        broadTerms,
        broadClinicalTrials: "",
        meshLabels,
        parentCategoryLabel,
      },
      publications: {
        phraseCount: null,
        meshCount: null,
        unionCount: null,
        previousRange: goldEntry.truePublicationRange,
        reviewedRange: old?.publications.reviewedRange ?? null,
        reviewed: old?.publications.reviewed ?? false,
      },
      trials: {
        pipelineTotal: null,
        broadSearchTotal: null,
        broadOnlyPopulation: 0,
        fullyScanned: false,
        excludedNonInterventional: 0,
        reviewSampleSize: 0,
        candidates: [],
        additionalRelevantNctIds:
          old?.trials.additionalRelevantNctIds ??
          goldEntry.knownRelevantNctIds ??
          [],
      },
      reviewNotes: old?.reviewNotes ?? "",
      reviewedBy: old?.reviewedBy ?? "",
      reviewedOn: old?.reviewedOn ?? null,
      fetchError: null,
    };

    try {
      const [
        phraseCount,
        meshCount,
        unionCount,
        pipelineTrials,
        broadTrials,
      ] = await Promise.all([
        fetchPublicationHitCount(phraseQuery),
        meshQuery ? fetchPublicationHitCount(meshQuery) : Promise.resolve(0),
        fetchPublicationHitCount(unionQuery),
        fetchTrialSignals(phraseTerms, meshLabels, recallTerms),
        broadTerms.length > 0
          ? fetchTrialSignals(broadTerms, [])
          : Promise.resolve(null),
      ]);
      packet.publications.phraseCount = phraseCount;
      packet.publications.meshCount = meshCount;
      packet.publications.unionCount = unionCount;
      packet.queries.clinicalTrials = pipelineTrials.query;
      packet.queries.broadClinicalTrials = broadTrials?.query ?? "";
      packet.trials.pipelineTotal = pipelineTrials.total;
      packet.trials.broadSearchTotal = broadTrials?.total ?? 0;
      packet.trials.fullyScanned =
        pipelineTrials.fullyScanned && (broadTrials?.fullyScanned ?? true);
      packet.trials.excludedNonInterventional =
        pipelineTrials.excludedNonInterventional;

      const pipelineIds = new Set(
        pipelineTrials.matchedStudies.map((trial) => trial.nctId)
      );
      const broadMatched = broadTrials?.matchedStudies ?? [];
      const broadIds = new Set(broadMatched.map((trial) => trial.nctId));
      const broadOnly = broadMatched.filter(
        (trial) => !pipelineIds.has(trial.nctId)
      );
      packet.trials.broadOnlyPopulation = broadOnly.length;

      const precisionSample = deterministicSample(
        pipelineTrials.matchedStudies,
        goldEntry.orphaCode
      );
      const recallSample = deterministicSample(
        broadOnly,
        `broad:${goldEntry.orphaCode}`,
        BROAD_SAMPLE_PER_DISEASE
      );
      const reviewSample = [
        ...precisionSample.map((trial) => ({
          trial,
          discoveredVia: broadIds.has(trial.nctId)
            ? ("both" as const)
            : ("pipeline" as const),
        })),
        ...recallSample.map((trial) => ({
          trial,
          discoveredVia: "broad" as const,
        })),
      ];
      packet.trials.reviewSampleSize = reviewSample.length;
      packet.trials.candidates = reviewSample.map(
        ({ trial, discoveredVia }) => {
        const prior = oldTrialById.get(trial.nctId);
        const conditions = trial.conditions ?? [];
        const likelyParentCategory = Boolean(
          parentCategoryLabel &&
            conditions.some((condition) => {
              const hay = normalizeTerm(condition);
              const needle = normalizeTerm(parentCategoryLabel);
              return (
                phrasePresent(hay, needle) &&
                isNameParentCollapse(orphanetName, parentCategoryLabel)
              );
            })
        );
        return {
          nctId: trial.nctId,
          title: trial.title,
          conditions,
          studyType: trial.studyType ?? null,
          status: trial.status,
          matchedVia: trial.matchedVia ?? null,
          url: trial.url,
          relevant: prior?.relevant ?? null,
          reason: prior?.reason ?? "",
          discoveredVia,
          ...(likelyParentCategory ? { likelyParentCategory: true } : {}),
          reviewSession: 0,
          ...(prior?.disagreementReviewed
            ? { disagreementReviewed: true }
            : {}),
        };
        }
      );

      for (const trial of [
        ...pipelineTrials.observationalStudies,
        ...pipelineTrials.expandedAccessStudies,
      ]) {
        attentionPool.push({ orphaCode: goldEntry.orphaCode, trial });
      }
      // Targeted refreshes preserve previously planted attention checks.
      if (args.code || args.limit != null) {
        for (const trial of old?.trials.candidates ?? []) {
          if (
            trial.studyType !== "INTERVENTIONAL" &&
            !packet.trials.candidates.some(
              (candidate) => candidate.nctId === trial.nctId
            )
          ) {
            packet.trials.candidates.push(trial);
          }
        }
      }
    } catch (error) {
      packet.fetchError = String(error);
      log.warn(
        `ORPHA:${goldEntry.orphaCode}: evidence fetch failed: ${String(error)}`
      );
    }
    prepared.push(packet);
  }

  if (!args.code && args.limit == null) {
    const attentionChecks = [...attentionPool]
      .sort(
        (a, b) =>
          stableHash(`attention:${a.orphaCode}:${a.trial.nctId}`) -
            stableHash(`attention:${b.orphaCode}:${b.trial.nctId}`) ||
          a.trial.nctId.localeCompare(b.trial.nctId)
      )
      .slice(0, ATTENTION_CHECKS);
    for (const { orphaCode, trial } of attentionChecks) {
      const packet = prepared.find((entry) => entry.orphaCode === orphaCode);
      if (!packet) continue;
      const prior = previousByCode
        .get(orphaCode)
        ?.trials.candidates.find((candidate) => candidate.nctId === trial.nctId);
      packet.trials.candidates.push({
        nctId: trial.nctId,
        title: trial.title,
        conditions: trial.conditions ?? [],
        studyType: trial.studyType ?? null,
        status: trial.status,
        matchedVia: trial.matchedVia ?? null,
        url: trial.url,
        relevant: prior?.relevant ?? null,
        reason: prior?.reason ?? "",
        discoveredVia: "pipeline",
        reviewSession: 0,
      });
    }
  }

  // A targeted --code/--limit refresh preserves packets outside the selection.
  const selectedCodes = new Set(prepared.map((entry) => entry.orphaCode));
  const entries = [
    ...prepared,
    ...(previous?.entries ?? []).filter(
      (entry) => !selectedCodes.has(entry.orphaCode)
    ),
  ].sort((a, b) => Number(a.orphaCode) - Number(b.orphaCode));

  const sessionOrder = entries
    .flatMap((entry) =>
      entry.trials.candidates.map((trial) => ({
        orphaCode: entry.orphaCode,
        trial,
      }))
    )
    .sort(
      (a, b) =>
        stableHash(`session:${a.orphaCode}:${a.trial.nctId}`) -
          stableHash(`session:${b.orphaCode}:${b.trial.nctId}`) ||
        a.trial.nctId.localeCompare(b.trial.nctId)
    );
  sessionOrder.forEach(({ trial }, index) => {
    trial.reviewSession = Math.floor(index / 50) + 1;
  });

  const review: ReviewFile = {
    generatedAt: new Date().toISOString(),
    instructions: [
      "Do not treat this generated packet as ground truth.",
      "Only INTERVENTIONAL studies enter the clinical-trial metric; excludedNonInterventional is reported separately.",
      `Pipeline candidates are a seeded hash draw across the full result set—not the first ${REVIEW_SAMPLE_PER_DISEASE} returned by ClinicalTrials.gov.`,
      `Up to ${BROAD_SAMPLE_PER_DISEASE} broad-only candidates per disease expose possible false negatives using genes, Mondo parents, shortest synonyms, and rare significant words.`,
      "Mechanical exact-condition suggestions are hidden until --apply; disagreements are then stopped for a second look.",
      `Ten non-interventional known-bad attention checks are planted without labels. Catch at least eight or --apply refuses the session.`,
      "Use reviewSession to work in deterministic sittings of about 50 candidates.",
      'For every candidate, set relevant to true, false, "uncertain", or "relevant-to-parent-category" and write a one-sentence reason.',
      'Use "relevant-to-parent-category" when the study is about a broader named disease that contains this entity (e.g. Gaucher disease for Gaucher disease type 3), not a confirmed subtype-specific match. Candidates with likelyParentCategory=true are the usual cases.',
      "Parent-category verdicts are stored separately and do not count toward trueTrialCount.",
      "Search ClinicalTrials.gov independently; add known relevant IDs to additionalRelevantNctIds for recall measurement.",
      "Inspect phrase, MeSH, and union Europe PMC results; set reviewedRange and reviewed=true.",
      "Set reviewedBy, reviewedOn (YYYY-MM-DD), and reviewNotes.",
      "Run npm run verify:gold -- --apply; it refuses incomplete packets.",
    ],
    entries,
  };
  writeJsonAtomic(reviewPath, review);
  log.info(
    `Wrote ${prepared.length} prepared packet(s) (${entries.length} total) to ${reviewPath}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const goldPath = path.join(process.cwd(), "tests", "gold-standard.json");
  const reviewPath = path.join(process.cwd(), "tests", "gold-review.json");
  if (args.apply) applyReviews(goldPath, reviewPath);
  else await prepareReviews(goldPath, reviewPath, args);
}

main().catch((error) => {
  log.error(String(error));
  process.exit(1);
});
