import type { DiseasesArtifact } from "./types";

/** Human-readable calendar date from YYYY-MM-DD or ISO timestamp. */
export function formatSnapshotDate(isoOrDate: string): string {
  const day = isoOrDate.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Latest of lastFullIngest / lastRefresh / generatedAt for live surfaces. */
export function artifactDataAsOf(artifact: DiseasesArtifact): string {
  const candidates = [
    artifact.lastFullIngest,
    artifact.lastRefresh,
    artifact.generatedAt,
  ].filter((x): x is string => Boolean(x));
  if (candidates.length === 0) return "unknown date";
  const latest = candidates
    .map((c) => ({ c, t: Date.parse(c) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => b.t - a.t)[0]?.c;
  return formatSnapshotDate(latest ?? artifact.generatedAt);
}

export function dataAsOfLabel(artifact: DiseasesArtifact): string {
  return `Data as of ${artifactDataAsOf(artifact)}`;
}
