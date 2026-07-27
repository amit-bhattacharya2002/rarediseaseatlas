export type Confidence = "high" | "medium" | "low";

export type GenCCClassification =
  | "Definitive"
  | "Strong"
  | "Moderate"
  | "Limited"
  | "Disputed"
  | "Refuted"
  | "Animal Model Only"
  | "No Known Disease Relationship"
  | "None";

export type CredibleMetric = "publications" | "trials";

export type IndiaMatchVia = "direct" | "parent";

export type IndiaMappingConfidence = "direct" | "inferred" | "category";

export type QueryStatus = "ok" | "suspect" | "broken";

export type MatchStrategy =
  | "phrase"
  | "mesh"
  | "corrected-name"
  | "recall-expansion";

/** Slim client search document — avoids shipping full DiseaseRecord trees. */
export interface SearchIndexEntry {
  orphaCode: string;
  name: string;
  synonyms: string[];
  /** Precomputed 0–4 signal levels for the result glyph */
  publications: number;
  researchers: number;
  trials: number;
}

export interface DiseaseIdentifiers {
  mondo: string[];
  mesh: string[];
  umls: string[];
  omim: string[];
  ncit: string[];
}

export interface QueryHealth {
  status: QueryStatus;
  reasons: string[];
  strategiesAttempted: MatchStrategy[];
  strategiesWithHits: MatchStrategy[];
}

export interface ParentLiteratureProbe {
  mondoId: string;
  label: string;
  hits: number;
}

export interface AuthorRecord {
  name: string;
  count: number;
  affiliation: string | null;
  mostRecentYear: number | null;
  europePmcAuthorQuery: string;
}

export interface TrialRecord {
  nctId: string;
  title: string;
  status: string;
  url: string;
  /** ClinicalTrials.gov condition field, retained for relevance review. */
  conditions?: string[];
  /** INTERVENTIONAL, OBSERVATIONAL, EXPANDED_ACCESS, etc. */
  studyType?: string | null;
  /** Per-study strategy match (aggregate is also stored on trials.matchedVia). */
  matchedVia?: "mesh" | "phrase" | "both" | "recall-expansion";
  /** Dual-model relevance annotation — does not change trials.total. */
  relevance?: TrialRelevance;
}

export type RegistrySource =
  | "ictrp"
  | "ctis"
  | "isrctn"
  | "ctgov"
  | "ctri"
  | "jrct"
  | "anzctr"
  | "drks"
  | "chictr"
  | "euctr"
  | "other";

export type RelevanceVerdict =
  | true
  | false
  | "uncertain"
  | "relevant-to-parent-category";

export type RelevanceConsensus =
  | "relevant"
  | "parent-category"
  | "irrelevant"
  | "uncertain"
  | "skipped";

export interface TrialRelevanceModelVote {
  relevant: RelevanceVerdict;
  reason: string;
  model: string;
}

export interface TrialRelevance {
  consensus: RelevanceConsensus;
  reason: string;
  openai?: TrialRelevanceModelVote;
  anthropic?: TrialRelevanceModelVote;
  promptVersion: string;
  reviewedAt: string;
}

export interface RegistryTrialRecord {
  id: string;
  nctId: string | null;
  secondaryIds: string[];
  title: string;
  status: string | null;
  registry: RegistrySource;
  url: string;
  conditions: string[];
  studyType: string | null;
  relevance?: TrialRelevance;
}

export interface SecondaryRegistriesBlock {
  fetchedAt: string;
  queryTerms: string[];
  rawFetched: number;
  afterDedupe: number;
  alreadyOnCtgov: number;
  kept: RegistryTrialRecord[];
  parentCategory: RegistryTrialRecord[];
  uncertain: RegistryTrialRecord[];
  droppedCount: number;
  sourceErrors?: Partial<Record<RegistrySource, string>>;
}

export interface YearCount {
  year: number;
  count: number;
}

export interface GroupEntitlement {
  label: string;
  amountCeiling: string | null;
  mechanism: string;
  caveat: string;
  verifyUrl: string | null;
}

export interface DiseaseRecord {
  orphaCode: string;
  name: string;
  /** Additive, never overwrites `name`. Detected correction, or null. */
  nameCorrected: string | null;
  synonyms: string[];
  /** Mondo hasExactSynonym union (used in queries alongside Orphanet synonyms) */
  mondoSynonyms: string[];
  definition: string | null;
  /**
   * Machine-generated plain rewrite of `definition` only.
   * Null when no API key / insufficient source / generation refused.
   * Filled by scripts/plain-language.ts — not during ingest.
   */
  plainLanguageDefinition: string | null;
  prevalenceClass: string | null;
  mondoIds: string[];
  expertLink: string;
  disorderGroup: string | null;

