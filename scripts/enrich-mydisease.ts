/**
 * Enrich diseases with MyDisease.info CTD chemicals/pathways + HPO sample.
 *
 *   npx tsx scripts/enrich-mydisease.ts
 *   npx tsx scripts/enrich-mydisease.ts --limit 50
 *   npx tsx scripts/enrich-mydisease.ts --codes 324,558
 */
import {
  fetchMyDiseaseBatch,
  mondoCurie,
  summarizeMyDisease,
} from "./lib/mydisease";
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

  log.info(
    `MyDisease enrich: ${targets.length}/${artifact.diseases.length} diseases`
  );

  const mondoIds = targets
    .map((d) => (d.mondoIds?.[0] ? mondoCurie(d.mondoIds[0]) : null))
    .filter((x): x is string => Boolean(x));
  log.info(`Fetching MyDisease batches for ${mondoIds.length} Mondo IDs…`);
  const hits = await fetchMyDiseaseBatch(mondoIds);

  let ok = 0;
  let withChems = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    const mondoId = d.mondoIds?.[0] ? mondoCurie(d.mondoIds[0]) : null;
    const hit = mondoId ? hits.get(mondoId) ?? null : null;
    d.mydisease = summarizeMyDisease(hit, mondoId);
    ok += 1;
    if (d.mydisease.chemicalCount > 0) withChems += 1;
    if ((i + 1) % 500 === 0 || i === targets.length - 1) {
      log.info(
        `  progress ${i + 1}/${targets.length} (with chemicals=${withChems})`
      );
      writeArtifact(deriveArtifact(artifact));
    }
  }

  artifact.sourceVersions = {
    ...artifact.sourceVersions,
    mydiseaseEnrichedAt: new Date().toISOString(),
  };
  writeArtifact(deriveArtifact(artifact));
  log.info(
    `Done. ok=${ok} withChemicals=${withChems}. Wrote diseases.json + .gz`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
