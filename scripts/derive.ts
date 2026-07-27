/**
 * Recompute all derived fields from the existing artifact — no network.
 *
 *   npm run derive
 *
 * Reads data/diseases.json (or .gz), recomputes queryHealth, confidence,
 * excludeFromNeglect, aggregates, distributions, and percentiles, then writes
 * JSON + gzip atomically.
 */
import { readArtifact, writeArtifact } from "./lib/artifact-io";
import { deriveArtifact } from "./lib/derive";
import { log } from "./lib/logger";

async function main(): Promise<void> {
  const artifact = readArtifact();

  deriveArtifact(artifact);
  artifact.generatedAt = new Date().toISOString();

  writeArtifact(artifact);

  const a = artifact.aggregate;
  log.info(
    `Derive done. noTrials ${a.noTrials}/${a.trialsDenominator}; broken=${a.brokenQueryRows}; ` +
      `noTrials+lit=${a.noTrialsWithSubstantialLiterature}; noTrials+noLit=${a.noTrialsWithNoLiterature}; ` +
      `pubsDen=${a.publicationsDenominator}; intersection=${a.intersectionDenominator}`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
