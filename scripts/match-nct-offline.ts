/**
 * Offline NCT ↔ Orphanet matcher (first pass).
 *
 * Exact normalized join of disease name / synonyms / MeSH labels against
 * ClinicalTrials.gov conditions + keywords from the slim dump.
 *
 * Does NOT write data/diseases.json — analysis only under data/analysis/.
 *
 *   node --import tsx scripts/match-nct-offline.ts
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { normalizeTerm } from "./lib/query-build";
import { log } from "./lib/logger";

const STUDIES =
  process.env.NCT_SLIM_PATH ??
  path.join(process.cwd(), "data/nct-inspect/studies-slim.jsonl");
const DISEASES =
  process.env.RARE_SLIM_PATH ??
  path.join(process.cwd(), "data/dumps/rare-diseases-slim.json");
const OUT_DIR = path.join(process.cwd(), "data/analysis/nct-offline-match");

const MIN_TERM_LEN = 5;
/** Terms that hit this many diseases are too ambiguous for auto-assign. */
const MAX_DISEASES_PER_TERM = 8;

interface SlimDisease {
  orphaCode: string;
  name: string;
  nameCorrected: string | null;
  synonyms: string[];
  meshLabels: string[];
  trialsTotal: number | null;
}

interface SlimStudy {
  nctId: string;
  briefTitle: string | null;
  officialTitle: string | null;
  overallStatus: string | null;
  studyType: string | null;
  phases: string[];
  conditions: string[];
  keywords: string[];
  startDate: string | null;
}

interface Hit {
  orphaCode: string;
  nctId: string;
  studyType: string | null;
  overallStatus: string | null;
  briefTitle: string | null;
  matchedTerm: string;
  matchedVia: "condition" | "keyword";
  fieldValue: string;
}

