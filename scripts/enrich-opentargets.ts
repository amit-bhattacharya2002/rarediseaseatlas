/**
 * Enrich diseases with Open Targets drugs / clinical candidates (Mondo ID).
 *
 *   npx tsx scripts/enrich-opentargets.ts
 *   npx tsx scripts/enrich-opentargets.ts --limit 50
 *   npx tsx scripts/enrich-opentargets.ts --codes 324,558
 */
import { fetchOpenTargetsDrugs } from "./lib/opentargets";
import { mondoCurie } from "./lib/mydisease";
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
    `Open Targets enrich: ${targets.length}/${artifact.diseases.length} diseases`
  );

  let ok = 0;
  let withDrugs = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    const mondoId = d.mondoIds?.[0] ? mondoCurie(d.mondoIds[0]) : null;
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    try {
      if (!mondoId) {
        d.openTargets = {
          fetchedAt: new Date().toISOString(),
          efoId: null,
          drugCount: 0,
          drugs: [],
        };
      } else {
        d.openTargets = await fetchOpenTargetsDrugs(mondoId);
      }
      ok += 1;
      if ((d.openTargets.drugCount ?? 0) > 0) withDrugs += 1;
      log.info(
        `  drugs=${d.openTargets.drugCount}` +
          (d.openTargets.drugs[0] ? ` e.g. ${d.openTargets.drugs[0].name}` : "")
      );
    } catch (err) {
      failed += 1;
      log.warn(`  Open Targets failed: ${String(err)}`);
      d.openTargets = d.openTargets ?? null;
    }
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      writeArtifact(deriveArtifact(artifact));
      log.info(`  checkpoint ${i + 1}/${targets.length}`);
    }
  }

  artifact.sourceVersions = {
    ...artifact.sourceVersions,
    openTargetsEnrichedAt: new Date().toISOString(),
  };
  writeArtifact(deriveArtifact(artifact));
  log.info(
    `Done. ok=${ok} withDrugs=${withDrugs} failed=${failed}. Wrote diseases.json + .gz`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
