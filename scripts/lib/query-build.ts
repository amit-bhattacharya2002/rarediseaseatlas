import { buildEuropePmcQuery, COMMON_WORDS } from "../stoplist";

/** Hard cap after articleVariants — over-long OR queries return HTTP 400 on CT.gov. */
export const MAX_PHRASE_TERMS = 40;

/**
 * Explicit phrase-term list: name(s) + stoplisted synonyms, with all name terms
 * always retained (preferred labels are never dropped by the stoplist). Shared
 * by ingest and the validation harness so both build identical queries.
 */
export function buildPhraseTerms(
  nameTerms: string[],
  synonyms: string[]
): { terms: string[]; dropped: { term: string; reason: string }[] } {
  const cleanedSynonyms = synonyms.filter((s) => !isOntologySpeak(s));
  const ontologyDropped = synonyms
    .filter((s) => isOntologySpeak(s))
    .map((term) => ({ term, reason: "Mondo ontology-speak synonym" }));

  const { kept, dropped } = buildEuropePmcQuery(nameTerms[0], [
    ...nameTerms.slice(1),
    ...cleanedSynonyms,
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  // Prefer canonical name terms first so the cap keeps the highest-value labels.
  for (const t of [...nameTerms, ...kept]) {
    for (const variant of articleVariants(t)) {
      const k = variant.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(variant.trim());
    }
  }
  const cappedDropped: { term: string; reason: string }[] = [];
  let terms = out;
  if (terms.length > MAX_PHRASE_TERMS) {
    for (const term of terms.slice(MAX_PHRASE_TERMS)) {
      cappedDropped.push({ term, reason: "term-cap after articleVariants" });
    }
    terms = terms.slice(0, MAX_PHRASE_TERMS);
  }
  return {
    terms,
    dropped: [...dropped, ...ontologyDropped, ...cappedDropped],
  };
}

/** Split terms into chunks whose OR'd quoted query stays under CT.gov URL limits. */
export function chunkTermsForTrials(
  terms: string[],
  // Encoded URLs expand spaces/punctuation; stay well under CT.gov's practical limit.
  maxQueryChars = 900
): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const raw of terms) {
    const t = raw.trim().replace(/"/g, "");
    if (!t) continue;
    const piece = `"${t}"`;
    const add = current.length === 0 ? piece.length : piece.length + 4; // " OR "
    if (current.length > 0 && len + add > maxQueryChars) {
      chunks.push(current);
      current = [t];
      len = piece.length;
    } else {
      current.push(t);
      len += add;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [[]];
}

export function phraseQueryFromTerms(terms: string[]): string {
  return terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}

export function normalizeTerm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeTerm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function buildCorpusTokenFrequency(
  diseases: { name: string; synonyms: string[] }[]
): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const disease of diseases) {
    for (const token of normalizeTerm(
      [disease.name, ...disease.synonyms].join(" ")
    ).split(" ")) {
      if (!token) continue;
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }
  return frequencies;
}

/**
 * Article variants for labels containing "of [the] …".
 * "adenocarcinoma of the gallbladder" ↔ "adenocarcinoma of gallbladder".
 */
export function articleVariants(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const variants = [trimmed];
  if (/\bof the\b/i.test(trimmed)) {
    variants.push(trimmed.replace(/\bof the\b/gi, "of"));
  } else if (/\bof [a-z]/i.test(trimmed)) {
    variants.push(trimmed.replace(/\bof ([a-z])/gi, "of the $1"));
  }
  return uniqueTerms(variants);
}

/** Mondo / ontology scaffolding labels that inflate phrase queries. */
export function isOntologySpeak(term: string): boolean {
  return (
    /caused disease or disorder/i.test(term) ||
    /disease or disorder$/i.test(term) ||
    /caused by qualitative or quantitative defects/i.test(term) ||
    /disease caused by mutation in\b/i.test(term) ||
    /^inborn .+\bactivity\b/i.test(term) ||
    /rare inborn error of/i.test(term) ||
    /inborn error of .+ activity/i.test(term)
  );
}

/**
 * Drop leading clinical qualifiers. Useful for the benchmark's broad candidate
 * list (over-fetch for adjudication). Must NOT enter production recall — it
 * collapses distinct entities onto parent diseases (e.g. congenital muscular
 * dystrophy → muscular dystrophy).
 */
export function qualifierStrippedAliases(name: string): string[] {
  const m = name.match(
    /^(proximal|distal|severe|classic|typical|hereditary|congenital|infantile|juvenile|adult|autosomal (dominant|recessive)|x-linked)\s+(.+)$/i
  );
  if (!m?.[3]) return [];
  const stripped = m[3].trim();
  return stripped.length >= 5 ? [stripped] : [];
}

/** Content tokens used to keep parents disease-specific (not organ-system umbrellas). */
export function contentTokens(value: string): string[] {
  return normalizeTerm(value)
    .split(" ")
    .filter((token) => token.length >= 5 && !COMMON_WORDS.has(token));
}

/**
 * Ultra-generic Mondo ancestors / disease-class umbrellas that match huge
 * CT.gov populations and must never enter production recall queries.
 */
const GENERIC_PARENT_LABEL =
  /^(disease|disorder|syndrome|rare disease|human disease|genetic disease|hereditary disease|inherited disease|nervous system (disease|disorder)|central nervous system (disease|disorder)|peripheral nervous system (disease|disorder)|cardiovascular (disease|disorder)|heart (disease|disorder)|cardiac (disease|disorder|rhythm disease)|musculoskeletal (disease|disorder)|metabolic (disease|disorder)|immune system (disease|disorder)|integumentary system (disease|disorder)|respiratory (disease|disorder)|digestive system (disease|disorder)|urinary system (disease|disorder)|endocrine system (disease|disorder)|hematologic (disease|disorder)|neoplastic disease|cancer|tumor|developmental disorder|multiple congenital anomalies.*|.*intellectual disability|autosomal dominant disease|autosomal recessive disease|muscular dystrophy|combined immunodeficiency|severe combined immunodeficiency|polycystic kidney disease|movement disorder|cardiac abnormality)$/i;

/**
 * Disease heads that explode CT.gov as lone recall tokens.
 * Only entries reachable after the ≥12-char lone-token floor are listed;
 * shorter heads (cataract, leukemia, anemia, …) are already rejected by length.
 */
const HIGH_VOLUME_DISEASE_TOKENS = new Set([
  "hypertension", // 12
  "adenocarcinoma", // 14
  "immunodeficiency", // 16
]);

/**
 * Phenotype / anatomy tokens blocked as lone recall terms (≥12 chars only;
 * shorter phenotypes are already rejected by the length floor).
 */
const PHENOTYPE_TOKENS = new Set([
  "arachnodactyly", // 14
  "hypertelorism", // 13
  "kyphoscoliosis", // 14
  "microcephalic", // 13
  "ossification", // 12
  "demyelinating", // 13
  "hypomagnesemia", // 14
]);

/** Short organ/system tokens — block "<organ> disease|disorder" umbrellas. */
const ORGAN_TOKENS = new Set([
  "heart",
  "liver",
  "kidney",
  "brain",
  "bone",
  "skin",
  "lung",
  "blood",
  "nerve",
  "muscle",
  "renal",
  "hepatic",
  "cardiac",
  "ocular",
  "spinal",
  "colon",
  "breast",
]);

/** Minimum character length for a non-gene multi-word recall phrase. */
const MIN_MULTIWORD_RECALL_LENGTH = 20;

function isBlockedToken(token: string): boolean {
  return (
    HIGH_VOLUME_DISEASE_TOKENS.has(token) ||
    PHENOTYPE_TOKENS.has(token) ||
    ORGAN_TOKENS.has(token) ||
    COMMON_WORDS.has(token)
  );
}

function isGenericParentLabel(label: string): boolean {
  const normalized = normalizeTerm(label);
  if (!normalized || normalized.length < 5) return true;
  if (GENERIC_PARENT_LABEL.test(label.trim())) return true;
  if (GENERIC_PARENT_LABEL.test(normalized)) return true;
  if (/multiple congenital anomalies/i.test(label)) return true;
  if (/intellectual disability/i.test(label) && contentTokens(label).length <= 3) {
    return true;
  }
  const tokens = contentTokens(label);
  if (tokens.length === 0) return true;
  if (
    tokens.length === 1 &&
    /\b(disease|disorder|syndrome|condition)$/i.test(label)
  ) {
    // "heart disorder" — generic organ umbrella.
    // "Marfan syndrome" / "Fabry disease" — eponymous, not generic.
    const token = tokens[0];
    if (token.length < 5 || isBlockedToken(token)) return true;
    return false;
  }
  return false;
}

/**
 * Subtype → parent name collapse: "Gaucher disease type 3" contains
 * "Gaucher disease". Those parents must not enter production recall — they
 * reintroduce the qualifier-stripping failure (child query matches every
 * parent-disease trial). Same-entity synonyms (exact normalize match) are OK.
 */
export function isNameParentCollapse(
  diseaseName: string,
  candidate: string
): boolean {
  const diseaseNorm = normalizeTerm(diseaseName);
  const candidateNorm = normalizeTerm(candidate);
  if (!candidateNorm || candidateNorm.length < 5) return false;
  if (diseaseNorm === candidateNorm) return false;
  // Token-boundary containment — not raw substring, or "syndactyly" collapses
  // onto "cephalopolysyndactyly".
  return ` ${diseaseNorm} `.includes(` ${candidateNorm} `);
}

function parentSharesDiseaseSignal(diseaseName: string, parentLabel: string): boolean {
  // Never treat a Mondo name-parent / subtype core as a shared-signal hit.
  if (isNameParentCollapse(diseaseName, parentLabel)) return false;
  const diseaseTokens = new Set(contentTokens(diseaseName));
  if (diseaseTokens.size === 0) return false;
  return contentTokens(parentLabel).some((token) => diseaseTokens.has(token));
}

/**
 * Max gene symbols allowed in the specific-tier trial recall expansion.
 * Uncapped gene lists (and common oncogenes) flood CT.gov; papers may still
 * use more genes via the separate Europe PMC path later.
 */
export const MAX_RECALL_GENES = 3;

/**
 * Gene symbols that alone match huge interventional trial populations on
 * ClinicalTrials.gov. Kept out of specific-tier recall; disease-name phrases
 * and the parent-category tier still apply. GenCC continues to list them on
 * the disease record for biology UI.
 *
 * Must stay aligned with HIGH_FREQUENCY_ONCOGENES in scripts/audit-artifact.ts.
 */
export const HIGH_FREQUENCY_ONCOGENES = new Set([
  "KRAS",
  "NRAS",
  "HRAS",
  "BRAF",
  "TP53",
  "EGFR",
  "PIK3CA",
  "ALK",
  "MYC",
  "PTEN",
  "RB1",
  "BRCA1",
  "BRCA2",
  "KIT",
  "MET",
  "RET",
  "ROS1",
  "IDH1",
  "IDH2",
  "FLT3",
  "JAK2",
  "ABL1",
  "BCR",
  "NF1",
  "NF2",
  "VHL",
  "APC",
  "SMAD4",
  "CDKN2A",
  "ERBB2",
  "AKT1",
  "CTNNB1",
  "NOTCH1",
  "FGFR1",
  "FGFR2",
  "FGFR3",
  "FGFR4",
  "PDGFRA",
  "SF3B1",
  "TET2",
  "DNMT3A",
  "ASXL1",
  "RUNX1",
  "WT1",
  "NPM1",
  "CEBPA",
  "STK11",
  "MLH1",
  "MSH2",
  "ATM",
  "CDH1",
  "SDHB",
  "TSC1",
  "TSC2",
]);

/** Stable, capped gene list for trial recall / incomplete-scan retries. */
export function capRecallGenes(genes: string[]): string[] {
  return uniqueTerms(
    genes
      .map((g) => g.trim())
      .filter(
        (g) =>
          g.length >= 2 && !HIGH_FREQUENCY_ONCOGENES.has(g.toUpperCase())
      )
  ).slice(0, MAX_RECALL_GENES);
}

/**
 * Recall terms allowed into production CT.gov queries.
 * Capped non-oncogene genes pass. Non-gene terms need real content-token
 * specificity — including eponymous "<Name> disease|syndrome" forms.
 */
export function isSafeRecallTerm(term: string, genes: string[]): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;
  if (HIGH_FREQUENCY_ONCOGENES.has(trimmed.toUpperCase())) return false;
  const geneSet = new Set(genes.map((g) => g.toUpperCase()));
  if (geneSet.has(trimmed.toUpperCase())) return true;
  if (isOntologySpeak(trimmed) || isGenericParentLabel(trimmed)) return false;

  const tokens = contentTokens(trimmed);
  const normTokens = normalizeTerm(trimmed).split(" ").filter(Boolean);

  // Multi-word with ≥2 content tokens (not "of"/"the" padding).
  if (tokens.length >= 2) {
    if (trimmed.length < MIN_MULTIWORD_RECALL_LENGTH) return false;
    return true;
  }

  // Eponymous "<Name> disease|syndrome": one content token + one common trailing word.
  if (tokens.length === 1 && normTokens.length === 2) {
    const token = tokens[0];
    return token.length >= 5 && !isBlockedToken(token);
  }

  // Lone tokens: only long disease-like names — never disease heads or phenotypes.
  if (normTokens.length !== 1) return false;
  const token = normTokens[0];
  if (token.length < 12) return false;
  if (isBlockedToken(token)) return false;
  return true;
}

/**
 * Production recall expansions for the *specific-tier* trial query: safe
 * shortest synonym (+ manual aliases). Genes are intentionally omitted —
 * gene symbols contaminate CT.gov (oncology/umbrella hits). Use
 * `capRecallGenes` only for incomplete-scan retries.
 *
 * Mondo parent labels are NOT included here — they belong only in the
 * parent-category tier (`parentCategoryLabelForTrials`).
 *
 * `parentLabels` / `genes` accepted for call-site compatibility; genes ignored.
 */
export function buildTrialRecallExpansionTerms(args: {
  name: string;
  synonyms: string[];
  mondoSynonyms: string[];
  parentLabels?: string[];
  genes?: string[];
  manualAliases?: string[];
}): string[] {
  const allSynonyms = [...args.synonyms, ...args.mondoSynonyms]
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length >= 5 &&
        value.length <= 100 &&
        !isOntologySpeak(value) &&
        !isGenericParentLabel(value) &&
        !isNameParentCollapse(args.name, value)
    )
    .sort((a, b) => a.length - b.length);
  const shortestSynonym = allSynonyms[0] ?? "";

  const candidates = uniqueTerms([
    ...(args.manualAliases ?? []).filter(
      (alias) => !isNameParentCollapse(args.name, alias)
    ),
    shortestSynonym,
  ]);

  return candidates.filter((term) => isSafeRecallTerm(term, []));
}

