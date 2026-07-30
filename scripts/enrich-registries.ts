/**
 * Secondary multi-registry enrichment + dual-model LLM relevance.
 *
 * Does NOT write diseases.checkpoint.json — safe alongside a running full ingest.
 * Does NOT change trials.total (CT.gov headline stays authoritative).
 *
 *   npx tsx scripts/enrich-registries.ts
 *   npx tsx scripts/enrich-registries.ts --codes 116,390 --limit 5
 *   npx tsx scripts/enrich-registries.ts --skip-llm
 */
import fs from "node:fs";
import path from "node:path";
import { buildPhraseTerms } from "./lib/query-build";
import {
  emptySecondaryBlock,
  fetchSecondaryRegistryTrials,
} from "./lib/registries";
import { canonicalizeId } from "./lib/registries/normalize";
import {
  loadRelevanceModels,
  reviewTrialRelevance,
  skippedRelevance,
} from "./lib/trial-relevance";
import { deriveArtifact } from "./lib/derive";
import { ensureCacheDir } from "./lib/cache";
import { readArtifact, writeArtifact } from "./lib/artifact-io";
import { log } from "./lib/logger";
import type {
  DiseaseRecord,
  RegistryTrialRecord,
  TrialRecord,
} from "../src/lib/types";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
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

function parseArgs(argv: string[]): {
  limit: number | null;
  codes: Set<string> | null;
  skipLlm: boolean;
} {
  let limit: number | null = null;
  const codes = new Set<string>();
  let skipLlm = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) throw new Error("--limit needs N>0");
      limit = n;
    } else if (a === "--codes") {
      for (const part of (argv[++i] ?? "").split(",")) {
        const c = part.trim();
        if (c) codes.add(c);
      }
    } else if (a === "--skip-llm") {
      skipLlm = true;
    }
  }
  return { limit, codes: codes.size ? codes : null, skipLlm };
}

function ctgovNctIds(d: DiseaseRecord): Set<string> {
  const ids = new Set<string>();
  const add = (t?: TrialRecord[] | null) => {
    for (const row of t ?? []) {
      if (row.nctId) ids.add(canonicalizeId(row.nctId));
    }
  };
  add(d.trials.recruiting);
  add(d.trials.observational);
  add(d.trials.generalRegistries);
  add(d.trials.parentCategory?.recruiting);
  return ids;
}

function diseaseContext(d: DiseaseRecord) {
  return {
    name: d.nameCorrected ?? d.name,
    definition: d.definition,
    aliases: [
      ...d.synonyms,
      ...d.mondoSynonyms,
      ...(d.nameCorrected ? [d.name] : []),
    ].slice(0, 40),
  };
}

async function annotateCtgovTrials(
  d: DiseaseRecord,
  models: ReturnType<typeof loadRelevanceModels>,
  skipLlm: boolean
): Promise<number> {
  const ctx = diseaseContext(d);
  let n = 0;
  const annotateList = async (rows: TrialRecord[], cap: number) => {
    for (const row of rows.slice(0, cap)) {
      if (skipLlm || !models) {
        row.relevance = skippedRelevance(
          skipLlm ? "LLM skipped (--skip-llm)" : "LLM keys/models not configured"
        );
        continue;
      }
      row.relevance = await reviewTrialRelevance(
        ctx,
        {
          id: row.nctId,
          title: row.title,
          studyType: row.studyType ?? null,
          conditions: row.conditions ?? [],
        },
        models
      );
      n += 1;
    }
  };
  // Recruiting first (highest user value); cap long observational/registry lists.
  await annotateList(d.trials.recruiting, 40);
  await annotateList(d.trials.observational ?? [], 15);
  await annotateList(d.trials.generalRegistries ?? [], 10);
  if (d.trials.parentCategory?.recruiting) {
    await annotateList(d.trials.parentCategory.recruiting, 15);
  }
  return n;
}

