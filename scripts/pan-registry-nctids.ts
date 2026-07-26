/**
 * Pan-disease registries and natural-history umbrella studies.
 *
 * These enroll across rare diseases (or "all rare diseases") and will match
 * hundreds of condition pages. Useful for families, but not evidence that a
 * condition-specific trial exists.
 *
 * Add NCT IDs as found — search titles for "rare disease" / "natural history" /
 * "registry" plus breadth indicators (coordination of rare diseases, etc.).
 */

export const PAN_REGISTRY_NCTIDS = new Set<string>([
  // Rare Disease Patient Registry & Natural History Study — Coordination of Rare Diseases at Sanford
  "NCT01793168",
]);

export function isPanRegistryNctId(nctId: string): boolean {
  return PAN_REGISTRY_NCTIDS.has(nctId.trim().toUpperCase());
}
