/**
 * FDA + EMA orphan-drug designation indexes (cached) + disease matching.
 *
 * FDA: community-parsed OOPD dump (UMLS-annotated).
 * EMA: public medicines-output-orphan_designations JSON report (name join).
 */
import fs from "node:fs";
import path from "node:path";
import { fetchText } from "./http";
import { normalizeTerm } from "./query-build";
import type { DiseaseRecord } from "../../src/lib/types";

const FDA_MIRROR_URL =
  "https://raw.githubusercontent.com/r76941156/fda_orphan_drug/main/data.json";
const FDA_CACHE_PATH = path.join(process.cwd(), ".cache", "fda-orphan-oopd.json");

const EMA_URL =
  "https://www.ema.europa.eu/en/documents/report/medicines-output-orphan_designations-json-report_en.json";
const EMA_CACHE_PATH = path.join(
  process.cwd(),
  ".cache",
  "ema-orphan-designations.json"
);

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type DesignationRow = NonNullable<
  DiseaseRecord["orphanDesignation"]
>["designations"][number];

interface OrphanDesignationText {
  original_text?: string;
  parsed_text?: string;
  umls?: string;
}

interface FdaOrphanRow {
  generic_name?: string;
  trade_name?: string;
  designation_status?: string;
  approval_status?: string;
  designated_date?: string;
  orphan_designation?: OrphanDesignationText | string;
}

interface FdaOrphanDoc {
  _id?: string;
  fda_orphan_drug?: FdaOrphanRow[];
}

export interface FdaOrphanIndex {
  fetchedAt: string;
  byUmls: Map<string, FdaOrphanRow[]>;
  byName: Map<string, FdaOrphanRow[]>;
}

/** @deprecated Prefer FdaOrphanIndex */
export type OrphanIndex = FdaOrphanIndex;

interface EmaOrphanRow {
  medicine_name?: string;
  active_substance?: string;
  intended_use?: string;
  eu_designation_number?: string;
  date_of_designation_or_refusal?: string;
  status?: string;
  orphan_designation_url?: string;
}

