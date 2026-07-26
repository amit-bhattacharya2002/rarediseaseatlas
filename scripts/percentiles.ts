/**
 * Post-process data/diseases.json: per-disease percentiles + corpus distributions.
 *
 *   npx tsx scripts/percentiles.ts
 */

import fs from "node:fs";
import path from "node:path";
import { applyPercentiles } from "./lib/percentiles";
import { log } from "./lib/logger";
import type { DiseasesArtifact } from "../src/lib/types";

async function main(): Promise<void> {
  const p = path.join(process.cwd(), "data", "diseases.json");
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  const artifact = JSON.parse(fs.readFileSync(p, "utf8")) as DiseasesArtifact;
  applyPercentiles(artifact);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
  const dist = artifact.distributions!;
  log.info(
    `Percentiles written. pubs n=${dist.publicationsLast10Years.n} median=${dist.publicationsLast10Years.median}; ` +
      `trials n=${dist.trials.n} median=${dist.trials.median} shareZero=${(dist.trials.shareZero * 100).toFixed(1)}%`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
