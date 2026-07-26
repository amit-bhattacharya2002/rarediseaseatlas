/**
 * Resolve MeSH ids (from Mondo xrefs) to descriptor / concept labels.
 * Best-effort: NLM id service, cached by id. Failures return null (matching
 * then falls back to phrase-only and queryHealth records the attempt).
 */

import { fetchJson } from "./http";
import { log } from "./logger";

interface MeshJsonLd {
  label?: { "@value"?: string } | string;
}

/** MESH id, e.g. "D000544" or "C537596" → preferred label, or null. */
export async function resolveMeshLabel(meshId: string): Promise<string | null> {
  const id = meshId.trim();
  if (!/^[CD]\d+$/i.test(id)) return null;
  const url = `https://id.nlm.nih.gov/mesh/${id}.json`;
  try {
    const data = await fetchJson<MeshJsonLd>(url, {
      cacheKey: `mesh:label:${id}`,
      timeoutMs: 30_000,
      maxRetries: 3,
      headers: { Accept: "application/json" },
    });
    const lbl =
      typeof data.label === "string"
        ? data.label
        : data.label?.["@value"] ?? null;
    const clean = lbl?.trim();
    return clean && clean.length >= 3 ? clean : null;
  } catch (err) {
    log.warn(`MeSH label resolve failed for ${id}: ${String(err)}`);
    return null;
  }
}

export async function resolveMeshLabels(meshIds: string[]): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of meshIds) {
    const label = await resolveMeshLabel(id);
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      out.push(label);
    }
  }
  return out;
}
