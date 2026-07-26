import crypto from "node:crypto";
import { collectExactSynonyms, collectIdentifiers } from "./identifiers";
import { resolveMeshLabels } from "./mesh";
import {
  buildCorpusTokenFrequency,
  buildPhraseTerms,
  buildRecallExpansionTerms,
  novelRecallTerms,
  normalizeTerm,
  parentLabelsForRecall,
  phraseQueryFromTerms,
  qualifierStrippedAliases,
  uniqueTerms,
} from "./query-build";
import { fetchTrialSignals } from "./trials";
import { buildMeshQuery, fetchPublicationHitCount } from "./europepmc";
import { lookupGenCC, type GenCCIndex } from "./gencc";
import type { MondoHierarchy } from "./mondo";
import type { OrphanetDisease } from "./orphanet";
import type { TrialRecord } from "../../src/lib/types";

export const buildBenchmarkTokenFrequency = buildCorpusTokenFrequency;
export const normalizeBenchmarkText = normalizeTerm;
export const uniqueBenchmarkTerms = uniqueTerms;

export const BENCHMARK_SCHEMA_VERSION = 1;
/** Pipeline terms match production ingest (phrase + recall-expansion). */
export const CANDIDATE_QUERY_VERSION = "production-recall-v6";
export const ADJUDICATION_PROMPT_VERSION = "trial-relevance-v2";

export type AutomatedVerdict =
  | true
  | false
  | "uncertain"
  | "relevant-to-parent-category";
export type ConsensusVerdict =
  | "relevant"
  | "irrelevant"
  | "uncertain"
  | "parent-category";
export type DiscoverySource = "pipeline" | "broad" | "both";

export interface BenchmarkSeedEntry {
  orphaCode: string;
  name: string;
  knownDifficulty: string;
  manualAliases?: string[];
}

export interface ModelVerdict {
  provider: "openai" | "anthropic";
  model: string;
  promptVersion: string;
  verdict: AutomatedVerdict;
  reason: string;
  adjudicatedAt: string;
}

export interface BenchmarkCandidate {
  nctId: string;
  title: string;
  conditions: string[];
  studyType: string | null;
  status: string;
  url: string;
  discoveredVia: DiscoverySource;
  openai?: ModelVerdict;
  anthropic?: ModelVerdict;
  consensus?: ConsensusVerdict;
  consensusReason?: string;
}

export interface BenchmarkEntry {
  orphaCode: string;
  name: string;
  orphanetName: string;
  definition: string | null;
  knownDifficulty: string;
  aliases: string[];
  queries: {
    pipelineTerms: string[];
    broadTerms: string[];
    meshLabels: string[];
    pipeline: string;
    broad: string;
  };
  fullyScanned: boolean;
  pipelinePopulation: number;
  broadOnlyPopulation: number;
  publicationDiagnostics: {
    phraseCount: number;
    meshCount: number;
    unionCount: number;
    broadCount: number;
  };
  candidates: BenchmarkCandidate[];
}

export interface BenchmarkControlResult {
  id: string;
  expected: false;
  openai?: ModelVerdict;
  anthropic?: ModelVerdict;
  passed?: boolean;
}

export interface AutomatedBenchmark {
  schemaVersion: number;
  generatedAt: string;
  completedAt: string | null;
  complete: boolean;
  candidateQueryVersion: string;
  promptVersion: string;
  models: {
    openai: string;
    anthropic: string;
  };
  controls: {
    required: number;
    passed: number;
    results: BenchmarkControlResult[];
  };
  entries: BenchmarkEntry[];
}

export function buildBenchmarkBroadTerms(args: {
  seed: BenchmarkSeedEntry;
  orphanetName: string;
  synonyms: string[];
  mondoSynonyms: string[];
  parentLabels: string[];
  genes: string[];
}): string[] {
  // Broad list = production recall ∪ qualifier-stripped aliases.
  // Qualifier stripping is over-fetch for adjudication only — never production.
  return uniqueTerms([
    ...buildRecallExpansionTerms({
      name: `${args.orphanetName} ${args.seed.name}`,
      synonyms: args.synonyms,
      mondoSynonyms: args.mondoSynonyms,
      parentLabels: args.parentLabels,
      genes: args.genes,
      manualAliases: [
        args.seed.name.split(" / ")[0],
        ...(args.seed.manualAliases ?? []),
      ],
    }),
    ...qualifierStrippedAliases(args.orphanetName),
    ...qualifierStrippedAliases(args.seed.name.split(" / ")[0]),
  ]);
}

