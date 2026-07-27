/**
 * Loud guards for nightly/monthly cadence jobs.
 *
 *   npx tsx scripts/assert-refresh-guards.ts --mode nightly --before path --after path
 *   npx tsx scripts/assert-refresh-guards.ts --mode monthly --before path --after path
 */
import fs from "node:fs";
import type { DiseasesArtifact } from "../src/lib/types";

function parseArgs(argv: string[]): {
  mode: "nightly" | "monthly";
  beforePath: string;
  afterPath: string;
  /** When true, allow up to 15% noTrials move (accuracy remediation batch). */
  accuracyBatch: boolean;
} {
  let mode: "nightly" | "monthly" = "nightly";
  let beforePath = "";
  let afterPath = "";
  let accuracyBatch = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--mode") {
      const m = argv[++i];
      if (m !== "nightly" && m !== "monthly") {
        throw new Error("--mode must be nightly or monthly");
      }
      mode = m;
    } else if (a === "--before") {
      beforePath = argv[++i] ?? "";
    } else if (a === "--after") {
      afterPath = argv[++i] ?? "";
    } else if (a === "--accuracy-batch") {
      accuracyBatch = true;
    }
  }
  if (!beforePath || !afterPath) {
    throw new Error(
      "Usage: --mode nightly|monthly --before PATH --after PATH [--accuracy-batch]"
    );
  }
  return { mode, beforePath, afterPath, accuracyBatch };
}

function load(p: string): DiseasesArtifact {
  return JSON.parse(fs.readFileSync(p, "utf8")) as DiseasesArtifact;
}

function main(): void {
  const { mode, beforePath, afterPath, accuracyBatch } = parseArgs(
    process.argv.slice(2)
  );
  const before = load(beforePath);
  const after = load(afterPath);
  const failures: string[] = [];

  if (after.diseases.length < before.diseases.length) {
    failures.push(
      `Artifact row count dropped ${before.diseases.length} → ${after.diseases.length}`
    );
  }

  if (mode === "nightly") {
    if (
      JSON.stringify(before.sourceVersions) !==
      JSON.stringify(after.sourceVersions)
    ) {
      failures.push("Nightly run changed sourceVersions (forbidden)");
    }
    const prev = before.aggregate.noTrials;
    const next = after.aggregate.noTrials;
    const maxDelta = accuracyBatch ? 0.15 : 0.05;
    if (prev > 0) {
      const delta = Math.abs(next - prev) / prev;
      if (delta > maxDelta) {
        failures.push(
          `Nightly noTrials moved more than ${(maxDelta * 100).toFixed(0)}%: ${prev} → ${next} (Δ=${(delta * 100).toFixed(1)}%)${accuracyBatch ? " [--accuracy-batch]" : ""} — treating as bug signal`
        );
      }
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(`GUARD FAIL: ${f}`);
    process.exit(1);
  }
  console.log(
    `Refresh guards OK (${mode}${accuracyBatch ? ", accuracy-batch" : ""}): rows ${before.diseases.length}→${after.diseases.length}; noTrials ${before.aggregate.noTrials}→${after.aggregate.noTrials}`
  );
}

main();
