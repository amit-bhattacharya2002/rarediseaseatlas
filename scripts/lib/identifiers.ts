/**
 * Structured cross-references from Mondo xrefs.
 * Buckets MESH / UMLS / OMIM / NCIT (+ mondo) for identifier-based matching.
 */

import type { MondoHierarchy } from "./mondo";
import { normalizeMondoId } from "./mondo";

export interface DiseaseIdentifiers {
  mondo: string[];
  mesh: string[];
  umls: string[];
  omim: string[];
  ncit: string[];
}

function bucket(xref: string, ids: DiseaseIdentifiers): void {
  const [prefixRaw, ...rest] = xref.split(":");
  const prefix = prefixRaw.trim().toUpperCase();
  const value = rest.join(":").trim();
  if (!value) return;
  switch (prefix) {
    case "MESH":
    case "MSH":
      if (!ids.mesh.includes(value)) ids.mesh.push(value);
      break;
    case "UMLS":
      if (!ids.umls.includes(value)) ids.umls.push(value);
      break;
    case "OMIM":
    case "MIM":
      if (!ids.omim.includes(value)) ids.omim.push(value);
      break;
    case "NCIT":
      if (!ids.ncit.includes(value)) ids.ncit.push(value);
      break;
    default:
      break;
  }
}

export function collectIdentifiers(
  mondoIds: string[],
  mondo: MondoHierarchy
): DiseaseIdentifiers {
  const ids: DiseaseIdentifiers = {
    mondo: [...new Set(mondoIds.map(normalizeMondoId))],
    mesh: [],
    umls: [],
    omim: [],
    ncit: [],
  };
  for (const m of ids.mondo) {
    for (const xref of mondo.xrefsOf(m)) {
      bucket(xref, ids);
    }
  }
  return ids;
}

/** Mondo hasExactSynonym union across a disease's Mondo ids. */
export function collectExactSynonyms(
  mondoIds: string[],
  mondo: MondoHierarchy
): string[] {
  const out = new Set<string>();
  for (const m of mondoIds.map(normalizeMondoId)) {
    for (const s of mondo.exactSynonymsOf(m)) out.add(s);
  }
  return [...out];
}
