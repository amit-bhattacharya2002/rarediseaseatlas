import type {
  RegistrySource,
  RegistryTrialRecord,
  SecondaryRegistriesBlock,
} from "../../../src/lib/types";
import { searchCtis } from "./ctis";
import { searchIctrp } from "./ictrp";
import { searchIsrctn } from "./isrctn";
import {
  dedupeRegistryTrials,
  splitAlreadyOnCtgov,
} from "./normalize";

export interface SecondaryFetchResult {
  raw: RegistryTrialRecord[];
  deduped: RegistryTrialRecord[];
  novel: RegistryTrialRecord[];
  alreadyOnCtgov: RegistryTrialRecord[];
  sourceErrors: Partial<Record<RegistrySource, string>>;
}

export async function fetchSecondaryRegistryTrials(
  terms: string[],
  opts: { excludeNctIds: Set<string> }
): Promise<SecondaryFetchResult> {
  const sourceErrors: Partial<Record<RegistrySource, string>> = {};
  const buckets: RegistryTrialRecord[][] = [];

  const runners: Array<{
    source: RegistrySource;
    run: () => Promise<RegistryTrialRecord[]>;
  }> = [
    { source: "ictrp", run: () => searchIctrp(terms) },
    { source: "ctis", run: () => searchCtis(terms) },
    { source: "isrctn", run: () => searchIsrctn(terms) },
  ];

  await Promise.all(
    runners.map(async ({ source, run }) => {
      try {
        const rows = await run();
        buckets.push(rows);
      } catch (err) {
        sourceErrors[source] = String(err).slice(0, 500);
      }
    })
  );

  const raw = buckets.flat();
  const deduped = dedupeRegistryTrials(raw);
  const { novel, alreadyOnCtgov } = splitAlreadyOnCtgov(
    deduped,
    opts.excludeNctIds
  );

  return { raw, deduped, novel, alreadyOnCtgov, sourceErrors };
}

export function emptySecondaryBlock(
  terms: string[],
  partial?: Partial<SecondaryRegistriesBlock>
): SecondaryRegistriesBlock {
  return {
    fetchedAt: new Date().toISOString(),
    queryTerms: terms,
    rawFetched: 0,
    afterDedupe: 0,
    alreadyOnCtgov: 0,
    kept: [],
    parentCategory: [],
    uncertain: [],
    droppedCount: 0,
    ...partial,
  };
}
