import crypto from "node:crypto";
import { fetchJsonPost } from "../http";
import type { RegistryTrialRecord } from "../../../src/lib/types";
import { collectSecondaryIds, extractNctId } from "./normalize";

const CTIS_SEARCH = "https://euclinicaltrials.eu/ctis-public-api/search";
const MAX_PAGES = 3;
const PAGE_SIZE = 20;
const MAX_TERMS = 3;

interface CtisHit {
  ctNumber?: string;
  ctTitle?: string;
  shortTitle?: string;
  conditions?: string;
  ctStatus?: number | string;
  sponsor?: string;
  trialPhase?: string;
  eudraCtCode?: string;
}

interface CtisResponse {
  pagination?: { totalRecords?: number; totalPages?: number };
  data?: CtisHit[];
}

const STATUS_MAP: Record<string, string> = {
  "1": "Under evaluation",
  "2": "Authorised",
  "3": "Authorised, recruiting",
  "4": "Authorised, ongoing",
  "5": "Expired",
  "6": "Revoked",
  "7": "Not authorised",
  "8": "Cancelled",
  "9": "Suspended",
  "10": "Ended",
};

function emptyCriteria(overrides: Record<string, unknown>) {
  return {
    containAll: null,
    containAny: null,
    containNot: null,
    title: null,
    number: null,
    eudraCtCode: null,
    endOfTrialLetterNumber: null,
    endOfTrialExemptionNumber: null,
    sponsor: null,
    medicalCondition: null,
    productName: null,
    productCode: null,
    ageGroupCodes: null,
    therapeuticAreaCodes: null,
    countryCodes: null,
    siteStatusCodes: null,
    status: null,
    phaseCodes: null,
    sponsorTypeCodes: null,
    ...overrides,
  };
}

function toRecord(hit: CtisHit): RegistryTrialRecord | null {
  const id = (hit.ctNumber || "").trim();
  if (!id) return null;
  const title = (hit.ctTitle || hit.shortTitle || id).trim();
  const conditions = (hit.conditions || "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const statusRaw = hit.ctStatus != null ? String(hit.ctStatus) : "";
  const secondaryIds = collectSecondaryIds(id, hit.eudraCtCode, title);
  return {
    id,
    nctId: extractNctId(id, title, hit.eudraCtCode),
    secondaryIds,
    title,
    status: STATUS_MAP[statusRaw] ?? (statusRaw || null),
    registry: "ctis",
    url: `https://euclinicaltrials.eu/search-for-clinical-trials/?lang=en&EUCT=${encodeURIComponent(id)}`,
    conditions,
    studyType: hit.trialPhase ? `CTIS ${hit.trialPhase}` : "INTERVENTIONAL",
  };
}

export async function searchCtis(
  terms: string[]
): Promise<RegistryTrialRecord[]> {
  const q = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .slice(0, MAX_TERMS);
  if (q.length === 0) return [];

  const out: RegistryTrialRecord[] = [];
  const seen = new Set<string>();

  for (const term of q) {
    for (const page of Array.from({ length: MAX_PAGES }, (_, i) => i + 1)) {
      const body = {
        pagination: { page, size: PAGE_SIZE },
        sort: { property: "decisionDate", direction: "DESC" },
        searchCriteria: emptyCriteria({ containAny: term }),
      };
      const cacheKey = `ctis:v1:${crypto
        .createHash("sha1")
        .update(JSON.stringify(body))
        .digest("hex")}`;
      const res = await fetchJsonPost<CtisResponse>(CTIS_SEARCH, {
        body,
        cacheKey,
        timeoutMs: 45_000,
      });
      const rows = res.data ?? [];
      for (const hit of rows) {
        const rec = toRecord(hit);
        if (!rec || seen.has(rec.id)) continue;
        seen.add(rec.id);
        out.push(rec);
      }
      const totalPages = res.pagination?.totalPages ?? 1;
      if (page >= totalPages || rows.length === 0) break;
    }
  }

  return out;
}
