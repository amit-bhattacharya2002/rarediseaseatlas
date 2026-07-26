import fs from "node:fs";
import path from "node:path";
import type { CorpusLevels } from "./types";

export interface FindingsSnapshot {
  snapshotDate: string;
  artifactSource: string;
  defectProvenanceSource: string;
  orphanetVersion: string;
  mondoVersion: string | null;
  genccVersion: string;
  sampling: {
    mode: string;
    n: number;
    seed: number;
    excludedObsoleteOrNonRare: number;
  };
  corpusLevels: CorpusLevels;
  searchability: {
    sampled: number;
    brokenQueryRows: number;
    brokenSharePct: number;
    publicationsDenominator: number;
    publicationsExcludedFromDenom: number;
    publicationsExcludedPct: number;
    examples: Array<{ orphaCode: string; name: string; reason: string }>;
  };
  trials: {
    trialsDenominator: number;
    noTrialsSpecific: number;
    noTrialsSpecificPct: number;
    noTrialsParentInclusive: number;
    noTrialsParentInclusivePct: number;
    preliminary: boolean;
    preliminaryNote: string;
  };
  labelDefects: {
    framing: string;
    disorderEntriesInProduct1: number;
    upstreamPreferredLabelMisspellings: number;
    upstreamShareOfProduct1Pct: number;
    defects: Array<{
      orphaCode: string;
      preferredLabel: string;
      suspectedForm: string;
      synonyms: string[];
      orphanetUrl: string;
      note: string;
    }>;
    corpusMisspellingCounts: Record<string, number | undefined>;
  };
  hyperSpecificLabels: {
    countZeroWithInformativeParent: number;
    examples: Array<{
      orphaCode: string;
      name: string;
      publicationTotal: number;
      mondoParentLabel: string | null;
      mondoParentPublications: number | null;
      geneRelatedForm: boolean;
    }>;
    geneRelatedInSample: number;
    geneRelatedExamples: Array<{
      orphaCode: string;
      name: string;
      publicationTotal: number | null;
      queryStatus: string;
    }>;
  };
  housekeeping: {
    excludedObsoleteOrNonRare: number;
    note: string;
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATE_RE = /^findings-(\d{4}-\d{2}-\d{2})\.json$/;

/** List published snapshot dates (YYYY-MM-DD), newest first. Never uses findings-latest. */
export function listFindingsDates(): string[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .map((name) => DATE_RE.exec(name)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function loadFindingsSnapshot(date: string): FindingsSnapshot {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid findings snapshot date: ${date}`);
  }
  const filePath = path.join(DATA_DIR, `findings-${date}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Findings snapshot not found: findings-${date}.json`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as FindingsSnapshot;
}

/** Newest dated snapshot — the only runtime source for /findings. */
export function loadLatestFindings(): FindingsSnapshot {
  const dates = listFindingsDates();
  if (dates.length === 0) {
    throw new Error(
      "No data/findings-YYYY-MM-DD.json snapshots found. Run npm run findings:build."
    );
  }
  return loadFindingsSnapshot(dates[0]);
}

export function findingsDatedFilename(snapshot: FindingsSnapshot): string {
  return `findings-${snapshot.snapshotDate}.json`;
}
