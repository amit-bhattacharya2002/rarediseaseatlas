/**
 * Per-disease percentiles + corpus distributions over per-signal denominators.
 */

import { inCredibleSet } from "./confidence";
import type {
  DiseaseRecord,
  DiseasesArtifact,
  DistributionStats,
} from "../../src/lib/types";

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function distribution(values: number[]): DistributionStats {
  const sorted = [...values].sort((a, b) => a - b);
  const zeros = sorted.filter((v) => v === 0).length;
  return {
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    shareZero: sorted.length ? zeros / sorted.length : 0,
    n: sorted.length,
  };
}

/** Percentile rank: share of values strictly below x, plus half the ties (0–100). */
export function percentileRank(value: number, population: number[]): number {
  if (population.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const v of population) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return Math.round(((below + equal * 0.5) / population.length) * 1000) / 10;
}

export function applyPercentiles(artifact: DiseasesArtifact): DiseasesArtifact {
  const pubPop: { d: DiseaseRecord; v: number }[] = [];
  const trialPop: { d: DiseaseRecord; v: number }[] = [];

  for (const d of artifact.diseases) {
    const broken = d.queryHealth?.status === "broken";
    const pubOk =
      !broken &&
      inCredibleSet(
        {
          confidence: d.confidence,
          excludeFromNeglect: d.excludeFromNeglect,
          sourceErrors: d.sourceErrors,
          trialsFullyScanned: d.trials.fullyScanned,
        },
        "publications"
      );
    const trialOk =
      !broken &&
      inCredibleSet(
        {
          confidence: d.confidence,
          excludeFromNeglect: d.excludeFromNeglect,
          sourceErrors: d.sourceErrors,
          trialsFullyScanned: d.trials.fullyScanned,
        },
        "trials"
      );

    if (pubOk && d.publications.last10Years != null) {
      pubPop.push({ d, v: d.publications.last10Years });
    }
    if (trialOk && d.trials.total != null) {
      trialPop.push({ d, v: d.trials.total });
    }
  }

  const pubValues = pubPop.map((x) => x.v);
  const trialValues = trialPop.map((x) => x.v);

  for (const d of artifact.diseases) {
    d.publicationsPercentile = null;
    d.trialsPercentile = null;
  }
  for (const { d, v } of pubPop) {
    d.publicationsPercentile = percentileRank(v, pubValues);
  }
  for (const { d, v } of trialPop) {
    d.trialsPercentile = percentileRank(v, trialValues);
  }

  artifact.distributions = {
    publicationsLast10Years: distribution(pubValues),
    trials: distribution(trialValues),
  };

  return artifact;
}
