/**
 * Part 0 — verify suspected Orphanet label defects against the raw cached
 * product XML (read-only). Does not download, does not touch live ingest
 * artifacts (data/diseases.json), and does not hit external APIs.
 *
 *   npx tsx scripts/verify-defects.ts
 *
 * Writes data/defect-provenance.json
 */
import fs from "node:fs";
import path from "node:path";

const CACHE_PRODUCT1 = path.join(process.cwd(), ".cache", "en_product1.xml");
const SAMPLE_ARTIFACT = path.join(
  process.cwd(),
  "data",
  "diseases.sample300-seed42.json"
);
const OUT_PATH = path.join(process.cwd(), "data", "defect-provenance.json");

interface SuspectedDefect {
  orphaCode: string;
  kind: "misspelling" | "missing-word-boundary";
  suspectedForm: string;
  note: string;
}

const SUSPECTED: SuspectedDefect[] = [
  {
    orphaCode: "693869",
    kind: "misspelling",
    suspectedForm: "Gallblader",
    note: 'Preferred label spelling "Gallblader" vs standard "gallbladder".',
  },
  {
    orphaCode: "658595",
    kind: "missing-word-boundary",
    suspectedForm: "microcephalicdwarfism",
    note: 'Suspected glued form "microcephalicdwarfism" in preferred label.',
  },
  {
    orphaCode: "293621",
    kind: "missing-word-boundary",
    suspectedForm: "cornealdystrophy",
    note: 'Suspected glued form "cornealdystrophy" in preferred label.',
  },
  {
    orphaCode: "53583",
    kind: "misspelling",
    suspectedForm: "choreathetosis",
    note: 'Preferred label uses "choreathetosis"; synonym uses "choreoathetosis".',
  },
  {
    orphaCode: "436159",
    kind: "misspelling",
    suspectedForm: "haploinsuffiency",
    note: 'Preferred label spelling "haploinsuffiency" vs "haploinsufficiency".',
  },
];

/**
 * Suspected missing word boundary in the sense of the two catalogue examples:
 * an adjectival ending (-ic/-al/-ous/-ar) immediately followed by a disease head
 * with no space or hyphen — e.g. "microcephalicdwarfism", "cornealdystrophy".
 * Excludes established single-token compounds (chondrodystrophy, lipoatrophy).
 */
function hasMissingWordBoundary(label: string): boolean {
  return /(?:ic|al|ous|ar)(dwarfism|dystrophy|disease|syndrome|deficiency|malformation)\b/i.test(
    label
  );
}

const MISSPELLING_PATTERNS: Array<{
  id: string;
  re: RegExp;
  description: string;
}> = [
  {
    id: "gallblader",
    re: /\bgallblader\b/i,
    description: '"gallblader" (missing second "d")',
  },
  {
    id: "haploinsuffiency",
    re: /\bhaploinsuffiency\b/i,
    description: '"haploinsuffiency" (missing "c")',
  },
  {
    id: "choreathetosis-not-choreo",
    re: /\bchoreathetosis\b/i,
    description:
      '"choreathetosis" (vs "choreoathetosis"; report occurrence, not clinical correctness)',
  },
];

interface DisorderLabels {
  orphaCode: string;
  name: string;
  synonyms: string[];
}

interface DefectRow {
  orphaCode: string;
  kind: string;
  suspectedForm: string;
  rawSourceLabel: string;
  rawSynonyms: string[];
  parsedLabel: string | null;
  origin: "upstream" | "parser" | "not-reproduced";
  note: string;
}

function extractJdborMeta(xml: string): { date: string; version: string } {
  const m = xml.match(
    /<JDBOR\s+date="([^"]*)"\s+version="([^"]*)"/
  );
  return {
    date: m?.[1] ?? "unknown",
    version: m?.[2] ?? "unknown",
  };
}

