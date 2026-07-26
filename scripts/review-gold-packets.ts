/**
 * Dual-provider adjudication of tests/gold-review.json candidates.
 * Writes verdicts (including relevant-to-parent-category), marks attention
 * checks, sets publication reviewed ranges, then is ready for:
 *   npm run verify:gold -- --apply
 *
 *   npx tsx scripts/review-gold-packets.ts
 *   npx tsx scripts/review-gold-packets.ts --resume
 */
import fs from "node:fs";
import path from "node:path";
import {
  consensusVerdict,
  type AutomatedVerdict,
  type BenchmarkCandidate,
  type BenchmarkEntry,
} from "./lib/automated-benchmark";
import { adjudicateCandidate } from "./lib/benchmark-llm";
import { adjudicationBudgetStatus } from "./lib/adjudication-budget";
import { log } from "./lib/logger";

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

type PacketVerdict =
  | true
  | false
  | "uncertain"
  | "relevant-to-parent-category"
  | null;

interface ReviewTrial {
  nctId: string;
  title: string;
  conditions: string[];
  studyType: string | null;
  status: string;
  matchedVia: "mesh" | "phrase" | "both" | null;
  url: string;
  relevant: PacketVerdict;
  reason: string;
  discoveredVia: "pipeline" | "broad" | "both";
  likelyParentCategory?: boolean;
  reviewSession: number;
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

function toBenchmarkShapes(
  entry: ReviewEntry,
  trial: ReviewTrial
): { entry: BenchmarkEntry; candidate: BenchmarkCandidate } {
  const aliases = [
    entry.goldName,
    ...entry.queries.broadTerms,
    ...(entry.queries.parentCategoryLabel
      ? [entry.queries.parentCategoryLabel]
      : []),
  ].filter(Boolean);
  return {
    entry: {
      orphaCode: entry.orphaCode,
      name: entry.goldName,
      orphanetName: entry.orphanetName,
      definition: entry.definition,
      knownDifficulty: entry.knownDifficulty,
      aliases,
      queries: {
        pipelineTerms: [],
        broadTerms: entry.queries.broadTerms,
        meshLabels: entry.queries.meshLabels,
        pipeline: entry.queries.clinicalTrials,
        broad: entry.queries.broadClinicalTrials,
      },
      fullyScanned: entry.trials.fullyScanned,
      candidates: [],
      pipelineTotal: entry.trials.pipelineTotal ?? 0,
      broadSearchTotal: entry.trials.broadSearchTotal ?? 0,
      broadOnlyPopulation: entry.trials.broadOnlyPopulation,
      excludedNonInterventional: entry.trials.excludedNonInterventional,
      publicationCounts: {
        phrase: entry.publications.phraseCount,
        mesh: entry.publications.meshCount,
        union: entry.publications.unionCount,
      },
    } as unknown as BenchmarkEntry,
    candidate: {
      nctId: trial.nctId,
      title: trial.title,
      conditions: trial.conditions,
      studyType: trial.studyType,
      status: trial.status,
      url: trial.url,
      discoveredVia: trial.discoveredVia,
    },
  };
}

function mapConsensus(
  openai: AutomatedVerdict,
  anthropic: AutomatedVerdict,
  likelyParentCategory: boolean
): { relevant: Exclude<PacketVerdict, null>; reason: string } {
  const { verdict, reason } = consensusVerdict(openai, anthropic);
  if (verdict === "relevant") {
    // Dual true on a parent-hinted broad hit still needs a parent tag when both
    // providers actually returned parent-category (handled above). If consensus
    // is relevant but the packet flagged a name-parent condition match, keep
    // disease-true — the models saw subtype evidence.
    return { relevant: true, reason };
  }
  if (verdict === "irrelevant") return { relevant: false, reason };
  if (verdict === "parent-category") {
    return { relevant: "relevant-to-parent-category", reason };
  }
  // Uncertain: if the packet already tagged a name-parent condition match and
  // neither provider said irrelevant, prefer the parent-category verdict so
  // the review measures the tier split instead of discarding the case.
  if (
    likelyParentCategory &&
    openai !== false &&
    anthropic !== false &&
    (openai === "relevant-to-parent-category" ||
      anthropic === "relevant-to-parent-category" ||
      openai === "uncertain" ||
      anthropic === "uncertain")
  ) {
    return {
      relevant: "relevant-to-parent-category",
      reason: `${reason} Packet likelyParentCategory=true; recorded as parent-category.`,
    };
  }
  return { relevant: "uncertain", reason };
}

function writeAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const resume = process.argv.includes("--resume");
  const openaiModel = process.env.ADJUDICATION_OPENAI_MODEL;
  const anthropicModel = process.env.ADJUDICATION_ANTHROPIC_MODEL;
  if (!openaiModel || !anthropicModel) {
    throw new Error(
      "Set ADJUDICATION_OPENAI_MODEL and ADJUDICATION_ANTHROPIC_MODEL in .env.local"
    );
  }
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    throw new Error("OPENAI_API_KEY and ANTHROPIC_API_KEY are required");
  }

  const reviewPath = path.join(process.cwd(), "tests", "gold-review.json");
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8")) as ReviewFile;

  let adjudicated = 0;
  let skipped = 0;
  let attentionMarked = 0;

  for (let e = 0; e < review.entries.length; e += 1) {
    const entry = review.entries[e];
    log.info(
      `[${e + 1}/${review.entries.length}] ORPHA:${entry.orphaCode} ${entry.orphanetName} (${entry.trials.candidates.length} candidates)`
    );

    for (const trial of entry.trials.candidates) {
      if (trial.studyType !== "INTERVENTIONAL") {
        if (trial.relevant == null || !resume) {
          trial.relevant = false;
          trial.reason =
            "Attention check: non-interventional studies are not clinical trials.";
          attentionMarked += 1;
        }
        continue;
      }

      if (
        resume &&
        trial.relevant != null &&
        trial.reason.trim().length > 0
      ) {
        skipped += 1;
        continue;
      }

      const shapes = toBenchmarkShapes(entry, trial);
      const [openai, anthropic] = await Promise.all([
        adjudicateCandidate(
          "openai",
          openaiModel,
          shapes.entry,
          shapes.candidate
        ),
        adjudicateCandidate(
          "anthropic",
          anthropicModel,
          shapes.entry,
          shapes.candidate
        ),
      ]);
      const mapped = mapConsensus(
        openai.verdict,
        anthropic.verdict,
        Boolean(trial.likelyParentCategory)
      );
      trial.relevant = mapped.relevant;
      trial.reason = `OpenAI=${String(openai.verdict)}; Anthropic=${String(anthropic.verdict)}. ${mapped.reason} ${openai.reason} / ${anthropic.reason}`.slice(
        0,
        480
      );
      adjudicated += 1;

      if (adjudicated % 10 === 0) {
        writeAtomic(reviewPath, review);
        const budget = adjudicationBudgetStatus();
        log.info(
          `  checkpoint adjudicated=${adjudicated} spent=$${budget.spentUsd.toFixed(3)} remaining=$${budget.remainingUsd.toFixed(3)}`
        );
      }
    }

    const union = entry.publications.unionCount;
    if (union != null) {
      // Live Europe PMC union is the reviewed point estimate for this packet.
      entry.publications.reviewedRange = [union, union];
      entry.publications.reviewed = true;
    } else if (entry.publications.previousRange) {
      entry.publications.reviewedRange = entry.publications.previousRange;
      entry.publications.reviewed = true;
    }

    entry.reviewedBy = "dual-model-consensus (gpt-4o-mini + claude-haiku-4-5)";
    entry.reviewedOn = new Date().toISOString().slice(0, 10);
    entry.reviewNotes =
      "Automated dual-provider adjudication with parent-category verdict support (prompt trial-relevance-v2). Attention checks marked irrelevant. Publication range set to live Europe PMC union count.";

    writeAtomic(reviewPath, review);
  }

  writeAtomic(reviewPath, review);
  const budget = adjudicationBudgetStatus();
  const counts = { true: 0, false: 0, uncertain: 0, parent: 0 };
  for (const entry of review.entries) {
    for (const trial of entry.trials.candidates) {
      if (trial.studyType !== "INTERVENTIONAL") continue;
      if (trial.relevant === true) counts.true += 1;
      else if (trial.relevant === false) counts.false += 1;
      else if (trial.relevant === "uncertain") counts.uncertain += 1;
      else if (trial.relevant === "relevant-to-parent-category") counts.parent += 1;
    }
  }

  log.info(
    `Done. adjudicated=${adjudicated} skipped=${skipped} attentionMarked=${attentionMarked}`
  );
  log.info(
    `Verdicts: true=${counts.true} false=${counts.false} uncertain=${counts.uncertain} parent-category=${counts.parent}`
  );
  log.info(
    `Budget spent=$${budget.spentUsd.toFixed(3)} remaining=$${budget.remainingUsd.toFixed(3)}`
  );
  log.info("Next: npm run verify:gold -- --apply");
}

main().catch((error) => {
  log.error(String(error));
  process.exit(1);
});
