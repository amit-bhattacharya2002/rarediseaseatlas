import type { RegistrySource, RegistryTrialRecord } from "../../src/lib/types";

const NCT_RE = /\bNCT\d{8}\b/i;
const ISRCTN_RE = /\bISRCTN\d{8}\b/i;
const EUCT_RE = /\b\d{4}-\d{6}-\d{2}(?:-\d{2})?\b/;
const EUDRACT_RE = /\b\d{4}-\d{6}-\d{2}\b/;
const CTRI_RE = /\bCTRI\/\d{4}\/\d{2}\/\d{6}\b/i;
const DRKS_RE = /\bDRKS\d{8}\b/i;
const JRCT_RE = /\bjRCT\w+\d+\b/i;
const CHICTR_RE = /\bChiCTR(?:-[A-Z]+)?-\d+\b/i;
const ANZCTR_RE = /\bACTRN\d{14}\b/i;

export function canonicalizeId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function extractNctId(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (!v) continue;
    const m = v.match(NCT_RE);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

export function collectSecondaryIds(
  ...values: Array<string | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    for (const re of [
      NCT_RE,
      ISRCTN_RE,
      EUCT_RE,
      EUDRACT_RE,
      CTRI_RE,
      DRKS_RE,
      JRCT_RE,
      CHICTR_RE,
      ANZCTR_RE,
    ]) {
      const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
      const global = new RegExp(re.source, flags);
      for (const m of v.matchAll(global)) {
        out.add(canonicalizeId(m[0]));
      }
    }
  }
  return [...out];
}

export function inferRegistrySource(id: string): RegistrySource {
  const c = canonicalizeId(id);
  if (c.startsWith("NCT")) return "ctgov";
  if (c.startsWith("ISRCTN")) return "isrctn";
  if (c.startsWith("CTRI/")) return "ctri";
  if (c.startsWith("DRKS")) return "drks";
  if (c.startsWith("JRCT")) return "jrct";
  if (c.startsWith("CHICTR")) return "chictr";
  if (c.startsWith("ACTRN")) return "anzctr";
  if (/^\d{4}-\d{6}-\d{2}/.test(c)) return "euctr";
  return "other";
}

export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 12)
    .join(" ");
}

export function registryRecordKeys(r: RegistryTrialRecord): string[] {
  const keys = new Set<string>();
  keys.add(`id:${canonicalizeId(r.id)}`);
  if (r.nctId) keys.add(`nct:${canonicalizeId(r.nctId)}`);
  for (const s of r.secondaryIds) keys.add(`sid:${canonicalizeId(s)}`);
  const fp = titleFingerprint(r.title);
  if (fp.length >= 24) keys.add(`title:${fp}`);
  return [...keys];
}

/**
 * Dedupe registry candidates. Prefer records that already carry an NCT when
 * merging; otherwise keep the first-seen richer record.
 */
export function dedupeRegistryTrials(
  records: RegistryTrialRecord[]
): RegistryTrialRecord[] {
  const byKey = new Map<string, RegistryTrialRecord>();
  const clusters: RegistryTrialRecord[] = [];

  const findCluster = (r: RegistryTrialRecord): RegistryTrialRecord | null => {
    for (const key of registryRecordKeys(r)) {
      const hit = byKey.get(key);
      if (hit) return hit;
    }
    return null;
  };

  for (const r of records) {
    const existing = findCluster(r);
    if (!existing) {
      clusters.push(r);
      for (const key of registryRecordKeys(r)) byKey.set(key, r);
      continue;
    }
    // Merge IDs into the surviving record.
    const mergedIds = new Set([
      ...existing.secondaryIds,
      ...r.secondaryIds,
      ...(r.nctId ? [r.nctId] : []),
      ...(existing.nctId ? [existing.nctId] : []),
    ]);
    existing.secondaryIds = [...mergedIds].filter(
      (id) => id !== canonicalizeId(existing.id) && id !== existing.nctId
    );
    if (!existing.nctId && r.nctId) existing.nctId = r.nctId;
    if ((!existing.conditions || existing.conditions.length === 0) && r.conditions.length) {
      existing.conditions = r.conditions;
    }
    if (!existing.studyType && r.studyType) existing.studyType = r.studyType;
    if (!existing.status && r.status) existing.status = r.status;
    for (const key of registryRecordKeys(existing)) byKey.set(key, existing);
  }

  return clusters;
}

export function splitAlreadyOnCtgov(
  records: RegistryTrialRecord[],
  excludeNctIds: Set<string>
): { novel: RegistryTrialRecord[]; alreadyOnCtgov: RegistryTrialRecord[] } {
  const novel: RegistryTrialRecord[] = [];
  const alreadyOnCtgov: RegistryTrialRecord[] = [];
  const exclude = new Set([...excludeNctIds].map(canonicalizeId));
  for (const r of records) {
    const nct = r.nctId ? canonicalizeId(r.nctId) : null;
    const hit =
      (nct && exclude.has(nct)) ||
      r.secondaryIds.some((id) => exclude.has(canonicalizeId(id)));
    if (hit) alreadyOnCtgov.push(r);
    else novel.push(r);
  }
  return { novel, alreadyOnCtgov };
}
