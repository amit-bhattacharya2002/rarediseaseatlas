/**
 * Enrich diseases.json with Monarch Initiative associations joined on Mondo IDs:
 *   - HPO phenotype counts (DiseaseToPhenotypicFeatureAssociation)
 *   - Alliance genotype models (GenotypeToDiseaseAssociation / model_of)
 *
 * Does not touch the ingest loop or ClinicalTrials.gov. Safe while full ingest runs.
 *
 *   npx tsx scripts/enrich-monarch.ts
 *   npx tsx scripts/enrich-monarch.ts --limit 20
 *   npx tsx scripts/enrich-monarch.ts --codes 10,116,365
 */

import fs from "node:fs";
import path from "node:path";
import { fetchJson } from "./lib/http";
import { deriveArtifact } from "./lib/derive";
import { log } from "./lib/logger";
import type { DiseasesArtifact, DiseaseRecord } from "../src/lib/types";

const MONARCH = "https://api-v3.monarchinitiative.org/v3/api";

interface AssocItem {
  subject?: string;
  subject_label?: string;
  subject_taxon_label?: string;
  object?: string;
  object_label?: string;
  predicate?: string;
}

interface AssocPage {
  total?: number;
  items?: AssocItem[];
}

function parseArgs(argv: string[]): { limit: number | null; codes: Set<string> | null } {
  let limit: number | null = null;
  const codes = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) throw new Error("--limit needs a positive integer");
      limit = n;
    } else if (a === "--codes") {
      for (const part of (argv[++i] ?? "").split(",")) {
        const c = part.trim();
        if (c) codes.add(c);
      }
    }
  }
  return { limit, codes: codes.size ? codes : null };
}

function writeAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function mondoCurie(id: string): string {
  const t = id.trim();
  if (/^MONDO:/i.test(t)) {
    const num = t.slice(t.indexOf(":") + 1);
    return `MONDO:${num}`;
  }
  if (/^\d+$/.test(t)) return `MONDO:${t.padStart(7, "0")}`;
  return t;
}

async function phenotypeSummary(mondoIds: string[]): Promise<{
  count: number;
  sample: string[];
}> {
  let total = 0;
  const sample: string[] = [];
  const seen = new Set<string>();
  for (const raw of mondoIds) {
    const id = mondoCurie(raw);
    const url =
      `${MONARCH}/association?subject=${encodeURIComponent(id)}` +
      `&category=${encodeURIComponent("biolink:DiseaseToPhenotypicFeatureAssociation")}` +
      `&limit=5`;
    const page = await fetchJson<AssocPage>(url, {
      cacheKey: `monarch:pheno:${id}:v1`,
      maxRetries: 3,
      timeoutMs: 45_000,
    });
    total = Math.max(total, page.total ?? 0);
    for (const item of page.items ?? []) {
      const label = item.object_label?.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      sample.push(label);
    }
  }
  return { count: total, sample: sample.slice(0, 5) };
}

async function modelSummary(mondoIds: string[]): Promise<{
  count: number;
  models: NonNullable<DiseaseRecord["monarch"]>["models"];
}> {
  const models: NonNullable<DiseaseRecord["monarch"]>["models"] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const raw of mondoIds) {
    const id = mondoCurie(raw);
    const url =
      `${MONARCH}/association?object=${encodeURIComponent(id)}` +
      `&category=${encodeURIComponent("biolink:GenotypeToDiseaseAssociation")}` +
      `&limit=20`;
    const page = await fetchJson<AssocPage>(url, {
      cacheKey: `monarch:model:${id}:v1`,
      maxRetries: 3,
      timeoutMs: 45_000,
    });
    total += page.total ?? 0;
    for (const item of page.items ?? []) {
      const mid = item.subject?.trim();
      if (!mid || seen.has(mid)) continue;
      seen.add(mid);
      models.push({
        id: mid,
        label: (item.subject_label ?? mid).replace(/<[^>]+>/g, ""),
        taxonLabel: item.subject_taxon_label ?? null,
      });
    }
  }
  return { count: total || models.length, models: models.slice(0, 12) };
}

async function enrichOne(d: DiseaseRecord): Promise<void> {
  if (!d.mondoIds?.length) {
    d.monarch = {
      fetchedAt: new Date().toISOString(),
      phenotypeCount: 0,
      phenotypeSample: [],
      modelCount: 0,
      models: [],
    };
    return;
  }
  const pheno = await phenotypeSummary(d.mondoIds);
  const models = await modelSummary(d.mondoIds);
  d.monarch = {
    fetchedAt: new Date().toISOString(),
    phenotypeCount: pheno.count,
    phenotypeSample: pheno.sample,
    modelCount: models.count,
    models: models.models,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const artifactPath = path.join(process.cwd(), "data", "diseases.json");
  const artifact = JSON.parse(
    fs.readFileSync(artifactPath, "utf8")
  ) as DiseasesArtifact;

  let targets = artifact.diseases;
  if (args.codes) {
    targets = targets.filter((d) => args.codes!.has(d.orphaCode));
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  log.info(`Monarch enrich: ${targets.length}/${artifact.diseases.length} diseases`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    try {
      await enrichOne(d);
      ok += 1;
      const m = d.monarch!;
      log.info(
        `  phenotypes=${m.phenotypeCount} models=${m.modelCount}` +
          (m.models[0] ? ` e.g. ${m.models[0].taxonLabel ?? m.models[0].id}` : "")
      );
    } catch (err) {
      failed += 1;
      log.warn(`  Monarch enrich failed: ${String(err)}`);
      d.monarch = d.monarch ?? null;
    }
    if ((i + 1) % 25 === 0) {
      writeAtomic(artifactPath, deriveArtifact(artifact));
      log.info(`  checkpoint wrote through ${i + 1}`);
    }
  }

  artifact.sourceVersions = {
    ...artifact.sourceVersions,
    monarchApi: "api-v3.monarchinitiative.org",
    monarchEnrichedAt: new Date().toISOString(),
  } as typeof artifact.sourceVersions;

  writeAtomic(artifactPath, deriveArtifact(artifact));
  log.info(`Done. ok=${ok} failed=${failed}. trialReadiness recomputed via derive.`);
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
