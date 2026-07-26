import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  adjudicationCacheKey,
  assertBenchmarkScansFullyScanned,
  consensusVerdict,
  mergeBenchmarkCandidates,
  parseModelVerdict,
  type BenchmarkCandidate,
  type BenchmarkEntry,
} from "./lib/automated-benchmark";
import { buildAdjudicationEvidence } from "./lib/benchmark-llm";
import {
  adjudicationBudgetStatus,
  reserveAdjudicationBudget,
  settleAdjudicationBudget,
} from "./lib/adjudication-budget";
import type { TrialRecord } from "../src/lib/types";

const trial = (nctId: string, title = "Study of Alpha disease"): TrialRecord => ({
  nctId,
  title,
  status: "COMPLETED",
  url: `https://clinicaltrials.gov/study/${nctId}`,
  conditions: ["Alpha disease"],
  studyType: "INTERVENTIONAL",
});

assert.deepEqual(consensusVerdict(true, true).verdict, "relevant");
assert.deepEqual(consensusVerdict(false, false).verdict, "irrelevant");
assert.deepEqual(consensusVerdict(true, false).verdict, "uncertain");
assert.deepEqual(consensusVerdict("uncertain", true).verdict, "uncertain");

assert.deepEqual(
  parseModelVerdict(
    '```json\n{"relevant":true,"reason":"The condition field names it."}\n```'
  ),
  { verdict: true, reason: "The condition field names it." }
);
assert.throws(() => parseModelVerdict('{"relevant":"yes","reason":"bad"}'));
assert.throws(() => parseModelVerdict('{"relevant":true}'));

const candidate: BenchmarkCandidate = {
  ...trial("NCT00000001"),
  conditions: ["Alpha disease"],
  studyType: "INTERVENTIONAL",
  discoveredVia: "pipeline",
};
const entry: BenchmarkEntry = {
  orphaCode: "1",
  name: "Alpha disease",
  orphanetName: "Alpha disease",
  definition: "A rare condition.",
  knownDifficulty: "none",
  aliases: ["Alpha syndrome"],
  queries: {
    pipelineTerms: ["Alpha disease"],
    broadTerms: ["Alpha syndrome"],
    meshLabels: [],
    pipeline: '"Alpha disease"',
    broad: '"Alpha syndrome"',
  },
  fullyScanned: true,
  pipelinePopulation: 1,
  broadOnlyPopulation: 0,
  publicationDiagnostics: {
    phraseCount: 1,
    meshCount: 0,
    unionCount: 1,
    broadCount: 1,
  },
  candidates: [candidate],
};

const evidence = buildAdjudicationEvidence(entry, candidate);
assert.equal("discoveredVia" in evidence.trial, false);
assert.equal(JSON.stringify(evidence).includes("pipeline"), false);

const firstKey = adjudicationCacheKey({
  provider: "openai",
  model: "model-a",
  diseaseName: entry.orphanetName,
  definition: entry.definition,
  aliases: entry.aliases,
  candidate,
});
const changedModelKey = adjudicationCacheKey({
  provider: "openai",
  model: "model-b",
  diseaseName: entry.orphanetName,
  definition: entry.definition,
  aliases: entry.aliases,
  candidate,
});
const changedEvidenceKey = adjudicationCacheKey({
  provider: "openai",
  model: "model-a",
  diseaseName: entry.orphanetName,
  definition: entry.definition,
  aliases: entry.aliases,
  candidate: { ...candidate, title: "Changed evidence" },
});
assert.notEqual(firstKey, changedModelKey);
assert.notEqual(firstKey, changedEvidenceKey);

const merged = mergeBenchmarkCandidates(
  [trial("NCT00000001"), trial("NCT00000002")],
  [trial("NCT00000002"), trial("NCT00000003")]
);
assert.equal(merged.length, 3);
assert.equal(
  merged.find((item) => item.nctId === "NCT00000002")?.discoveredVia,
  "both"
);

assert.doesNotThrow(() =>
  assertBenchmarkScansFullyScanned("1", true, true)
);
assert.throws(
  () => assertBenchmarkScansFullyScanned("1", true, false),
  /scan incomplete/
);

const originalCwd = process.cwd();
const budgetDir = fs.mkdtempSync(path.join(os.tmpdir(), "rrd-budget-"));
process.chdir(budgetDir);
process.env.ADJUDICATION_BUDGET_USD = "0.001";
const reservation = reserveAdjudicationBudget({
  provider: "openai",
  model: "gpt-4o-mini",
  prompt: "small prompt",
  maxOutputTokens: 20,
});
assert(adjudicationBudgetStatus().spentUsd > 0);
settleAdjudicationBudget(reservation, { inputTokens: 2, outputTokens: 2 });
assert(adjudicationBudgetStatus().spentUsd < reservation.maximumUsd);
assert.throws(
  () =>
    reserveAdjudicationBudget({
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "x".repeat(10_000_000),
      maxOutputTokens: 220,
    }),
  /budget exhausted/
);
process.chdir(originalCwd);
fs.rmSync(budgetDir, { recursive: true, force: true });

console.log("Automated accuracy fixture tests passed.");

