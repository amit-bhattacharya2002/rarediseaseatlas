/**
 * Lightweight ClinicalTrials.gov probe for disease pages.
 * Uses the published query string only — full Mondo/query rebuild is nightly.
 */

export interface CtStudy {
  protocolSection?: {
    identificationModule?: { briefTitle?: string; officialTitle?: string };
    conditionsModule?: { conditions?: string[] };
    designModule?: { studyType?: string };
  };
}

interface CtResponse {
  totalCount?: number;
  studies?: CtStudy[];
  nextPageToken?: string;
}

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Count interventional studies whose conditions/title match a published query phrase. */
export function countMatchingInterventional(
  studies: CtStudy[],
  query: string
): number {
  const phrases = query
    .split(/\s+OR\s+/i)
    .map((p) => normalize(p.replace(/"/g, "")))
    .filter((p) => p.length >= 4);
  if (phrases.length === 0) return 0;
  let n = 0;
  for (const s of studies) {
    if (s.protocolSection?.designModule?.studyType !== "INTERVENTIONAL") {
      continue;
    }
    const conditions = (
      s.protocolSection?.conditionsModule?.conditions ?? []
    ).map(normalize);
    const title = normalize(
      s.protocolSection?.identificationModule?.briefTitle ||
        s.protocolSection?.identificationModule?.officialTitle ||
        ""
    );
    const hit = phrases.some((phrase) => {
      const padded = ` ${phrase} `;
      return (
        conditions.some((c) => ` ${c} `.includes(padded)) ||
        ` ${title} `.includes(padded)
      );
    });
    if (hit) n += 1;
  }
  return n;
}

const DEFAULT_MAX_PAGES = 25;

/**
 * Page CT.gov for query.cond matches. Caps pages so disease pages stay responsive.
 * fullyScanned=false when truncated — prefer under-count to claiming completeness.
 */
export async function probeInterventionalTrials(
  query: string,
  maxPages = DEFAULT_MAX_PAGES
): Promise<{ liveTotal: number; pages: number; fullyScanned: boolean }> {
  if (!query.trim()) {
    return { liveTotal: 0, pages: 0, fullyScanned: true };
  }

  const collected: CtStudy[] = [];
  let token: string | undefined;
  let pages = 0;

  do {
    pages += 1;
    const base =
      `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(query)}` +
      `&format=json&pageSize=100&countTotal=true`;
    const url = token
      ? `${base}&pageToken=${encodeURIComponent(token)}`
      : base;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ClinicalTrials.gov HTTP ${res.status}`);
    }
    const data = (await res.json()) as CtResponse;
    collected.push(...(data.studies ?? []));
    token = data.nextPageToken;
    if (!(data.studies?.length)) break;
  } while (token && pages < maxPages);

  return {
    liveTotal: countMatchingInterventional(collected, query),
    pages,
    fullyScanned: !token,
  };
}
