/**
 * Synonym stoplist for Europe PMC / ClinicalTrials.gov query construction.
 *
 * Drops terms that are dangerously generic and would inflate hit counts.
 * Rules (applied in order):
 *  1. Anything under 5 characters
 *  2. Bare acronyms under 4 characters (all-caps / alphanumeric short codes)
 *  3. Single common English words
 *  4. Hyphenated/spaced Greek-prefix + single letter generics (Poly-X, Tetra X, …)
 *
 * Prefer extending rules rather than hard-coding disease-specific drops.
 */

export const COMMON_WORDS = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "in",
    "on",
    "to",
    "for",
    "with",
    "without",
    "from",
    "by",
    "type",
    "form",
    "disease",
    "disorder",
    "syndrome",
    "condition",
    "anomaly",
    "deficiency",
    "failure",
    "defect",
    "defects",
    "malformation",
    "malformations",
    "cancer",
    "tumor",
    "tumour",
    "carcinoma",
    "leukemia",
    "leukaemia",
    "lymphoma",
    "infection",
    "infections",
    "virus",
    "viral",
    "bacterial",
    "chronic",
    "acute",
    "severe",
    "mild",
    "familial",
    "hereditary",
    "congenital",
    "infantile",
    "juvenile",
    "adult",
    "neonatal",
    "primary",
    "secondary",
    "isolated",
    "classic",
    "classical",
    "atypical",
    "progressive",
    "benign",
    "malignant",
    "rare",
    "unknown",
    "unspecified",
    "other",
    "nos",
    "spectrum",
    "variant",
    "variants",
    "associated",
    "related",
    "like",
    "due",
  ].map((w) => w.toLowerCase())
);

export interface StoplistDecision {
  keep: string[];
  dropped: { term: string; reason: string }[];
}

function isBareAcronym(term: string): boolean {
  return /^[A-Z0-9][A-Z0-9\-./]*$/.test(term) && !/\s/.test(term);
}

/**
 * Poly-X, Tetra X, Penta-X, Tri-X, etc. — ambiguous across chemistry,
 * materials science, and karyotype shorthand.
 */
export function isHyphenatedGeneric(term: string): boolean {
  const t = term.trim();
  // Greek/Latin numeric prefix + optional separator + single letter (X/Y/A…)
  if (
    /^(mono|di|tri|tetra|penta|hexa|hepta|octa|nona|deca|poly)[\s\-]?[A-Za-z]$/i.test(
      t
    )
  ) {
    return true;
  }
  // Bare "Poly X" style already covered; also "X poly" unlikely
  // Short "N-X" / "X,Y" karyotype fragments without syndrome context
  if (/^[A-Za-z][\s\-][A-Za-z]$/.test(t)) return true;
  return false;
}

export function filterSynonyms(terms: string[]): StoplistDecision {
  const keep: string[] = [];
  const dropped: { term: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (term.length < 5) {
      dropped.push({ term, reason: "under 5 characters" });
      continue;
    }

    if (isBareAcronym(term) && term.replace(/[^A-Za-z0-9]/g, "").length < 4) {
      dropped.push({ term, reason: "bare acronym under 4 characters" });
      continue;
    }

    if (!/\s/.test(term) && COMMON_WORDS.has(term.toLowerCase())) {
      dropped.push({ term, reason: "single common English word" });
      continue;
    }

    if (isHyphenatedGeneric(term)) {
      dropped.push({
        term,
        reason: "hyphenated/spaced numeric-prefix + single letter (ambiguous)",
      });
      continue;
    }

    keep.push(term);
  }

  return { keep, dropped };
}

/**
 * Build an OR'd quoted-phrase query from preferred label + synonyms.
 */
export function buildEuropePmcQuery(
  preferredLabel: string,
  synonyms: string[]
): { query: string; kept: string[]; dropped: { term: string; reason: string }[] } {
  const all = [preferredLabel, ...synonyms];
  const { keep, dropped } = filterSynonyms(all);

  const preferred = preferredLabel.trim();
  const preferredDropped = dropped.find(
    (d) => d.term.toLowerCase() === preferred.toLowerCase()
  );

  // Always retain the preferred label even if stoplist would drop it —
  // but keep the drop reason logged so confidence can reflect the risk.
  if (
    preferred &&
    !keep.some((k) => k.toLowerCase() === preferred.toLowerCase())
  ) {
    keep.unshift(preferred);
    if (!preferredDropped) {
      // Label was filtered by an earlier pass into keep already, or empty filter
    }
  }

  const finalKept: string[] = [];
  const seen = new Set<string>();
  for (const t of keep) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    finalKept.push(t);
  }

  const query = finalKept.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
  return { query, kept: finalKept, dropped };
}