/** Lightweight extract of OrphaCode + preferred Name + Synonyms from product1. */
function extractDisorders(xml: string): Map<string, DisorderLabels> {
  const out = new Map<string, DisorderLabels>();
  // Split on Disorder open tags that carry an id= attribute (top-level disorders).
  const chunks = xml.split(/<Disorder id="/);
  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    // Stop at next top-level sibling roughly — take until </Disorder> that closes this block.
    // Nested Disorder elements are rare inside; use first OrphaCode/Name pair.
    const code = chunk.match(/<OrphaCode>(\d+)<\/OrphaCode>/)?.[1];
    const name = chunk.match(/<Name lang="en">([^<]*)<\/Name>/)?.[1];
    if (!code || !name) continue;
    // Decode a few XML entities that appear in labels.
    const decodedName = decodeXml(name);
    const synBlock = chunk.match(
      /<SynonymList[^>]*>([\s\S]*?)<\/SynonymList>/
    )?.[1];
    const synonyms: string[] = [];
    if (synBlock) {
      for (const sm of synBlock.matchAll(
        /<Synonym lang="en">([^<]*)<\/Synonym>/g
      )) {
        synonyms.push(decodeXml(sm[1]));
      }
    }
    // Prefer first occurrence (canonical Disorder row).
    if (!out.has(code)) {
      out.set(code, { orphaCode: code, name: decodedName, synonyms });
    }
  }
  return out;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

function loadParsedLabels(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(SAMPLE_ARTIFACT)) {
    console.warn(
      `Sample artifact missing at ${SAMPLE_ARTIFACT}; parsedLabel will be null for all rows.`
    );
    return map;
  }
  const artifact = JSON.parse(fs.readFileSync(SAMPLE_ARTIFACT, "utf8")) as {
    diseases: Array<{ orphaCode: string; name: string }>;
  };
  for (const d of artifact.diseases) {
    map.set(d.orphaCode, d.name);
  }
  return map;
}

function classifySuspected(
  suspect: SuspectedDefect,
  raw: DisorderLabels | undefined,
  parsedLabel: string | null
): DefectRow {
  if (!raw) {
    return {
      orphaCode: suspect.orphaCode,
      kind: suspect.kind,
      suspectedForm: suspect.suspectedForm,
      rawSourceLabel: "",
      rawSynonyms: [],
      parsedLabel,
      origin: "not-reproduced",
      note: `${suspect.note} OrphaCode not found in cached product1 XML.`,
    };
  }

  const form = suspect.suspectedForm;
  const formRe = new RegExp(
    form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );
  const inRawPreferred = formRe.test(raw.name);
  const inRawSynonym = raw.synonyms.some((s) => formRe.test(s));
  const inRawAny = inRawPreferred || inRawSynonym;
  const inParsed = parsedLabel != null ? formRe.test(parsedLabel) : false;

  let origin: DefectRow["origin"];
  let note = suspect.note;

  if (inRawPreferred) {
    if (parsedLabel == null) {
      origin = "upstream";
      note +=
        " Present in raw preferred Name; code absent from sample artifact so parse comparison skipped.";
    } else if (parsedLabel === raw.name) {
      origin = "upstream";
      note +=
        " Raw preferred Name equals our parsed label — form is upstream, not introduced by the parser.";
    } else if (inParsed) {
      origin = "upstream";
      note +=
        " Form present in both raw preferred Name and parsed label (labels differ in other ways).";
    } else {
      // Raw has it, parser somehow removed it — still upstream content; parser did not invent it.
      origin = "upstream";
      note += ` Raw preferred Name contains the form; parsed label differs ("${parsedLabel}").`;
    }
  } else if (inParsed && !inRawAny) {
    origin = "parser";
    note +=
      " Form appears only in the parsed label — not in raw Name or Synonyms.";
  } else if (inRawSynonym && !inRawPreferred) {
    origin = "upstream";
    note +=
      " Form appears in a Synonym only (not preferred Name). Still upstream source text.";
  } else {
    origin = "not-reproduced";
    note += ` Not found in raw preferred Name ("${raw.name}") or synonyms [${raw.synonyms.join("; ") || "none"}].`;
  }

  return {
    orphaCode: suspect.orphaCode,
    kind: suspect.kind,
    suspectedForm: suspect.suspectedForm,
    rawSourceLabel: raw.name,
    rawSynonyms: raw.synonyms,
    parsedLabel,
    origin,
    note,
  };
}

