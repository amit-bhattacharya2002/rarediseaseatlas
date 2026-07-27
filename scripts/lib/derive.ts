/**
 * Network-free derivation: queryHealth, confidence, excludeFromNeglect,
 * aggregates, distributions, percentiles. Runs over raw records written by
 * ingest. `npm run derive` re-runs this against the existing artifact.
 */

import { buildEuropePmcQuery } from "../stoplist";
import {
  applySignalConfidenceRules,
  buildReverseIndex,
  computeConfidence,
  countsTowardNeglect,
  inCredibleSet,
} from "./confidence";
import { loadCorpusLevelsFromCache } from "./corpus-levels";
import { applyPercentiles } from "./percentiles";
import type {
  DiseaseRecord,
  DiseasesArtifact,
  MatchStrategy,
  QueryHealth,
} from "../../src/lib/types";
import { computeTrialReadiness } from "./readiness";

const PARENT_PUBS_SUBSTANTIAL = 50;
/** Bytes that appear when Orphanet UTF-8 is mis-decoded as CP850 (e.g. TomÚ-…). */
const CP850_CORRUPT = /[ÚÞÛÙÓßÔõÕþÝ´±¾¶÷·³°]/;

/**
 * Backfill fields added after an artifact was first written, so derive runs on
 * older artifacts (Part: "npm run derive must be runnable standalone"). Never
 * fabricates signal data — only fills structural defaults + infers strategy
 * hits from existing counts.
 */
function ensureRecordShape(d: DiseaseRecord): void {
  const dd = d as unknown as Record<string, unknown>;
  if (dd.nameCorrected === undefined) d.nameCorrected = null;
  if (dd.mondoSynonyms === undefined) d.mondoSynonyms = [];
  if (dd.meshLabels === undefined) d.meshLabels = [];
  if (dd.parentLiteratureProbe === undefined) d.parentLiteratureProbe = null;
  if (dd.identifiers === undefined) {
    d.identifiers = { mondo: d.mondoIds ?? [], mesh: [], umls: [], omim: [], ncit: [] };
  }
  if (dd.publicationsPercentile === undefined) d.publicationsPercentile = null;
  if (dd.trialsPercentile === undefined) d.trialsPercentile = null;

  const pub = d.publications as Record<string, unknown>;
  if (pub.phraseCount === undefined) pub.phraseCount = d.publications.total;
  if (pub.meshCount === undefined) pub.meshCount = 0;
  if (pub.meshQuery === undefined) pub.meshQuery = "";

  const tr = d.trials as Record<string, unknown>;
  if (tr.matchedVia === undefined) {
    // Prefer strategiesWithHits when present — never invent "phrase" for recall-only.
    const fromHealth = (d.queryHealth?.strategiesWithHits ?? []).filter(
      (s): s is "phrase" | "mesh" | "recall-expansion" =>
        s === "phrase" || s === "mesh" || s === "recall-expansion"
    );
    tr.matchedVia =
      fromHealth.length > 0
        ? fromHealth
        : (d.trials.total ?? 0) > 0
          ? ["phrase"]
          : [];
  }
  if (tr.generalRegistries === undefined) tr.generalRegistries = [];
  if (tr.registeredStudiesTotal === undefined) {
    tr.registeredStudiesTotal = d.trials.total;
  }
  if (tr.observationalTotal === undefined) tr.observationalTotal = 0;
  if (tr.observationalRecruitingCount === undefined) {
    tr.observationalRecruitingCount = 0;
  }
  if (tr.observational === undefined) tr.observational = [];
  if (tr.expandedAccessTotal === undefined) tr.expandedAccessTotal = 0;
  if (tr.parentCategory === undefined) tr.parentCategory = null;

  if (dd.queryHealth === undefined) {
    const withHits: MatchStrategy[] = [];
    if ((d.publications.total ?? 0) > 0 || (d.trials.total ?? 0) > 0) {
      withHits.push("phrase");
    }
    d.queryHealth = {
      status: "ok",
      reasons: [],
      strategiesAttempted: ["phrase"],
      strategiesWithHits: withHits,
    };
  }
}

