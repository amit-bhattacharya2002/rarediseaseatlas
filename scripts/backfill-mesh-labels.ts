/**
 * Backfill MeSH descriptor labels after id.nlm.nih.gov failures during ingest.
 *
 * Soft-failed NLM lookups leave identifiers.mesh populated but meshLabels empty
 * (or short). This script re-resolves labels from the NLM id service, writes them
 * onto the published artifact, then re-derives.
 *
 * Run AFTER a full ingest publishes data/diseases.json:
 *
 *   npm run backfill:mesh
 *   npm run backfill:mesh -- --limit 50
 *   npm run backfill:mesh -- --requery          # also re-fetch pubs + trials
 *   npm run backfill:mesh -- --artifact data/diseases.json
 *
 * Does not touch diseases that already have a full meshLabels set.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureCacheDir } from "./lib/cache";
import { deriveArtifact } from "./lib/derive";
import {
  europePmcSearchUrl,
  fetchPublicationSignals,
} from "./lib/europepmc";
import { resolveMeshLabels } from "./lib/mesh";
import { loadMondoHierarchy } from "./lib/mondo";
import { collectExactSynonyms } from "./lib/identifiers";
import {
  buildPhraseTerms,
  buildPublicationExpansionTerms,
  buildTrialRecallExpansionTerms,
  capRecallGenes,
  novelRecallTerms,
  parentCategoryLabelForTrials,
  parentLabelsForRecall,
  phraseQueryFromTerms,
} from "./lib/query-build";
import {
  fetchParentCategoryTrials,
  fetchTrialSignals,
} from "./lib/trials";
import { appendRefreshLog } from "./lib/refresh-log";
import { log } from "./lib/logger";
import type { DiseaseRecord, DiseasesArtifact, MatchStrategy } from "../src/lib/types";

interface Args {
  artifactPath: string;
  limit: number | null;
  requery: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  let artifactPath = path.join(process.cwd(), "data", "diseases.json");
  let limit: number | null = null;
  let requery = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--artifact") {
      artifactPath = path.resolve(argv[++i] ?? "");
    } else if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      limit = n;
    } else if (a === "--requery") {
      requery = true;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: tsx scripts/backfill-mesh-labels.ts [options]
  --artifact PATH   Artifact to update (default data/diseases.json)
  --limit N         Process at most N diseases
  --requery         After labels resolve, re-fetch publications + trials
  --dry-run         Resolve and report only; do not write`);
      process.exit(0);
    }
  }
  return { artifactPath, limit, requery, dryRun };
}

function writeAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function needsMeshBackfill(d: DiseaseRecord): boolean {
  const ids = d.identifiers?.mesh ?? [];
  if (ids.length === 0) return false;
  const labels = d.meshLabels ?? [];
  return labels.length < ids.length;
}

function labelsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((x) => x.toLowerCase()).sort();
  const sb = [...b].map((x) => x.toLowerCase()).sort();
  return sa.every((v, i) => v === sb[i]);
}

async function requerySignals(
  d: DiseaseRecord,
  meshLabels: string[],
  mondo: Awaited<ReturnType<typeof loadMondoHierarchy>>
): Promise<void> {
  const nameTerms = d.nameCorrected ? [d.name, d.nameCorrected] : [d.name];
  const liveMondoSyn = collectExactSynonyms(d.mondoIds, mondo);
  const mondoSynonyms =
    liveMondoSyn.length > 0 ? liveMondoSyn : d.mondoSynonyms;
  const allSyn = [...d.synonyms, ...mondoSynonyms];
  const { terms: phraseTerms } = buildPhraseTerms(nameTerms, allSyn);
  const phraseQuery = phraseQueryFromTerms(phraseTerms);
  const diseaseName = d.nameCorrected ?? d.name;
  const parentLabels = parentLabelsForRecall(
    d.mondoIds,
    (id, maxDepth) => mondo.ancestors(id, maxDepth),
    (id) => mondo.label(id),
    diseaseName
  );
  let recallTerms = novelRecallTerms(
    phraseTerms,
    buildTrialRecallExpansionTerms({
      name: diseaseName,
      synonyms: d.synonyms,
      mondoSynonyms,
      parentLabels,
      genes: d.geneDiseaseValidity.genes,
    })
  );
  const pubExpansion = novelRecallTerms(
    phraseTerms,
    buildPublicationExpansionTerms({
      name: diseaseName,
      synonyms: d.synonyms,
      mondoSynonyms,
      genes: d.geneDiseaseValidity.genes,
    })
  );

  try {
    const pubs = await fetchPublicationSignals(
      phraseQuery,
      meshLabels,
      pubExpansion
    );
    d.publications = {
      ...d.publications,
      total: pubs.total,
      phraseCount: pubs.phraseCount,
      meshCount: pubs.meshCount,
      last10Years: pubs.last10Years,
      byYear: pubs.byYear,
      europePmcUrl: europePmcSearchUrl(pubs.effectiveQuery),
      meshQuery: pubs.meshQuery,
      papersSampledForAuthors: pubs.papersSampledForAuthors,
    };
    d.researchers = {
      distinctCount: pubs.distinctResearchers,
      top: pubs.topAuthors,
    };
    if (d.sourceErrors?.publications) {
      const { publications: _p, ...rest } = d.sourceErrors;
      d.sourceErrors = Object.keys(rest).length
        ? (rest as typeof d.sourceErrors)
        : null;
    }
  } catch (err) {
    d.sourceErrors = {
      ...(d.sourceErrors ?? {}),
      publications: String(err),
    };
    log.warn(`  pubs requery failed ORPHA:${d.orphaCode}: ${String(err)}`);
  }

  try {
    let trials = await fetchTrialSignals(phraseTerms, meshLabels, recallTerms);
    if (!trials.fullyScanned) {
      const safe = novelRecallTerms(
        phraseTerms,
        capRecallGenes(d.geneDiseaseValidity.genes)
      );
      trials = await fetchTrialSignals(phraseTerms, meshLabels, safe);
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
          trials.matchedStudies.map((s) => s.nctId)
        );
      } catch (parentErr) {
        log.warn(
          `  parent-category fetch failed for "${parentLabel}": ${String(parentErr)}`
        );
      }
    }
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
    const attempted = new Set<MatchStrategy>(
      d.queryHealth.strategiesAttempted as MatchStrategy[]
    );
    if (meshLabels.length > 0) attempted.add("mesh");
    if (recallTerms.length > 0) attempted.add("recall-expansion");
    const withHits = new Set<MatchStrategy>(
      d.queryHealth.strategiesWithHits as MatchStrategy[]
    );
    for (const s of trials.queryStrategiesWithHits) withHits.add(s);
    if ((d.publications.meshCount ?? 0) > 0) withHits.add("mesh");
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
  } catch (err) {
    d.sourceErrors = {
      ...(d.sourceErrors ?? {}),
      trials: String(err),
    };
    log.warn(`  trials requery failed ORPHA:${d.orphaCode}: ${String(err)}`);
  }
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  ensureCacheDir();

  if (!fs.existsSync(args.artifactPath)) {
    throw new Error(`Artifact not found: ${args.artifactPath}`);
  }

  const artifact = JSON.parse(
    fs.readFileSync(args.artifactPath, "utf8")
  ) as DiseasesArtifact;

  let targets = artifact.diseases.filter(needsMeshBackfill);
  if (args.limit != null) targets = targets.slice(0, args.limit);

  log.info(
    `MeSH backfill: ${targets.length} diseases with missing labels ` +
      `(of ${artifact.diseases.length}); requery=${args.requery} dryRun=${args.dryRun}`
  );

  const mondo = args.requery ? await loadMondoHierarchy() : null;

  let attempted = 0;
  let filled = 0;
  let stillEmpty = 0;
  let unchanged = 0;
  const errors: { orphaCode: string; error: string }[] = [];
  const filledCodes: string[] = [];

  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    attempted += 1;
    const ids = d.identifiers.mesh;
    log.info(
      `[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name} ` +
        `(${ids.length} MeSH id(s), had ${d.meshLabels.length} label(s))`
    );
    try {
      const prev = [...d.meshLabels];
      const next = await resolveMeshLabels(ids);
      if (labelsEqual(prev, next)) {
        unchanged += 1;
        if (next.length === 0) stillEmpty += 1;
        log.info(`  no change (${next.length} label(s))`);
        continue;
      }
      if (args.dryRun) {
        log.info(
          `  dry-run would set meshLabels=${JSON.stringify(next)} (was ${prev.length})`
        );
        if (next.length > prev.length) {
          filled += 1;
          filledCodes.push(d.orphaCode);
        } else if (next.length === 0) {
          stillEmpty += 1;
        }
        continue;
      }
      d.meshLabels = next;
      if (next.length === 0) {
        stillEmpty += 1;
        log.warn(`  still empty after NLM resolve`);
      } else {
        filled += 1;
        filledCodes.push(d.orphaCode);
        log.info(`  meshLabels → [${next.join(" | ")}]`);
      }
      if (args.requery && next.length > 0 && mondo) {
        log.info(`  requerying publications + trials with MeSH terms`);
        await requerySignals(d, next, mondo);
      }
    } catch (err) {
      errors.push({ orphaCode: d.orphaCode, error: String(err) });
      log.fail(`ORPHA:${d.orphaCode}: ${String(err)}`);
    }

    if (!args.dryRun && (i + 1) % 25 === 0) {
      writeAtomic(args.artifactPath, deriveArtifact(artifact));
      log.info(`  checkpoint wrote through ${i + 1}`);
    }
  }

  const durationMs = Date.now() - started;
  if (!args.dryRun) {
    const derived = deriveArtifact(artifact);
    writeAtomic(args.artifactPath, derived);
  }

  const entry = {
    kind: "backfill-mesh-labels",
    ranAt: new Date().toISOString(),
    artifact: path.relative(process.cwd(), args.artifactPath),
    diseasesChecked: attempted,
    filled: filledCodes,
    stillEmpty,
    unchanged,
    requery: args.requery,
    dryRun: args.dryRun,
    durationMs,
    errors,
  };
  if (!args.dryRun) appendRefreshLog(entry);

  log.info(
    `Done. checked=${attempted} filled=${filled} stillEmpty=${stillEmpty} ` +
      `unchanged=${unchanged} errors=${errors.length} durationMs=${durationMs}`
  );
  if (stillEmpty > 0) {
    log.warn(
      `${stillEmpty} disease(s) still have no MeSH labels after retry — NLM may still be unhealthy or ids invalid.`
    );
  }
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