export function assertBenchmarkScansFullyScanned(
  orphaCode: string,
  pipelineFullyScanned: boolean,
  broadFullyScanned: boolean
): void {
  if (!pipelineFullyScanned || !broadFullyScanned) {
    throw new Error(
      `ORPHA:${orphaCode}: ClinicalTrials.gov candidate scan incomplete`
    );
  }
}

export function mergeBenchmarkCandidates(
  pipelineTrials: TrialRecord[],
  broadTrials: TrialRecord[]
): BenchmarkCandidate[] {
  const candidates = new Map<string, BenchmarkCandidate>();
  const add = (trial: TrialRecord, source: Exclude<DiscoverySource, "both">) => {
    const existing = candidates.get(trial.nctId);
    if (existing) {
      existing.discoveredVia = "both";
      return;
    }
    candidates.set(trial.nctId, {
      nctId: trial.nctId,
      title: trial.title,
      conditions: trial.conditions ?? [],
      studyType: trial.studyType ?? null,
      status: trial.status,
      url: trial.url,
      discoveredVia: source,
    });
  };
  for (const trial of pipelineTrials) add(trial, "pipeline");
  for (const trial of broadTrials) add(trial, "broad");
  return [...candidates.values()].sort((a, b) =>
    a.nctId.localeCompare(b.nctId)
  );
}

export async function discoverAutomatedBenchmarkEntry(args: {
  seed: BenchmarkSeedEntry;
  disease: OrphanetDisease;
  mondo: MondoHierarchy;
  gencc: GenCCIndex;
}): Promise<{
  entry: BenchmarkEntry;
  nonInterventionalControls: TrialRecord[];
}> {
  const { seed, disease, mondo, gencc } = args;
  const identifiers = collectIdentifiers(disease.mondoIds, mondo);
  const mondoSynonyms = collectExactSynonyms(disease.mondoIds, mondo);
  const meshLabels = await resolveMeshLabels(identifiers.mesh);
  const { terms: phraseTerms } = buildPhraseTerms(
    [disease.name],
    [...disease.synonyms, ...mondoSynonyms]
  );
  const parentLabels = parentLabelsForRecall(
    disease.mondoIds,
    (id, maxDepth) => mondo.ancestors(id, maxDepth),
    (id) => mondo.label(id),
    disease.name
  );
  const genes = lookupGenCC(gencc, disease.mondoIds, disease.orphaCode).genes;
  const recallTerms = novelRecallTerms(
    phraseTerms,
    buildRecallExpansionTerms({
      name: disease.name,
      synonyms: disease.synonyms,
      mondoSynonyms,
      parentLabels,
      genes,
    })
  );
  // Production pipeline = phrase + recall (mesh is a separate CT.gov strategy).
  const pipelineTerms = uniqueTerms([...phraseTerms, ...recallTerms]);
  // Broad keeps seed manual aliases / extra expansions not already in production.
  const broadTerms = buildBenchmarkBroadTerms({
    seed,
    orphanetName: disease.name,
    synonyms: disease.synonyms,
    mondoSynonyms,
    parentLabels,
    genes,
  }).filter(
    (term) =>
      !pipelineTerms.some(
        (pipelineTerm) =>
          normalizeBenchmarkText(pipelineTerm) === normalizeBenchmarkText(term)
      )
  );
  if (pipelineTerms.length === 0) {
    throw new Error(`ORPHA:${seed.orphaCode}: empty pipeline candidate strategy`);
  }

  const phraseQuery = phraseQueryFromTerms(phraseTerms);
  const meshQuery = buildMeshQuery(meshLabels);
  const unionQuery = meshQuery
    ? `(${phraseQuery}) OR (${meshQuery})`
    : phraseQuery;
  const broadPublicationQuery =
    broadTerms.length > 0 ? phraseQueryFromTerms(broadTerms) : "";
  const pipelinePromise = fetchTrialSignals(
    phraseTerms,
    meshLabels,
    recallTerms
  );
  const broadPromise =
    broadTerms.length > 0
      ? fetchTrialSignals(broadTerms, [])
      : Promise.resolve(null);
  const [
    pipeline,
    broad,
    phraseCount,
    meshCount,
    unionCount,
    broadCount,
  ] = await Promise.all([
    pipelinePromise,
    broadPromise,
    fetchPublicationHitCount(phraseQuery),
    meshQuery ? fetchPublicationHitCount(meshQuery) : Promise.resolve(0),
    fetchPublicationHitCount(unionQuery),
    broadPublicationQuery
      ? fetchPublicationHitCount(broadPublicationQuery)
      : Promise.resolve(0),
  ]);
  const broadStudies = broad?.matchedStudies ?? [];
  assertBenchmarkScansFullyScanned(
    seed.orphaCode,
    pipeline.fullyScanned,
    broad?.fullyScanned ?? true
  );
  const candidates = mergeBenchmarkCandidates(
    pipeline.matchedStudies,
    broadStudies
  );

  const pipelineIds = new Set(
    pipeline.matchedStudies.map((trial) => trial.nctId)
  );
  const broadOnlyPopulation = broadStudies.filter(
    (trial) => !pipelineIds.has(trial.nctId)
  ).length;

  return {
    entry: {
      orphaCode: seed.orphaCode,
      name: seed.name,
      orphanetName: disease.name,
      definition: disease.definition,
      knownDifficulty: seed.knownDifficulty,
      aliases: uniqueBenchmarkTerms([
        ...disease.synonyms,
        ...mondoSynonyms,
        ...(seed.manualAliases ?? []),
        ...meshLabels,
      ]),
      queries: {
        pipelineTerms,
        broadTerms,
        meshLabels,
        pipeline: pipeline.query,
        broad: broad?.query ?? "",
      },
      fullyScanned: true,
      pipelinePopulation: pipeline.matchedStudies.length,
      broadOnlyPopulation,
      publicationDiagnostics: {
        phraseCount,
        meshCount,
        unionCount,
        broadCount,
      },
      candidates,
    },
    nonInterventionalControls: [
      ...pipeline.observationalStudies,
      ...pipeline.expandedAccessStudies,
    ],
  };
}