function scanCorpus(disorders: Map<string, DisorderLabels>): {
  missingWordBoundary: {
    countPreferred: number;
    countAnyLabel: number;
    examples: Array<{ orphaCode: string; label: string; field: string }>;
  };
  misspellings: Record<
    string,
    {
      description: string;
      countPreferred: number;
      countAnyLabel: number;
      examples: Array<{ orphaCode: string; label: string; field: string }>;
    }
  >;
} {
  const boundaryExamples: Array<{
    orphaCode: string;
    label: string;
    field: string;
  }> = [];
  let boundaryPreferred = 0;
  let boundaryAny = 0;

  const misspellings: Record<
    string,
    {
      description: string;
      countPreferred: number;
      countAnyLabel: number;
      examples: Array<{ orphaCode: string; label: string; field: string }>;
    }
  > = {};
  for (const p of MISSPELLING_PATTERNS) {
    misspellings[p.id] = {
      description: p.description,
      countPreferred: 0,
      countAnyLabel: 0,
      examples: [],
    };
  }

  for (const d of disorders.values()) {
    if (hasMissingWordBoundary(d.name)) {
      boundaryPreferred += 1;
      boundaryAny += 1;
      if (boundaryExamples.length < 25) {
        boundaryExamples.push({
          orphaCode: d.orphaCode,
          label: d.name,
          field: "Name",
        });
      }
    } else {
      const synHit = d.synonyms.find((s) => hasMissingWordBoundary(s));
      if (synHit) {
        boundaryAny += 1;
        if (boundaryExamples.length < 25) {
          boundaryExamples.push({
            orphaCode: d.orphaCode,
            label: synHit,
            field: "Synonym",
          });
        }
      }
    }

    for (const p of MISSPELLING_PATTERNS) {
      if (p.re.test(d.name)) {
        misspellings[p.id].countPreferred += 1;
        misspellings[p.id].countAnyLabel += 1;
        if (misspellings[p.id].examples.length < 15) {
          misspellings[p.id].examples.push({
            orphaCode: d.orphaCode,
            label: d.name,
            field: "Name",
          });
        }
      } else {
        const syn = d.synonyms.find((s) => p.re.test(s));
        if (syn) {
          misspellings[p.id].countAnyLabel += 1;
          if (misspellings[p.id].examples.length < 15) {
            misspellings[p.id].examples.push({
              orphaCode: d.orphaCode,
              label: syn,
              field: "Synonym",
            });
          }
        }
      }
    }
  }

  return {
    missingWordBoundary: {
      countPreferred: boundaryPreferred,
      countAnyLabel: boundaryAny,
      examples: boundaryExamples,
    },
    misspellings,
  };
}

function main(): void {
  if (!fs.existsSync(CACHE_PRODUCT1)) {
    throw new Error(
      `Cached Orphanet product missing: ${CACHE_PRODUCT1}. Refusing to download.`
    );
  }

  const xml = fs.readFileSync(CACHE_PRODUCT1, "utf8");
  const meta = extractJdborMeta(xml);
  const disorders = extractDisorders(xml);
  const parsed = loadParsedLabels();

  const defects = SUSPECTED.map((s) =>
    classifySuspected(s, disorders.get(s.orphaCode), parsed.get(s.orphaCode) ?? null)
  );

  const corpusScan = scanCorpus(disorders);

  // Sample artifact version stamp when available (read-only snapshot).
  let orphanetVersionFromArtifact: string | null = null;
  if (fs.existsSync(SAMPLE_ARTIFACT)) {
    const art = JSON.parse(fs.readFileSync(SAMPLE_ARTIFACT, "utf8")) as {
      sourceVersions?: { orphanetProduct1?: string };
    };
    orphanetVersionFromArtifact = art.sourceVersions?.orphanetProduct1 ?? null;
  }

  const report = {
    verifiedOn: new Date().toISOString().slice(0, 10),
    orphanetSourceFile: CACHE_PRODUCT1,
    orphanetVersion: orphanetVersionFromArtifact ?? meta.date,
    orphanetJdbor: meta,
    disorderCountInXml: disorders.size,
    defects,
    corpusScan,
    publishableDefects: defects.filter((d) => d.origin === "upstream"),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Disorders in XML: ${disorders.size}`);
  console.log("Suspected defects:");
  for (const d of defects) {
    console.log(
      `  ORPHA:${d.orphaCode} origin=${d.origin} raw="${d.rawSourceLabel}" parsed=${JSON.stringify(d.parsedLabel)}`
    );
  }
  console.log(
    `Missing-word-boundary (preferred Names): ${corpusScan.missingWordBoundary.countPreferred}`
  );
  for (const [id, row] of Object.entries(corpusScan.misspellings)) {
    console.log(
      `Misspelling ${id}: preferred=${row.countPreferred} anyLabel=${row.countAnyLabel}`
    );
  }
  console.log(
    `Publishable (upstream only): ${report.publishableDefects.length}/${defects.length}`
  );
}

main();
