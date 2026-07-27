/**
 * Nightly cadence: re-query ClinicalTrials.gov only for diseases with
 * trials.total === 0 and queryHealth.status !== "broken".
 *
 *   npx tsx scripts/refresh-zero-trials.ts
 *   npx tsx scripts/refresh-zero-trials.ts --limit 20
 *
 * Bypasses .cache/ reads. Writes only trials.* + lastTrialCheck (+ sourceErrors.trials).
 * Appends one line to data/refresh-log.jsonl. Does not touch publications/GenCC/Mondo/India.
 */
import fs from "node:fs";
import path from "node:path";
import { setCacheReadsDisabled } from "./lib/cache";
import {
  buildPhraseTerms,
  buildRecallExpansionTerms,
  capRecallGenes,
  novelRecallTerms,
  parentCategoryLabelForTrials,
  parentLabelsForRecall,
} from "./lib/query-build";
import {
  fetchParentCategoryTrials,
  fetchTrialSignals,
} from "./lib/trials";
import { loadMondoHierarchy } from "./lib/mondo";
import { collectExactSynonyms } from "./lib/identifiers";
import { deriveArtifact } from "./lib/derive";
import { appendRefreshLog } from "./lib/refresh-log";
import { log } from "./lib/logger";
import { readArtifact, writeArtifact } from "./lib/artifact-io";
import type { DiseaseRecord, DiseasesArtifact, MatchStrategy } from "../src/lib/types";

function parseLimit(argv: string[]): number | null {
  const i = argv.indexOf("--limit");
  if (i < 0) return null;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("--limit requires a positive integer");
  }
  return n;
}

