/**
 * Recompute all derived fields from the existing artifact — no network.
 *
 *   npm run derive
 *
 * Reads data/diseases.json, recomputes queryHealth, confidence,
 * excludeFromNeglect, aggregates, distributions, and percentiles, then writes
 * back atomically.
 */

import fs from "node:fs";
import path from "node:path";
import { deriveArtifact } from "./lib/derive";
import { log } from "./lib/logger";
import type { DiseasesArtifact } from "../src/lib/types";

async function main(): Promise<void> {
  const p = path.join(process.cwd(), "data", "diseases.json");
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  const artifact = JSON.parse(fs.readFileSync(p, "utf8")) as DiseasesArtifact;

  deriveArtifact(artifact);
  artifact.generatedAt = new Date().toISOString();

  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);

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