/**
 * @deprecated Prefer `buildTrialRecallExpansionTerms` (no genes in specific tier).
 * Kept as an alias so older call sites compile during the migration.
 */
export function buildRecallExpansionTerms(args: {
  name: string;
  synonyms: string[];
  mondoSynonyms: string[];
  parentLabels: string[];
  genes: string[];
  manualAliases?: string[];
}): string[] {
  return buildTrialRecallExpansionTerms(args);
}

/**
 * Infer HGNC-like symbols from long Orphanet labels when GenCC is empty
 * (e.g. "ZMYND11-related … syndrome").
 */
export function inferGeneSymbolsFromName(name: string): string[] {
  const out: string[] = [];
  const related = name.match(
    /\b([A-Z][A-Z0-9]{1,14}(?:-[A-Z0-9]{1,8})?)-related\b/
  );
  if (related?.[1]) out.push(related[1]);
  const leading = name.match(
    /^([A-Z][A-Z0-9]{1,14}(?:-[A-Z0-9]{1,8})?)(?:\s|,|:|\/)/
  );
  if (leading?.[1] && !/^(ORPHA|OMIM|MESH|MONDO)$/i.test(leading[1])) {
    out.push(leading[1]);
  }
  return uniqueTerms(out).filter(
    (g) => !HIGH_FREQUENCY_ONCOGENES.has(g.toUpperCase())
  );
}

