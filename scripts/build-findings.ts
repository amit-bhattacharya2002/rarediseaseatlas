/**
 * Freeze a dated findings snapshot from the committed sample artifact and
 * verified defect provenance. Never reads or writes data/diseases.json.
 *
 *   npx tsx scripts/build-findings.ts
 *
 * Inputs (read-only):
 *   data/diseases.sample300-seed42.json
 *   data/defect-provenance.json
 *   .cache/en_product1.xml  (corpus level counts only)
 *
 * Output:
 *   data/findings-YYYY-MM-DD.json
 */
import fs from "node:fs";
import path from "node:path";
import { corpusLevelsFromXml } from "./lib/corpus-levels";

const SAMPLE_PATH = path.join(
  process.cwd(),
  "data",
  "diseases.sample300-seed42.json"
);
const DEFECTS_PATH = path.join(process.cwd(), "data", "defect-provenance.json");
const PRODUCT1_PATH = path.join(process.cwd(), ".cache", "en_product1.xml");

interface SampleDisease {
  orphaCode: string;
  name: string;
  queryHealth?: { status: string; reasons: string[] };
  publications?: { total: number | null };
  parentLiteratureProbe?: {
    mondoId: string;
    label: string;
    hits: number;
  } | null;
  excludeFromNeglect?: boolean;
}

interface SampleArtifact {
  sampling: {
    mode: string;
    n: number;
    seed: number;
    excludedObsoleteOrNonRare: number;
  };
  sourceVersions: {
    orphanetProduct1: string;
    orphanetPrevalence: string;
    gencc: string;
    mondo?: string;
  };
  aggregate: {
    totalDiseases: number;
    publicationsDenominator: number;
    trialsDenominator: number;
    noTrials: number;
    noTrialsParentInclusive: number;
    brokenQueryRows: number;
    incompleteSourceRows: number;
  };
  diseases: SampleDisease[];
}

function pct(numer: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((1000 * numer) / denom) / 10;
}

function hyperSpecificExamples(diseases: SampleDisease[]) {
  const genericParent =
    /^(human disease|syndromic disease|disease|neoplasm|cataract|eye disorder|autosomal recessive disease|inborn errors of metabolism)$/i;

  const descriptiveZero = diseases
    .filter((d) => {
      const pubs = d.publications?.total;
      const parent = d.parentLiteratureProbe;
      if (pubs !== 0 || !parent || parent.hits < 50) return false;
      if (genericParent.test(parent.label)) return false;
      // Prefer long, multi-clause preferred labels (index-style names).
      return d.name.length >= 45 || d.name.includes("-");
    })
    .map((d) => ({
      orphaCode: d.orphaCode,
      name: d.name,
      publicationTotal: d.publications?.total ?? 0,
      mondoParentLabel: d.parentLiteratureProbe!.label,
      mondoParentPublications: d.parentLiteratureProbe!.hits,
      geneRelatedForm: /^[A-Z0-9]{2,}-related\b/.test(d.name),
    }))
    .sort((a, b) => b.mondoParentPublications - a.mondoParentPublications);

  const geneRelated = diseases
    .filter((d) => /^[A-Z0-9]{2,}-related\b/.test(d.name))
    .map((d) => ({
      orphaCode: d.orphaCode,
      name: d.name,
      publicationTotal: d.publications?.total ?? null,
      queryStatus: d.queryHealth?.status ?? "unknown",
    }));

  const geneRelatedSparse = geneRelated
    .filter((g) => (g.publicationTotal ?? 0) < 5)
    .slice(0, 2)
    .map((g) => ({
      orphaCode: g.orphaCode,
      name: g.name,
      publicationTotal: g.publicationTotal ?? 0,
      mondoParentLabel: "(no informative Mondo parent probe in this sample)",
      mondoParentPublications: 0,
      geneRelatedForm: true,
    }));

  // Prefer a short curated list when present in the sample (clear parents).
  const preferredCodes = ["2269", "1174", "466921", "308621", "692812"];
  const byCode = new Map(diseases.map((d) => [d.orphaCode, d]));
  const curated = preferredCodes
    .map((code) => byCode.get(code))
    .filter((d): d is SampleDisease => Boolean(d))
    .map((d) => ({
      orphaCode: d.orphaCode,
      name: d.name,
      publicationTotal: d.publications?.total ?? 0,
      mondoParentLabel: d.parentLiteratureProbe?.label ?? null,
      mondoParentPublications: d.parentLiteratureProbe?.hits ?? null,
      geneRelatedForm: /^[A-Z0-9]{2,}-related\b/.test(d.name),
    }));

  const examples =
    curated.length >= 3
      ? curated.slice(0, 4)
      : [...descriptiveZero.slice(0, 3), ...geneRelatedSparse].slice(0, 4);

  return {
    countZeroWithInformativeParent: descriptiveZero.length,
    examples,
    geneRelatedInSample: geneRelated.length,
    geneRelatedExamples: geneRelated
      .filter((g) => (g.publicationTotal ?? 0) < 5)
      .slice(0, 4),
  };
}

