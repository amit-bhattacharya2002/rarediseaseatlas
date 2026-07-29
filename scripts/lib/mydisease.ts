/**
 * MyDisease.info helpers — Mondo-keyed disease annotations (CTD + HPO).
 */
import { fetchFormPost, fetchJson } from "./http";
import type { DiseaseRecord } from "../../src/lib/types";

const MYDISEASE = "https://mydisease.info/v1";

export function mondoCurie(id: string): string {
  const t = id.trim();
  if (/^MONDO:/i.test(t)) {
    const num = t.slice(t.indexOf(":") + 1);
    return `MONDO:${num}`;
  }
  if (/^\d+$/.test(t)) return `MONDO:${t.padStart(7, "0")}`;
  return t;
}

interface CtdChemical {
  chemical_name?: string;
  direct_evidence?: string;
  mesh_chemical_id?: string;
  pubmed?: string | number;
}

interface CtdPathway {
  pathway_name?: string;
}

interface HpoPhenotype {
  hpo_id?: string;
  hpo_name?: string;
  numeric_freq?: number;
}

export interface MyDiseaseHit {
  _id?: string;
  notfound?: boolean;
  ctd?: {
    chemical_related_to_disease?: CtdChemical | CtdChemical[];
    pathway_related_to_disease?: CtdPathway | CtdPathway[];
  };
  hpo?:
    | {
        phenotype_related_to_disease?: HpoPhenotype | HpoPhenotype[];
      }
    | Array<{
        phenotype_related_to_disease?: HpoPhenotype | HpoPhenotype[];
      }>;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractPhenotypes(hpo: MyDiseaseHit["hpo"]): HpoPhenotype[] {
  const blocks = asArray(hpo);
  const out: HpoPhenotype[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    out.push(...asArray(block.phenotype_related_to_disease));
  }
  return out;
}

export function summarizeMyDisease(
  hit: MyDiseaseHit | null,
  mondoId: string | null
): NonNullable<DiseaseRecord["mydisease"]> {
  const fetchedAt = new Date().toISOString();
  if (!hit || hit.notfound) {
    return {
      fetchedAt,
      mondoId,
      chemicalCount: 0,
      chemicals: [],
      pathwayCount: 0,
      pathways: [],
      phenotypeCount: 0,
      phenotypeSample: [],
    };
  }

  const chems = asArray(hit.ctd?.chemical_related_to_disease);
  const therapeuticFirst = [...chems].sort((a, b) => {
    const at = /therapeutic/i.test(a.direct_evidence ?? "") ? 0 : 1;
    const bt = /therapeutic/i.test(b.direct_evidence ?? "") ? 0 : 1;
    return (
      at - bt || (a.chemical_name ?? "").localeCompare(b.chemical_name ?? "")
    );
  });
  const seenChem = new Set<string>();
  const chemicals: NonNullable<DiseaseRecord["mydisease"]>["chemicals"] = [];
  for (const c of therapeuticFirst) {
    const name = c.chemical_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenChem.has(key)) continue;
    seenChem.add(key);
    if (chemicals.length < 12) {
      chemicals.push({
        name,
        evidence: c.direct_evidence?.trim() || null,
        meshId: c.mesh_chemical_id?.trim() || null,
        pubmed: c.pubmed != null ? String(c.pubmed) : null,
      });
    }
  }

  const pathwaysRaw = asArray(hit.ctd?.pathway_related_to_disease);
  const pathways: string[] = [];
  const seenPath = new Set<string>();
  for (const p of pathwaysRaw) {
    const name = p.pathway_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenPath.has(key)) continue;
    seenPath.add(key);
    if (pathways.length < 8) pathways.push(name);
  }

  const phenos = extractPhenotypes(hit.hpo);
  phenos.sort((a, b) => (b.numeric_freq ?? -1) - (a.numeric_freq ?? -1));
  const phenotypeSample: NonNullable<
    DiseaseRecord["mydisease"]
  >["phenotypeSample"] = [];
  const seenPh = new Set<string>();
  for (const p of phenos) {
    const id = p.hpo_id?.trim();
    const name = p.hpo_name?.trim();
    if (!id || !name) continue;
    if (seenPh.has(id)) continue;
    seenPh.add(id);
    if (phenotypeSample.length < 8) phenotypeSample.push({ id, name });
  }

  return {
    fetchedAt,
    mondoId,
    chemicalCount: seenChem.size,
    chemicals,
    pathwayCount: seenPath.size,
    pathways,
    phenotypeCount: seenPh.size,
    phenotypeSample,
  };
}

/** Batch annotate Mondo IDs (chunks of 80). */
export async function fetchMyDiseaseBatch(
  mondoIds: string[]
): Promise<Map<string, MyDiseaseHit>> {
  const unique = [...new Set(mondoIds.map(mondoCurie).filter(Boolean))];
  const out = new Map<string, MyDiseaseHit>();
  const chunkSize = 80;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const body = new URLSearchParams();
    body.set("ids", chunk.join(","));
    body.set(
      "fields",
      "ctd.chemical_related_to_disease,ctd.pathway_related_to_disease,hpo"
    );
    const text = await fetchFormPost(`${MYDISEASE}/disease`, body.toString(), {
      cacheKey: `mydisease:batch:${chunk.join(",")}:v2`,
      maxRetries: 4,
      timeoutMs: 90_000,
    });
    const parsed = JSON.parse(text) as MyDiseaseHit | MyDiseaseHit[];
    const hits = asArray(parsed);
    for (const hit of hits) {
      const id = hit._id ? mondoCurie(String(hit._id)) : null;
      if (id) out.set(id, hit);
    }
    for (const id of chunk) {
      if (!out.has(id)) out.set(id, { _id: id, notfound: true });
    }
  }
  return out;
}

export async function fetchMyDiseaseOne(mondoId: string): Promise<MyDiseaseHit> {
  const id = mondoCurie(mondoId);
  try {
    return await fetchJson<MyDiseaseHit>(
      `${MYDISEASE}/disease/${encodeURIComponent(id)}?fields=ctd.chemical_related_to_disease,ctd.pathway_related_to_disease,hpo`,
      { cacheKey: `mydisease:one:${id}:v2`, maxRetries: 3, timeoutMs: 45_000 }
    );
  } catch (err) {
    if (/HTTP 404/.test(String(err))) return { _id: id, notfound: true };
    throw err;
  }
}