  query: string;
  synonymsDropped: string[];
  identifiers: DiseaseIdentifiers;
  /** MeSH descriptor labels resolved from identifiers.mesh (used in queries) */
  meshLabels: string[];
  confidence: Confidence;
  confidenceReasons: string[];
  queryHealth: QueryHealth;
  /** Naming-artifact / GenCC contradiction — excluded from publication neglect metrics */
  excludeFromNeglect: boolean;
  /** Raw probe stored by ingest; derive turns it into excludeFromNeglect */
  parentLiteratureProbe: ParentLiteratureProbe | null;

  publications: {
    /** Deduplicated union of phrase + MeSH; null = fetch failed (not a measured zero) */
    total: number | null;
    phraseCount: number | null;
    meshCount: number | null;
    last10Years: number | null;
    byYear: YearCount[];
    europePmcUrl: string;
    meshQuery: string;
    papersSampledForAuthors: number;
  };
  researchers: {
    /** Distinct structured author names in the sampled papers; null if pubs fetch failed */
    distinctCount: number | null;
    top: AuthorRecord[];
  };
  trials: {
    /** Condition-specific INTERVENTIONAL studies; null = fetch failed. */
    total: number | null;
    recruitingCount: number | null;
    recruiting: TrialRecord[];
    /** Matched registered studies of any type, excluding pan-disease registries. */
    registeredStudiesTotal: number | null;
    /** Observational studies are actionable research, but not clinical trials. */
    observationalTotal: number | null;
    observationalRecruitingCount: number | null;
    observational: TrialRecord[];
    expandedAccessTotal: number | null;
    /** Pan-disease registries / natural-history umbrellas — not counted in total */
    generalRegistries: TrialRecord[];
    query: string;
    /** Genes, Mondo parents, qualifier-stripped aliases, shortest synonym, rare words */
    recallTerms?: string[];
    fullyScanned: boolean;
    /** Strategies that produced at least one hit */
    matchedVia: ("mesh" | "phrase" | "both" | "recall-expansion")[];
    /**
     * Broader Mondo name-parent tier (e.g. "Gaucher disease" for type 3).
     * Exclusive of NCT IDs already in the disease-specific count. Not counted
     * in `total` / headline aggregates — shown separately on disease pages.
     */
    parentCategory: {
      label: string;
      total: number | null;
      recruitingCount: number | null;
      recruiting: TrialRecord[];
      query: string;
      fullyScanned: boolean;
    } | null;
    /**
     * Multi-registry secondary net (ICTRP / CTIS / ISRCTN, …).
     * Never merged into `total` — CT.gov remains the headline denominator.
     */
    secondaryRegistries?: SecondaryRegistriesBlock | null;
  };
  /** ISO timestamp of the last ClinicalTrials.gov re-check for this disease. */
  lastTrialCheck?: string;
  geneDiseaseValidity: {
    classification: GenCCClassification;
    genes: string[];
  };

  /** Per-source fetch failures — record is kept; aggregates skip incomplete rows */
  sourceErrors: {
    publications?: string;
    trials?: string;
  } | null;

  indiaNprd: {
    listed: boolean;
    via: IndiaMatchVia | null;
    /** Ancestor Mondo / Orpha id when via === "parent" */
    matchedVia: string | null;
    /** Policy entry name when via === "parent" */
    matchedViaLabel: string | null;
    groups: Array<1 | 2 | 3>;
    entitlements: GroupEntitlement[];
  } | null;

  /** Percentile ranks 0–100 within the appropriate denominator (null if not in set) */
  publicationsPercentile: number | null;
  trialsPercentile: number | null;

  /**
   * Optional Monarch / Alliance enrichment (Mondo ID joins only).
   * Filled by `npm run enrich:monarch` — not required for ingest.
   */
  monarch?: {
    fetchedAt: string;
    phenotypeCount: number | null;
    phenotypeSample: string[];
    modelCount: number;
    models: Array<{
      id: string;
      label: string;
      taxonLabel: string | null;
    }>;
  } | null;

  /** Derived research-stage checklist — recomputed by derive. */
  trialReadiness?: TrialReadiness;

  ingestedAt: string;
}

export type ReadinessStageId =
  | "gene"
  | "literature"
  | "phenotype"
  | "animal-model"
  | "orphan-designation"
  | "interventional-trial";

export type ReadinessStageStatus =
  | "met"
  | "partial"
  | "absent"
  | "unknown"
  | "not-applicable";

export interface ReadinessStage {
  id: ReadinessStageId;
  status: ReadinessStageStatus;
  label: string;
  detail: string;
  evidenceUrl?: string | null;
}

export interface TrialReadiness {
  /** Plain one-liner for families / advocates. */
  summary: string;
  /** Stages that are met or partial (excludes unknown / n/a). */
  filledCount: number;
  /** Stages we attempt to score (excludes not-applicable). */
  scoredCount: number;
  stages: ReadinessStage[];
}

export interface SamplingProvenance {
  mode: "sample" | "limit" | "full";
  n: number | null;
  seed: number | null;
  excludedObsoleteOrNonRare: number;
}

export interface DistributionStats {
  median: number;
  q1: number;
  q3: number;
  shareZero: number;
  n: number;
}