async function annotateSecondary(
  rows: RegistryTrialRecord[],
  d: DiseaseRecord,
  models: ReturnType<typeof loadRelevanceModels>,
  skipLlm: boolean
): Promise<{
  kept: RegistryTrialRecord[];
  parentCategory: RegistryTrialRecord[];
  uncertain: RegistryTrialRecord[];
  droppedCount: number;
}> {
  const ctx = diseaseContext(d);
  const kept: RegistryTrialRecord[] = [];
  const parentCategory: RegistryTrialRecord[] = [];
  const uncertain: RegistryTrialRecord[] = [];
  let droppedCount = 0;
  const MAX_SECONDARY_LLM = 40;

  for (const row of rows.slice(0, MAX_SECONDARY_LLM)) {
    if (skipLlm || !models) {
      row.relevance = skippedRelevance(
        skipLlm ? "LLM skipped (--skip-llm)" : "LLM keys/models not configured"
      );
      uncertain.push(row);
      continue;
    }
    row.relevance = await reviewTrialRelevance(
      ctx,
      {
        id: row.id,
        title: row.title,
        studyType: row.studyType,
        conditions: row.conditions,
      },
      models
    );
    const c = row.relevance.consensus;
    if (c === "relevant") kept.push(row);
    else if (c === "parent-category") parentCategory.push(row);
    else if (c === "irrelevant") droppedCount += 1;
    else uncertain.push(row);
  }

  // Overflow beyond LLM cap stays uncertain/skipped.
  for (const row of rows.slice(MAX_SECONDARY_LLM)) {
    row.relevance = skippedRelevance("Beyond per-disease secondary LLM cap");
    uncertain.push(row);
  }

  return { kept, parentCategory, uncertain, droppedCount };
}

async function main(): Promise<void> {
  loadEnvLocal();
  ensureCacheDir();
  const args = parseArgs(process.argv.slice(2));
  const artifact = readArtifact();

  let targets = artifact.diseases;
  if (args.codes) {
    targets = targets.filter((d) => args.codes!.has(d.orphaCode));
  }
  if (args.limit) targets = targets.slice(0, args.limit);
  if (!args.codes) {
    const pending = targets.filter((d) => !d.trials.secondaryRegistries);
    log.info(
      `Registries enrich: ${pending.length} pending of ${targets.length} selected`
    );
    targets = pending;
  }

  const models = args.skipLlm ? null : loadRelevanceModels();
  if (!args.skipLlm && !models) {
    log.warn(
      "LLM keys/models missing — fetching registries only; relevance marked skipped. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, ADJUDICATION_OPENAI_MODEL, ADJUDICATION_ANTHROPIC_MODEL in .env.local"
    );
  }

  log.info(
    `Enriching registries for ${targets.length}/${artifact.diseases.length} diseases (llm=${models ? "on" : "off"})`
  );

  let failed = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    try {
      const nameTerms = d.nameCorrected ? [d.name, d.nameCorrected] : [d.name];
      const { terms } = buildPhraseTerms(nameTerms, [
        ...d.synonyms,
        ...d.mondoSynonyms,
      ]);
      const queryTerms = terms.slice(0, 5);

      const fetched = await fetchSecondaryRegistryTrials(queryTerms, {
        excludeNctIds: ctgovNctIds(d),
      });

      const annotated = await annotateSecondary(
        fetched.novel,
        d,
        models,
        args.skipLlm || !models
      );

      d.trials.secondaryRegistries = emptySecondaryBlock(queryTerms, {
        rawFetched: fetched.raw.length,
        afterDedupe: fetched.deduped.length,
        alreadyOnCtgov: fetched.alreadyOnCtgov.length,
        kept: annotated.kept,
        parentCategory: annotated.parentCategory,
        uncertain: annotated.uncertain,
        droppedCount: annotated.droppedCount,
        sourceErrors: Object.keys(fetched.sourceErrors).length
          ? fetched.sourceErrors
          : undefined,
      });

      const ctgovAnnotated = await annotateCtgovTrials(
        d,
        models,
        args.skipLlm || !models
      );

      log.info(
        `  secondary raw=${fetched.raw.length} dedupe=${fetched.deduped.length} novel=${fetched.novel.length} kept=${annotated.kept.length} parent=${annotated.parentCategory.length} uncertain=${annotated.uncertain.length} dropped=${annotated.droppedCount}; ctgovLLM=${ctgovAnnotated}; errors=${Object.keys(fetched.sourceErrors).join(",") || "none"}`
      );
    } catch (err) {
      failed += 1;
      log.warn(`  FAILED: ${String(err)}`);
      d.trials.secondaryRegistries = emptySecondaryBlock([], {
        sourceErrors: { other: String(err).slice(0, 500) },
      });
    }

    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      writeArtifact(artifact);
      log.info(`  checkpointed publish artifact (${i + 1}/${targets.length})`);
    }
  }

  writeArtifact(deriveArtifact(artifact));
  log.info(`Done. failed=${failed}. Wrote diseases.json + .gz`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