export interface EmaOrphanIndex {
  fetchedAt: string;
  byName: Map<string, EmaOrphanRow[]>;
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

function designationText(row: FdaOrphanRow): {
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

function pushMap<T>(map: Map<string, T[]>, key: string, row: T) {
  const k = key.trim();
  if (!k) return;
  const list = map.get(k) ?? [];
  list.push(row);
  map.set(k, list);
}

async function loadCachedText(
  cachePath: string,
  url: string,
  timeoutMs = 180_000
): Promise<{ body: string; fetchedAt: string }> {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  if (fs.existsSync(cachePath)) {
    const age = Date.now() - fs.statSync(cachePath).mtimeMs;
    if (age < MAX_AGE_MS) {
      return {
        body: fs.readFileSync(cachePath, "utf8"),
        fetchedAt: fs.statSync(cachePath).mtime.toISOString(),
      };
    }
  }
  const body = await fetchText(url, {
    cacheKey: undefined,
    timeoutMs,
    maxRetries: 3,
  });
  fs.writeFileSync(cachePath, body, "utf8");
  return { body, fetchedAt: new Date().toISOString() };
}

export async function loadFdaOrphanIndex(): Promise<FdaOrphanIndex> {
  const { body, fetchedAt } = await loadCachedText(
    FDA_CACHE_PATH,
    FDA_MIRROR_URL
  );
  const docs = JSON.parse(body) as FdaOrphanDoc[];
  const byUmls = new Map<string, FdaOrphanRow[]>();
  const byName = new Map<string, FdaOrphanRow[]>();
  for (const doc of docs) {
    for (const row of doc.fda_orphan_drug ?? []) {
      const { text, umlsIds } = designationText(row);
      for (const umls of umlsIds) pushMap(byUmls, umls.toUpperCase(), row);
      const norm = normalizeTerm(text.replace(/^treatment of\s+/i, ""));
      if (norm.length >= 4) pushMap(byName, norm, row);
    }
  }
  return { fetchedAt, byUmls, byName };
}

/** @deprecated Use loadFdaOrphanIndex */
export async function loadOrphanIndex(): Promise<FdaOrphanIndex> {
  return loadFdaOrphanIndex();
}

export async function loadEmaOrphanIndex(): Promise<EmaOrphanIndex> {
  const { body, fetchedAt } = await loadCachedText(EMA_CACHE_PATH, EMA_URL);
  const parsed = JSON.parse(body) as {
    data?: EmaOrphanRow[];
    meta?: { timestamp?: string };
  };
  const byName = new Map<string, EmaOrphanRow[]>();
  for (const row of parsed.data ?? []) {
    const intended = asText(row.intended_use).replace(
      /^(treatment|prevention|diagnosis)\s+of\s+/i,
      ""
    );
    const norm = normalizeTerm(intended);
    if (norm.length >= 4) pushMap(byName, norm, row);
  }
  return {
    fetchedAt: parsed.meta?.timestamp ?? fetchedAt,
    byName,
  };
}

function fdaRowToDesignation(
  row: FdaOrphanRow,
  matchedVia: "umls" | "name"
): DesignationRow {
  const { text } = designationText(row);
  return {
    agency: "fda",
    genericName: row.generic_name?.trim() || "unknown",
    tradeName: row.trade_name?.trim() || null,
    designation: text || "Orphan designation",
    designationStatus: row.designation_status?.trim() || null,
    approvalStatus: row.approval_status?.trim() || null,
    designatedDate: row.designated_date?.trim() || null,
    matchedVia,
    url: null,
  };
}

function emaRowToDesignation(row: EmaOrphanRow): DesignationRow {
  const substance =
    asText(row.active_substance) || asText(row.medicine_name) || "unknown";
  const intended = asText(row.intended_use) || "Orphan designation";
  return {
    agency: "ema",
    genericName: substance,
    tradeName: asText(row.medicine_name) || null,
    designation: intended,
    designationStatus: asText(row.status) || null,
    approvalStatus: asText(row.status) || null,
    designatedDate: asText(row.date_of_designation_or_refusal) || null,
    matchedVia: "name",
    url: asText(row.orphan_designation_url) || null,
  };
}

function isFdaApprovedOrphan(status: string | null): boolean {
  if (!status) return false;
  return /fda approved for orphan indication/i.test(status);
}

function isEmaPositive(status: string | null): boolean {
  if (!status) return false;
  return /^positive$/i.test(status.trim());
}

export function matchFdaOrphanDesignations(
  d: DiseaseRecord,
  index: FdaOrphanIndex
): NonNullable<DiseaseRecord["orphanDesignation"]> {
  const seen = new Set<string>();
  const designations: DesignationRow[] = [];

  const addRows = (rows: FdaOrphanRow[] | undefined, via: "umls" | "name") => {
    if (!rows) return;
    for (const row of rows) {
      const key = `fda|${row.generic_name}|${designationText(row).text}|${row.designated_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      designations.push(fdaRowToDesignation(row, via));
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
    const ap = isFdaApprovedOrphan(a.approvalStatus) ? 0 : 1;
    const bp = isFdaApprovedOrphan(b.approvalStatus) ? 0 : 1;
    return (
      ap - bp || (b.designatedDate ?? "").localeCompare(a.designatedDate ?? "")
    );
  });

  const capped = designations.slice(0, 15);
  return {
    fetchedAt: index.fetchedAt,
    source: "fda-oopd",
    matched: designations.length > 0,
    designationCount: designations.length,
    approvedOrphanIndicationCount: designations.filter((x) =>
      isFdaApprovedOrphan(x.approvalStatus)
    ).length,
    designations: capped,
  };
}

/** @deprecated Prefer matchFdaOrphanDesignations */
export function matchOrphanDesignations(
  d: DiseaseRecord,
  index: FdaOrphanIndex
): NonNullable<DiseaseRecord["orphanDesignation"]> {
  return matchFdaOrphanDesignations(d, index);
}

export function matchEmaOrphanDesignations(
  d: DiseaseRecord,
  index: EmaOrphanIndex
): DesignationRow[] {
  const seen = new Set<string>();
  const designations: DesignationRow[] = [];
  const names = [
    d.name,
    d.nameCorrected,
    ...d.synonyms,
    ...d.mondoSynonyms,
  ].filter(Boolean) as string[];

  for (const name of names) {
    const norm = normalizeTerm(name);
    if (norm.length < 4) continue;
    const rows = index.byName.get(norm);
    if (!rows) continue;
    for (const row of rows) {
      const key = `ema|${row.eu_designation_number}|${row.active_substance}|${row.intended_use}`;
      if (seen.has(key)) continue;
      seen.add(key);
      designations.push(emaRowToDesignation(row));
    }
    if (designations.length >= 20) break;
  }

  designations.sort((a, b) => {
    const ap = isEmaPositive(a.designationStatus) ? 0 : 1;
    const bp = isEmaPositive(b.designationStatus) ? 0 : 1;
    return (
      ap - bp || (b.designatedDate ?? "").localeCompare(a.designatedDate ?? "")
    );
  });
  return designations.slice(0, 15);
}

export function mergeOrphanDesignations(
  fda: NonNullable<DiseaseRecord["orphanDesignation"]>,
  emaRows: DesignationRow[],
  fetchedAt: string
): NonNullable<DiseaseRecord["orphanDesignation"]> {
  const fdaRows = fda.designations.map((row) => ({
    ...row,
    agency: (row.agency ?? "fda") as "fda" | "ema",
  }));
  const combined = [...fdaRows, ...emaRows];
  combined.sort((a, b) => {
    const agencyRank = (x: DesignationRow) =>
      x.agency === "fda" && isFdaApprovedOrphan(x.approvalStatus)
        ? 0
        : x.agency === "ema" && isEmaPositive(x.designationStatus)
          ? 1
          : 2;
    return (
      agencyRank(a) - agencyRank(b) ||
      (b.designatedDate ?? "").localeCompare(a.designatedDate ?? "")
    );
  });
  const capped = combined.slice(0, 20);
  const hasFda = fdaRows.length > 0;
  const hasEma = emaRows.length > 0;
  const source: NonNullable<DiseaseRecord["orphanDesignation"]>["source"] =
    hasFda && hasEma ? "fda-oopd+ema" : hasEma ? "ema" : "fda-oopd";

  return {
    fetchedAt,
    source,
    matched: capped.length > 0,
    designationCount: combined.length,
    approvedOrphanIndicationCount: fdaRows.filter((x) =>
      isFdaApprovedOrphan(x.approvalStatus)
    ).length,
    designations: capped,
  };
}