function diseaseTerms(d: SlimDisease): string[] {
  const raw = [
    d.name,
    d.nameCorrected,
    ...d.synonyms,
    ...d.meshLabels,
  ].filter(Boolean) as string[];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const n = normalizeTerm(t);
    if (n.length < MIN_TERM_LEN) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function buildIndex(diseases: SlimDisease[]): {
  termToOrpha: Map<string, Set<string>>;
  ambiguousTerms: string[];
} {
  const termToOrpha = new Map<string, Set<string>>();
  for (const d of diseases) {
    for (const term of diseaseTerms(d)) {
      const set = termToOrpha.get(term) ?? new Set();
      set.add(d.orphaCode);
      termToOrpha.set(term, set);
    }
  }
  const ambiguousTerms: string[] = [];
  for (const [term, set] of Array.from(termToOrpha.entries())) {
    if (set.size > MAX_DISEASES_PER_TERM) {
      ambiguousTerms.push(term);
      termToOrpha.delete(term);
    }
  }
  return { termToOrpha, ambiguousTerms };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(STUDIES)) {
    throw new Error(`Missing NCT slim dump: ${STUDIES}`);
  }
  if (!fs.existsSync(DISEASES)) {
    throw new Error(`Missing rare-disease slim dump: ${DISEASES}`);
  }

  const slim = JSON.parse(fs.readFileSync(DISEASES, "utf8")) as {
    diseases: SlimDisease[];
  };
  const diseases = slim.diseases;
  log.info(`Indexing ${diseases.length} diseases…`);
  const { termToOrpha, ambiguousTerms } = buildIndex(diseases);
  log.info(
    `Index terms=${termToOrpha.size} ambiguousDropped=${ambiguousTerms.length}`
  );

  const byOrpha = new Map<string, Map<string, Hit>>();
  const matchedNct = new Set<string>();
  let studiesRead = 0;
  let studiesWithHit = 0;
  let interventionalMatched = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(STUDIES, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const started = Date.now();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const study = JSON.parse(line) as SlimStudy;
    studiesRead += 1;
    if (!study.nctId) continue;

    let studyHit = false;
    const scan = (
      values: string[] | undefined,
      via: "condition" | "keyword"
    ) => {
      for (const value of values ?? []) {
        const n = normalizeTerm(value);
        if (n.length < MIN_TERM_LEN) continue;
        const orphas = termToOrpha.get(n);
        if (!orphas) continue;
        for (const orphaCode of orphas) {
          studyHit = true;
          const diseaseMap = byOrpha.get(orphaCode) ?? new Map();
          const existing = diseaseMap.get(study.nctId);
          // Prefer condition match over keyword if both fire.
          if (existing && existing.matchedVia === "condition") continue;
          diseaseMap.set(study.nctId, {
            orphaCode,
            nctId: study.nctId,
            studyType: study.studyType,
            overallStatus: study.overallStatus,
            briefTitle: study.briefTitle,
            matchedTerm: n,
            matchedVia: via,
            fieldValue: value,
          });
          byOrpha.set(orphaCode, diseaseMap);
        }
      }
    };

    scan(study.conditions, "condition");
    scan(study.keywords, "keyword");

    if (studyHit) {
      studiesWithHit += 1;
      matchedNct.add(study.nctId);
      if (study.studyType === "INTERVENTIONAL") interventionalMatched += 1;
    }

    if (studiesRead % 100_000 === 0) {
      log.info(
        `  scanned ${studiesRead} studies · matchedNCT=${matchedNct.size} · diseasesHit=${byOrpha.size}`
      );
    }
  }

  const diseaseRows = diseases.map((d) => {
    const hits = Array.from(byOrpha.get(d.orphaCode)?.values() ?? []);
    const interventional = hits.filter((h) => h.studyType === "INTERVENTIONAL");
    return {
      orphaCode: d.orphaCode,
      name: d.name,
      existingTrialsTotal: d.trialsTotal,
      offlineMatchCount: hits.length,
      offlineInterventionalCount: interventional.length,
      deltaVsExisting:
        d.trialsTotal == null
          ? null
          : interventional.length - d.trialsTotal,
      matches: hits
        .sort((a, b) => {
          const ai = a.studyType === "INTERVENTIONAL" ? 0 : 1;
          const bi = b.studyType === "INTERVENTIONAL" ? 0 : 1;
          return ai - bi || a.nctId.localeCompare(b.nctId);
        })
        .slice(0, 50),
      truncated: hits.length > 50,
    };
  });

  diseaseRows.sort(
    (a, b) => b.offlineInterventionalCount - a.offlineInterventionalCount
  );

  const withAny = diseaseRows.filter((r) => r.offlineMatchCount > 0);
  const withInterventional = diseaseRows.filter(
    (r) => r.offlineInterventionalCount > 0
  );
  const existingZeroOfflinePos = diseaseRows.filter(
    (r) => (r.existingTrialsTotal ?? 0) === 0 && r.offlineInterventionalCount > 0
  );
  const existingPosOfflineZero = diseaseRows.filter(
    (r) => (r.existingTrialsTotal ?? 0) > 0 && r.offlineInterventionalCount === 0
  );

  const summary = {
    ranAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    inputs: { studies: STUDIES, diseases: DISEASES },
    rules: {
      minTermLen: MIN_TERM_LEN,
      maxDiseasesPerTerm: MAX_DISEASES_PER_TERM,
      match: "exact normalizeTerm equality on conditions then keywords",
      writesDiseasesJson: false,
    },
    indexTerms: termToOrpha.size,
    ambiguousTermsDropped: ambiguousTerms.length,
    studiesRead,
    studiesWithAnyDiseaseHit: studiesWithHit,
    uniqueNctMatched: matchedNct.size,
    interventionalNctMatched: interventionalMatched,
    diseasesWithAnyHit: withAny.length,
    diseasesWithInterventionalHit: withInterventional.length,
    existingZeroButOfflineInterventional: existingZeroOfflinePos.length,
    existingInterventionalButOfflineZero: existingPosOfflineZero.length,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "ambiguous-terms.json"),
    `${JSON.stringify(ambiguousTerms.sort(), null, 2)}\n`
  );

  const assignmentsPath = path.join(OUT_DIR, "disease-assignments.jsonl");
  const assignOut = fs.createWriteStream(assignmentsPath);
  for (const row of diseaseRows) {
    assignOut.write(`${JSON.stringify(row)}\n`);
  }
  await new Promise<void>((resolve, reject) => {
    assignOut.end(() => resolve());
    assignOut.on("error", reject);
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "top-offline-interventional.json"),
    `${JSON.stringify(withInterventional.slice(0, 40), null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "existing-zero-offline-positive.json"),
    `${JSON.stringify(existingZeroOfflinePos.slice(0, 100), null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "existing-positive-offline-zero.json"),
    `${JSON.stringify(existingPosOfflineZero.slice(0, 100), null, 2)}\n`
  );

  log.info(`Done. ${JSON.stringify(summary)}`);
  log.info(`Wrote ${OUT_DIR}`);
}

main().catch((err) => {
  log.error(String(err));
  process.exit(1);
});
