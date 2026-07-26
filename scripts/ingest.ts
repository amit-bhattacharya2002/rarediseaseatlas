/**
 * Build-time ingestion — NETWORK + CACHE ONLY.
 *
 * Fetches raw per-disease signals (publications, trials, identifiers) and writes
 * data/diseases.json only when the target set is complete. Mid-run progress goes
 * to data/diseases.checkpoint.json so a partial corpus cannot overwrite publish.
 *
 * Usage:
 *   npx tsx scripts/ingest.ts --limit 50
 *   npx tsx scripts/ingest.ts --limit 0
 *   npx tsx scripts/ingest.ts --sample 300 --seed 42 [--resume] [--no-cache]
 *
 * Rate limiting (~3 req/sec + backoff) lives in scripts/lib/http.ts.
 * Plain-language rewriting is a separate post-step: npm run plain-language
 */

import fs from "node:fs";
import path from "node:path";
import { loadOrphanetDiseases, type OrphanetDisease } from "./lib/orphanet";
import { loadGenCC, lookupGenCC } from "./lib/gencc";
import {
  fetchPublicationHitCount,
  fetchPublicationSignals,
  europePmcSearchUrl,
} from "./lib/europepmc";
import {
  fetchParentCategoryTrials,
  fetchTrialSignals,
} from "./lib/trials";
import { loadMondoHierarchy, type MondoHierarchy } from "./lib/mondo";
import { collectExactSynonyms, collectIdentifiers } from "./lib/identifiers";
import { resolveMeshLabels } from "./lib/mesh";
import {
  buildTokenIndex,
  correctName,
  type NameCorrection,
} from "./lib/normalize";
import { buildIndiaMatcher } from "./lib/india";
import {
  buildPhraseTerms,
  buildRecallExpansionTerms,
  novelRecallTerms,
  parentCategoryLabelForTrials,
  parentLabelsForRecall,
  phraseQueryFromTerms,
} from "./lib/query-build";
import { deriveArtifact } from "./lib/derive";
import {
  assertIndiaFreshness,
  loadIndiaNprd,
  validateIndiaStructure,
} from "./lib/validate-india";
import { log } from "./lib/logger";
import { ensureCacheDir, setCacheReadsDisabled } from "./lib/cache";
import type { IngestStatusFile } from "../src/lib/ingest-status";
import type {
  DiseaseRecord,
  DiseasesArtifact,
  MatchStrategy,
  ParentLiteratureProbe,
  SamplingProvenance,
} from "../src/lib/types";

const CHECKPOINT_EVERY = 25;
const EXCLUDED_PREFIXES = ["OBSOLETE:", "NON RARE IN EUROPE:"];
const PARENT_ANCESTOR_CHECK_LIMIT = 8;

const PUBLISH_PATH = path.join(process.cwd(), "data", "diseases.json");
const CHECKPOINT_PATH = path.join(
  process.cwd(),
  "data",
  "diseases.checkpoint.json"
);
const STATUS_PATH = path.join(process.cwd(), "data", "ingest-status.json");

function writeIngestStatus(status: IngestStatusFile): void {
  const dir = path.dirname(STATUS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = STATUS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, STATUS_PATH);
}

function publishCount(): number {
  try {
    if (!fs.existsSync(PUBLISH_PATH)) return 0;
    const pub = JSON.parse(fs.readFileSync(PUBLISH_PATH, "utf8")) as {
      diseases?: unknown[];
    };
    return pub.diseases?.length ?? 0;
  } catch {
    return 0;
  }
}

interface CliArgs {
  limit: number;
  sample: number | null;
  resume: boolean;
  noCache: boolean;
  seed: number;
}

