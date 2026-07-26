/**
 * Additive label normalisation (Part 1).
 *
 * NEVER overwrites source data — produces `nameCorrected` alongside `name`,
 * logs every correction, and both are used when querying.
 *
 * Two detectors, both cross-checked against the corpus token index:
 *  - Missing word boundary (APPLIED): a pure-alpha token that is NOT itself a
 *    corpus word (freq 0) but splits into two frequent corpus tokens
 *    (e.g. "cornealdystrophy" → "corneal dystrophy"). Safe: the glued form
 *    cannot be a real word, so the split is unambiguous.
 *  - Misspelling (FLAGGED, NOT APPLIED): a rare token with a much-more-frequent
 *    Levenshtein neighbour. In a medical vocabulary edit-distance cannot tell a
 *    typo from a legitimately different term — measured false positives include
 *    "Ebstein anomaly"→"epstein", "Rheumatic fever"→"rheumatoid",
 *    "Hydrolethalus"→"hydrocephalus". Silently querying such a guess would
 *    violate "never alter source data", so these are surfaced as review
 *    candidates (logged + in the run report) and are NOT used in queries.
 */

const FREQ_MIN = 8; // "frequent" corpus token threshold
const MIN_TOKEN_LEN = 6; // only meaningful words, avoids acronym noise
const RARE_MAX = 2; // a misspelling may recur across a name + its synonym
const NEIGHBOUR_RATIO = 4; // neighbour must be this many× more frequent

export interface NameCorrection {
  orphaCode: string;
  original: string;
  corrected: string;
  /** "missing-boundary" is applied to queries; "misspelling-candidate" is flagged only. */
  type: "missing-boundary" | "misspelling-candidate";
  detail: string;
  applied: boolean;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 0);
}

export interface CorpusTokenIndex {
  freq: Map<string, number>;
  frequent: Set<string>;
  frequentByLen: Map<number, string[]>;
}

export function buildTokenIndex(
  entries: { name: string; synonyms: string[] }[]
): CorpusTokenIndex {
  const freq = new Map<string, number>();
  for (const e of entries) {
    for (const t of tokenize([e.name, ...e.synonyms].join(" "))) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  const frequent = new Set<string>();
  const frequentByLen = new Map<number, string[]>();
  for (const [t, c] of freq) {
    if (c >= FREQ_MIN && t.length >= 3) {
      frequent.add(t);
      const list = frequentByLen.get(t.length) ?? [];
      list.push(t);
      frequentByLen.set(t.length, list);
    }
  }
  return { freq, frequent, frequentByLen };
}

function levenshtein(a: string, b: string, cap: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > cap) return cap + 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function trySplit(
  token: string,
  idx: CorpusTokenIndex
): { left: string; right: string } | null {
  for (let i = 3; i <= token.length - 3; i++) {
    const left = token.slice(0, i);
    const right = token.slice(i);
    if (idx.frequent.has(left) && idx.frequent.has(right)) {
      return { left, right };
    }
  }
  return null;
}

function findMisspelling(
  token: string,
  idx: CorpusTokenIndex,
  rareFreq: number
): string | null {
  const cap = token.length >= 9 ? 2 : 1;
  const minNeighbour = Math.max(FREQ_MIN, rareFreq * NEIGHBOUR_RATIO);
  let best: string | null = null;
  let bestDist = cap + 1;
  let bestFreq = 0;
  for (let len = token.length - cap; len <= token.length + cap; len++) {
    for (const cand of idx.frequentByLen.get(len) ?? []) {
      if (cand === token) continue;
      if (cand[0] !== token[0]) continue; // first-char prune
      const f = idx.freq.get(cand) ?? 0;
      if (f < minNeighbour) continue;
      const d = levenshtein(token, cand, cap);
      if (d >= 1 && d <= cap) {
        if (d < bestDist || (d === bestDist && f > bestFreq)) {
          best = cand;
          bestDist = d;
          bestFreq = f;
        }
      }
    }
  }
  return best;
}

/**
 * Detect corrections in a name. Returns the corrected string (or null if none)
 * plus structured change records. Only the preferred label is corrected;
 * synonyms provide corpus context.
 */
export function correctName(
  orphaCode: string,
  name: string,
  idx: CorpusTokenIndex
): {
  corrected: string | null;
  changes: NameCorrection[];
  candidates: NameCorrection[];
} {
  const changes: NameCorrection[] = [];
  const candidates: NameCorrection[] = [];
  const tokens = name.split(/(\s+)/); // keep whitespace for reconstruction
  let mutated = false;
  const rebuilt = tokens.map((tok) => {
    // Only pure-alphabetic tokens are candidates. Hyphens, slashes, digits, and
    // apostrophes mark legitimately-separated compounds ("impairment-ocular",
    // "X-linked") — never treat those as a missing word boundary.
    if (!/^[a-z]+$/i.test(tok)) return tok;
    const bare = tok.toLowerCase();
    if (bare.length < MIN_TOKEN_LEN) return tok;
    const f = idx.freq.get(bare) ?? 0;

    // 1) missing word boundary — only for tokens that are NOT real corpus words
    if (f === 0) {
      const split = trySplit(bare, idx);
      if (split) {
        mutated = true;
        changes.push({
          orphaCode,
          original: name,
          corrected: `${split.left} ${split.right}`,
          type: "missing-boundary",
          detail: `"${bare}" → "${split.left} ${split.right}" (both frequent corpus tokens)`,
          applied: true,
        });
        return `${split.left} ${split.right}`;
      }
    }

    // 2) misspelling — FLAG ONLY (edit-distance is unsafe in medical vocab).
    if (f >= 1 && f <= RARE_MAX) {
      const fix = findMisspelling(bare, idx, f);
      if (fix) {
        candidates.push({
          orphaCode,
          original: name,
          corrected: name.replace(new RegExp(`\\b${bare}\\b`, "i"), fix),
          type: "misspelling-candidate",
          detail: `"${bare}" resembles frequent token "${fix}" (freq ${idx.freq.get(fix)}) — flagged for human review, NOT applied to queries`,
          applied: false,
        });
      }
    }
    return tok;
  });

  return {
    corrected: mutated ? rebuilt.join("") : null,
    changes,
    candidates,
  };
}
