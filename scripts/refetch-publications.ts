/**
 * Re-fetch Europe PMC publication signals using current phrase + gene
 * expansion rules, then re-derive aggregates.
 *
 * Does NOT write diseases.checkpoint.json — safe alongside a running full ingest.
 *
 *   npx tsx scripts/refetch-publications.ts --codes 694308,324
 *   npx tsx scripts/refetch-publications.ts --codes-from data/analysis/remediation-manifest.json
 *   npx tsx scripts/refetch-publications.ts --full
 *   npx tsx scripts/refetch-publications.ts --full --limit 50
 *   npx tsx scripts/refetch-publications.ts --full --from 100
 *   npx tsx scripts/refetch-publications.ts --full --force   # also re-fetch diseases with no gene expansion
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildPhraseTerms,
  buildPublicationExpansionTerms,
  novelRecallTerms,
  phraseQueryFromTerms,
} from "./lib/query-build";
import {
  europePmcSearchUrl,
  fetchPublicationSignals,
} from "./lib/europepmc";
import { collectExactSynonyms } from "./lib/identifiers";
import { loadMondoHierarchy } from "./lib/mondo";
import { deriveArtifact } from "./lib/derive";
import { readArtifact, writeArtifact } from "./lib/artifact-io";
import { log } from "./lib/logger";
import type { DiseaseRecord } from "../src/lib/types";

function parseArgs(argv: string[]): {
  limit: number | null;
  codes: Set<string> | null;
  full: boolean;
  from: number;
  force: boolean;
} {
  let limit: number | null = null;
  const codes = new Set<string>();
  let full = false;
  let from = 0;
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit requires a positive integer");
      }
      limit = n;
      i += 1;
    } else if (a === "--from") {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 0) {
        throw new Error("--from requires a non-negative integer (0-based index)");
      }
      from = n;
      i += 1;
    } else if (a === "--full") {
      full = true;
    } else if (a === "--force") {
      force = true;
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

  return { limit, codes: codes.size > 0 ? codes : null, full, from, force };
}

function expansionAlreadyInQuery(
  query: string | null | undefined,
  expansion: string[]
): boolean {
  if (!query || expansion.length === 0) return false;
  return expansion.every((t) => query.includes(`"${t}"`));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.full && !args.codes) {
    throw new Error(
      "refetch-publications requires --codes, --codes-from, or --full"
    );
  }

  const artifact = readArtifact();
  const mondo = await loadMondoHierarchy();
  const byCode = new Map(artifact.diseases.map((d) => [d.orphaCode, d]));

  let targets: DiseaseRecord[];
  if (args.full) {
    targets = [...artifact.diseases];
  } else {
    targets = [...(args.codes as Set<string>)]
      .map((c) => byCode.get(c))
      .filter((d): d is DiseaseRecord => Boolean(d));
    const missing = [...(args.codes as Set<string>)].filter(
      (c) => !byCode.has(c)
    );
    if (missing.length) {
      log.warn(
        `ORPHA not in artifact: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`
      );
    }
  }
  if (args.from > 0) {
    if (args.from >= targets.length) {
      throw new Error(
        `--from ${args.from} is past the end of ${targets.length} targets`
      );
    }
    targets = targets.slice(args.from);
    log.info(`Resuming from index ${args.from}`);
  }
  if (args.limit) targets = targets.slice(0, args.limit);

  // Gene-expansion pass: only hit Europe PMC when genes change the query.
  // Explicit --codes / --codes-from always fetch; --force re-fetches everyone.
  const genePassOnly = args.full && !args.force;

  log.info(
    `Re-fetching publications for up to ${targets.length}/${artifact.diseases.length} diseases` +
      (genePassOnly ? " (gene-expansion targets only; use --force for all)" : "")
  );

  let changed = 0;
  let failed = 0;
  let skipped = 0;
  let fetched = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
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
      const diseaseName = d.nameCorrected ?? d.name;
      const pubExpansion = novelRecallTerms(
        phraseTerms,
        buildPublicationExpansionTerms({
          name: diseaseName,
          synonyms: d.synonyms,
          mondoSynonyms,
          genes: d.geneDiseaseValidity.genes,
        })
      );

      if (genePassOnly && pubExpansion.length === 0) {
        skipped += 1;
        if ((i + 1) % 500 === 0) {
          log.info(
            `[${i + 1}/${targets.length}] … skipped ${skipped} (no gene expansion)`
          );
        }
        continue;
      }

      if (
        genePassOnly &&
        expansionAlreadyInQuery(d.query, pubExpansion)
      ) {
        skipped += 1;
        continue;
      }

      log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
      if (dropped.length) {
        log.info(
          `  dropped: ${dropped.map((x) => `${x.term} (${x.reason})`).join("; ")}`
        );
      }
      if (pubExpansion.length) {
        log.info(`  gene expansion: ${pubExpansion.join(" | ")}`);
      }

      // Counts matter for headlines; keep prior researchers + byYear sparkline
      // on the corpus gene pass (author/year series dominate wall time).
      const pubs = await fetchPublicationSignals(
        phraseQuery,
        d.meshLabels,
        pubExpansion,
        genePassOnly
          ? {
              skipAuthors: true,
              skipStrategyCounts: true,
              yearSeriesYears: 0,
            }
          : {}
      );
      fetched += 1;
      const prev = d.publications.total;
      d.query = pubs.effectiveQuery || phraseQuery;
      d.mondoSynonyms = mondoSynonyms;
      d.synonymsDropped = dropped.map((x) => x.term);
      d.publications = {
        total: pubs.total,
        phraseCount: genePassOnly
          ? (d.publications.phraseCount ?? pubs.phraseCount)
          : pubs.phraseCount,
        meshCount: genePassOnly
          ? (d.publications.meshCount ?? pubs.meshCount)
          : pubs.meshCount,
        last10Years: pubs.last10Years,
        byYear:
          genePassOnly && pubs.byYear.length === 0
            ? d.publications.byYear
            : pubs.byYear,
        europePmcUrl: europePmcSearchUrl(pubs.effectiveQuery || phraseQuery),
        meshQuery: pubs.meshQuery || d.publications.meshQuery,
        papersSampledForAuthors: genePassOnly
          ? (d.publications.papersSampledForAuthors ?? 0)
          : pubs.papersSampledForAuthors,
      };
      if (!genePassOnly) {
        d.researchers = {
          distinctCount: pubs.distinctResearchers,
          top: pubs.topAuthors,
        };
      }
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
      log.warn(
        `[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} FAILED: ${String(err)}`
      );
      d.sourceErrors = {
        ...(d.sourceErrors ?? {}),
        publications: String(err),
      };
    }

    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      writeArtifact(artifact);
      log.info(
        `  checkpointed artifact (${i + 1}/${targets.length}; fetched=${fetched} skipped=${skipped} changed=${changed})`
      );
    }
  }

  const derived = deriveArtifact(artifact);
  writeArtifact(derived);
  log.info(
    `Done. fetched=${fetched} skipped=${skipped} changed=${changed} failed=${failed}. Wrote diseases.json + .gz`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
