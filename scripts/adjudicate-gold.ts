/**
 * Build an automated, dual-provider accuracy benchmark.
 *
 * Required:
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 *   ADJUDICATION_OPENAI_MODEL
 *   ADJUDICATION_ANTHROPIC_MODEL
 *
 * Usage:
 *   npm run adjudicate:gold
 *   npm run adjudicate:gold -- --resume
 *   npm run adjudicate:gold -- --code 70
 *   npm run adjudicate:gold -- --limit 2
 *   npm run adjudicate:gold -- --resume --skip-noisy
 */

import fs from "node:fs";
import path from "node:path";
import {
  ADJUDICATION_PROMPT_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  CANDIDATE_QUERY_VERSION,
  consensusVerdict,
  discoverAutomatedBenchmarkEntry,
  type AutomatedBenchmark,
  type BenchmarkCandidate,
  type BenchmarkEntry,
  type BenchmarkSeedEntry,
  type BenchmarkControlResult,
} from "./lib/automated-benchmark";
import { adjudicateCandidate } from "./lib/benchmark-llm";
import { loadOrphanetDiseases, type OrphanetDisease } from "./lib/orphanet";
import { loadMondoHierarchy } from "./lib/mondo";
import { loadGenCC } from "./lib/gencc";
import { log } from "./lib/logger";
import { adjudicationBudgetStatus } from "./lib/adjudication-budget";
import type { TrialRecord } from "../src/lib/types";

/**
 * Ultra-high-volume seeds that burn budget or exceed CT.gov scan ceilings
 * once recall-expansion is on. Mid-size seeds are preferred for expansion.
 */
const NOISY_ORPHA_CODES = new Set([
  "586", // cystic fibrosis
  "98896", // Duchenne
  "636945", // invasive candidiasis
  "791", // retinitis pigmentosa
  "355", // Gaucher
  "324", // Fabry
  "98878", // Hemophilia A
  "778", // Rett
  "739", // Prader-Willi
  "905", // Wilson
  "60", // alpha-1-antitrypsin deficiency
  "300493", // Sagliker — incomplete scan under recall
  "293621", // X-linked endothelial corneal dystrophy — 1k+ hits
  "3099", // rheumatic fever
  "465508", // symptomatic HFE hemochromatosis
]);

/** Exhaustive dual-provider adjudication beyond this burns the $5 budget. */
const MAX_CANDIDATES_FOR_ADJUDICATION = 220;

interface SeedFile {
  entries: BenchmarkSeedEntry[];
}

interface Args {
  resume: boolean;
  code: string | null;
  limit: number | null;
  skipNoisy: boolean;
  force: boolean;
}

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

interface ControlCandidate {
  entry: BenchmarkEntry;
  candidate: BenchmarkCandidate;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    resume: false,
    code: null,
    limit: null,
    skipNoisy: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--resume") args.resume = true;
    else if (argv[i] === "--skip-noisy") args.skipNoisy = true;
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--code") {
      args.code = argv[++i] ?? null;
      if (!args.code) throw new Error("--code requires an ORPHAcode");
    } else if (argv[i] === "--limit") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      args.limit = value;
    }
  }
  return args;
}

function writeAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function assertConfiguration(): { openai: string; anthropic: string } {
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Automated adjudication requires both OPENAI_API_KEY and ANTHROPIC_API_KEY"
    );
  }
  const openai = process.env.ADJUDICATION_OPENAI_MODEL?.trim();
  const anthropic = process.env.ADJUDICATION_ANTHROPIC_MODEL?.trim();
  if (!openai || !anthropic) {
    throw new Error(
      "Set exact ADJUDICATION_OPENAI_MODEL and ADJUDICATION_ANTHROPIC_MODEL values; model provenance may not be implicit"
    );
  }
  return { openai, anthropic };
}

function newBenchmark(models: {
  openai: string;
  anthropic: string;
}): AutomatedBenchmark {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    completedAt: null,
    complete: false,
    candidateQueryVersion: CANDIDATE_QUERY_VERSION,
    promptVersion: ADJUDICATION_PROMPT_VERSION,
    models,
    controls: { required: 10, passed: 0, results: [] },
    entries: [],
  };
}