export interface CorpusLevels {
  product1Total: number;
  byDisorderGroup: Record<string, number>;
  afterDroppingGroups: number;
  excludedObsoleteOrNonRarePreferredNames: number;
  atlasUsableEstimate: number;
  /** Disorder-level count — the figure behind “about 7,000 rare diseases”. */
  commonlyCitedDisorderLevel: number;
  reconciliationNote: string;
}

export interface DiseasesArtifact {
  generatedAt: string;
  /** ISO timestamp of the last successful full ingest publish. */
  lastFullIngest?: string;
  /** ISO timestamp of the last zero-trial nightly refresh. */
  lastRefresh?: string;
  /** @deprecated use sampling.n — retained for older readers */
  ingestLimit: number | null;
  sampling: SamplingProvenance;
  sourceVersions: {
    orphanetProduct1: string;
    orphanetPrevalence: string;
    /** GenCC data fingerprint (max submitted_run_date), not local fetch time */
    gencc: string;
    genccFetchedAt: string;
    mondo?: string;
    /** Monarch API host when enrich:monarch has been run */
    monarchApi?: string;
    monarchEnrichedAt?: string;
  };
  /** Orphanet product1 taxonomy breakdown — denominators for narrative counts. */
  corpusLevels?: CorpusLevels;
  diseases: DiseaseRecord[];
  aggregate: {
    totalDiseases: number;
    /** Credible for publication metrics (name-collision / pub fetch / neglect exclusions) */
    publicationsDenominator: number;
    /** Credible for trial metrics (trial fetch + full scan only) */
    trialsDenominator: number;
    /** Size of publications∩trials credible sets — denominator for noRecentPubsNoTrials */
    intersectionDenominator: number;
    noPublicationsLast10Years: number;
    /** No INTERVENTIONAL trial for the specific condition name (headline numerator). */
    noTrials: number;
    /**
     * No specific INTERVENTIONAL trial AND no parent-category INTERVENTIONAL
     * hits. Sensitivity comparison: counting broader-category registrations
     * as filling a zero would use this numerator instead of `noTrials`.
     */
    noTrialsParentInclusive: number;
    /** No matched registered study of any type (methodology comparison). */
    noRegisteredStudies: number;
    noRecentPubsNoTrials: number;
    incompleteSourceRows: number;
    /** Records where every strategy returned zero across both DBs — excluded from all denominators */
    brokenQueryRows: number;
    /** Defensibility: no trials AND last10Years >= median (name demonstrably matches literature) */
    noTrialsWithSubstantialLiterature: number;
    /** No trials AND no/low literature — likelier query artifacts */
    noTrialsWithNoLiterature: number;
  };
  distributions?: {
    publicationsLast10Years: DistributionStats;
    trials: DistributionStats;
  };
  /** Measured against a versioned benchmark; provenance is explicit below. */
  validation?: ValidationSummary;
  /** All additive label corrections detected this run (Part 1) */
  nameCorrections?: {
    orphaCode: string;
    original: string;
    corrected: string;
    type: string;
    detail: string;
    /** true = used in queries (missing-boundary); false = review candidate only */
    applied: boolean;
  }[];
}

export interface ValidationSummary {
  runAt: string;
  method: "automated-dual-model-consensus" | "legacy-human-review";
  benchmarkVersion: string;
  promptVersion?: string;
  models?: {
    openai: string;
    anthropic: string;
  };
  trialsRecall: number;
  trialsPrecision: number;
  /** Automated publication searches are diagnostics, not labelled accuracy. */
  publicationsWithinRange?: number | null;
  publicationQueryAgreement?: number | null;
  consensusCoverage: number;
  consensusCandidates: number;
  uncertainCandidates: number;
  count: number;
  byDifficulty: Record<
    string,
    {
      count: number;
      trialsRecall: number;
      trialsPrecision: number;
      consensusCoverage: number;
    }
  >;
}

export interface IndiaCentre {
  name: string;
  city: string;
  state: string;
  phone: string | null;
  department: string | null;
  referralRequired: boolean | null;
  notes: string | null;
  source: string;
}

export interface OfficialDiseaseCount {
  count: number;
  source: string;
  date: string;
  note?: string;
}

export interface IndiaNprdDisease {
  orphaCode: string | null;
  name: string;
  group: 1 | 2 | 3;
  source: string;
  mappingConfidence: IndiaMappingConfidence;
}

export interface IndiaNprdData {
  lastVerified: string;
  source: string;
  disclaimer: string;
  maintainerNote?: string;
  crowdfundingPortal: string;
  officialDiseaseCounts: OfficialDiseaseCount[];
  /** Claimed unique notified conditions; cross-group duplicates inflate entry count */
  officialDiseaseCountClaim: number;
  groupEntitlements: Record<string, GroupEntitlement>;
  centresOfExcellence: IndiaCentre[];
  centresNote?: string;
  diseases: IndiaNprdDisease[];
}
