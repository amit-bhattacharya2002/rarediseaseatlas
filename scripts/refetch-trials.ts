/**
 * Re-fetch ClinicalTrials.gov signals for every disease in data/diseases.json
 * using the current recall-expansion rules and parent-category tier, then
 * re-derive aggregates.
 *
 *   npx tsx scripts/refetch-trials.ts
 *   npx tsx scripts/refetch-trials.ts --limit 20
 *   npx tsx scripts/refetch-trials.ts --codes-from data/analysis/remediation-manifest.json
 *   npx tsx scripts/refetch-trials.ts --codes 100020,2612
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildPhraseTerms,
  buildRecallExpansionTerms,
  capRecallGenes,
  novelRecallTerms,
  parentCategoryLabelForTrials,
  parentLabelsForRecall,
} from "./lib/query-build";
import {
  fetchParentCategoryTrials,
  fetchTrialSignals,
} from "./lib/trials";
import { loadMondoHierarchy } from "./lib/mondo";
import { collectExactSynonyms } from "./lib/identifiers";
import { deriveArtifact } from "./lib/derive";
import { log } from "./lib/logger";
import type { DiseasesArtifact, MatchStrategy } from "../src/lib/types";

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
        refetchTrials?: { orphaCode: string }[];
        codes?: string[];
      };
      if (Array.isArray(raw.refetchTrials)) {
        for (const row of raw.refetchTrials) {
          if (row?.orphaCode) codes.add(String(row.orphaCode));
        }
      } else if (Array.isArray(raw.codes)) {
        for (const c of raw.codes) codes.add(String(c));
      } else {
        throw new Error(
          `--codes-from ${file}: expected { refetchTrials: [{ orphaCode }] } or { codes: string[] }`
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
  const artifactPath = path.join(process.cwd(), "data", "diseases.json");
  const artifact = JSON.parse(
    fs.readFileSync(artifactPath, "utf8")
  ) as DiseasesArtifact;

  const mondo = await loadMondoHierarchy();

  let targets = artifact.diseases;
  if (args.codes) {
    const byCode = new Map(artifact.diseases.map((d) => [d.orphaCode, d]));
    const missing: string[] = [];
    targets = [];
    for (const code of args.codes) {
      const d = byCode.get(code);
      if (!d) missing.push(code);
      else targets.push(d);
    }
    if (missing.length) {
      log.warn(`--codes-from/--codes: ${missing.length} ORPHA not in artifact: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
    }
  }
  if (args.limit) targets = targets.slice(0, args.limit);
  log.info(`Re-fetching trials for ${targets.length}/${artifact.diseases.length} diseases`);

  let changed = 0;
  let failed = 0;
  let parentTiers = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const d = targets[i];
    log.info(`[${i + 1}/${targets.length}] ORPHA:${d.orphaCode} ${d.name}`);
    try {
      const nameTerms = d.nameCorrected ? [d.name, d.nameCorrected] : [d.name];
      const allSyn = [...d.synonyms, ...d.mondoSynonyms];
      const { terms: phraseTerms } = buildPhraseTerms(nameTerms, allSyn);
      const diseaseName = d.nameCorrected ?? d.name;
      const parentLabels = parentLabelsForRecall(
        d.mondoIds,
        (id, maxDepth) => mondo.ancestors(id, maxDepth),
        (id) => mondo.label(id),
        diseaseName
      );
      // Prefer Mondo synonyms from live ontology when available.
      const liveMondoSyn = collectExactSynonyms(d.mondoIds, mondo);
      let recallTerms = novelRecallTerms(
        phraseTerms,
        buildRecallExpansionTerms({
          name: diseaseName,
          synonyms: d.synonyms,
          mondoSynonyms: liveMondoSyn.length > 0 ? liveMondoSyn : d.mondoSynonyms,
          parentLabels,
          genes: d.geneDiseaseValidity.genes,
        })
      );

      let trials = await fetchTrialSignals(phraseTerms, d.meshLabels, recallTerms);
      if (!trials.fullyScanned) {
        const safe = novelRecallTerms(
          phraseTerms,
          capRecallGenes(d.geneDiseaseValidity.genes)
        );
        log.warn(
          `  incomplete scan; retrying gene-only recall [${safe.join(" | ")}]`
        );
        trials = await fetchTrialSignals(phraseTerms, d.meshLabels, safe);
        recallTerms = safe;
        if (!trials.fullyScanned) {
          throw new Error("incomplete ClinicalTrials.gov scan after safe retry");
        }
      }

      let parentCategory: (typeof d.trials)["parentCategory"] = null;
      const parentLabel = parentCategoryLabelForTrials(
        d.mondoIds,
        (id, maxDepth) => mondo.ancestors(id, maxDepth),
        (id) => mondo.label(id),
        diseaseName
      );
      if (parentLabel) {
        try {
          parentCategory = await fetchParentCategoryTrials(
            parentLabel,
            trials.matchedStudies.map((study) => study.nctId)
          );
          if ((parentCategory.total ?? 0) > 0) parentTiers += 1;
          if (!parentCategory.fullyScanned) {
            log.warn(
              `  parent-category scan incomplete for "${parentLabel}" (specific tier kept)`
            );
          }
        } catch (parentErr) {
          log.warn(
            `  parent-category fetch failed for "${parentLabel}": ${String(parentErr)}`
          );
          parentCategory = null;
        }
      }

      const prev = d.trials.total;
      d.trials = {
        ...d.trials,
        total: trials.total,
        recruitingCount: trials.recruitingCount,
        recruiting: trials.recruiting,
        registeredStudiesTotal: trials.registeredStudiesTotal,
        observationalTotal: trials.observationalTotal,
        observationalRecruitingCount: trials.observationalRecruitingCount,
        observational: trials.observationalRecruiting,
        expandedAccessTotal: trials.expandedAccessTotal,
        generalRegistries: trials.generalRegistries,
        query: trials.query,
        recallTerms,
        fullyScanned: trials.fullyScanned,
        matchedVia: trials.matchedVia,
        parentCategory,
      };

      const attempted = new Set<MatchStrategy>(
        d.queryHealth.strategiesAttempted.filter(
          (s) => s !== "recall-expansion"
        ) as MatchStrategy[]
      );
      if (recallTerms.length > 0) attempted.add("recall-expansion");
      const withHits = new Set<MatchStrategy>(
        d.queryHealth.strategiesWithHits.filter(
          (s) => s !== "recall-expansion"
        ) as MatchStrategy[]
      );
      // Rebuild trial strategy hits from this fetch; keep prior pub hits.
      for (const s of d.queryHealth.strategiesWithHits) {
        if (s === "phrase" || s === "mesh" || s === "corrected-name") {
          withHits.add(s);
        }
      }
      for (const s of trials.queryStrategiesWithHits) withHits.add(s);
      d.queryHealth = {
        ...d.queryHealth,
        strategiesAttempted: [...attempted],
        strategiesWithHits: [...withHits],
      };

      if (d.sourceErrors?.trials) {
        const { trials: _t, ...rest } = d.sourceErrors;
        d.sourceErrors = Object.keys(rest).length
          ? (rest as typeof d.sourceErrors)
          : null;
      }

      const parentNote = parentCategory
        ? `; parent="${parentCategory.label}" n=${parentCategory.total}`
        : "";
      if (prev !== trials.total) {
        changed += 1;
        log.info(
          `  trials ${prev} → ${trials.total}; recall=[${recallTerms.join(" | ")}]${parentNote}`
        );
      } else {
        log.info(
          `  trials ${trials.total} (unchanged); recall=[${recallTerms.join(" | ")}]${parentNote}`
        );
      }
    } catch (err) {
      failed += 1;
      log.fail(`ORPHA:${d.orphaCode}: ${String(err)}`);
      d.sourceErrors = {
        ...(d.sourceErrors ?? {}),
        trials: String(err),
      };
      d.trials = {
        ...d.trials,
        total: null,
        recruitingCount: null,
        registeredStudiesTotal: null,
        observationalTotal: null,
        observationalRecruitingCount: null,
        expandedAccessTotal: null,
        fullyScanned: false,
        parentCategory: null,
      };
    }

    if ((i + 1) % 25 === 0) {
      writeAtomic(artifactPath, deriveArtifact(artifact));
      log.info(`  checkpoint wrote through ${i + 1}`);
    }
  }

  const derived = deriveArtifact(artifact);
  writeAtomic(artifactPath, derived);
  const a = derived.aggregate;
  const pct =
    a.trialsDenominator > 0
      ? ((100 * a.noTrials) / a.trialsDenominator).toFixed(1)
      : "n/a";
  const inclusivePct =
    a.trialsDenominator > 0
      ? ((100 * a.noTrialsParentInclusive) / a.trialsDenominator).toFixed(1)
      : "n/a";
  log.info(
    `Done. changed=${changed} failed=${failed} parentTiersWithHits=${parentTiers}. No trials ${a.noTrials}/${a.trialsDenominator} (${pct}%); parent-inclusive zeros ${a.noTrialsParentInclusive} (${inclusivePct}%)`
  );
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