function compatible(
  benchmark: AutomatedBenchmark,
  models: { openai: string; anthropic: string }
): boolean {
  return (
    benchmark.schemaVersion === BENCHMARK_SCHEMA_VERSION &&
    benchmark.candidateQueryVersion === CANDIDATE_QUERY_VERSION &&
    benchmark.promptVersion === ADJUDICATION_PROMPT_VERSION &&
    benchmark.models.openai === models.openai &&
    benchmark.models.anthropic === models.anthropic
  );
}

function syntheticDisease(
  seed: BenchmarkSeedEntry,
  mondoIds: string[]
): OrphanetDisease {
  return {
    orphaCode: seed.orphaCode,
    name: seed.name.split(" / ")[0],
    synonyms: seed.manualAliases ?? [],
    definition: null,
    prevalenceClass: null,
    mondoIds,
    expertLink: `https://www.orpha.net/en/disease/detail/${seed.orphaCode}`,
    disorderGroup: "Group of disorders",
    disorderType: null,
  };
}

function hasCompleteVerdicts(
  entry: BenchmarkEntry,
  models: { openai: string; anthropic: string }
): boolean {
  return entry.candidates.every(
    (candidate) =>
      candidate.openai?.model === models.openai &&
      candidate.anthropic?.model === models.anthropic &&
      candidate.consensus != null
  );
}

async function adjudicateEntry(
  entry: BenchmarkEntry,
  models: { openai: string; anthropic: string },
  onCheckpoint: () => void
): Promise<void> {
  for (let index = 0; index < entry.candidates.length; index += 1) {
    const candidate = entry.candidates[index];
    if (
      candidate.openai?.model === models.openai &&
      candidate.anthropic?.model === models.anthropic &&
      candidate.consensus
    ) {
      continue;
    }
    const [openai, anthropic] = await Promise.all([
      adjudicateCandidate("openai", models.openai, entry, candidate),
      adjudicateCandidate("anthropic", models.anthropic, entry, candidate),
    ]);
    candidate.openai = openai;
    candidate.anthropic = anthropic;
    const consensus = consensusVerdict(openai.verdict, anthropic.verdict);
    candidate.consensus = consensus.verdict;
    candidate.consensusReason = consensus.reason;
    if ((index + 1) % 10 === 0) onCheckpoint();
  }
}

function toControlCandidate(
  entry: BenchmarkEntry,
  trial: TrialRecord
): ControlCandidate {
  return {
    entry,
    candidate: {
      nctId: trial.nctId,
      title: trial.title,
      conditions: trial.conditions ?? [],
      studyType: trial.studyType ?? null,
      status: trial.status,
      url: trial.url,
      discoveredVia: "pipeline",
    },
  };
}