function parseArgs(argv: string[]): CliArgs {
  let limit = 50;
  let sample: number | null = null;
  let resume = false;
  let noCache = false;
  let seed = 42;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") {
      limit = 0;
    } else if (a === "--limit") {
      const n = parseInt(argv[i + 1] ?? "", 10);
      if (Number.isNaN(n)) throw new Error("--limit requires a number (0 = full)");
      limit = n;
      i += 1;
    } else if (a === "--sample") {
      const n = parseInt(argv[i + 1] ?? "", 10);
      if (Number.isNaN(n) || n <= 0) throw new Error("--sample requires a positive number");
      sample = n;
      i += 1;
    } else if (a === "--seed") {
      const n = parseInt(argv[i + 1] ?? "", 10);
      if (Number.isNaN(n)) throw new Error("--seed requires a number");
      seed = n;
      i += 1;
    } else if (a === "--resume") {
      resume = true;
    } else if (a === "--no-cache") {
      noCache = true;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: tsx scripts/ingest.ts [options]
  --limit N     First N usable diseases after sort (default 50). 0 = all.
  --full        Alias for --limit 0 (full corpus).
  --sample N    Random sample of N (overrides --limit).
  --seed N      PRNG seed for --sample (default 42).
  --resume      Resume from data/diseases.checkpoint.json (same sampling mode).
  --no-cache    Ignore .cache/ reads`);
      process.exit(0);
    }
  }
  return { limit, sample, resume, noCache, seed };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleDiseases(
  diseases: OrphanetDisease[],
  n: number,
  seed: number
): OrphanetDisease[] {
  const rng = mulberry32(seed);
  const copy = [...diseases];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function samplingFromArgs(
  args: CliArgs,
  excludedObsoleteOrNonRare: number
): SamplingProvenance {
  if (args.sample != null) {
    return { mode: "sample", n: args.sample, seed: args.seed, excludedObsoleteOrNonRare };
  }
  if (args.limit === 0) {
    return { mode: "full", n: null, seed: null, excludedObsoleteOrNonRare };
  }
  return { mode: "limit", n: args.limit, seed: null, excludedObsoleteOrNonRare };
}

function loadArtifact(filePath: string): DiseasesArtifact {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as DiseasesArtifact;
  } catch (err) {
    log.error(`Corrupt ${filePath}: ${String(err)}. Fix or delete before --resume.`);
    throw new Error(`Resume aborted: ${filePath} is corrupt (${String(err)})`);
  }
}

function loadResumeArtifact(): DiseasesArtifact | null {
  if (fs.existsSync(CHECKPOINT_PATH)) {
    log.info(`Resume: loading ${CHECKPOINT_PATH}`);
    return loadArtifact(CHECKPOINT_PATH);
  }
  if (fs.existsSync(PUBLISH_PATH)) {
    log.info(
      `Resume: no checkpoint; loading published ${PUBLISH_PATH} (legacy fallback)`
    );
    return loadArtifact(PUBLISH_PATH);
  }
  return null;
}

function assertCompatibleResume(
  existing: DiseasesArtifact,
  next: SamplingProvenance
): void {
  const prev = existing.sampling;
  if (!prev) {
    throw new Error(
      "Resume aborted: existing artifact has no sampling provenance. Delete the checkpoint or start fresh."
    );
  }
  if (prev.mode !== next.mode || prev.n !== next.n || prev.seed !== next.seed) {
    throw new Error(
      `Resume aborted: sampling mismatch. Existing=${JSON.stringify(prev)} current=${JSON.stringify(next)}.`
    );
  }
}

function writeJsonAtomic(filePath: string, artifact: DiseasesArtifact): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function assertPublishable(
  artifact: DiseasesArtifact,
  targetSize: number,
  failed: number
): void {
  if (failed > 0) {
    throw new Error(
      `Refuse to publish: ${failed} disease(s) failed during ingest. Fix failures or resume; live artifact unchanged.`
    );
  }
  if (artifact.diseases.length !== targetSize) {
    throw new Error(
      `Refuse to publish: diseases.length=${artifact.diseases.length} !== target=${targetSize}. Checkpoint retained at ${CHECKPOINT_PATH}.`
    );
  }
  const incomplete = artifact.diseases.filter(
    (d) => d.trials.total !== null && !d.trials.fullyScanned
  );
  if (incomplete.length > 0) {
    const sample = incomplete
      .slice(0, 5)
      .map((d) => `ORPHA:${d.orphaCode}`)
      .join(", ");
    throw new Error(
      `Refuse to publish: ${incomplete.length} disease(s) have incomplete trial scans (e.g. ${sample}).`
    );
  }
}

async function probeParentLiterature(
  mondo: MondoHierarchy,
  mondoIds: string[]
): Promise<ParentLiteratureProbe | null> {
  let best: ParentLiteratureProbe | null = null;
  const seenLabels = new Set<string>();
  let n = 0;
  for (const mid of mondoIds) {
    for (const anc of mondo.ancestors(mid)) {
      if (n >= PARENT_ANCESTOR_CHECK_LIMIT) return best;
      const label = mondo.label(anc);
      if (!label || seenLabels.has(label.toLowerCase())) continue;
      seenLabels.add(label.toLowerCase());
      n += 1;
      try {
        const hits = await fetchPublicationHitCount(`"${label.replace(/"/g, "")}"`);
        if (!best || hits > best.hits) {
          best = { mondoId: anc, label, hits };
        }
        if (hits >= 50) return best;
      } catch (err) {
        log.warn(`  parent probe failed for ${label}: ${String(err)}`);
      }
    }
  }
  return best;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.noCache) {
    setCacheReadsDisabled(true);
    log.info("--no-cache: ignoring .cache/ reads");
  }
  ensureCacheDir();
  fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });

  const india = loadIndiaNprd();
  validateIndiaStructure(india);
  assertIndiaFreshness(india);

  const {
    diseases: orphanetRaw,
    orphaMondoByCode,
    allOrphaCodes,
    product1Date,
    prevalenceDate,
  } = await loadOrphanetDiseases();
  orphanetRaw.sort((a, b) => Number(a.orphaCode) - Number(b.orphaCode));

  const usable = orphanetRaw.filter(
    (d) => !EXCLUDED_PREFIXES.some((p) => d.name.startsWith(p))
  );
  const excludedObsoleteOrNonRare = orphanetRaw.length - usable.length;
  log.info(
    `Excluded ${excludedObsoleteOrNonRare} obsolete / non-rare-in-Europe entries; usable=${usable.length}`
  );

  const tokenIndex = buildTokenIndex(
    usable.map((d) => ({ name: d.name, synonyms: d.synonyms }))
  );
  const mondo = await loadMondoHierarchy();
  const indiaMatcher = buildIndiaMatcher({
    india,
    orphaToMondo: orphaMondoByCode,
    mondo,
  });
  indiaMatcher.validateAgainstCorpus(allOrphaCodes);

  const sampling = samplingFromArgs(args, excludedObsoleteOrNonRare);
  log.info(`Starting ingest sampling=${JSON.stringify(sampling)} resume=${args.resume}`);

  const gencc = await loadGenCC();

  const existing = args.resume ? loadResumeArtifact() : null;
  if (existing) assertCompatibleResume(existing, sampling);

  const byCode = new Map<string, DiseaseRecord>();
  if (existing) {
    for (const d of existing.diseases) byCode.set(d.orphaCode, d);
    log.info(`Resume: loaded ${byCode.size} existing diseases`);
  }

  // Seed from resume so checkpoint/publish merge rather than replace corrections.
  // deriveArtifact also rebuilds nameCorrections from per-disease nameCorrected.
  const corrections: NameCorrection[] = (existing?.nameCorrections ?? [])
    .filter(
      (c): c is typeof c & { type: NameCorrection["type"] } =>
        c.type === "missing-boundary" || c.type === "misspelling-candidate"
    )
    .map((c) => ({
      orphaCode: c.orphaCode,
      original: c.original,
      corrected: c.corrected,
      type: c.type,
      detail: c.detail,
      applied: c.applied,
    }));

  const target: OrphanetDisease[] =
    args.sample != null
      ? sampleDiseases(usable, args.sample, args.seed)
      : args.limit === 0
        ? usable
        : usable.slice(0, Math.min(args.limit, usable.length));

  if (args.sample != null) {
    log.info(`Sampled ${target.length} diseases with seed=${args.seed}`);
  } else if (args.limit === 0) {
    log.info(`Full corpus target: ${target.length} usable diseases`);
  }

  const buildArtifact = (): DiseasesArtifact => {
    const diseases = [...byCode.values()].sort(
      (a, b) => Number(a.orphaCode) - Number(b.orphaCode)
    );
    const artifact: DiseasesArtifact = {
      generatedAt: new Date().toISOString(),
      ingestLimit: sampling.n,
      sampling,
      sourceVersions: {
        orphanetProduct1: product1Date,
        orphanetPrevalence: prevalenceDate,
        gencc: gencc.dataVersion,
        genccFetchedAt: gencc.fetchedAt,
        mondo: mondo.version,
      },
      diseases,
      aggregate: {
        totalDiseases: 0,
        publicationsDenominator: 0,
        trialsDenominator: 0,
        intersectionDenominator: 0,
        noRecentPubsNoTrials: 0,
        noPublicationsLast10Years: 0,
        noTrials: 0,
        noTrialsParentInclusive: 0,
        noRegisteredStudies: 0,
        incompleteSourceRows: 0,
        brokenQueryRows: 0,
        noTrialsWithSubstantialLiterature: 0,
        noTrialsWithNoLiterature: 0,
      },
      nameCorrections: corrections.map((c) => ({
        orphaCode: c.orphaCode,
        original: c.original,
        corrected: c.corrected,
        type: c.type,
        detail: c.detail,
        applied: c.applied,
      })),
    };
    return deriveArtifact(artifact);
  };

  writeIngestStatus({
    status: "running",
    done: byCode.size,
    target: target.length,
    published: publishCount(),
    sampling: {
      mode: sampling.mode,
      n: sampling.n,
      seed: sampling.seed,
    },
    updatedAt: new Date().toISOString(),
    message:
      "Ingest in progress. Live site numbers still come from the last published artifact.",
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const od of target) {
    if (args.resume && byCode.has(od.orphaCode)) {
      skipped += 1;
      continue;
    }

    processed += 1;
    log.info(`[${processed + skipped}/${target.length}] ORPHA:${od.orphaCode} ${od.name}`);

    try {
      const { corrected, changes, candidates } = correctName(
        od.orphaCode,
        od.name,
        tokenIndex
      );
      for (const c of changes) {
        corrections.push(c);
        log.info(`  name correction APPLIED (${c.type}) ORPHA:${od.orphaCode}: ${c.detail}`);
      }
      for (const c of candidates) {
        corrections.push(c);
        log.info(`  spelling candidate FLAGGED ORPHA:${od.orphaCode}: ${c.detail}`);
      }

      const identifiers = collectIdentifiers(od.mondoIds, mondo);
      const mondoSynonyms = collectExactSynonyms(od.mondoIds, mondo);
      const meshLabels = await resolveMeshLabels(identifiers.mesh);

      const nameTerms = corrected ? [od.name, corrected] : [od.name];
      const allSyn = [...od.synonyms, ...mondoSynonyms];
      const { terms: phraseTerms, dropped } = buildPhraseTerms(nameTerms, allSyn);
      const phraseQuery = phraseQueryFromTerms(phraseTerms);

      const gene = lookupGenCC(gencc, od.mondoIds, od.orphaCode);
      const parentLabels = parentLabelsForRecall(
        od.mondoIds,
        (id, maxDepth) => mondo.ancestors(id, maxDepth),
        (id) => mondo.label(id),
        corrected ?? od.name
      );
      const recallTerms = novelRecallTerms(
        phraseTerms,
        buildRecallExpansionTerms({
          name: corrected ?? od.name,
          synonyms: od.synonyms,
          mondoSynonyms,
          parentLabels,
          genes: gene.genes,
        })
      );

      for (const d of dropped) {
        log.info(`  stoplist drop ORPHA:${od.orphaCode}: "${d.term}" (${d.reason})`);
      }
      if (recallTerms.length > 0) {
        log.info(
          `  recall expansion ORPHA:${od.orphaCode}: ${recallTerms.join(" | ")}`
        );
      }

      const sourceErrors: { publications?: string; trials?: string } = {};

      let pubs: Awaited<ReturnType<typeof fetchPublicationSignals>> | null = null;
      try {
        pubs = await fetchPublicationSignals(phraseQuery, meshLabels);
      } catch (err) {
        sourceErrors.publications = String(err);
        log.warn(`  ORPHA:${od.orphaCode}: publications fetch failed: ${String(err)}`);
      }

      let trials: Awaited<ReturnType<typeof fetchTrialSignals>> | null = null;
      let effectiveRecallTerms = recallTerms;
      let parentCategory: DiseaseRecord["trials"]["parentCategory"] = null;
      try {
        trials = await fetchTrialSignals(phraseTerms, meshLabels, recallTerms);
        if (trials && !trials.fullyScanned) {
          // Broad parents can exceed the page ceiling. Fall back to genes only.
          const safeRecall = novelRecallTerms(phraseTerms, [...gene.genes]);
          log.warn(
            `  ORPHA:${od.orphaCode}: incomplete scan with full recall; retrying with gene-only recall [${safeRecall.join(" | ")}]`
          );
          trials = await fetchTrialSignals(phraseTerms, meshLabels, safeRecall);
          effectiveRecallTerms = safeRecall;
          if (trials && !trials.fullyScanned) {
            throw new Error(
              `incomplete ClinicalTrials.gov scan (query returned more pages than the safety ceiling)`
            );
          }
        }
        const parentLabel = parentCategoryLabelForTrials(
          od.mondoIds,
          (id, maxDepth) => mondo.ancestors(id, maxDepth),
          (id) => mondo.label(id),
          corrected ?? od.name
        );
        if (parentLabel && trials) {
          try {
            const parent = await fetchParentCategoryTrials(
              parentLabel,
              trials.matchedStudies.map((study) => study.nctId)
            );
            parentCategory = parent;
            if (!parent.fullyScanned) {
              log.warn(
                `  ORPHA:${od.orphaCode}: parent-category scan incomplete for "${parentLabel}" (specific tier still published)`
              );
            } else if (parent.total > 0) {
              log.info(
                `  parent category ORPHA:${od.orphaCode}: "${parentLabel}" → ${parent.total} interventional (exclusive of specific)`
              );
            }
          } catch (parentErr) {
            log.warn(
              `  ORPHA:${od.orphaCode}: parent-category fetch failed for "${parentLabel}": ${String(parentErr)}`
            );
            parentCategory = null;
          }
        }
      } catch (err) {
        sourceErrors.trials = String(err);
        log.warn(`  ORPHA:${od.orphaCode}: trials fetch failed: ${String(err)}`);
        // Incomplete scans must fail the disease — never publish a truncated zero/partial.
        if (String(err).includes("incomplete ClinicalTrials.gov scan")) {
          throw err;
        }
      }

      let parentLiteratureProbe: ParentLiteratureProbe | null = null;
      if (pubs?.total === 0 && od.mondoIds.length > 0) {
        parentLiteratureProbe = await probeParentLiterature(mondo, od.mondoIds);
      }

      const indiaHit = indiaMatcher.lookup(od.orphaCode, od.mondoIds);

      const strategiesAttempted: MatchStrategy[] = ["phrase"];
      if (meshLabels.length > 0) strategiesAttempted.push("mesh");
      if (corrected) strategiesAttempted.push("corrected-name");
      if (effectiveRecallTerms.length > 0) {
        strategiesAttempted.push("recall-expansion");
      }

      const strategiesWithHits = new Set<MatchStrategy>();
      for (const s of pubs?.strategiesWithHits ?? []) strategiesWithHits.add(s);
      for (const v of trials?.queryStrategiesWithHits ?? []) {
        strategiesWithHits.add(v);
      }

      const record: DiseaseRecord = {
        orphaCode: od.orphaCode,
        name: od.name,
        nameCorrected: corrected,
        synonyms: od.synonyms,
        mondoSynonyms,
        definition: od.definition,
        plainLanguageDefinition: null,
        prevalenceClass: od.prevalenceClass,
        mondoIds: od.mondoIds,
        expertLink: od.expertLink,
        disorderGroup: od.disorderGroup,
        query: phraseQuery,
        synonymsDropped: dropped.map((d) => d.term),
        identifiers,
        meshLabels,
        confidence: "medium",
        confidenceReasons: [],
        queryHealth: {
          status: "ok",
          reasons: [],
          strategiesAttempted,
          strategiesWithHits: [...strategiesWithHits],
        },
        excludeFromNeglect: false,
        parentLiteratureProbe,
        publications: {
          total: pubs ? pubs.total : null,
          phraseCount: pubs ? pubs.phraseCount : null,
          meshCount: pubs ? pubs.meshCount : null,
          last10Years: pubs ? pubs.last10Years : null,
          byYear: pubs?.byYear ?? [],
          europePmcUrl: europePmcSearchUrl(pubs?.effectiveQuery || phraseQuery),
          meshQuery: pubs?.meshQuery ?? "",
          papersSampledForAuthors: pubs?.papersSampledForAuthors ?? 0,
        },
        researchers: {
          distinctCount: pubs ? pubs.distinctResearchers : null,
          top: pubs?.topAuthors ?? [],
        },
        trials: {
          total: trials ? trials.total : null,
          recruitingCount: trials ? trials.recruitingCount : null,
          recruiting: trials?.recruiting ?? [],
          registeredStudiesTotal: trials
            ? trials.registeredStudiesTotal
            : null,
          observationalTotal: trials ? trials.observationalTotal : null,
          observationalRecruitingCount: trials
            ? trials.observationalRecruitingCount
            : null,
          observational: trials?.observationalRecruiting ?? [],
          expandedAccessTotal: trials ? trials.expandedAccessTotal : null,
          generalRegistries: trials?.generalRegistries ?? [],
          query: trials?.query ?? "",
          recallTerms: effectiveRecallTerms,
          fullyScanned: trials?.fullyScanned ?? false,
          matchedVia: trials?.matchedVia ?? [],
          parentCategory,
        },
        geneDiseaseValidity: { classification: gene.classification, genes: gene.genes },
        sourceErrors:
          sourceErrors.publications || sourceErrors.trials ? sourceErrors : null,
        indiaNprd: {
          listed: indiaHit.listed,
          via: indiaHit.via,
          matchedVia: indiaHit.matchedVia,
          matchedViaLabel: indiaHit.matchedViaLabel,
          groups: indiaHit.groups,
          entitlements: indiaHit.entitlements,
        },
        publicationsPercentile: null,
        trialsPercentile: null,
        ingestedAt: new Date().toISOString(),
      };

      byCode.set(od.orphaCode, record);
    } catch (err) {
      failed += 1;
      log.fail(`ORPHA:${od.orphaCode} ${od.name}: ${String(err)}`);
    }

    if (processed % CHECKPOINT_EVERY === 0) {
      writeJsonAtomic(CHECKPOINT_PATH, buildArtifact());
      writeIngestStatus({
        status: "running",
        done: byCode.size,
        target: target.length,
        published: publishCount(),
        sampling: {
          mode: sampling.mode,
          n: sampling.n,
          seed: sampling.seed,
        },
        updatedAt: new Date().toISOString(),
        message:
          "Ingest in progress. Live site numbers still come from the last published artifact.",
      });
      log.info(
        `  checkpoint wrote ${byCode.size}/${target.length} diseases → ${CHECKPOINT_PATH}`
      );
    }
  }

  const artifact = buildArtifact();
  writeJsonAtomic(CHECKPOINT_PATH, artifact);
  log.info(`Final checkpoint: ${artifact.diseases.length}/${target.length} → ${CHECKPOINT_PATH}`);

  assertPublishable(artifact, target.length, failed);
  artifact.lastFullIngest = new Date().toISOString();
  writeJsonAtomic(PUBLISH_PATH, artifact);
  writeIngestStatus({
    status: "complete",
    done: artifact.diseases.length,
    target: target.length,
    published: artifact.diseases.length,
    sampling: {
      mode: sampling.mode,
      n: sampling.n,
      seed: sampling.seed,
    },
    updatedAt: new Date().toISOString(),
    message: "Ingest finished and published.",
  });
  log.info(`Published ${artifact.diseases.length} diseases → ${PUBLISH_PATH}`);

  const a = artifact.aggregate;
  const trialPct =
    a.trialsDenominator > 0
      ? ((100 * a.noTrials) / a.trialsDenominator).toFixed(1)
      : "n/a";
  log.info(
    `Done. wrote ${artifact.diseases.length} diseases (processed=${processed}, skipped=${skipped}, failed=${failed}). ` +
      `No trials ${a.noTrials}/${a.trialsDenominator} (${trialPct}%); broken=${a.brokenQueryRows}; ` +
      `noTrials+lit=${a.noTrialsWithSubstantialLiterature}; corrections=${corrections.length}; total=${a.totalDiseases}`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
