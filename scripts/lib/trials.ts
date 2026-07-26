import { fetchJson } from "./http";
import { chunkTermsForTrials } from "./query-build";
import { isPanRegistryNctId } from "../pan-registry-nctids";
import type { TrialRecord } from "../../src/lib/types";

interface CtStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      studyType?: string;
    };
  };
}

interface CtResponse {
  totalCount?: number;
  studies?: CtStudy[];
  nextPageToken?: string;
}

const RECRUITING_STATUSES = new Set([
  "RECRUITING",
  "NOT_YET_RECRUITING",
  "ENROLLING_BY_INVITATION",
]);

export type TrialMatchVia = "mesh" | "phrase" | "both" | "recall-expansion";

/** Build an OR'd quoted-phrase query for ClinicalTrials.gov (same discipline as Europe PMC). */
export function buildTrialsQuery(terms: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of terms) {
    const t = raw.trim().replace(/"/g, "");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`"${t}"`);
  }
  return parts.join(" OR ");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Phrase match with token boundaries — blocks "oma"/"cyst" style substring hits. */
export function phrasePresent(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  const h = ` ${haystack} `;
  const n = ` ${needle} `;
  return h.includes(n);
}

function termsMatch(study: CtStudy, terms: string[], minLen: number): boolean {
  const conditions = (study.protocolSection?.conditionsModule?.conditions ?? []).map(
    normalize
  );
  const title = normalize(
    study.protocolSection?.identificationModule?.briefTitle ||
      study.protocolSection?.identificationModule?.officialTitle ||
      ""
  );
  for (const term of terms) {
    const needle = normalize(term);
    if (needle.length < 4) continue;
    if (conditions.some((c) => phrasePresent(c, needle))) return true;
  }
  for (const term of terms) {
    const needle = normalize(term);
    if (needle.length < minLen) continue; // title-only stricter
    if (phrasePresent(title, needle)) return true;
  }
  return false;
}

/** Legacy boolean matcher (phrase terms only) — retained for tests. */
export function studyMatchesTerms(study: CtStudy, terms: string[]): boolean {
  return termsMatch(study, terms, 8);
}

/** Which strategies matched a study. */
export function classifyStudy(
  study: CtStudy,
  phraseTerms: string[],
  meshTerms: string[],
  recallTerms: string[] = []
): { phrase: boolean; mesh: boolean; recall: boolean } {
  return {
    phrase: termsMatch(study, phraseTerms, 8),
    // MeSH descriptor labels are trusted vocabulary — allow shorter title match
    mesh: meshTerms.length > 0 ? termsMatch(study, meshTerms, 6) : false,
    // Gene symbols and parent labels can be short; condition match is primary.
    recall:
      recallTerms.length > 0 ? termsMatch(study, recallTerms, 4) : false,
  };
}

function studyToRecord(s: CtStudy): TrialRecord | null {
  const id = s.protocolSection?.identificationModule?.nctId;
  if (!id) return null;
  const title =
    s.protocolSection?.identificationModule?.briefTitle ||
    s.protocolSection?.identificationModule?.officialTitle ||
    "Untitled study";
  const status = s.protocolSection?.statusModule?.overallStatus ?? "UNKNOWN";
  return {
    nctId: id,
    title,
    status,
    url: `https://clinicaltrials.gov/study/${id}`,
    conditions: s.protocolSection?.conditionsModule?.conditions ?? [],
    studyType: s.protocolSection?.designModule?.studyType ?? null,
  };
}

function labelMatchedVia(cls: {
  phrase: boolean;
  mesh: boolean;
  recall: boolean;
}): TrialMatchVia {
  if (cls.phrase && cls.mesh) return "both";
  if (cls.phrase) return "phrase";
  if (cls.mesh) return "mesh";
  if (cls.recall) return "recall-expansion";
  return "phrase";
}

export interface TrialSignals {
  /** Unique INTERVENTIONAL studies only. */
  total: number;
  recruitingCount: number;
  recruiting: TrialRecord[];
  /** Every unique condition-specific match, retained for validation/review. */
  matchedStudies: TrialRecord[];
  registeredStudiesTotal: number;
  observationalTotal: number;
  observationalRecruitingCount: number;
  observationalRecruiting: TrialRecord[];
  observationalStudies: TrialRecord[];
  expandedAccessTotal: number;
  expandedAccessStudies: TrialRecord[];
  /** Matched observational / expanded-access records excluded from trial counts. */
  excludedNonInterventional: number;
  generalRegistries: TrialRecord[];
  query: string;
  fullyScanned: boolean;
  /** Distinct match strategies that produced at least one hit */
  matchedVia: TrialMatchVia[];
  /** Strategies with any condition-specific registered-study hit, any type. */
  queryStrategiesWithHits: ("mesh" | "phrase" | "recall-expansion")[];
  strategiesAttempted: ("phrase" | "mesh" | "recall-expansion")[];
}

async function fetchTrialQueryPages(
  query: string,
  phraseTerms: string[],
  meshTerms: string[],
  recallTerms: string[],
  state: {
    recruiting: TrialRecord[];
    matchedStudies: TrialRecord[];
    observationalRecruiting: TrialRecord[];
    observationalStudies: TrialRecord[];
    expandedAccessStudies: TrialRecord[];
    generalRegistries: TrialRecord[];
    seenIds: Set<string>;
    seenAllIds: Set<string>;
    seenRegistry: Set<string>;
    phraseHits: number;
    meshHits: number;
    bothHits: number;
    recallHits: number;
    queryPhraseHit: boolean;
    queryMeshHit: boolean;
    queryRecallHit: boolean;
    excludedNonInterventional: number;
  }
): Promise<{ fullyScanned: boolean }> {
  const base =
    `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(query)}` +
    `&format=json&pageSize=100&countTotal=true`;

  let token: string | undefined;
  let pages = 0;
  const maxPages = 250;

  do {
    pages += 1;
    const url = token
      ? `${base}&pageToken=${encodeURIComponent(token)}`
      : base;
    const page = await fetchJson<CtResponse>(url, {
      cacheKey: `ctgov:v2:cond:b5:${query}:p${pages}:${token ?? "start"}`,
    });

    for (const s of page.studies ?? []) {
      const cls = classifyStudy(s, phraseTerms, meshTerms, recallTerms);
      if (!cls.phrase && !cls.mesh && !cls.recall) continue;
      const rec = studyToRecord(s);
      if (!rec) continue;

      if (isPanRegistryNctId(rec.nctId)) {
        if (!state.seenRegistry.has(rec.nctId)) {
          state.seenRegistry.add(rec.nctId);
          state.generalRegistries.push(rec);
        }
        continue;
      }

      if (cls.phrase) state.queryPhraseHit = true;
      if (cls.mesh) state.queryMeshHit = true;
      if (cls.recall && !cls.phrase && !cls.mesh) state.queryRecallHit = true;
      if (state.seenAllIds.has(rec.nctId)) continue;
      state.seenAllIds.add(rec.nctId);
      rec.matchedVia = labelMatchedVia(cls);

      if (rec.studyType !== "INTERVENTIONAL") {
        state.excludedNonInterventional += 1;
        if (rec.studyType === "OBSERVATIONAL") {
          state.observationalStudies.push(rec);
          if (RECRUITING_STATUSES.has(rec.status.toUpperCase())) {
            state.observationalRecruiting.push(rec);
          }
        } else {
          state.expandedAccessStudies.push(rec);
        }
        continue;
      }

      if (state.seenIds.has(rec.nctId)) continue;
      state.seenIds.add(rec.nctId);
      state.matchedStudies.push(rec);
      if (rec.matchedVia === "both") state.bothHits += 1;
      else if (rec.matchedVia === "phrase") state.phraseHits += 1;
      else if (rec.matchedVia === "mesh") state.meshHits += 1;
      else if (rec.matchedVia === "recall-expansion") state.recallHits += 1;
      if (RECRUITING_STATUSES.has(rec.status.toUpperCase())) {
        state.recruiting.push(rec);
      }
    }

    token = page.nextPageToken;
    if (!(page.studies?.length)) break;
  } while (token && pages < maxPages);

  return { fullyScanned: !token };
}

/**
 * Fetch condition-specific trials. Union of quoted name phrases, MeSH
 * descriptor labels, and recall-expansion terms via query.cond; each hit is
 * post-filtered and tagged with the strategy that matched it.
 * Long term lists are chunked and unioned so over-long queries never silently
 * become measured zeros.
 */
export async function fetchTrialSignals(
  phraseTerms: string[],
  meshTerms: string[] = [],
  recallTerms: string[] = []
): Promise<TrialSignals> {
  const strategiesAttempted: ("phrase" | "mesh" | "recall-expansion")[] = [
    "phrase",
  ];
  if (meshTerms.length > 0) strategiesAttempted.push("mesh");
  if (recallTerms.length > 0) strategiesAttempted.push("recall-expansion");

  const allTerms = [...phraseTerms, ...meshTerms, ...recallTerms];
  const query = buildTrialsQuery(allTerms);
  if (!query) {
    return {
      total: 0,
      recruitingCount: 0,
      recruiting: [],
      matchedStudies: [],
      registeredStudiesTotal: 0,
      observationalTotal: 0,
      observationalRecruitingCount: 0,
      observationalRecruiting: [],
      observationalStudies: [],
      expandedAccessTotal: 0,
      expandedAccessStudies: [],
      excludedNonInterventional: 0,
      generalRegistries: [],
      query: "",
      fullyScanned: true,
      matchedVia: [],
      queryStrategiesWithHits: [],
      strategiesAttempted,
    };
  }

  const chunks = chunkTermsForTrials(allTerms);
  const state = {
    recruiting: [] as TrialRecord[],
    matchedStudies: [] as TrialRecord[],
    observationalRecruiting: [] as TrialRecord[],
    observationalStudies: [] as TrialRecord[],
    expandedAccessStudies: [] as TrialRecord[],
    generalRegistries: [] as TrialRecord[],
    seenIds: new Set<string>(),
    seenAllIds: new Set<string>(),
    seenRegistry: new Set<string>(),
    phraseHits: 0,
    meshHits: 0,
    bothHits: 0,
    recallHits: 0,
    queryPhraseHit: false,
    queryMeshHit: false,
    queryRecallHit: false,
    excludedNonInterventional: 0,
  };

  let fullyScanned = true;
  for (const chunk of chunks) {
    const chunkQuery = buildTrialsQuery(chunk);
    if (!chunkQuery) continue;
    const pageResult = await fetchTrialQueryPages(
      chunkQuery,
      phraseTerms,
      meshTerms,
      recallTerms,
      state
    );
    if (!pageResult.fullyScanned) fullyScanned = false;
  }

  const matchedVia: TrialMatchVia[] = [];
  if (state.bothHits > 0) matchedVia.push("both");
  if (state.phraseHits > 0) matchedVia.push("phrase");
  if (state.meshHits > 0) matchedVia.push("mesh");
  if (state.recallHits > 0) matchedVia.push("recall-expansion");
  const queryStrategiesWithHits: ("mesh" | "phrase" | "recall-expansion")[] =
    [];
  if (state.queryPhraseHit) queryStrategiesWithHits.push("phrase");
  if (state.queryMeshHit) queryStrategiesWithHits.push("mesh");
  if (state.queryRecallHit) queryStrategiesWithHits.push("recall-expansion");

  return {
    total: state.matchedStudies.length,
    recruitingCount: state.recruiting.length,
    recruiting: state.recruiting.slice(0, 15),
    matchedStudies: state.matchedStudies,
    registeredStudiesTotal:
      state.matchedStudies.length +
      state.observationalStudies.length +
      state.expandedAccessStudies.length,
    observationalTotal: state.observationalStudies.length,
    observationalRecruitingCount: state.observationalRecruiting.length,
    observationalRecruiting: state.observationalRecruiting.slice(0, 15),
    observationalStudies: state.observationalStudies,
    expandedAccessTotal: state.expandedAccessStudies.length,
    expandedAccessStudies: state.expandedAccessStudies,
    excludedNonInterventional: state.excludedNonInterventional,
    generalRegistries: state.generalRegistries,
    query,
    fullyScanned,
    matchedVia,
    queryStrategiesWithHits,
    strategiesAttempted,
  };
}

export interface ParentCategoryTrialSignals {
  label: string;
  total: number;
  recruitingCount: number;
  recruiting: TrialRecord[];
  query: string;
  fullyScanned: boolean;
}

/**
 * Broader-category tier: fetch by parent label alone, then drop NCT IDs already
 * counted in the disease-specific result. Incomplete scans are returned as-is
 * (caller must not fail the disease on parent-tier truncation).
 */
export async function fetchParentCategoryTrials(
  label: string,
  excludeNctIds: Iterable<string>
): Promise<ParentCategoryTrialSignals> {
  const exclude = new Set(excludeNctIds);
  const signals = await fetchTrialSignals([label], [], []);
  const matched = signals.matchedStudies.filter(
    (study) => !exclude.has(study.nctId)
  );
  const recruiting = matched.filter((study) =>
    RECRUITING_STATUSES.has(study.status.toUpperCase())
  );
  return {
    label,
    total: matched.length,
    recruitingCount: recruiting.length,
    recruiting: recruiting.slice(0, 15),
    query: signals.query,
    fullyScanned: signals.fullyScanned,
  };
}
