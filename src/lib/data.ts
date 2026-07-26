import diseasesJson from "../../data/diseases.json";
import indiaJson from "../../data/india-nprd.json";
import { githubNewIssueUrl } from "./site";
import { signalLevel } from "./signals";
import type {
  DiseaseRecord,
  DiseasesArtifact,
  IndiaNprdData,
  SearchIndexEntry,
} from "./types";

export type { SearchIndexEntry };

export const diseasesArtifact = diseasesJson as DiseasesArtifact;
export const indiaNprd = indiaJson as IndiaNprdData;

/** Fail the build if India NPRD verification is older than 12 months. */
function assertIndiaBuildFreshness(): void {
  const verified = new Date(indiaNprd.lastVerified + "T00:00:00Z");
  if (Number.isNaN(verified.getTime())) {
    throw new Error(
      `India NPRD lastVerified is not a valid date: ${indiaNprd.lastVerified}`
    );
  }
  const ageDays = (Date.now() - verified.getTime()) / 86_400_000;
  if (ageDays > 365) {
    throw new Error(
      `India NPRD lastVerified (${indiaNprd.lastVerified}) is ${Math.floor(ageDays)} days old (>12 months). Re-verify data/india-nprd.json before building.`
    );
  }
}

assertIndiaBuildFreshness();

/**
 * Part 5 — headline reconciliation guard. The rendered numerator MUST come from
 * aggregate.noTrials, never derived from distributions.shareZero. Fail the build
 * if the aggregate is missing or internally inconsistent.
 */
function assertAggregateInvariants(): void {
  const a = diseasesArtifact.aggregate;
  if (a == null) throw new Error("Artifact aggregate missing.");
  // Older artifacts predate the parent-category sensitivity numerator.
  if (typeof a.noTrialsParentInclusive !== "number") {
    a.noTrialsParentInclusive = a.noTrials;
  }
  for (const key of [
    "noTrials",
    "noTrialsParentInclusive",
    "noRegisteredStudies",
    "trialsDenominator",
    "noPublicationsLast10Years",
    "publicationsDenominator",
  ] as const) {
    if (typeof a[key] !== "number" || !Number.isInteger(a[key])) {
      throw new Error(`aggregate.${key} must be an integer; got ${a[key]}`);
    }
  }
  if (a.noTrials > a.trialsDenominator) {
    throw new Error(
      `aggregate.noTrials (${a.noTrials}) exceeds trialsDenominator (${a.trialsDenominator}).`
    );
  }
  if (a.noTrialsParentInclusive > a.noTrials) {
    throw new Error(
      `aggregate.noTrialsParentInclusive (${a.noTrialsParentInclusive}) exceeds noTrials (${a.noTrials}).`
    );
  }
  if (
    a.noRegisteredStudies > a.noTrials ||
    a.noRegisteredStudies > a.trialsDenominator
  ) {
    throw new Error(
      `aggregate.noRegisteredStudies (${a.noRegisteredStudies}) must be <= noTrials (${a.noTrials}) and trialsDenominator (${a.trialsDenominator}).`
    );
  }
  if (a.noPublicationsLast10Years > a.publicationsDenominator) {
    throw new Error(
      `aggregate.noPublicationsLast10Years (${a.noPublicationsLast10Years}) exceeds publicationsDenominator (${a.publicationsDenominator}).`
    );
  }
  // Denominator consistency: rendered % must use the same aggregate block.
  if (a.trialsDenominator > 0) {
    const pct = (100 * a.noTrials) / a.trialsDenominator;
    if (!(pct >= 0 && pct <= 100)) {
      throw new Error(
        `aggregate noTrials/trialsDenominator percentage out of range: ${pct}`
      );
    }
  }
  const cl = diseasesArtifact.corpusLevels;
  if (cl) {
    if (cl.commonlyCitedDisorderLevel > cl.product1Total) {
      throw new Error(
        `corpusLevels.commonlyCitedDisorderLevel (${cl.commonlyCitedDisorderLevel}) exceeds product1Total (${cl.product1Total})`
      );
    }
    if (cl.atlasUsableEstimate > cl.afterDroppingGroups) {
      throw new Error(
        `corpusLevels.atlasUsableEstimate exceeds afterDroppingGroups`
      );
    }
  }
}