function writeAtomic(_file: string, value: unknown): void {
  writeArtifact(value as DiseasesArtifact);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNightlyFieldDiscipline(
  before: DiseasesArtifact,
  after: DiseasesArtifact,
  touchedCodes: Set<string>
): void {
  if (JSON.stringify(before.sourceVersions) !== JSON.stringify(after.sourceVersions)) {
    throw new Error("Nightly refresh must not change sourceVersions");
  }
  if (before.diseases.length !== after.diseases.length) {
    throw new Error(
      `Nightly refresh changed row count ${before.diseases.length} → ${after.diseases.length}`
    );
  }
  const beforeBy = new Map(before.diseases.map((d) => [d.orphaCode, d]));
  for (const d of after.diseases) {
    const prev = beforeBy.get(d.orphaCode);
    if (!prev) throw new Error(`Nightly refresh introduced ORPHA:${d.orphaCode}`);
    if (!touchedCodes.has(d.orphaCode)) {
      // Untouched rows must be byte-identical aside from derive-recomputed fields.
      const stripDerived = (row: DiseaseRecord) => {
        const {
          confidence: _c,
          confidenceReasons: _cr,
          queryHealth: _qh,
          excludeFromNeglect: _e,
          publicationsPercentile: _pp,
          trialsPercentile: _tp,
          ...rest
        } = row;
        return rest;
      };
      if (
        JSON.stringify(stripDerived(prev)) !== JSON.stringify(stripDerived(d))
      ) {
        throw new Error(
          `Nightly refresh mutated non-trial fields on untouched ORPHA:${d.orphaCode}`
        );
      }
      continue;
    }
    // Touched: publications / gene / india / identity must be unchanged.
    if (JSON.stringify(prev.publications) !== JSON.stringify(d.publications)) {
      throw new Error(`ORPHA:${d.orphaCode}: publications changed in nightly`);
    }
    if (
      JSON.stringify(prev.geneDiseaseValidity) !==
      JSON.stringify(d.geneDiseaseValidity)
    ) {
      throw new Error(`ORPHA:${d.orphaCode}: geneDiseaseValidity changed in nightly`);
    }
    if (JSON.stringify(prev.indiaNprd) !== JSON.stringify(d.indiaNprd)) {
      throw new Error(`ORPHA:${d.orphaCode}: indiaNprd changed in nightly`);
    }
    if (prev.name !== d.name || prev.nameCorrected !== d.nameCorrected) {
      throw new Error(`ORPHA:${d.orphaCode}: name fields changed in nightly`);
    }
  }
}

async function refreshOne(
  d: DiseaseRecord,
  mondo: Awaited<ReturnType<typeof loadMondoHierarchy>>
): Promise<{ transitioned: boolean; error: string | null }> {
  const checkedAt = new Date().toISOString();
  try {
    const nameTerms = d.nameCorrected ? [d.name, d.nameCorrected] : [d.name];
    const allSyn = [...d.synonyms, ...d.mondoSynonyms];
    const { terms: phraseTerms } = buildPhraseTerms(nameTerms, allSyn);
    const diseaseName = d.nameCorrected ?? d.name;
    const parentLabels = parentLabelsForRecall(
      d.mondoIds,
      (id, maxDepth) => mondo.ancestors(id, maxDepth),
      (id) => mondo.label(id),
      diseaseName
    );
    const liveMondoSyn = collectExactSynonyms(d.mondoIds, mondo);
    let recallTerms = novelRecallTerms(
      phraseTerms,
      buildRecallExpansionTerms({
        name: diseaseName,
        synonyms: d.synonyms,
        mondoSynonyms:
          liveMondoSyn.length > 0 ? liveMondoSyn : d.mondoSynonyms,
        parentLabels,
        genes: d.geneDiseaseValidity.genes,
      })
    );

    let trials = await fetchTrialSignals(phraseTerms, d.meshLabels, recallTerms);
    if (!trials.fullyScanned) {
      const safe = novelRecallTerms(
        phraseTerms,
        capRecallGenes(d.geneDiseaseValidity.genes)
      );
      log.warn(
        `  incomplete scan; retrying gene-only recall [${safe.join(" | ")}]`
      );
      trials = await fetchTrialSignals(phraseTerms, d.meshLabels, safe);
      recallTerms = safe;
      if (!trials.fullyScanned) {
        throw new Error("incomplete ClinicalTrials.gov scan after safe retry");
      }
    }

    let parentCategory: (typeof d.trials)["parentCategory"] = null;
    const parentLabel = parentCategoryLabelForTrials(
      d.mondoIds,
      (id, maxDepth) => mondo.ancestors(id, maxDepth),
      (id) => mondo.label(id),
      diseaseName
    );
    if (parentLabel) {
      try {
        parentCategory = await fetchParentCategoryTrials(
          parentLabel,
          trials.matchedStudies.map((study) => study.nctId)
        );
      } catch (parentErr) {
        log.warn(
          `  parent-category fetch failed for "${parentLabel}": ${String(parentErr)}`
        );
        parentCategory = null;
      }
    }

    const prevTotal = d.trials.total;
    d.trials = {
      ...d.trials,
      total: trials.total,
      recruitingCount: trials.recruitingCount,
      recruiting: trials.recruiting,
      registeredStudiesTotal: trials.registeredStudiesTotal,
      observationalTotal: trials.observationalTotal,
      observationalRecruitingCount: trials.observationalRecruitingCount,
      observational: trials.observationalRecruiting,
      expandedAccessTotal: trials.expandedAccessTotal,
      generalRegistries: trials.generalRegistries,
      query: trials.query,
      recallTerms,
      fullyScanned: trials.fullyScanned,
      matchedVia: trials.matchedVia,
      parentCategory,
    };
    d.lastTrialCheck = checkedAt;

    const attempted = new Set<MatchStrategy>(
      d.queryHealth.strategiesAttempted.filter(
        (s) => s !== "recall-expansion"
      ) as MatchStrategy[]
    );
    if (recallTerms.length > 0) attempted.add("recall-expansion");
    const withHits = new Set<MatchStrategy>();
    for (const s of d.queryHealth.strategiesWithHits) {
      if (s === "phrase" || s === "mesh" || s === "corrected-name") {
        withHits.add(s);
      }
    }
    for (const s of trials.queryStrategiesWithHits) withHits.add(s);
    d.queryHealth = {
      ...d.queryHealth,
      strategiesAttempted: [...attempted],
      strategiesWithHits: [...withHits],
    };

    if (d.sourceErrors?.trials) {
      const { trials: _t, ...rest } = d.sourceErrors;
      d.sourceErrors = Object.keys(rest).length
        ? (rest as typeof d.sourceErrors)
        : null;
    }

    const transitioned = prevTotal === 0 && (trials.total ?? 0) > 0;
    log.info(
      `  trials ${prevTotal} → ${trials.total}${transitioned ? " (ZERO→NONZERO)" : ""}`
    );
    return { transitioned, error: null };
  } catch (err) {
    const message = String(err);
    d.sourceErrors = { ...(d.sourceErrors ?? {}), trials: message };
    d.trials = {
      ...d.trials,
      total: null,
      recruitingCount: null,
      registeredStudiesTotal: null,
      observationalTotal: null,
      observationalRecruitingCount: null,
      expandedAccessTotal: null,
      fullyScanned: false,
      parentCategory: null,
    };
    d.lastTrialCheck = checkedAt;
    log.fail(`ORPHA:${d.orphaCode}: ${message}`);
    return { transitioned: false, error: message };
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  const limit = parseLimit(process.argv.slice(2));
  setCacheReadsDisabled(true);

  const before = readArtifact();
  const artifact = deepClone(before);

  let targets = artifact.diseases.filter(
    (d) => d.trials.total === 0 && d.queryHealth.status !== "broken"
  );
  if (limit != null) targets = targets.slice(0, limit);

  log.info(
    `Zero-trial refresh: ${targets.length} targets (of ${artifact.diseases.length}); cache reads disabled`
  );

  const mondo = await loadMondoHierarchy();
  const transitionsToNonZero: string[] = [];
  const errors: { orphaCode: string; error: string }[] = [];
  const touchedCodes = new Set<string>();

  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    touchedCodes.add(d.orphaCode);
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    const result = await refreshOne(d, mondo);
    if (result.transitioned) transitionsToNonZero.push(d.orphaCode);
    if (result.error) errors.push({ orphaCode: d.orphaCode, error: result.error });

    if ((i + 1) % 25 === 0) {
      writeAtomic("", deriveArtifact(deepClone(artifact)));
      log.info(`  checkpoint wrote through ${i + 1}`);
    }
  }

  artifact.lastRefresh = new Date().toISOString();
  const derived = deriveArtifact(artifact);
  assertNightlyFieldDiscipline(before, derived, touchedCodes);
  writeAtomic("", derived);

  const durationMs = Date.now() - started;
  const logEntry = {
    kind: "nightly-zero-trials",
    ranAt: new Date().toISOString(),
    diseasesChecked: targets.length,
    transitionsToNonZero,
    durationMs,
    errors,
  };
  appendRefreshLog(logEntry);

  const a = derived.aggregate;
  const pct =
    a.trialsDenominator > 0
      ? ((100 * a.noTrials) / a.trialsDenominator).toFixed(1)
      : "n/a";
  log.info(
    `Done. checked=${targets.length} transitions=${transitionsToNonZero.length} errors=${errors.length} durationMs=${durationMs}. No trials ${a.noTrials}/${a.trialsDenominator} (${pct}%)`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