function computeQueryHealth(d: DiseaseRecord): QueryHealth {
  const attempted = new Set<MatchStrategy>(
    d.queryHealth?.strategiesAttempted ?? ["phrase"]
  );
  if (d.nameCorrected) attempted.add("corrected-name");
  const withHits = new Set<MatchStrategy>(d.queryHealth?.strategiesWithHits ?? []);

  const reasons: string[] = [];
  const pub = d.publications.total;
  const trials = d.trials.registeredStudiesTotal;

  const pubFailed = Boolean(d.sourceErrors?.publications);
  const trialFailed = Boolean(d.sourceErrors?.trials);

  let status: QueryHealth["status"] = "ok";

  // broken: both fetches succeeded and every strategy returned zero
  if (!pubFailed && !trialFailed && pub === 0 && trials === 0) {
    status = "broken";
    reasons.push(
      "Every search strategy returned zero across Europe PMC and ClinicalTrials.gov — this is almost always a query-construction problem, not absence of research."
    );
  } else {
    if (d.nameCorrected) {
      status = "suspect";
      reasons.push(
        `Label correction detected (${d.nameCorrected}) — queried with both original and corrected forms.`
      );
    }
    if (attempted.size >= 2 && withHits.size === 1) {
      status = status === "broken" ? status : "suspect";
      reasons.push(
        `Only one of ${attempted.size} strategies returned hits (${[...withHits].join(", ") || "none"}).`
      );
    }
    if (pubFailed || trialFailed) {
      status = "suspect";
      reasons.push(
        `Source fetch failed for ${[pubFailed ? "publications" : null, trialFailed ? "trials" : null].filter(Boolean).join(" and ")}.`
      );
    }
  }

  if (status === "ok") reasons.push("Query returned hits via a name/identifier strategy.");

  return {
    status,
    reasons,
    strategiesAttempted: [...attempted],
    strategiesWithHits: [...withHits],
  };
}

function recomputeConfidence(
  d: DiseaseRecord,
  reverseIndex: Map<string, string[]>
): void {
  const synonyms = [...d.synonyms, ...(d.mondoSynonyms ?? [])];
  const { kept, dropped } = buildEuropePmcQuery(d.name, synonyms);

  const base = computeConfidence({
    preferredLabel: d.name,
    synonymsDropped: dropped.map((x) => x.term),
    reverseIndex,
    orphaCode: d.orphaCode,
    queryTerms: kept,
  });

  const adjusted = applySignalConfidenceRules({
    confidence: base.confidence,
    reasons: base.reasons,
    publicationTotal: d.publications.total,
    trialTotal: d.trials.total,
    prevalenceClass: d.prevalenceClass,
    geneClassification: d.geneDiseaseValidity.classification,
    definition: d.definition,
    mondoIds: d.mondoIds,
  });

  let confidence = adjusted.confidence;
  let reasons = adjusted.reasons;
  let excludeFromNeglect = adjusted.excludeFromNeglect;

  if (d.sourceErrors?.publications && excludeFromNeglect) {
    excludeFromNeglect = false;
    confidence = base.confidence;
    reasons = reasons.filter((r) => !r.includes("Zero publications but GenCC"));
    reasons.push(
      "Publications fetch failed — gene-validity contradiction rule not applied"
    );
  }

  // Mondo parent-literature artifact (probe fetched by ingest)
  if (
    !excludeFromNeglect &&
    d.publications.total === 0 &&
    !d.sourceErrors?.publications &&
    d.parentLiteratureProbe &&
    d.parentLiteratureProbe.hits >= PARENT_PUBS_SUBSTANTIAL
  ) {
    excludeFromNeglect = true;
    confidence = "low";
    reasons.push(
      `Zero publications but parent term ${d.parentLiteratureProbe.label} has ${d.parentLiteratureProbe.hits} — literature likely indexed under a broader name`
    );
  }

  // Broken queries cannot be high/medium confidence — structural contradiction.
  if (d.queryHealth?.status === "broken" && confidence !== "low") {
    confidence = "low";
    reasons = [
      "Query health is broken (no hits on either database) — confidence forced low",
      ...reasons,
    ];
  }

  // Preferred-label encoding corruption (CP850 double-decode) is a source defect.
  if (CP850_CORRUPT.test(d.name)) {
    confidence = "low";
    reasons = [
      d.nameCorrected
        ? `Preferred label still contains encoding artifacts; queries use nameCorrected (${d.nameCorrected})`
        : "Preferred label contains encoding artifacts (CP850/UTF-8 mojibake) — treat counts with caution",
      ...reasons.filter((r) => !r.includes("encoding")),
    ];
  }

  d.confidence = confidence;
  d.confidenceReasons = reasons;
  d.excludeFromNeglect = excludeFromNeglect;
}

function credibleGate(d: DiseaseRecord, metric: "publications" | "trials"): boolean {
  if (d.queryHealth.status === "broken") return false;
  return inCredibleSet(
    {
      confidence: d.confidence,
      excludeFromNeglect: d.excludeFromNeglect,
      sourceErrors: d.sourceErrors,
      trialsFullyScanned: d.trials.fullyScanned,
    },
    metric
  );
}

