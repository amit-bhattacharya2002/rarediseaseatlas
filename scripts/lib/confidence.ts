import type {
  Confidence,
  CredibleMetric,
  GenCCClassification,
} from "../../src/lib/types";

const STOPWORDS = new Set([
  "disease",
  "disorder",
  "syndrome",
  "deficiency",
  "type",
  "form",
  "with",
  "without",
  "and",
  "the",
  "of",
  "in",
  "a",
  "an",
]);

export function buildReverseIndex(
  diseases: { orphaCode: string; name: string; synonyms: string[] }[]
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const d of diseases) {
    const terms = [d.name, ...d.synonyms];
    for (const t of terms) {
      const key = t.trim().toLowerCase();
      if (!key) continue;
      const list = index.get(key) ?? [];
      if (!list.includes(d.orphaCode)) list.push(d.orphaCode);
      index.set(key, list);
    }
  }
  return index;
}

function isDistinctiveMultiWord(label: string): boolean {
  const words = label
    .toLowerCase()
    .split(/[\s\-/,]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return words.length >= 2 && label.length >= 12;
}

/** Ultra-rare prevalence classes from Orphanet. */
export function isUltraRarePrevalence(prevalenceClass: string | null): boolean {
  if (!prevalenceClass) return false;
  const p = prevalenceClass.replace(/\s+/g, " ").toLowerCase();
  return (
    p.includes("<1 / 1 000 000") ||
    p.includes("<1/1000000") ||
    p.includes("<1 / 1000000")
  );
}

export function computeConfidence(args: {
  preferredLabel: string;
  synonymsDropped: string[];
  reverseIndex: Map<string, string[]>;
  orphaCode: string;
  queryTerms: string[];
}): { confidence: Confidence; reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 2;

  if (isDistinctiveMultiWord(args.preferredLabel)) {
    reasons.push("Preferred label is multi-word and distinctive");
    score += 1;
  } else {
    reasons.push("Preferred label is short or not clearly distinctive");
    score -= 1;
  }

  if (args.synonymsDropped.length > 0) {
    reasons.push(
      `${args.synonymsDropped.length} synonym(s) dropped by stoplist (may under-count)`
    );
    score -= 1;
  } else {
    reasons.push("No synonyms dropped by stoplist");
  }

  let collisions = 0;
  for (const term of args.queryTerms) {
    const key = term.trim().toLowerCase();
    const owners = args.reverseIndex.get(key) ?? [];
    const others = owners.filter((c) => c !== args.orphaCode);
    if (others.length > 0) {
      collisions += 1;
      reasons.push(
        `"${term}" also appears on ORPHA:${others.slice(0, 3).join(", ORPHA:")}${
          others.length > 3 ? "…" : ""
        }`
      );
    }
  }
  if (collisions > 0) {
    score -= collisions >= 2 ? 2 : 1;
  } else {
    reasons.push("No label/synonym collisions with other diseases in this corpus");
  }

  let confidence: Confidence;
  if (score >= 3) confidence = "high";
  else if (score >= 1) confidence = "medium";
  else confidence = "low";

  return { confidence, reasons, score };
}

const STRONG_GENE = new Set<GenCCClassification>(["Definitive", "Strong"]);

/**
 * Post-hoc confidence adjustments using fetched signals.
 * publicationTotal / trialTotal may be null when the fetch failed.
 */
export function applySignalConfidenceRules(args: {
  confidence: Confidence;
  reasons: string[];
  publicationTotal: number | null;
  trialTotal: number | null;
  prevalenceClass: string | null;
  geneClassification: GenCCClassification;
  definition: string | null;
  mondoIds: string[];
}): {
  confidence: Confidence;
  reasons: string[];
  excludeFromNeglect: boolean;
} {
  let { confidence } = args;
  const reasons = [...args.reasons];
  let excludeFromNeglect = false;
  const pubs = args.publicationTotal;
  const trials = args.trialTotal;

  if (pubs === 0 && STRONG_GENE.has(args.geneClassification)) {
    confidence = "low";
    excludeFromNeglect = true;
    reasons.push(
      `Zero publications but GenCC ${args.geneClassification} — literature likely indexed under another name; excluded from neglect count`
    );
  }

  // Taxonomy scaffolding: no definition and no Mondo crosswalk
  if (!args.definition && args.mondoIds.length === 0) {
    if (confidence !== "low") {
      confidence = "low";
      reasons.push(
        "No Orphanet definition and no Mondo IDs — likely taxonomy scaffolding; confidence capped at low"
      );
    } else {
      reasons.push(
        "No Orphanet definition and no Mondo IDs — likely taxonomy scaffolding"
      );
    }
  }

  if (pubs != null && isUltraRarePrevalence(args.prevalenceClass)) {
    if (pubs >= 500) {
      confidence = "low";
      reasons.push(
        `Publication count (${pubs}) is implausibly high for prevalence class "${args.prevalenceClass}" — treat as possible over-matching, not a measure of research intensity`
      );
    } else if (pubs >= 200 && confidence === "high") {
      confidence = "medium";
      reasons.push(
        `Publication count (${pubs}) is high for prevalence class "${args.prevalenceClass}" — confidence capped at medium`
      );
    }
  } else if (
    pubs != null &&
    (!args.prevalenceClass || /unknown/i.test(args.prevalenceClass)) &&
    pubs >= 1000 &&
    confidence !== "low"
  ) {
    confidence = "low";
    reasons.push(
      `Publication count (${pubs}) is extremely high with unknown/missing prevalence — treat as possible over-matching, not proven research intensity`
    );
  }

  if (
    trials != null &&
    pubs != null &&
    trials > 10 &&
    pubs < 50 &&
    trials > pubs * 2
  ) {
    if (confidence === "high") confidence = "medium";
    if (trials > pubs * 5) confidence = "low";
    reasons.push(
      `Trial count (${trials}) far exceeds publication count (${pubs}) — trial matching may still be loose`
    );
  }

  return { confidence, reasons, excludeFromNeglect };
}

/**
 * Per-signal credibility.
 * - publications: name-collision / over-match (low confidence), neglect exclusions, pub fetch errors
 * - trials: only trial fetch errors or incomplete scan — publication flags say nothing about trials
 */
export function inCredibleSet(
  args: {
    confidence: Confidence;
    excludeFromNeglect: boolean;
    sourceErrors: { publications?: string; trials?: string } | null;
    trialsFullyScanned?: boolean;
  },
  metric: CredibleMetric
): boolean {
  if (metric === "publications") {
    if (args.excludeFromNeglect) return false;
    if (args.confidence === "low") return false;
    if (args.sourceErrors?.publications) return false;
    return true;
  }
  // trials
  if (args.sourceErrors?.trials) return false;
  if (args.trialsFullyScanned === false) return false;
  return true;
}

/**
 * Thin-attention row. Caller must already have established credibility
 * via inCredibleSet for both metrics — this only checks the zero signals.
 */
export function countsTowardNeglect(args: {
  last10YearsPubs: number | null;
  trialTotal: number | null;
}): boolean {
  return args.last10YearsPubs === 0 && args.trialTotal === 0;
}