/**
 * Europe PMC expansions: capped GenCC genes (plus name-inferred symbols) and
 * generated `<GENE> syndrome` / `<GENE>-related` patterns. Mondo parents and
 * bare OMIM IDs are never included.
 */
export function buildPublicationExpansionTerms(args: {
  name: string;
  synonyms?: string[];
  mondoSynonyms?: string[];
  genes: string[];
}): string[] {
  const genes = capRecallGenes([
    ...args.genes,
    ...inferGeneSymbolsFromName(args.name),
  ]);
  const patterns: string[] = [];
  for (const g of genes) {
    // Bare 2–3 letter symbols (e.g. GLA) over-match in Europe PMC; keep patterns.
    if (g.length >= 4) patterns.push(g);
    patterns.push(`${g} syndrome`);
    patterns.push(`${g}-related`);
  }
  return uniqueTerms(patterns);
}

/**
 * Parent labels usable as recall terms.
 * Keeps only ancestors that share a content token with the disease name and
 * are not organ-system / ontology scaffolding.
 */
export function parentLabelsForRecall(
  mondoIds: string[],
  ancestorsOf: (id: string, maxDepth?: number) => string[],
  labelOf: (id: string) => string | null,
  diseaseName: string,
  maxParents = 3
): string[] {
  return uniqueTerms(
    mondoIds.flatMap((id) =>
      ancestorsOf(id, 2)
        .map((ancestor) => labelOf(ancestor))
        .filter((label): label is string => Boolean(label))
    )
  )
    .filter(
      (label) =>
        !isGenericParentLabel(label) &&
        parentSharesDiseaseSignal(diseaseName, label)
    )
    .slice(0, maxParents);
}

/**
 * Singular broader category for the parent-trial tier.
 * Prefers the longest non-generic Mondo ancestor that is a name-parent of the
 * disease (subtype → parent). Null when none — no second-tier fetch.
 */
export function parentCategoryLabelForTrials(
  mondoIds: string[],
  ancestorsOf: (id: string, maxDepth?: number) => string[],
  labelOf: (id: string) => string | null,
  diseaseName: string
): string | null {
  const candidates = uniqueTerms(
    mondoIds.flatMap((id) =>
      ancestorsOf(id, 2)
        .map((ancestor) => labelOf(ancestor))
        .filter((label): label is string => Boolean(label))
    )
  ).filter(
    (label) =>
      !isGenericParentLabel(label) &&
      !isOntologySpeak(label) &&
      isNameParentCollapse(diseaseName, label)
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Recall terms that are not already in the production phrase list.
 * Used so strategy accounting can distinguish recall-expansion hits.
 */
export function novelRecallTerms(
  phraseTerms: string[],
  recallTerms: string[]
): string[] {
  return recallTerms.filter(
    (term) =>
      !phraseTerms.some(
        (phrase) => normalizeTerm(phrase) === normalizeTerm(term)
      )
  );
}
