/**
 * Open Targets Platform — drugs / clinical candidates by Mondo ID.
 */
import { fetchJsonPost } from "./http";
import { mondoCurie } from "./mydisease";
import type { DiseaseRecord } from "../../src/lib/types";

const OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql";

export function mondoToEfoId(mondoId: string): string {
  return mondoCurie(mondoId).replace(":", "_");
}

interface OtDrugRow {
  id?: string;
  maxClinicalStage?: string | null;
  drug?: { id?: string; name?: string } | null;
}

interface OtResponse {
  data?: {
    disease?: {
      id?: string;
      name?: string;
      drugAndClinicalCandidates?: {
        count?: number;
        rows?: OtDrugRow[];
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

const QUERY = `
query DiseaseDrugs($efoId: String!) {
  disease(efoId: $efoId) {
    id
    name
    drugAndClinicalCandidates {
      count
      rows {
        id
        maxClinicalStage
        drug { id name }
      }
    }
  }
}
`;

const STAGE_RANK: Record<string, number> = {
  PHASE_4: 4,
  PHASE_3: 3,
  PHASE_2: 2,
  PHASE_1: 1,
  EARLY: 0.5,
};

export async function fetchOpenTargetsDrugs(
  mondoId: string
): Promise<NonNullable<DiseaseRecord["openTargets"]>> {
  const efoId = mondoToEfoId(mondoId);
  const res = await fetchJsonPost<OtResponse>(OT_GQL, {
    body: { query: QUERY, variables: { efoId } },
    cacheKey: `opentargets:drugs:${efoId}:v1`,
    maxRetries: 4,
    timeoutMs: 60_000,
  });
  if (res.errors?.length) {
    // Missing disease id is common — treat as empty.
    const msg = res.errors.map((e) => e.message).join("; ");
    if (/not found|Cannot return null|disease/i.test(msg)) {
      return {
        fetchedAt: new Date().toISOString(),
        efoId,
        drugCount: 0,
        drugs: [],
      };
    }
  }
  const block = res.data?.disease?.drugAndClinicalCandidates;
  const rows = block?.rows ?? [];
  const drugs: NonNullable<DiseaseRecord["openTargets"]>["drugs"] = [];
  const seen = new Set<string>();
  const sorted = [...rows].sort(
    (a, b) =>
      (STAGE_RANK[b.maxClinicalStage ?? ""] ?? -1) -
        (STAGE_RANK[a.maxClinicalStage ?? ""] ?? -1) ||
      (a.drug?.name ?? "").localeCompare(b.drug?.name ?? "")
  );
  for (const row of sorted) {
    const chemblId = row.drug?.id?.trim();
    const name = row.drug?.name?.trim();
    if (!chemblId || !name) continue;
    if (seen.has(chemblId)) continue;
    seen.add(chemblId);
    drugs.push({
      chemblId,
      name,
      maxClinicalStage: row.maxClinicalStage ?? null,
      url: `https://platform.opentargets.org/drug/${chemblId}`,
    });
    if (drugs.length >= 15) break;
  }
  return {
    fetchedAt: new Date().toISOString(),
    efoId: res.data?.disease?.id ?? efoId,
    drugCount: block?.count ?? drugs.length,
    drugs,
  };
}
