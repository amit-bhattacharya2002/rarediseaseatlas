/**
 * Ensure data/diseases.json exists (extract from diseases.json.gz if needed).
 *   npx tsx scripts/ensure-artifact-json.ts
 */
import { ensureArtifactJson } from "./lib/artifact-io";
import { log } from "./lib/logger";

try {
  const p = ensureArtifactJson();
  log.info(`Artifact ready: ${p}`);
} catch (err) {
  log.error(String(err));
  process.exit(1);
}
