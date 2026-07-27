/**
 * Re-fetch Europe PMC publication signals for selected diseases using current
 * phrase-term rules (ontology-speak filtered via buildPhraseTerms), then
 * re-derive aggregates.
 *
 * Does NOT write diseases.checkpoint.json — safe alongside a running full ingest.
 *
 *   npx tsx scripts/refetch-publications.ts --codes 390,533,863,99828,3336
 *   npx tsx scripts/refetch-publications.ts --codes-from data/analysis/remediation-manifest.json
 */
import fs from "node:fs";
import path from "node:path";
import { buildPhraseTerms, phraseQueryFromTerms } from "./lib/query-build";
import {
  europePmcSearchUrl,
  fetchPublicationSignals,
} from "./lib/europepmc";
import { collectExactSynonyms } from "./lib/identifiers";
import { loadMondoHierarchy } from "./lib/mondo";
import { deriveArtifact } from "./lib/derive";
import { log } from "./lib/logger";
import type { DiseasesArtifact } from "../src/lib/types";

function parseArgs(argv: string[]): {
  limit: number | null;
  codes: Set<string> | null;
} {
  let limit: number | null = null;
  const codes = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      limit = n;
      i += 1;
    } else if (a === "--codes") {
      const raw = argv[i + 1];
      if (!raw) throw new Error("--codes requires a comma-separated ORPHA list");
      for (const part of raw.split(",")) {
        const c = part.trim();
        if (c) codes.add(c);
      }
      i += 1;
    } else if (a === "--codes-from") {
      const file = argv[i + 1];
      if (!file) throw new Error("--codes-from requires a JSON path");
      const abs = path.isAbsolute(file)
        ? file
        : path.join(process.cwd(), file);
      const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as {
        refetchPublications?: { orphaCode: string }[];
        codes?: string[];
      };
      if (Array.isArray(raw.refetchPublications)) {
        for (const row of raw.refetchPublications) {
          if (row?.orphaCode) codes.add(String(row.orphaCode));
        }
      } else if (Array.isArray(raw.codes)) {
        for (const c of raw.codes) codes.add(String(c));
      } else {
        throw new Error(
          `--codes-from ${file}: expected { refetchPublications: [{ orphaCode }] } or { codes: string[] }`
        );
      }
      i += 1;
    }
  }

  return { limit, codes: codes.size > 0 ? codes : null };
}

function writeAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.codes) {
    throw new Error(
      "refetch-publications requires --codes or --codes-from (refusing a full 300 pub re-fetch by accident)"
    );
  }

  const artifactPath = path.join(process.cwd(), "data", "diseases.json");
  const artifact = JSON.parse(
    fs.readFileSync(artifactPath, "utf8")
  ) as DiseasesArtifact;

  const mondo = await loadMondoHierarchy();
  const byCode = new Map(artifact.diseases.map((d) => [d.orphaCode, d]));
  let targets = [...args.codes]
    .map((c) => byCode.get(c))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  const missing = [...args.codes].filter((c) => !byCode.has(c));
  if (missing.length) {
    log.warn(
      `ORPHA not in artifact: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`
    );
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  log.info(
    `Re-fetching publications for ${targets.length}/${artifact.diseases.length} diseases`
  );

  let changed = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    try {
      const nameTerms = d.nameCorrected ? [d.name, d.nameCorrected] : [d.name];
      const liveMondoSyn = collectExactSynonyms(d.mondoIds, mondo);
      const mondoSynonyms =
        liveMondoSyn.length > 0 ? liveMondoSyn : d.mondoSynonyms;
      const allSyn = [...d.synonyms, ...mondoSynonyms];
      const { terms: phraseTerms, dropped } = buildPhraseTerms(
        nameTerms,
        allSyn
      );
      const phraseQuery = phraseQueryFromTerms(phraseTerms);
      if (dropped.length) {
        log.info(
          `  dropped: ${dropped.map((x) => `${x.term} (${x.reason})`).join("; ")}`
        );
      }

      const pubs = await fetchPublicationSignals(phraseQuery, d.meshLabels);
      const prev = d.publications.total;
      d.query = pubs.effectiveQuery || phraseQuery;
      d.mondoSynonyms = mondoSynonyms;
      d.synonymsDropped = dropped.map((x) => x.term);
      d.publications = {
        total: pubs.total,
        phraseCount: pubs.phraseCount,
        meshCount: pubs.meshCount,
        last10Years: pubs.last10Years,
        byYear: pubs.byYear,
        europePmcUrl: europePmcSearchUrl(pubs.effectiveQuery || phraseQuery),
        meshQuery: pubs.meshQuery,
        papersSampledForAuthors: pubs.papersSampledForAuthors,
      };
      d.researchers = {
        distinctCount: pubs.distinctResearchers,
        top: pubs.topAuthors,
      };
      if (d.sourceErrors?.publications) {
        const nextErrors = { ...d.sourceErrors };
        delete nextErrors.publications;
        d.sourceErrors =
          nextErrors.trials != null ? { trials: nextErrors.trials } : null;
      }

      if (prev !== pubs.total) changed += 1;
      log.info(`  pubs ${prev} → ${pubs.total}`);
    } catch (err) {
      failed += 1;
      log.warn(`  FAILED: ${String(err)}`);
      d.sourceErrors = {
        ...(d.sourceErrors ?? {}),
        publications: String(err),
      };
    }

    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      writeAtomic(artifactPath, artifact);
      log.info(`  checkpointed publish artifact (${i + 1}/${targets.length})`);
    }
  }

  const derived = deriveArtifact(artifact);
  writeAtomic(artifactPath, derived);
  log.info(
    `Done. changed=${changed} failed=${failed}. Wrote ${artifactPath} (checkpoint untouched).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
