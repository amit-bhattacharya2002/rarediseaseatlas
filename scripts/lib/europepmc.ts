import { fetchJson } from "./http";
import { log } from "./logger";
import type { AuthorRecord, YearCount } from "../../src/lib/types";

const PMC_BASE =
  "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

interface PmcAuthor {
  fullName?: string;
  lastName?: string;
  firstName?: string;
  initials?: string;
  authorAffiliationDetailsList?: {
    authorAffiliation?:
      | { affiliation?: string }
      | Array<{ affiliation?: string }>;
  };
}

interface PmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  title?: string;
  pubYear?: string;
  authorList?: { author?: PmcAuthor | PmcAuthor[] };
  authorString?: string;
}

interface PmcResponse {
  hitCount?: number;
  nextCursorMark?: string;
  resultList?: { result?: PmcResult | PmcResult[] };
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Dedup key: last name + initials, lowercased. Skips collective/consortium noise. */
function authorDedupKey(a: PmcAuthor): { key: string; display: string } | null {
  const last = (a.lastName ?? "").trim();
  if (!last || last.length < 2) return null;
  if (/consortium|et al|collaborat|network|group|investigators/i.test(last)) {
    return null;
  }
  const initials = (a.initials || a.firstName || "")
    .trim()
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
  const key = `${last.toLowerCase()}|${initials.toLowerCase()}`;
  const display =
    a.fullName?.trim() ||
    `${last}${initials ? ` ${initials}` : ""}`.trim();
  return { key, display };
}

function firstAffiliation(a: PmcAuthor): string | null {
  const list = a.authorAffiliationDetailsList?.authorAffiliation;
  const items = asArray(list);
  for (const item of items) {
    if (item?.affiliation?.trim()) return item.affiliation.trim();
  }
  return null;
}

export function europePmcSearchUrl(query: string): string {
  return `https://europepmc.org/search?query=${encodeURIComponent(query)}`;
}

async function pmcSearch(
  query: string,
  pageSize: number,
  cursorMark = "*",
  resultType: "lite" | "core" = "core"
): Promise<PmcResponse> {
  const url =
    `${PMC_BASE}?query=${encodeURIComponent(query)}` +
    `&format=json&resultType=${resultType}&pageSize=${pageSize}` +
    `&cursorMark=${encodeURIComponent(cursorMark)}`;
  return fetchJson<PmcResponse>(url, {
    cacheKey: `pmc:${resultType}:${pageSize}:${query}:${cursorMark}`,
  });
}

/** Lite hit-count only (for Mondo parent artifact checks). */
export async function fetchPublicationHitCount(query: string): Promise<number> {
  if (!query.trim()) return 0;
  const res = await pmcSearch(query, 1, "*", "lite");
  return res.hitCount ?? 0;
}

/** Build a MeSH OR query fragment from descriptor labels. */
export function buildMeshQuery(meshLabels: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of meshLabels) {
    const t = raw.trim().replace(/"/g, "");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`MESH:"${t}"`);
  }
  return parts.join(" OR ");
}

export interface PublicationSignals {
  total: number;
  phraseCount: number;
  meshCount: number;
  last10Years: number;
  byYear: YearCount[];
  distinctResearchers: number;
  papersSampledForAuthors: number;
  topAuthors: AuthorRecord[];
  effectiveQuery: string;
  meshQuery: string;
  strategiesWithHits: ("phrase" | "mesh")[];
}

/**
 * Union of the quoted phrase query and a MeSH descriptor query. Europe PMC
 * hitCount of the OR query is already deduplicated, so it is the union total.
 */
export async function fetchPublicationSignals(
  phraseQuery: string,
  meshLabels: string[] = []
): Promise<PublicationSignals> {
  const meshQuery = buildMeshQuery(meshLabels);
  const effectiveQuery = meshQuery
    ? phraseQuery
      ? `(${phraseQuery}) OR (${meshQuery})`
      : `(${meshQuery})`
    : phraseQuery;

  if (!effectiveQuery.trim()) {
    return {
      total: 0,
      phraseCount: 0,
      meshCount: 0,
      last10Years: 0,
      byYear: [],
      distinctResearchers: 0,
      papersSampledForAuthors: 0,
      topAuthors: [],
      effectiveQuery: "",
      meshQuery: "",
      strategiesWithHits: [],
    };
  }

  const query = effectiveQuery;
  const phraseCount = phraseQuery
    ? (await pmcSearch(phraseQuery, 1, "*", "lite")).hitCount ?? 0
    : 0;
  const meshCount = meshQuery
    ? (await pmcSearch(meshQuery, 1, "*", "lite")).hitCount ?? 0
    : 0;
  const totalRes = await pmcSearch(query, 1, "*", "lite");
  const total = totalRes.hitCount ?? 0;

  const strategiesWithHits: ("phrase" | "mesh")[] = [];
  if (phraseCount > 0) strategiesWithHits.push("phrase");
  if (meshCount > 0) strategiesWithHits.push("mesh");

  const authorCounts = new Map<
    string,
    {
      display: string;
      count: number;
      affiliation: string | null;
      mostRecentYear: number | null;
    }
  >();

  let cursor = "*";
  let fetched = 0;
  const target = Math.min(200, total);

  while (fetched < target) {
    const pageSize = Math.min(100, target - fetched);
    const page = await pmcSearch(query, pageSize, cursor, "core");
    const results = asArray(page.resultList?.result);
    if (results.length === 0) break;

    for (const r of results) {
      const year = r.pubYear ? parseInt(r.pubYear, 10) : null;
      const authors = asArray(r.authorList?.author);
      // Structured authors only — authorString comma-splits inflate distinct counts
      for (const a of authors) {
        const id = authorDedupKey(a);
        if (!id) continue;
        const aff = firstAffiliation(a);
        const prev = authorCounts.get(id.key) ?? {
          display: id.display,
          count: 0,
          affiliation: null,
          mostRecentYear: null,
        };
        prev.count += 1;
        if (aff) prev.affiliation = aff;
        if (year && (!prev.mostRecentYear || year > prev.mostRecentYear)) {
          prev.mostRecentYear = year;
        }
        authorCounts.set(id.key, prev);
      }
    }

    fetched += results.length;
    const next = page.nextCursorMark;
    if (!next || next === cursor) break;
    cursor = next;
  }

  const topAuthors: AuthorRecord[] = [...authorCounts.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .slice(0, 10)
    .map((meta) => ({
      name: meta.display,
      count: meta.count,
      affiliation: meta.affiliation,
      mostRecentYear: meta.mostRecentYear,
      europePmcAuthorQuery: `AUTH:"${meta.display.replace(/"/g, "")}" AND (${query})`,
    }));

  const currentYear = new Date().getFullYear();
  const byYear: YearCount[] = [];
  let last10Years = 0;

  for (let y = currentYear - 14; y <= currentYear; y++) {
    const yearQuery = `(${query}) AND PUB_YEAR:${y}`;
    try {
      const yr = await pmcSearch(yearQuery, 1, "*", "lite");
      const count = yr.hitCount ?? 0;
      byYear.push({ year: y, count });
      if (y >= currentYear - 9) last10Years += count;
    } catch (err) {
      log.warn(`PMC year query failed for ${y}: ${String(err)}`);
      byYear.push({ year: y, count: 0 });
    }
  }

  return {
    total,
    phraseCount,
    meshCount,
    last10Years,
    byYear,
    distinctResearchers: authorCounts.size,
    papersSampledForAuthors: fetched,
    topAuthors,
    effectiveQuery: query,
    meshQuery,
    strategiesWithHits,
  };
}
