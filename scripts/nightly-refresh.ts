/**
 * Nightly artifact refresh orchestrator.
 *
 * Priority:
 *   1) ORPHA codes queued from disease-page live checks (refresh-log)
 *   2) Remaining parent/oncogene-contaminated rows (oldest lastTrialCheck first)
 * Cap the refetch batch (default 150), then run zero-trial refresh, derive, audit.
 *
 *   npx tsx scripts/nightly-refresh.ts
 *   npx tsx scripts/nightly-refresh.ts --limit 5
 *   npx tsx scripts/nightly-refresh.ts --limit 150 --zero-limit 50 --skip-zero
 *   npx tsx scripts/nightly-refresh.ts --skip-audit
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  HIGH_FREQUENCY_ONCOGENES,
} from "./lib/query-build";
import {
  appendRefreshLog,
  readQueuedOrphaCodes,
} from "./lib/refresh-log";
import { readArtifact } from "./lib/artifact-io";
import { log } from "./lib/logger";
import type { DiseasesArtifact } from "../src/lib/types";

const GENE = /^[A-Z][A-Z0-9-]{1,9}$/;
const MANIFEST_PATH = path.join(
  process.cwd(),
  "data",
  "analysis",
  "nightly-refetch-manifest.json"
);

function parseArgs(argv: string[]): {
  limit: number;
  zeroLimit: number | null;
  skipZero: boolean;
  skipAudit: boolean;
  skipRefetch: boolean;
  skipDerive: boolean;
} {
  let limit = 150;
  let zeroLimit: number | null = null;
  let skipZero = false;
  let skipAudit = false;
  let skipRefetch = false;
  let skipDerive = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      limit = n;
    } else if (a === "--zero-limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--zero-limit requires a positive integer");
      }
      zeroLimit = n;
    } else if (a === "--skip-zero") {
      skipZero = true;
    } else if (a === "--skip-audit") {
      skipAudit = true;
    } else if (a === "--skip-refetch") {
      skipRefetch = true;
    } else if (a === "--skip-derive") {
      skipDerive = true;
    }
  }
  return { limit, zeroLimit, skipZero, skipAudit, skipRefetch, skipDerive };
}

function runTsx(scriptRel: string, args: string[]): void {
  const script = path.join(process.cwd(), scriptRel);
  log.info(`$ npx tsx ${scriptRel} ${args.join(" ")}`.trim());
  const result = spawnSync(
    "npx",
    ["tsx", script, ...args],
    { stdio: "inherit", cwd: process.cwd(), env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(
      `${scriptRel} exited with status ${result.status ?? "null"}`
    );
  }
}

function isContaminated(d: DiseasesArtifact["diseases"][number]): boolean {
  if (d.queryHealth?.status === "broken") return false;
  if (d.sourceErrors?.trials) return false;
  if (d.trials.total == null || d.trials.total <= 0) return false;
  const recall = d.trials.recallTerms ?? [];
  const nonGene = recall.filter((t) => !GENE.test(String(t)));
  const onco = recall.filter((t) =>
    HIGH_FREQUENCY_ONCOGENES.has(String(t).toUpperCase())
  );
  return nonGene.length > 0 || onco.length > 0;
}

function buildPriorityCodes(
  artifact: DiseasesArtifact,
  limit: number
): { codes: string[]; fromQueue: number; fromContamination: number } {
  const inArtifact = new Set(artifact.diseases.map((d) => d.orphaCode));
  const queued = readQueuedOrphaCodes().filter((c) => inArtifact.has(c));

  const contaminated = artifact.diseases
    .filter(isContaminated)
    .sort((a, b) => {
      const ta = a.lastTrialCheck ? Date.parse(a.lastTrialCheck) : 0;
      const tb = b.lastTrialCheck ? Date.parse(b.lastTrialCheck) : 0;
      return ta - tb; // oldest / never checked first
    })
    .map((d) => d.orphaCode);

  const seen = new Set<string>();
  const codes: string[] = [];
  let fromQueue = 0;
  let fromContamination = 0;

  for (const c of queued) {
    if (codes.length >= limit) break;
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
    fromQueue += 1;
  }
  for (const c of contaminated) {
    if (codes.length >= limit) break;
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
    fromContamination += 1;
  }

  return { codes, fromQueue, fromContamination };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = new Date().toISOString();
  const artifact = readArtifact();

  const { codes, fromQueue, fromContamination } = buildPriorityCodes(
    artifact,
    args.limit
  );

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  const manifest = {
    generatedAt: started,
    limit: args.limit,
    fromQueue,
    fromContamination,
    refetchTrials: codes.map((orphaCode) => ({ orphaCode })),
    codes,
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  log.info(
    `Nightly priority: ${codes.length} codes (queue=${fromQueue}, contamination=${fromContamination}) → ${MANIFEST_PATH}`
  );

  if (!args.skipRefetch && codes.length > 0) {
    runTsx("scripts/refetch-trials.ts", [
      "--codes-from",
      MANIFEST_PATH,
      "--no-cache",
    ]);
  } else if (codes.length === 0) {
    log.info("No priority refetch targets");
  }

  if (!args.skipZero) {
    const zeroArgs =
      args.zeroLimit != null ? ["--limit", String(args.zeroLimit)] : [];
    runTsx("scripts/refresh-zero-trials.ts", zeroArgs);
  }

  if (!args.skipDerive) {
    runTsx("scripts/derive.ts", []);
  }

  if (!args.skipAudit) {
    // Audit exits 1 on ASSERT only; WARN is fine.
    const audit = spawnSync(
      "npx",
      ["tsx", "scripts/audit-artifact.ts", "data/diseases.json"],
      { stdio: "inherit", cwd: process.cwd(), env: process.env }
    );
    if (audit.status !== 0) {
      throw new Error("audit-artifact failed (ASSERT)");
    }
  }

  appendRefreshLog({
    kind: "nightly-refresh",
    ranAt: new Date().toISOString(),
    startedAt: started,
    priorityCount: codes.length,
    fromQueue,
    fromContamination,
    zeroLimit: args.zeroLimit,
    skipZero: args.skipZero,
  });

  log.info("Nightly refresh orchestrator done");
}

try {
  main();
} catch (err) {
  log.error(String(err));
  process.exit(1);
}
