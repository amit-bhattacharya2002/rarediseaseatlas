/**
 * Validation harness (Part 3).
 *
 *   npm run validate
 *
 * Runs the live matching pipeline against tests/gold-standard.json and reports
 * recall / precision (bidirectional proxies), a per-difficulty breakdown, and a
 * regression diff vs the committed baseline. Fails the build if trial recall
 * drops below the last recorded baseline. Writes the measured summary into
 * data/diseases.json (artifact.validation) so the UI can publish real numbers.
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
  novelRecallTerms,
  parentLabelsForRecall,
  phraseQueryFromTerms,
} from "./lib/query-build";
import { fetchPublicationSignals } from "./lib/europepmc";
import { fetchTrialSignals } from "./lib/trials";
import { loadGenCC, lookupGenCC } from "./lib/gencc";
import { log } from "./lib/logger";
import type { DiseasesArtifact, ValidationSummary } from "../src/lib/types";
import type {
  AutomatedBenchmark,
  BenchmarkCandidate,
} from "./lib/automated-benchmark";

const RECALL_REGRESSION_EPSILON = 0.02;

interface GoldEntry {
  orphaCode: string;
  name: string;
  manualAliases?: string[];
  verifiedOn: string;
  trueTrialCount: number;
  truePublicationRange: [number, number];
  knownDifficulty: string;
  notes?: string;
  knownRelevantNctIds?: string[];
  knownIrrelevantNctIds?: string[];
  uncertainNctIds?: string[];
  knownParentCategoryNctIds?: string[];
  reviewedBy?: string;
}

interface GoldFile {
  entries: GoldEntry[];
}

interface EntryResult {
  orphaCode: string;
  name: string;
  difficulty: string;
  foundTrials: number;
  foundPubs: number;
  trueTrials: number;
  pubRange: [number, number];
  recall: number | null;
  precision: number | null;
  pubsInRange: boolean;
  matchedVia: string[];
  truePositiveNctIds: string[];
  falsePositiveNctIds: string[];
}

interface Baseline {
  runAt: string;
  trialsRecall: number;
  trialsPrecision: number;
  publicationsWithinRange: number;
  count: number;
  perEntry: Record<string, { foundTrials: number; foundPubs: number }>;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1;
}

async function main(): Promise<void> {
  const goldPath = path.join(process.cwd(), "tests", "gold-standard.json");
  const gold = JSON.parse(fs.readFileSync(goldPath, "utf8")) as GoldFile;

  const { diseases, orphaMondoByCode, allOrphaCodes } =
    await loadOrphanetDiseases();
  const byCode = new Map(diseases.map((d) => [d.orphaCode, d]));
  const mondo = await loadMondoHierarchy();
  const gencc = await loadGenCC();

  const normalizeLabel = (value: string): string =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const mappingErrors: string[] = [];
  for (const g of gold.entries) {
    if (!/^\d+$/.test(g.orphaCode)) continue;
    if (
      !Array.isArray(g.knownRelevantNctIds) ||
      !Array.isArray(g.knownIrrelevantNctIds) ||
      !Array.isArray(g.uncertainNctIds) ||
      !g.reviewedBy?.trim()
    ) {
      mappingErrors.push(
        `ORPHA:${g.orphaCode} (${g.name}) has not completed NCT-level human review; run npm run verify:gold`
      );
    } else if (g.trueTrialCount !== g.knownRelevantNctIds.length) {
      mappingErrors.push(
        `ORPHA:${g.orphaCode} trueTrialCount=${g.trueTrialCount} but knownRelevantNctIds has ${g.knownRelevantNctIds.length}`
      );
    }
    if (!allOrphaCodes.has(g.orphaCode)) {
      mappingErrors.push(
        `ORPHA:${g.orphaCode} (${g.name}) is absent from the loaded Orphanet corpus`
      );
      continue;
    }

    const od = byCode.get(g.orphaCode);
    // Umbrella/group entities are intentionally excluded from the disease list,
    // but remain valid gold cases when their code exists in the full corpus.
    if (!od) {
      if (g.knownDifficulty !== "umbrella") {
        mappingErrors.push(
          `ORPHA:${g.orphaCode} (${g.name}) is not a usable disease row; only umbrella gold cases may target filtered group entities`
        );
      }
      continue;
    }

    const expected = normalizeLabel(g.name.split(" / ")[0].split(" (")[0]);
    const corpusLabels = [od.name, ...od.synonyms].map(normalizeLabel);
    const matches = corpusLabels.some(
      (label) =>
        label === expected ||
        label.includes(expected) ||
        expected.includes(label)
    );
    if (!matches) {
      mappingErrors.push(
        `ORPHA:${g.orphaCode} gold label "${g.name}" resolves to "${od.name}"`
      );
    }
  }
  if (mappingErrors.length > 0) {
    throw new Error(
      `Gold-standard ORPHA mapping errors:\n- ${mappingErrors.join("\n- ")}`
    );
  }

  const results: EntryResult[] = [];

  for (const g of gold.entries) {
    if (!/^\d+$/.test(g.orphaCode)) continue; // skip placeholders
    const od = byCode.get(g.orphaCode);
    const name = od?.name ?? g.name.split(" / ")[0].split(" (")[0];
    const synonyms = od?.synonyms ?? [];
    const mondoIds = od?.mondoIds ?? orphaMondoByCode.get(g.orphaCode) ?? [];

    const identifiers = collectIdentifiers(mondoIds, mondo);
    const mondoSynonyms = collectExactSynonyms(mondoIds, mondo);
    const meshLabels = await resolveMeshLabels(identifiers.mesh);

    const { terms: phraseTerms } = buildPhraseTerms(
      [name],
      [...synonyms, ...mondoSynonyms]
    );
    const phraseQuery = phraseQueryFromTerms(phraseTerms);
    const gene = lookupGenCC(gencc, mondoIds, g.orphaCode);
    const parentLabels = parentLabelsForRecall(
      mondoIds,
      (id, maxDepth) => mondo.ancestors(id, maxDepth),
      (id) => mondo.label(id),
      name
    );
    const recallTerms = novelRecallTerms(
      phraseTerms,
      buildRecallExpansionTerms({
        name,
        synonyms,
        mondoSynonyms,
        parentLabels,
        genes: gene.genes,
        manualAliases: g.manualAliases,
      })
    );

    let foundTrials = 0;
    let matchedVia: string[] = [];
    let foundTrialIds: string[] = [];
    try {
      const t = await fetchTrialSignals(phraseTerms, meshLabels, recallTerms);
      foundTrials = t.total;
      matchedVia = t.matchedVia;
      foundTrialIds = t.matchedStudies.map((study) => study.nctId);
    } catch (err) {
      log.warn(`validate: trials fetch failed ORPHA:${g.orphaCode}: ${String(err)}`);
    }

    let foundPubs = 0;
    try {
      const p = await fetchPublicationSignals(phraseQuery, meshLabels);
      foundPubs = p.total;
    } catch (err) {
      log.warn(`validate: pubs fetch failed ORPHA:${g.orphaCode}: ${String(err)}`);
    }

    const relevant = new Set(g.knownRelevantNctIds ?? []);
    const irrelevant = new Set(g.knownIrrelevantNctIds ?? []);
    const truePositiveNctIds = foundTrialIds.filter((id) => relevant.has(id));
    const falsePositiveNctIds = foundTrialIds.filter((id) => irrelevant.has(id));
    const trueT = relevant.size;
    // Recall: reviewed relevant IDs found / all independently reviewed relevant IDs.
    const recall =
      trueT > 0 ? truePositiveNctIds.length / trueT : null;
    // Precision: relevant / (relevant + irrelevant) in the fixed, deterministic
    // reviewed sample. Unreviewed population IDs and uncertain IDs are excluded.
    const adjudicatedFound =
      truePositiveNctIds.length + falsePositiveNctIds.length;
    const precision =
      adjudicatedFound > 0
        ? truePositiveNctIds.length / adjudicatedFound
        : null;
    const pubsInRange =
      foundPubs >= g.truePublicationRange[0] && foundPubs <= g.truePublicationRange[1];

    results.push({
      orphaCode: g.orphaCode,
      name,
      difficulty: g.knownDifficulty,
      foundTrials,
      foundPubs,
      trueTrials: trueT,
      pubRange: g.truePublicationRange,
      recall,
      precision,
      pubsInRange,
      matchedVia,
      truePositiveNctIds,
      falsePositiveNctIds,
    });

    log.info(
      `ORPHA:${g.orphaCode} ${name} [${g.knownDifficulty}] trials found=${foundTrials} true=${trueT} ` +
        `recall=${recall == null ? "n/a" : recall.toFixed(2)} prec=${precision == null ? "n/a" : precision.toFixed(2)} ` +
        `pubs=${foundPubs} in[${g.truePublicationRange.join(",")}]=${pubsInRange} via=${matchedVia.join("|") || "-"}`
    );
  }

  const trialsRecall = mean(results.map((r) => r.recall).filter((x): x is number => x != null));
  const trialsPrecision = mean(
    results.map((r) => r.precision).filter((x): x is number => x != null)
  );
  const publicationsWithinRange = mean(results.map((r) => (r.pubsInRange ? 1 : 0)));

  const byDifficulty: ValidationSummary["byDifficulty"] = {};
  for (const r of results) {
    const b = (byDifficulty[r.difficulty] ??= {
      count: 0,
      trialsRecall: 0,
      trialsPrecision: 0,
      consensusCoverage: 1,
    });
    b.count += 1;
  }
  for (const diff of Object.keys(byDifficulty)) {
    const rs = results.filter((r) => r.difficulty === diff);
    byDifficulty[diff].trialsRecall = mean(
      rs.map((r) => r.recall).filter((x): x is number => x != null)
    );
    byDifficulty[diff].trialsPrecision = mean(
      rs.map((r) => r.precision).filter((x): x is number => x != null)
    );
  }

  const summary: ValidationSummary = {
    runAt: new Date().toISOString(),
    method: "legacy-human-review",
    benchmarkVersion: "legacy-gold-standard",
    trialsRecall,
    trialsPrecision,
    publicationsWithinRange,
    publicationQueryAgreement: null,
    consensusCoverage: 1,
    consensusCandidates: 0,
    uncertainCandidates: 0,
    count: results.length,
    byDifficulty,
  };

  log.info(
    `SUMMARY recall=${trialsRecall.toFixed(3)} precision=${trialsPrecision.toFixed(3)} ` +
      `pubsInRange=${publicationsWithinRange.toFixed(3)} n=${results.length}`
  );
  for (const [diff, b] of Object.entries(byDifficulty)) {
    log.info(
      `  [${diff}] n=${b.count} recall=${b.trialsRecall.toFixed(2)} precision=${b.trialsPrecision.toFixed(2)}`
    );
  }

  // Baseline comparison / regression diff
  const baselinePath = path.join(process.cwd(), "tests", "validation-baseline.json");
  const perEntry: Baseline["perEntry"] = {};
  for (const r of results) perEntry[r.orphaCode] = { foundTrials: r.foundTrials, foundPubs: r.foundPubs };

  let regressed = false;
  if (fs.existsSync(baselinePath)) {
    const prev = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as Baseline;
    log.info(
      `Baseline: recall=${prev.trialsRecall.toFixed(3)} (from ${prev.runAt.slice(0, 10)})`
    );
    for (const r of results) {
      const p = prev.perEntry?.[r.orphaCode];
      if (p && r.foundTrials < p.foundTrials) {
        log.warn(
          `  REGRESSED ORPHA:${r.orphaCode} ${r.name}: trials ${p.foundTrials} → ${r.foundTrials}`
        );
      }
    }
    if (trialsRecall < prev.trialsRecall - RECALL_REGRESSION_EPSILON) {
      regressed = true;
      log.fail(
        `Trial recall ${trialsRecall.toFixed(3)} dropped below baseline ${prev.trialsRecall.toFixed(3)} (epsilon ${RECALL_REGRESSION_EPSILON}).`
      );
    }
    // keep baseline at the best observed recall
    if (!regressed && trialsRecall >= prev.trialsRecall) {
      writeBaseline(baselinePath, summary, perEntry);
    }
  } else {
    writeBaseline(baselinePath, summary, perEntry);
    log.info("Wrote initial validation baseline.");
  }

  // Publish measured numbers into the artifact
  const artifactPath = path.join(process.cwd(), "data", "diseases.json");
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as DiseasesArtifact;
    artifact.validation = summary;
    const tmp = artifactPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, artifactPath);
    log.info("Wrote validation summary into data/diseases.json");
  }

  if (regressed) process.exit(1);
}

interface AutomatedEntryResult {
  orphaCode: string;
  name: string;
  difficulty: string;
  foundTrials: number;
  recall: number | null;
  precision: number | null;
  consensusCoverage: number;
  relevant: number;
  irrelevant: number;
  uncertain: number;
}

interface AutomatedBaseline {
  runAt: string;
  benchmarkVersion: string;
  trialsRecall: number;
  trialsPrecision: number;
  consensusCoverage: number;
  perEntry: Record<string, { foundTrials: number }>;
}

function benchmarkVersion(benchmark: AutomatedBenchmark): string {
  return [
    benchmark.candidateQueryVersion,
    benchmark.promptVersion,
    `openai=${benchmark.models.openai}`,
    `anthropic=${benchmark.models.anthropic}`,
  ].join("|");
}

function candidateVerdictCounts(candidates: BenchmarkCandidate[]): {
  relevant: number;
  irrelevant: number;
  uncertain: number;
} {
  return {
    relevant: candidates.filter((candidate) => candidate.consensus === "relevant")
      .length,
    irrelevant: candidates.filter(
      (candidate) => candidate.consensus === "irrelevant"
    ).length,
    uncertain: candidates.filter(
      (candidate) =>
        candidate.consensus === "uncertain" ||
        candidate.consensus === "parent-category"
    ).length,
  };
}

async function mainAutomated(): Promise<void> {
  const partial = process.argv.includes("--partial");
  const root = process.cwd();
  const benchmarkPath = path.join(root, "tests", "automated-benchmark.json");
  if (!fs.existsSync(benchmarkPath)) {
    throw new Error(
      "Missing tests/automated-benchmark.json; run npm run adjudicate:gold"
    );
  }
  const benchmark = JSON.parse(
    fs.readFileSync(benchmarkPath, "utf8")
  ) as AutomatedBenchmark;
  if (!benchmark.complete && !partial) {
    throw new Error(
      "Automated benchmark is incomplete; run npm run adjudicate:gold -- --resume, or npm run validate -- --partial"
    );
  }
  if (!benchmark.models.openai || !benchmark.models.anthropic) {
    throw new Error("Automated benchmark lacks dual-provider model provenance");
  }
  if (!partial && benchmark.controls.passed < 8) {
    throw new Error(
      "Automated benchmark lacks passed controls; finish a full adjudicate run"
    );
  }

  const results: AutomatedEntryResult[] = [];
  let consensusCandidates = 0;
  let uncertainCandidates = 0;
  const entries = benchmark.entries.filter((entry) =>
    entry.candidates.every((candidate) => candidate.consensus != null)
  );
  if (entries.length === 0) {
    throw new Error("No fully adjudicated diseases available to validate");
  }
  if (partial) {
    log.info(
      `Partial validation over ${entries.length}/${benchmark.entries.length} adjudicated diseases`
    );
  }

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    log.info(
      `[${index + 1}/${entries.length}] validating ORPHA:${entry.orphaCode} ${entry.name}`
    );
    const trials = await fetchTrialSignals(
      entry.queries.pipelineTerms,
      entry.queries.meshLabels
    );
    if (!trials.fullyScanned) {
      if (partial) {
        log.warn(
          `ORPHA:${entry.orphaCode}: production trial scan incomplete — skipped in --partial`
        );
        continue;
      }
      throw new Error(
        `ORPHA:${entry.orphaCode}: production trial scan is incomplete`
      );
    }
    const candidateById = new Map(
      entry.candidates.map((candidate) => [candidate.nctId, candidate])
    );
    const foundIds = trials.matchedStudies.map((trial) => trial.nctId);
    const missing = foundIds.filter((id) => !candidateById.has(id));
    if (missing.length > 0) {
      if (partial) {
        log.warn(
          `ORPHA:${entry.orphaCode}: ${missing.length} production IDs not yet adjudicated — skipped in --partial`
        );
        continue;
      }
      throw new Error(
        `ORPHA:${entry.orphaCode}: ${missing.length} production IDs were not adjudicated (${missing.slice(0, 5).join(", ")})`
      );
    }

    const counts = candidateVerdictCounts(entry.candidates);
    consensusCandidates += counts.relevant + counts.irrelevant;
    uncertainCandidates += counts.uncertain;
    const relevantIds = new Set(
      entry.candidates
        .filter((candidate) => candidate.consensus === "relevant")
        .map((candidate) => candidate.nctId)
    );
    const foundRelevant = foundIds.filter((id) => relevantIds.has(id)).length;
    const foundIrrelevant = foundIds.filter(
      (id) => candidateById.get(id)?.consensus === "irrelevant"
    ).length;
    const recall =
      relevantIds.size > 0 ? foundRelevant / relevantIds.size : null;
    const precisionDenominator = foundRelevant + foundIrrelevant;
    const precision =
      precisionDenominator > 0
        ? foundRelevant / precisionDenominator
        : null;
    const coverage =
      entry.candidates.length > 0
        ? (counts.relevant + counts.irrelevant) / entry.candidates.length
        : 1;

    results.push({
      orphaCode: entry.orphaCode,
      name: entry.name,
      difficulty: entry.knownDifficulty,
      foundTrials: foundIds.length,
      recall,
      precision,
      consensusCoverage: coverage,
      ...counts,
    });
    log.info(
      `  found=${foundIds.length} relevant=${counts.relevant} irrelevant=${counts.irrelevant} uncertain=${counts.uncertain} ` +
        `recall=${recall == null ? "n/a" : recall.toFixed(3)} precision=${precision == null ? "n/a" : precision.toFixed(3)} ` +
        `pubQueries=${JSON.stringify(entry.publicationDiagnostics)}`
    );
  }

  if (results.length === 0) {
    throw new Error("No diseases remained after partial-validation skips");
  }

  const trialsRecall = mean(
    results.map((result) => result.recall).filter((v): v is number => v != null)
  );
  const trialsPrecision = mean(
    results
      .map((result) => result.precision)
      .filter((v): v is number => v != null)
  );
  const totalCandidates = consensusCandidates + uncertainCandidates;
  const consensusCoverage =
    totalCandidates > 0 ? consensusCandidates / totalCandidates : 1;
  const byDifficulty: ValidationSummary["byDifficulty"] = {};
  for (const difficulty of new Set(results.map((result) => result.difficulty))) {
    const subset = results.filter((result) => result.difficulty === difficulty);
    byDifficulty[difficulty] = {
      count: subset.length,
      trialsRecall: mean(
        subset
          .map((result) => result.recall)
          .filter((v): v is number => v != null)
      ),
      trialsPrecision: mean(
        subset
          .map((result) => result.precision)
          .filter((v): v is number => v != null)
      ),
      consensusCoverage: mean(
        subset.map((result) => result.consensusCoverage)
      ),
    };
  }

  const version = `${benchmarkVersion(benchmark)}${partial ? "|partial" : ""}`;
  const summary: ValidationSummary = {
    runAt: new Date().toISOString(),
    method: "automated-dual-model-consensus",
    benchmarkVersion: version,
    promptVersion: benchmark.promptVersion,
    models: benchmark.models,
    trialsRecall,
    trialsPrecision,
    publicationsWithinRange: null,
    publicationQueryAgreement: null,
    consensusCoverage,
    consensusCandidates,
    uncertainCandidates,
    count: results.length,
    byDifficulty,
  };

  const baselinePath = path.join(
    root,
    "tests",
    "automated-validation-baseline.json"
  );
  const perEntry = Object.fromEntries(
    results.map((result) => [
      result.orphaCode,
      { foundTrials: result.foundTrials },
    ])
  );
  let regressed = false;
  // Partial runs never create or compare baselines — they are interim evidence only.
  if (!partial && fs.existsSync(baselinePath)) {
    const previous = JSON.parse(
      fs.readFileSync(baselinePath, "utf8")
    ) as AutomatedBaseline;
    if (previous.benchmarkVersion !== version) {
      throw new Error(
        "Automated validation baseline uses different queries, prompt, or models; create a reviewed new baseline rather than comparing unlike benchmarks"
      );
    }
    if (trialsRecall < previous.trialsRecall - RECALL_REGRESSION_EPSILON) {
      regressed = true;
      log.fail(
        `Recall ${trialsRecall.toFixed(3)} regressed below ${previous.trialsRecall.toFixed(3)}`
      );
    }
    if (!regressed && trialsRecall >= previous.trialsRecall) {
      writeAutomatedBaseline(baselinePath, summary, perEntry);
    }
  } else if (!partial) {
    writeAutomatedBaseline(baselinePath, summary, perEntry);
  }

  const artifactPath = path.join(root, "data", "diseases.json");
  const artifact = JSON.parse(
    fs.readFileSync(artifactPath, "utf8")
  ) as DiseasesArtifact;
  artifact.validation = summary;
  const artifactTmp = `${artifactPath}.tmp`;
  fs.writeFileSync(
    artifactTmp,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );
  fs.renameSync(artifactTmp, artifactPath);
  log.info(
    `AUTOMATED SUMMARY recall=${trialsRecall.toFixed(3)} precision=${trialsPrecision.toFixed(3)} consensusCoverage=${consensusCoverage.toFixed(3)} n=${results.length}`
  );
  if (regressed) process.exit(1);
}

function writeAutomatedBaseline(
  file: string,
  summary: ValidationSummary,
  perEntry: Record<string, { foundTrials: number }>
): void {
  const baseline: AutomatedBaseline = {
    runAt: summary.runAt,
    benchmarkVersion: summary.benchmarkVersion,
    trialsRecall: summary.trialsRecall,
    trialsPrecision: summary.trialsPrecision,
    consensusCoverage: summary.consensusCoverage,
    perEntry,
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function writeBaseline(
  p: string,
  summary: ValidationSummary,
  perEntry: Baseline["perEntry"]
): void {
  const baseline: Baseline = {
    runAt: summary.runAt,
    trialsRecall: summary.trialsRecall,
    trialsPrecision: summary.trialsPrecision,
    publicationsWithinRange: summary.publicationsWithinRange ?? 0,
    count: summary.count,
    perEntry,
  };
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}

const useLegacyHumanGold = process.argv.includes("--legacy");
(useLegacyHumanGold ? main() : mainAutomated()).catch((err) => {
  log.error(String(err));
  process.exit(1);
});