function computeAggregate(
  diseases: DiseaseRecord[],
  trialMedian: number
): DiseasesArtifact["aggregate"] {
  let publicationsDenominator = 0;
  let trialsDenominator = 0;
  let intersectionDenominator = 0;
  let noRecentPubsNoTrials = 0;
  let noPublicationsLast10Years = 0;
  let noTrials = 0;
  let noTrialsParentInclusive = 0;
  let noRegisteredStudies = 0;
  let incompleteSourceRows = 0;
  let brokenQueryRows = 0;
  let noTrialsWithSubstantialLiterature = 0;
  let noTrialsWithNoLiterature = 0;

  const pubMedianForDefensibility = trialMedian; // computed separately below

  for (const d of diseases) {
    if (d.sourceErrors?.publications || d.sourceErrors?.trials) {
      incompleteSourceRows += 1;
    }
    if (d.queryHealth.status === "broken") {
      brokenQueryRows += 1;
      continue;
    }

    const pubOk = credibleGate(d, "publications");
    const trialOk = credibleGate(d, "trials");

    if (pubOk) {
      publicationsDenominator += 1;
      if (d.publications.last10Years === 0) noPublicationsLast10Years += 1;
    }
    if (trialOk) {
      trialsDenominator += 1;
      if (d.trials.total === 0) {
        noTrials += 1;
        const parentTotal = d.trials.parentCategory?.total ?? 0;
        if (parentTotal === 0) noTrialsParentInclusive += 1;
      }
      if (d.trials.registeredStudiesTotal === 0) noRegisteredStudies += 1;
    }
    if (pubOk && trialOk) {
      intersectionDenominator += 1;
      if (
        countsTowardNeglect({
          last10YearsPubs: d.publications.last10Years,
          trialTotal: d.trials.total,
        })
      ) {
        noRecentPubsNoTrials += 1;
      }
    }
  }

  // Part 7 — defensibility: of trial-credible no-trial diseases, how many have
  // substantial literature (pub credible + last10Years >= pub median)?
  void pubMedianForDefensibility;

  return {
    totalDiseases: diseases.length,
    publicationsDenominator,
    trialsDenominator,
    intersectionDenominator,
    noRecentPubsNoTrials,
    noPublicationsLast10Years,
    noTrials,
    noTrialsParentInclusive,
    noRegisteredStudies,
    incompleteSourceRows,
    brokenQueryRows,
    noTrialsWithSubstantialLiterature,
    noTrialsWithNoLiterature,
  };
}

export function deriveArtifact(artifact: DiseasesArtifact): DiseasesArtifact {
  const diseases = artifact.diseases;

  // 0) backfill structural fields for older artifacts
  for (const d of diseases) ensureRecordShape(d);

  // 1) queryHealth
  for (const d of diseases) {
    d.queryHealth = computeQueryHealth(d);
  }

  // 2) confidence + excludeFromNeglect (reverse index from full corpus)
  const reverseIndex = buildReverseIndex(
    diseases.map((d) => ({
      orphaCode: d.orphaCode,
      name: d.name,
      synonyms: [...d.synonyms, ...(d.mondoSynonyms ?? [])],
    }))
  );
  for (const d of diseases) recomputeConfidence(d, reverseIndex);

  // 2b) Trial-readiness stages from existing signals + optional Monarch enrichments
  for (const d of diseases) {
    d.trialReadiness = computeTrialReadiness(d);
  }

  // 3) aggregate (needs pub median for Part 7 diagnostic)
  const pubValues: number[] = [];
  for (const d of diseases) {
    if (d.queryHealth.status === "broken") continue;
    if (credibleGate(d, "publications") && d.publications.last10Years != null) {
      pubValues.push(d.publications.last10Years);
    }
  }
  const pubMedian = median(pubValues);

  const aggregate = computeAggregate(diseases, pubMedian);

  // Part 7 defensibility pass (needs pubMedian)
  for (const d of diseases) {
    if (d.queryHealth.status === "broken") continue;
    if (!credibleGate(d, "trials")) continue;
    if (d.trials.total !== 0) continue;
    const pubCredible = credibleGate(d, "publications");
    const recent = d.publications.last10Years ?? 0;
    if (pubCredible && recent >= pubMedian && recent > 0) {
      aggregate.noTrialsWithSubstantialLiterature += 1;
    } else {
      aggregate.noTrialsWithNoLiterature += 1;
    }
  }

  artifact.aggregate = aggregate;

  // 4) distributions + percentiles (percentiles module also honours broken via credibleGate?)
  applyPercentiles(artifact);

  // 5) Merge nameCorrections: keep existing report rows, add any disease with
  // nameCorrected missing from the list (so --resume cannot wipe the report).
  const prior = artifact.nameCorrections ?? [];
  const seen = new Set(prior.map((c) => c.orphaCode));
  const merged = [...prior];
  for (const d of diseases) {
    if (!d.nameCorrected || seen.has(d.orphaCode)) continue;
    merged.push({
      orphaCode: d.orphaCode,
      original: d.name,
      corrected: d.nameCorrected,
      type: "missing-boundary",
      detail: "Rebuilt by deriveArtifact from nameCorrected",
      applied: true,
    });
  }
  artifact.nameCorrections = merged.sort(
    (a, b) => Number(a.orphaCode) - Number(b.orphaCode)
  );

  // 6) Attach corpusLevels from cached product1 when missing or stale-empty.
  if (!artifact.corpusLevels) {
    const levels = loadCorpusLevelsFromCache();
    if (levels) artifact.corpusLevels = levels;
  }

  return artifact;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