async function adjudicateControls(
  pool: ControlCandidate[],
  models: { openai: string; anthropic: string }
): Promise<{
  results: BenchmarkControlResult[];
  passed: number;
  openaiPassed: number;
  anthropicPassed: number;
}> {
  const selected = [...pool]
    .sort(
      (a, b) =>
        hash(`control:${a.entry.orphaCode}:${a.candidate.nctId}`) -
          hash(`control:${b.entry.orphaCode}:${b.candidate.nctId}`) ||
        a.candidate.nctId.localeCompare(b.candidate.nctId)
    )
    .slice(0, 10);
  if (selected.length < 10) {
    throw new Error(
      `Only ${selected.length}/10 deterministic non-interventional controls were available`
    );
  }

  const results: BenchmarkControlResult[] = [];
  let passed = 0;
  let openaiPassed = 0;
  let anthropicPassed = 0;
  for (const item of selected) {
    const [openai, anthropic] = await Promise.all([
      adjudicateCandidate("openai", models.openai, item.entry, item.candidate),
      adjudicateCandidate(
        "anthropic",
        models.anthropic,
        item.entry,
        item.candidate
      ),
    ]);
    const openaiCorrect = openai.verdict === false;
    const anthropicCorrect = anthropic.verdict === false;
    if (openaiCorrect) openaiPassed += 1;
    if (anthropicCorrect) anthropicPassed += 1;
    if (openaiCorrect && anthropicCorrect) passed += 1;
    results.push({
      id: `${item.entry.orphaCode}:${item.candidate.nctId}`,
      expected: false,
      openai,
      anthropic,
      passed: openaiCorrect && anthropicCorrect,
    });
  }
  return { results, passed, openaiPassed, anthropicPassed };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const models = assertConfiguration();
  const startingBudget = adjudicationBudgetStatus();
  log.info(
    `Adjudication budget: $${startingBudget.remainingUsd.toFixed(4)} remaining of $${startingBudget.budgetUsd.toFixed(2)}`
  );
  const root = process.cwd();
  const seedPath = path.join(root, "tests", "gold-standard.json");
  const benchmarkPath = path.join(root, "tests", "automated-benchmark.json");
  const seeds = (JSON.parse(fs.readFileSync(seedPath, "utf8")) as SeedFile)
    .entries.filter((entry) => /^\d+$/.test(entry.orphaCode));

  let selected = seeds;
  if (args.code) {
    selected = selected.filter((entry) => entry.orphaCode === args.code);
    if (selected.length === 0) {
      throw new Error(`ORPHA:${args.code} is not in ${seedPath}`);
    }
  }
  if (args.skipNoisy) {
    const before = selected.length;
    selected = selected.filter(
      (entry) => !NOISY_ORPHA_CODES.has(entry.orphaCode)
    );
    log.info(
      `Skipping noisy high-volume seeds: removed ${before - selected.length}`
    );
  }
  if (args.limit != null) selected = selected.slice(0, args.limit);

  let benchmark = newBenchmark(models);
  if (args.resume && fs.existsSync(benchmarkPath)) {
    const existing = JSON.parse(
      fs.readFileSync(benchmarkPath, "utf8")
    ) as AutomatedBenchmark;
    if (!compatible(existing, models)) {
      // Allow carrying adjudicated verdicts forward when only the production
      // query version advanced (recall-expansion landed in ingest).
      const queryOnlyDrift =
        existing.schemaVersion === BENCHMARK_SCHEMA_VERSION &&
        existing.promptVersion === ADJUDICATION_PROMPT_VERSION &&
        existing.models.openai === models.openai &&
        existing.models.anthropic === models.anthropic &&
        existing.candidateQueryVersion !== CANDIDATE_QUERY_VERSION;
      if (!queryOnlyDrift) {
        throw new Error(
          "Existing automated benchmark uses different schema, query, prompt, or models; start without --resume"
        );
      }
      log.info(
        `Migrating candidateQueryVersion ${existing.candidateQueryVersion} → ${CANDIDATE_QUERY_VERSION}; prior verdicts reused by NCT ID`
      );
      existing.candidateQueryVersion = CANDIDATE_QUERY_VERSION;
      existing.complete = false;
      existing.completedAt = null;
    }
    benchmark = existing;
    if (args.skipNoisy) {
      const before = benchmark.entries.length;
      benchmark.entries = benchmark.entries.filter(
        (entry) =>
          hasCompleteVerdicts(entry, models) &&
          entry.candidates.length <= MAX_CANDIDATES_FOR_ADJUDICATION &&
          !NOISY_ORPHA_CODES.has(entry.orphaCode)
      );
      if (benchmark.entries.length !== before) {
        log.info(
          `Pruned ${before - benchmark.entries.length} incomplete/noisy benchmark entries`
        );
        writeAtomic(benchmarkPath, benchmark);
      }
    }
  }

  const { diseases, orphaMondoByCode, allOrphaCodes } =
    await loadOrphanetDiseases();
  const byCode = new Map(diseases.map((disease) => [disease.orphaCode, disease]));
  const mondo = await loadMondoHierarchy();
  const gencc = await loadGenCC();
  const entryMap = new Map(
    benchmark.entries.map((entry) => [entry.orphaCode, entry])
  );
  const controls: ControlCandidate[] = [];

  const checkpoint = () => {
    benchmark.entries = [...entryMap.values()].sort(
      (a, b) => Number(a.orphaCode) - Number(b.orphaCode)
    );
    writeAtomic(benchmarkPath, benchmark);
  };

  const isFullRun =
    !args.code && args.limit == null && selected.length === seeds.length;

  for (let index = 0; index < selected.length; index += 1) {
    const seed = selected[index];
    if (!allOrphaCodes.has(seed.orphaCode)) {
      throw new Error(`ORPHA:${seed.orphaCode} is absent from Orphanet`);
    }
    const existing = entryMap.get(seed.orphaCode);
    if (
      !args.force &&
      !args.code &&
      existing &&
      hasCompleteVerdicts(existing, models) &&
      (!isFullRun || benchmark.controls.results.length >= 10)
    ) {
      log.info(
        `[${index + 1}/${selected.length}] ORPHA:${seed.orphaCode} already complete`
      );
      continue;
    }

    log.info(
      `[${index + 1}/${selected.length}] discovering ORPHA:${seed.orphaCode} ${seed.name}`
    );
    const disease =
      byCode.get(seed.orphaCode) ??
      syntheticDisease(
        seed,
        orphaMondoByCode.get(seed.orphaCode) ?? []
      );
    let discovered: Awaited<
      ReturnType<typeof discoverAutomatedBenchmarkEntry>
    >;
    try {
      discovered = await discoverAutomatedBenchmarkEntry({
        seed,
        disease,
        mondo,
        gencc,
      });
    } catch (err) {
      const message = String(err);
      if (args.skipNoisy && /scan incomplete/i.test(message)) {
        log.warn(
          `  skipping ORPHA:${seed.orphaCode}: incomplete CT.gov scan (too many hits for exhaustive adjudication)`
        );
        continue;
      }
      throw err;
    }
    const previousById = new Map(
      (existing?.candidates ?? []).map((candidate) => [
        candidate.nctId,
        candidate,
      ])
    );
    for (const candidate of discovered.entry.candidates) {
      const previous = previousById.get(candidate.nctId);
      if (previous) {
        candidate.openai = previous.openai;
        candidate.anthropic = previous.anthropic;
        candidate.consensus = previous.consensus;
        candidate.consensusReason = previous.consensusReason;
      }
    }
    if (discovered.entry.candidates.length > MAX_CANDIDATES_FOR_ADJUDICATION) {
      log.warn(
        `  skipping ORPHA:${seed.orphaCode}: ${discovered.entry.candidates.length} candidates > ${MAX_CANDIDATES_FOR_ADJUDICATION} cap`
      );
      if (entryMap.has(seed.orphaCode)) {
        entryMap.delete(seed.orphaCode);
        checkpoint();
      }
      continue;
    }

    entryMap.set(seed.orphaCode, discovered.entry);
    for (const trial of discovered.nonInterventionalControls) {
      controls.push(toControlCandidate(discovered.entry, trial));
    }
    checkpoint();

    log.info(
      `  adjudicating ${discovered.entry.candidates.length} exhaustive candidates`
    );
    try {
      await adjudicateEntry(discovered.entry, models, checkpoint);
    } catch (err) {
      const message = String(err);
      if (/budget exhausted/i.test(message)) {
        checkpoint();
        log.warn(message);
        break;
      }
      throw err;
    }
    checkpoint();
  }

  if (isFullRun) {
    const controlResults =
      controls.length >= 10
        ? await adjudicateControls(controls, models)
        : {
            results: benchmark.controls.results,
            passed: benchmark.controls.results.filter((result) => result.passed)
              .length,
            openaiPassed: benchmark.controls.results.filter(
              (result) => result.openai?.verdict === false
            ).length,
            anthropicPassed: benchmark.controls.results.filter(
              (result) => result.anthropic?.verdict === false
            ).length,
          };
    benchmark.controls = {
      required: 10,
      passed: controlResults.passed,
      results: controlResults.results,
    };
    if (
      controlResults.openaiPassed < 8 ||
      controlResults.anthropicPassed < 8
    ) {
      checkpoint();
      throw new Error(
        `Hidden controls failed: OpenAI ${controlResults.openaiPassed}/10, Anthropic ${controlResults.anthropicPassed}/10`
      );
    }
  }

  benchmark.entries = [...entryMap.values()].sort(
    (a, b) => Number(a.orphaCode) - Number(b.orphaCode)
  );
  benchmark.complete =
    isFullRun &&
    seeds.every((seed) => {
      const entry = entryMap.get(seed.orphaCode);
      return entry ? hasCompleteVerdicts(entry, models) : false;
    }) &&
    benchmark.controls.passed >= 8;
  benchmark.completedAt = benchmark.complete ? new Date().toISOString() : null;
  writeAtomic(benchmarkPath, benchmark);
  const endingBudget = adjudicationBudgetStatus();
  log.info(
    `Automated benchmark ${benchmark.complete ? "complete" : "checkpointed"}: ${benchmark.entries.length}/${seeds.length} diseases; ` +
      `budget spent/reserved=$${endingBudget.spentUsd.toFixed(4)}, remaining=$${endingBudget.remainingUsd.toFixed(4)}`
  );
}

main().catch((error) => {
  log.error(String(error));
  process.exit(1);
});

