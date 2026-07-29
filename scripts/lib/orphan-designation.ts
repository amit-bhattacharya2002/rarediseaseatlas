/**
 * FDA orphan-drug designation index (cached mirror) + disease matching.
 *
 * Source: community-parsed FDA OOPD dump (UMLS-annotated designations).
 * Live FDA Excel download is form-gated / often blocked; we cache the mirror
 * under .cache/ and refresh when older than 30 days.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchText } from "./http";
import { normalizeTerm } from "./query-build";
import type { DiseaseRecord } from "../../src/lib/types";

const MIRROR_URL =
  "https://raw.githubusercontent.com/r76941156/fda_orphan_drug/main/data.json";
const CACHE_PATH = path.join(process.cwd(), ".cache", "fda-orphan-oopd.json");
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface OrphanDesignationText {
  original_text?: string;
  parsed_text?: string;
  umls?: string;
}

interface OrphanRow {
  generic_name?: string;
  trade_name?: string;
  designation_status?: string;
  approval_status?: string;
  designated_date?: string;
  orphan_designation?: OrphanDesignationText | string;
}

interface OrphanDoc {
  _id?: string;
  fda_orphan_drug?: OrphanRow[];
}

export interface OrphanIndex {
  fetchedAt: string;
  byUmls: Map<string, OrphanRow[]>;
  byName: Map<string, OrphanRow[]>;
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((v) => asText(v))
      .filter(Boolean)
      .join(" ");
  }
  return String(value).trim();
}

function asUmlsList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => asUmlsList(v));
  }
  return [];
}

function designationText(row: OrphanRow): {
  text: string;
  umlsIds: string[];
} {
  const raw = row.orphan_designation;
  if (raw == null) return { text: "", umlsIds: [] };
  if (typeof raw === "string") return { text: raw.trim(), umlsIds: [] };
  return {
    text: asText(raw.parsed_text) || asText(raw.original_text),
    umlsIds: asUmlsList(raw.umls),
  };
}

function pushMap(map: Map<string, OrphanRow[]>, key: string, row: OrphanRow) {
  const k = key.trim();
  if (!k) return;
  const list = map.get(k) ?? [];
  list.push(row);
  map.set(k, list);
}

export async function loadOrphanIndex(): Promise<OrphanIndex> {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  let body: string | null = null;
  if (fs.existsSync(CACHE_PATH)) {
    const age = Date.now() - fs.statSync(CACHE_PATH).mtimeMs;
    if (age < MAX_AGE_MS) body = fs.readFileSync(CACHE_PATH, "utf8");
  }
  if (!body) {
    body = await fetchText(MIRROR_URL, {
      cacheKey: undefined,
      timeoutMs: 180_000,
      maxRetries: 3,
    });
    fs.writeFileSync(CACHE_PATH, body, "utf8");
  }

  const docs = JSON.parse(body) as OrphanDoc[];
  const byUmls = new Map<string, OrphanRow[]>();
  const byName = new Map<string, OrphanRow[]>();
  for (const doc of docs) {
    for (const row of doc.fda_orphan_drug ?? []) {
      const { text, umlsIds } = designationText(row);
      for (const umls of umlsIds) pushMap(byUmls, umls.toUpperCase(), row);
      const norm = normalizeTerm(text.replace(/^treatment of\s+/i, ""));
      if (norm.length >= 4) pushMap(byName, norm, row);
    }
  }
  return {
    fetchedAt: new Date().toISOString(),
    byUmls,
    byName,
  };
}

function rowToDesignation(
  row: OrphanRow,
  matchedVia: "umls" | "name"
): NonNullable<DiseaseRecord["orphanDesignation"]>["designations"][number] {
  const { text } = designationText(row);
  return {
    genericName: row.generic_name?.trim() || "unknown",
    tradeName: row.trade_name?.trim() || null,
    designation: text || "Orphan designation",
    designationStatus: row.designation_status?.trim() || null,
    approvalStatus: row.approval_status?.trim() || null,
    designatedDate: row.designated_date?.trim() || null,
    matchedVia,
  };
}

function isApprovedOrphan(status: string | null): boolean {
  if (!status) return false;
  return /fda approved for orphan indication/i.test(status);
}

export function matchOrphanDesignations(
  d: DiseaseRecord,
  index: OrphanIndex
): NonNullable<DiseaseRecord["orphanDesignation"]> {
  const seen = new Set<string>();
  const designations: NonNullable<
    DiseaseRecord["orphanDesignation"]
  >["designations"] = [];

  const addRows = (rows: OrphanRow[] | undefined, via: "umls" | "name") => {
    if (!rows) return;
    for (const row of rows) {
      const key = `${row.generic_name}|${designationText(row).text}|${row.designated_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      designations.push(rowToDesignation(row, via));
    }
  };

  for (const umls of d.identifiers?.umls ?? []) {
    const id = umls.trim().toUpperCase();
    if (id) addRows(index.byUmls.get(id), "umls");
  }

  if (designations.length === 0) {
    const names = [
      d.name,
      d.nameCorrected,
      ...d.synonyms,
      ...d.mondoSynonyms,
    ].filter(Boolean) as string[];
    for (const name of names) {
      const norm = normalizeTerm(name);
      if (norm.length < 4) continue;
      addRows(index.byName.get(norm), "name");
      if (designations.length >= 20) break;
    }
  }

  designations.sort((a, b) => {
    const ap = isApprovedOrphan(a.approvalStatus) ? 0 : 1;
    const bp = isApprovedOrphan(b.approvalStatus) ? 0 : 1;
    return ap - bp || (b.designatedDate ?? "").localeCompare(a.designatedDate ?? "");
  });

  const capped = designations.slice(0, 15);
  const approvedOrphanIndicationCount = designations.filter((x) =>
    isApprovedOrphan(x.approvalStatus)
  ).length;

  return {
    fetchedAt: index.fetchedAt,
    source: "fda-oopd",
    matched: designations.length > 0,
    designationCount: designations.length,
    approvedOrphanIndicationCount,
    designations: capped,
  };
}