export function consensusVerdict(
  openai: AutomatedVerdict,
  anthropic: AutomatedVerdict
): { verdict: ConsensusVerdict; reason: string } {
  if (openai === true && anthropic === true) {
    return { verdict: "relevant", reason: "Both providers judged relevant." };
  }
  if (openai === false && anthropic === false) {
    return { verdict: "irrelevant", reason: "Both providers judged irrelevant." };
  }
  if (
    openai === "relevant-to-parent-category" &&
    anthropic === "relevant-to-parent-category"
  ) {
    return {
      verdict: "parent-category",
      reason: "Both providers judged relevant only to a broader parent category.",
    };
  }
  return {
    verdict: "uncertain",
    reason:
      openai === "uncertain" ||
      anthropic === "uncertain" ||
      openai === "relevant-to-parent-category" ||
      anthropic === "relevant-to-parent-category"
        ? "At least one provider returned uncertain or parent-category."
        : "Providers disagreed.",
  };
}

export function parseModelVerdict(raw: string): {
  verdict: AutomatedVerdict;
  reason: string;
} {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as {
    relevant?: boolean | "uncertain" | "relevant-to-parent-category";
    reason?: string;
  };
  if (
    parsed.relevant !== true &&
    parsed.relevant !== false &&
    parsed.relevant !== "uncertain" &&
    parsed.relevant !== "relevant-to-parent-category"
  ) {
    throw new Error("Model response has invalid relevant verdict");
  }
  const reason = parsed.reason?.trim();
  if (!reason || reason.length > 500) {
    throw new Error("Model response reason is missing or too long");
  }
  return { verdict: parsed.relevant, reason };
}

export function adjudicationCacheKey(args: {
  provider: string;
  model: string;
  diseaseName: string;
  definition: string | null;
  aliases: string[];
  candidate: Pick<BenchmarkCandidate, "nctId" | "title" | "conditions" | "studyType">;
}): string {
  const evidence = JSON.stringify({
    promptVersion: ADJUDICATION_PROMPT_VERSION,
    ...args,
  });
  return `automated-adjudication:${crypto
    .createHash("sha256")
    .update(evidence)
    .digest("hex")}`;
}

