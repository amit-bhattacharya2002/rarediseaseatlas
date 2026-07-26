import { writeBinaryCache, readBinaryCache } from "./cache";
import { fetchText } from "./http";
import { log } from "./logger";
import type { GenCCClassification } from "../../src/lib/types";

export const GENCC_TSV_URL =
  "https://thegencc.org/download/action/submissions-export-tsv";

const RANK: Record<string, number> = {
  Definitive: 7,
  Strong: 6,
  Moderate: 5,
  Limited: 4,
  "Animal Model Only": 3,
  Disputed: 2,
  Refuted: 1,
  "No Known Disease Relationship": 0,
};

export interface GenCCIndex {
  byMondo: Map<string, { classification: GenCCClassification; genes: Set<string> }>;
  /** Local download/parse timestamp */
  fetchedAt: string;
  /** Stable-ish fingerprint from data: max submitted_run_date in the TSV */
  dataVersion: string;
}

function normalizeClassification(raw: string): GenCCClassification {
  const t = raw.trim();
  if (t in RANK) return t as GenCCClassification;
  // Common variants
  if (/definitive/i.test(t)) return "Definitive";
  if (/^strong$/i.test(t)) return "Strong";
  if (/moderate/i.test(t)) return "Moderate";
  if (/limited/i.test(t)) return "Limited";
  if (/disputed/i.test(t)) return "Disputed";
  if (/refuted/i.test(t)) return "Refuted";
  if (/animal/i.test(t)) return "Animal Model Only";
  if (/no known/i.test(t)) return "No Known Disease Relationship";
  return "None";
}

function parseTsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line) => line.split("\t"));
}

export async function loadGenCC(): Promise<GenCCIndex> {
  const cacheFile = "gencc-submissions.tsv";
  let body: string;
  const cached = readBinaryCache(cacheFile);
  if (cached) {
    log.info("Using cached GenCC TSV");
    body = cached.toString("utf8");
  } else {
    log.info(`Downloading GenCC TSV from ${GENCC_TSV_URL}`);
    body = await fetchText(GENCC_TSV_URL, { timeoutMs: 180_000 });
    writeBinaryCache(cacheFile, Buffer.from(body, "utf8"));
  }

  const rows = parseTsv(body);
  if (rows.length < 2) {
    throw new Error("GenCC TSV is empty or unreadable");
  }

  const header = rows[0];
  const diseaseCurieIdx = header.indexOf("disease_curie");
  const classTitleIdx = header.indexOf("classification_title");
  const geneSymbolIdx = header.indexOf("gene_symbol");
  // Also accept ORPHA via disease_original_curie
  const originalCurieIdx = header.indexOf("disease_original_curie");
  const runDateIdx = header.indexOf("submitted_run_date");

  if (diseaseCurieIdx < 0 || classTitleIdx < 0 || geneSymbolIdx < 0) {
    throw new Error(
      `GenCC TSV columns changed. Expected disease_curie, classification_title, gene_symbol. Got: ${header.join(", ")}`
    );
  }

  const byMondo = new Map<
    string,
    { classification: GenCCClassification; genes: Set<string> }
  >();
  const byOrpha = new Map<
    string,
    { classification: GenCCClassification; genes: Set<string> }
  >();
  let maxRunDate = "";

  for (const row of rows.slice(1)) {
    if (runDateIdx >= 0) {
      const rd = (row[runDateIdx] ?? "").trim();
      // Only ISO dates — some rows are tab-misaligned and put UUIDs in this column
      if (/^\d{4}-\d{2}-\d{2}/.test(rd) && rd > maxRunDate) maxRunDate = rd;
    }
    const diseaseCurie = (row[diseaseCurieIdx] ?? "").trim();
    const classification = normalizeClassification(row[classTitleIdx] ?? "");
    const gene = (row[geneSymbolIdx] ?? "").trim();
    if (!diseaseCurie || classification === "None") continue;

    const apply = (
      map: Map<string, { classification: GenCCClassification; genes: Set<string> }>,
      key: string
    ) => {
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          classification,
          genes: new Set(gene ? [gene] : []),
        });
        return;
      }
      if ((RANK[classification] ?? -1) > (RANK[existing.classification] ?? -1)) {
        existing.classification = classification;
      }
      if (gene) existing.genes.add(gene);
    };

    if (diseaseCurie.startsWith("MONDO:")) {
      apply(byMondo, diseaseCurie);
    }
    if (originalCurieIdx >= 0) {
      const original = (row[originalCurieIdx] ?? "").trim();
      const orphaMatch = original.match(/ORPHA:?(\d+)/i);
      if (orphaMatch) apply(byOrpha, orphaMatch[1]);
    }
  }

  // Store ORPHA lookups under synthetic keys
  for (const [code, val] of byOrpha) {
    byMondo.set(`ORPHA:${code}`, val);
  }

  const dataVersion = maxRunDate
    ? `max_submitted_run_date=${maxRunDate}`
    : `rows=${rows.length - 1}`;
  log.info(`GenCC index: ${byMondo.size} disease keys (${dataVersion})`);
  return {
    byMondo,
    fetchedAt: new Date().toISOString(),
    dataVersion,
  };
}

export function lookupGenCC(
  index: GenCCIndex,
  mondoIds: string[],
  orphaCode: string
): { classification: GenCCClassification; genes: string[] } {
  let bestClass: GenCCClassification | null = null;
  const genes = new Set<string>();

  const consider = (key: string) => {
    const hit = index.byMondo.get(key);
    if (!hit) return;
    const hitRank = RANK[hit.classification] ?? -1;
    const bestRank = bestClass ? (RANK[bestClass] ?? -1) : -1;
    if (bestClass == null || hitRank > bestRank) {
      bestClass = hit.classification;
      genes.clear();
      for (const g of hit.genes) genes.add(g);
    } else if (hit.classification === bestClass) {
      for (const g of hit.genes) genes.add(g);
    }
  };

  for (const m of mondoIds) consider(m);
  consider(`ORPHA:${orphaCode}`);

  if (!bestClass) return { classification: "None", genes: [] };
  return {
    classification: bestClass,
    genes: [...genes].sort(),
  };
}
