/**
 * Enrich diseases with FDA + EMA orphan-drug designations (UMLS / name join).
 *
 *   npx tsx scripts/enrich-orphan.ts
 *   npx tsx scripts/enrich-orphan.ts --limit 100
 */
import {
  loadEmaOrphanIndex,
  loadFdaOrphanIndex,
  matchEmaOrphanDesignations,
  matchFdaOrphanDesignations,
  mergeOrphanDesignations,
} from "./lib/orphan-designation";
import { deriveArtifact } from "./lib/derive";
import { readArtifact, writeArtifact } from "./lib/artifact-io";
import { log } from "./lib/logger";

function parseArgs(argv: string[]): {
  limit: number | null;
  codes: Set<string> | null;
} {
  let limit: number | null = null;
  const codes = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n <= 0)
        throw new Error("--limit needs a positive integer");
      limit = n;
    } else if (a === "--codes") {
      for (const part of (argv[++i] ?? "").split(",")) {
        const c = part.trim();
        if (c) codes.add(c);
      }
    }
  }
  return { limit, codes: codes.size ? codes : null };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const artifact = readArtifact();
  let targets = artifact.diseases;
  if (args.codes) targets = targets.filter((d) => args.codes!.has(d.orphaCode));
  if (args.limit) targets = targets.slice(0, args.limit);

  log.info(`Loading FDA + EMA orphan designation indexes…`);
  const [fdaIndex, emaIndex] = await Promise.all([
    loadFdaOrphanIndex(),
    loadEmaOrphanIndex(),
  ]);
  log.info(
    `Orphan enrich: ${targets.length}/${artifact.diseases.length} diseases`
  );

  let matched = 0;
  let emaMatched = 0;
  const fetchedAt = new Date().toISOString();
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    const fda = matchFdaOrphanDesignations(d, fdaIndex);
    const emaRows = matchEmaOrphanDesignations(d, emaIndex);
    if (emaRows.length) emaMatched += 1;
    d.orphanDesignation = mergeOrphanDesignations(fda, emaRows, fetchedAt);
    if (d.orphanDesignation.matched) matched += 1;
    if ((i + 1) % 1000 === 0 || i === targets.length - 1) {
      log.info(
        `  progress ${i + 1}/${targets.length} (matched=${matched}, ema=${emaMatched})`
      );
      writeArtifact(deriveArtifact(artifact));
    }
  }

  artifact.sourceVersions = {
    ...artifact.sourceVersions,
    orphanDesignationEnrichedAt: fetchedAt,
    orphanDesignationSource: "fda-oopd-mirror+ema-json",
  };
  writeArtifact(deriveArtifact(artifact));
  log.info(
    `Done. matched=${matched}/${targets.length} (ema hits=${emaMatched}). Wrote diseases.json + .gz`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