assertAggregateInvariants();

export function indiaStaleWarning(): boolean {
  const verified = new Date(indiaNprd.lastVerified + "T00:00:00Z");
  const ageDays = (Date.now() - verified.getTime()) / 86_400_000;
  return ageDays > 183;
}

export function getAllDiseases(): DiseaseRecord[] {
  return diseasesArtifact.diseases;
}

export function getSearchIndex(): SearchIndexEntry[] {
  return diseasesArtifact.diseases.map((d) => ({
    orphaCode: d.orphaCode,
    name: d.name,
    synonyms: d.synonyms,
    publications: signalLevel(d.publications.total ?? 0, "pubs"),
    researchers: signalLevel(d.researchers.distinctCount ?? 0, "people"),
    trials: signalLevel(d.trials.total ?? 0, "trials"),
  }));
}

export function getDisease(orphaCode: string): DiseaseRecord | undefined {
  return diseasesArtifact.diseases.find((d) => d.orphaCode === orphaCode);
}

export function getAggregate() {
  return diseasesArtifact.aggregate;
}

export function getDistributions() {
  return diseasesArtifact.distributions;
}

/** Slim per-disease shape for the landscape heat map (keeps the client payload small). */
export function getLandscapeCells() {
  return diseasesArtifact.diseases.map((d) => ({
    orphaCode: d.orphaCode,
    name: d.name,
    pubs: d.publications.total,
    recent: d.publications.last10Years,
    trials: d.trials.total,
    researchers: d.researchers.distinctCount,
    confidence: d.confidence,
    broken: d.queryHealth?.status === "broken",
  }));
}

/** Neglect score: lower research attention → higher score. */
export function neglectScore(d: DiseaseRecord): number {
  const pubScore = Math.log10(1 + (d.publications.total ?? 0));
  const recentScore = Math.log10(1 + (d.publications.last10Years ?? 0));
  const trialScore = Math.log10(1 + (d.trials.total ?? 0));
  const researcherScore = Math.log10(1 + (d.researchers.distinctCount ?? 0));
  const geneBoost =
    d.geneDiseaseValidity.classification === "None"
      ? 0.4
      : d.geneDiseaseValidity.classification === "Limited" ||
          d.geneDiseaseValidity.classification === "Disputed"
        ? 0.2
        : 0;
  return 10 - (pubScore + recentScore + trialScore + researcherScore) + geneBoost;
}

export function getNeglectedDiseases(limit = 100): DiseaseRecord[] {
  return [...diseasesArtifact.diseases]
    .filter((d) => !d.excludeFromNeglect && d.queryHealth?.status !== "broken")
    .sort((a, b) => neglectScore(b) - neglectScore(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export const UMBRELLA_ORGS = [
  {
    name: "EURORDIS – Rare Diseases Europe",
    url: "https://www.eurordis.org/",
  },
  {
    name: "NORD – National Organization for Rare Disorders",
    url: "https://rarediseases.org/",
  },
  {
    name: "Rare Diseases International",
    url: "https://www.rarediseasesinternational.org/",
  },
  {
    name: "Global Genes",
    url: "https://globalgenes.org/",
  },
  {
    name: "Organization for Rare Diseases India (ORDI)",
    url: "https://ordindia.in/",
  },
] as const;

export function reportErrorUrl(orphaCode: string, name: string): string {
  return githubNewIssueUrl(
    `Data error: ORPHA:${orphaCode} — ${name}`,
    [
      `**ORPHAcode:** ${orphaCode}`,
      `**Disease name:** ${name}`,
      "",
      "**What looks wrong?**",
      "<!-- e.g. publication count, trials, researchers, India panel, definition -->",
      "",
      "**Suggested correction / source:**",
      "",
      "**Page URL:**",
    ].join("\n")
  );
}