function main(): void {
  if (!fs.existsSync(SAMPLE_PATH)) {
    throw new Error(`Missing frozen sample artifact: ${SAMPLE_PATH}`);
  }
  if (!fs.existsSync(DEFECTS_PATH)) {
    throw new Error(`Missing defect provenance: ${DEFECTS_PATH}`);
  }
  if (!fs.existsSync(PRODUCT1_PATH)) {
    throw new Error(`Missing cached Orphanet product1: ${PRODUCT1_PATH}`);
  }

  const sample = JSON.parse(
    fs.readFileSync(SAMPLE_PATH, "utf8")
  ) as SampleArtifact;
  const defectsFile = JSON.parse(fs.readFileSync(DEFECTS_PATH, "utf8")) as {
    verifiedOn: string;
    orphanetVersion: string;
    disorderCountInXml: number;
    corpusScan: {
      misspellings: Record<
        string,
        {
          description: string;
          countPreferred: number;
          countAnyLabel: number;
          examples: Array<{ orphaCode: string; label: string; field: string }>;
        }
      >;
    };
    publishableDefects: Array<{
      orphaCode: string;
      kind: string;
      suspectedForm: string;
      rawSourceLabel: string;
      rawSynonyms: string[];
      origin: string;
      note: string;
    }>;
  };

  const xml = fs.readFileSync(PRODUCT1_PATH, "utf8");
  const corpusLevels = corpusLevelsFromXml(xml);

  const upstreamDefects = defectsFile.publishableDefects.filter(
    (d) => d.origin === "upstream"
  );

  const brokenExamples = sample.diseases
    .filter((d) => d.queryHealth?.status === "broken")
    .slice(0, 8)
    .map((d) => ({
      orphaCode: d.orphaCode,
      name: d.name,
      reason:
        d.queryHealth?.reasons?.[0] ??
        "Every search strategy returned zero across Europe PMC and ClinicalTrials.gov.",
    }));

  const sampled = sample.aggregate.totalDiseases;
  const broken = sample.aggregate.brokenQueryRows;
  const pubDen = sample.aggregate.publicationsDenominator;
  const trialDen = sample.aggregate.trialsDenominator;
  const noSpecific = sample.aggregate.noTrials;
  const noInclusive = sample.aggregate.noTrialsParentInclusive;

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const findings = {
    snapshotDate,
    artifactSource: "data/diseases.sample300-seed42.json",
    defectProvenanceSource: "data/defect-provenance.json",
    orphanetVersion: sample.sourceVersions.orphanetProduct1,
    mondoVersion: sample.sourceVersions.mondo ?? null,
    genccVersion: sample.sourceVersions.gencc,
    sampling: sample.sampling,
    corpusLevels,
    searchability: {
      sampled,
      brokenQueryRows: broken,
      brokenSharePct: pct(broken, sampled),
      publicationsDenominator: pubDen,
      publicationsExcludedFromDenom: sampled - pubDen,
      publicationsExcludedPct: pct(sampled - pubDen, sampled),
      examples: brokenExamples,
    },
    trials: {
      trialsDenominator: trialDen,
      noTrialsSpecific: noSpecific,
      noTrialsSpecificPct: pct(noSpecific, trialDen),
      noTrialsParentInclusive: noInclusive,
      noTrialsParentInclusivePct: pct(noInclusive, trialDen),
      preliminary: true,
      preliminaryNote:
        "Trial relevance has dual-model adjudication on a 33-disease gold set; full human validation of trial relevance is not yet complete. Treat the sensitivity range as preliminary.",
    },
    labelDefects: {
      framing: "method-fragility",
      disorderEntriesInProduct1: defectsFile.disorderCountInXml,
      upstreamPreferredLabelMisspellings: upstreamDefects.length,
      upstreamShareOfProduct1Pct: pct(
        upstreamDefects.length,
        defectsFile.disorderCountInXml
      ),
      defects: upstreamDefects.map((d) => ({
        orphaCode: d.orphaCode,
        preferredLabel: d.rawSourceLabel,
        suspectedForm: d.suspectedForm,
        synonyms: d.rawSynonyms,
        orphanetUrl: `https://www.orpha.net/en/disease/detail/${d.orphaCode}`,
        note: d.note,
      })),
      corpusMisspellingCounts: {
        gallbladerPreferred: defectsFile.corpusScan.misspellings.gallblader
          ?.countPreferred,
        haploinsuffiencyPreferred:
          defectsFile.corpusScan.misspellings.haploinsuffiency?.countPreferred,
        choreathetosisPreferred:
          defectsFile.corpusScan.misspellings["choreathetosis-not-choreo"]
            ?.countPreferred,
      },
    },
    hyperSpecificLabels: hyperSpecificExamples(sample.diseases),
    housekeeping: {
      excludedObsoleteOrNonRare: sample.sampling.excludedObsoleteOrNonRare,
      note: "Preferred names beginning OBSOLETE: or NON RARE IN EUROPE: are dropped before atlas sampling. A literal query for such a prefixed string returns no literature even when the underlying condition is well studied.",
    },
  };

  const outPath = path.join(
    process.cwd(),
    "data",
    `findings-${snapshotDate}.json`
  );
  // Append-only: never overwrite an existing dated snapshot.
  if (fs.existsSync(outPath)) {
    throw new Error(
      `Refusing to overwrite existing snapshot ${outPath}. Snapshots are append-only — use a new date or delete only with explicit intent outside this script.`
    );
  }
  fs.writeFileSync(outPath, `${JSON.stringify(findings, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outPath} (append-only; findings-latest.json is not used)`);
  console.log(
    `Corpus: product1=${corpusLevels.product1Total}; Disorder-level=${corpusLevels.commonlyCitedDisorderLevel}; atlas usable≈${corpusLevels.atlasUsableEstimate}`
  );
  console.log(
    `Searchability: broken ${broken}/${sampled} (${findings.searchability.brokenSharePct}%); pub denom ${pubDen}/${sampled}`
  );
  console.log(
    `Trials (preliminary): specific ${findings.trials.noTrialsSpecificPct}%; parent-inclusive ${findings.trials.noTrialsParentInclusivePct}%`
  );
  console.log(`Upstream label defects published: ${upstreamDefects.length}`);
}

main();
