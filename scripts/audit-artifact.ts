/**
 * Artifact audit — run after every `derive`, and in CI.
 *
 *   npx tsx scripts/audit-artifact.ts data/diseases.json
 *   npx tsx scripts/audit-artifact.ts data/diseases.json --json audits/
 *
 * Deliberately standalone: imports nothing from lib/. An audit tool that shares
 * code with the thing it audits inherits its bugs.
 *
 * ASSERTIONS exit 1. WARNINGS report only — several are legitimate in edge
 * cases and should not block a build.
 */

import fs from "node:fs";
import path from "node:path";

const CP850_CORRUPT = /[ÚÞÛÙÓßÔõÕþÝ´±¾¶÷·³°]/;
const GENE = /^[A-Z][A-Z0-9-]{1,9}$/;

/** Gene symbols that return large trial populations on their own. */
const HIGH_FREQUENCY_ONCOGENES = new Set([
  "KRAS","NRAS","HRAS","BRAF","TP53","EGFR","PIK3CA","ALK","MYC","PTEN","RB1",
  "BRCA1","BRCA2","KIT","MET","RET","ROS1","IDH1","IDH2","FLT3","JAK2","ABL1",
  "BCR","NF1","NF2","VHL","APC","SMAD4","CDKN2A","ERBB2","AKT1","CTNNB1",
  "NOTCH1","FGFR1","FGFR2","FGFR3","FGFR4","PDGFRA","SF3B1","TET2","DNMT3A",
  "ASXL1","RUNX1","WT1","NPM1","CEBPA","STK11","MLH1","MSH2","ATM","CDH1",
  "SDHB","TSC1","TSC2",
]);

/** Warning thresholds — tune, but changing one is a decision worth a commit message. */
const THRESHOLDS = {
  maxParentContaminationShare: 0.02,   // of diseases reporting trials
  maxOntologySpeakQueries: 0,
  maxEncodingCorrupt: 0,
  maxTrialsExceedingPublications: 10,
};

type Issue = { level: "ASSERT" | "WARN"; code: string; detail: string; orphaCode?: string };

const args = process.argv.slice(2);
const artifactPath = args[0] ?? "data/diseases.json";
const jsonOutDir = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

const art = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const diseases: any[] = art.diseases ?? [];
const agg = art.aggregate ?? {};
const issues: Issue[] = [];

const trialTotal = (d: any) => d?.trials?.total ?? null;
const pubTotal = (d: any) => d?.publications?.total ?? null;
const recallTerms = (d: any): string[] => d?.trials?.recallTerms ?? [];
const nonGeneRecall = (d: any) => recallTerms(d).filter((t) => !GENE.test(t));
const oncogeneRecall = (d: any) =>
  recallTerms(d).filter((t) => HIGH_FREQUENCY_ONCOGENES.has(t.toUpperCase()));

const isCredibleForTrials = (d: any) =>
  d?.queryHealth?.status !== "broken" &&
  !d?.sourceErrors?.trials &&
  trialTotal(d) !== null;

// ---------------------------------------------------------------------------
// ASSERTIONS — structural contradictions. These must never ship.
// ---------------------------------------------------------------------------

for (const d of diseases) {
  // A broken query returned nothing anywhere. It cannot be high confidence.
  if (d?.queryHealth?.status === "broken" && d?.confidence !== "low") {
    issues.push({
      level: "ASSERT", code: "confidence-contradicts-queryhealth",
      orphaCode: d.orphaCode,
      detail: `confidence=${d.confidence} but queryHealth=broken`,
    });
  }

  // Encoding corruption silently manufactures false zeros. See
  // docs/orphanet-encoding-corruption.md.
  if (CP850_CORRUPT.test(d?.name ?? "")) {
    issues.push({
      level: "ASSERT", code: "label-encoding-corrupt",
      orphaCode: d.orphaCode,
      detail: `name contains CP850 double-decode artifact: ${d.name}`,
    });
  }

  // A record counted in an aggregate must have a number, not a null.
  if (isCredibleForTrials(d) && typeof trialTotal(d) !== "number") {
    issues.push({
      level: "ASSERT", code: "credible-record-null-total",
      orphaCode: d.orphaCode, detail: "in trials denominator but trials.total is not numeric",
    });
  }
}

// Denominators must reconcile with the records they claim to describe.
const credible = diseases.filter(isCredibleForTrials);
if (typeof agg.trialsDenominator === "number" && agg.trialsDenominator !== credible.length) {
  issues.push({
    level: "ASSERT", code: "denominator-mismatch",
    detail: `aggregate.trialsDenominator=${agg.trialsDenominator} but ${credible.length} records are credible-for-trials`,
  });
}

const countedNoTrials = credible.filter((d) => trialTotal(d) === 0).length;
if (typeof agg.noTrials === "number" && agg.noTrials !== countedNoTrials) {
  issues.push({
    level: "ASSERT", code: "notrials-mismatch",
    detail: `aggregate.noTrials=${agg.noTrials} but ${countedNoTrials} credible records have zero trials`,
  });
}

// Every published percentage must be recomputable from its own numerator and
// denominator. This is the 152-vs-114 render bug, made structurally impossible.
if (art.distributions?.trials?.shareZero != null && agg.trialsDenominator) {
  const implied = agg.noTrials / agg.trialsDenominator;
  if (Math.abs(implied - art.distributions.trials.shareZero) > 0.0005) {
    issues.push({
      level: "ASSERT", code: "share-does-not-match-counts",
      detail: `distributions.trials.shareZero=${art.distributions.trials.shareZero} but noTrials/denominator=${implied.toFixed(4)}`,
    });
  }
}

// A citable artifact must not misdescribe how it was validated.
if (art.validation) {
  const m = String(art.validation.method ?? "");
  const by = String(art.validation.reviewedBy ?? "");
  if (/human/i.test(m) && /model|gpt|claude|consensus/i.test(by)) {
    issues.push({
      level: "ASSERT", code: "validation-method-mislabelled",
      detail: `validation.method="${m}" but reviewedBy="${by}" — method must describe how verdicts were actually produced`,
    });
  }
}

// ---------------------------------------------------------------------------
// WARNINGS — quality signals. Report, don't block.
// ---------------------------------------------------------------------------

const withTrials = credible.filter((d) => (trialTotal(d) ?? 0) > 0);
const contaminated = withTrials.filter((d) => nonGeneRecall(d).length > 0);
const contaminationShare = withTrials.length ? contaminated.length / withTrials.length : 0;

if (contaminationShare > THRESHOLDS.maxParentContaminationShare) {
  issues.push({
    level: "WARN", code: "parent-term-contamination",
    detail: `${contaminated.length}/${withTrials.length} (${(contaminationShare * 100).toFixed(0)}%) of diseases reporting trials have non-gene recall terms in the specific-tier query`,
  });
}

for (const d of diseases) {
  const onco = oncogeneRecall(d);
  if (onco.length) {
    issues.push({
      level: "WARN", code: "high-frequency-oncogene-in-trial-query",
      orphaCode: d.orphaCode, detail: `recall terms include ${onco.join(", ")}`,
    });
  }

  // The two queries should differ only where policy says they differ.
  const pubQ = d?.query ?? "";
  const trialQ = d?.trials?.query ?? "";
  if (/disease or disorder/i.test(pubQ) !== /disease or disorder/i.test(trialQ)) {
    issues.push({
      level: "WARN", code: "ontology-speak-divergence",
      orphaCode: d.orphaCode,
      detail: "ontology-speak filtering differs between publication and trial queries",
    });
  }

  // Legitimate for registry-heavy conditions with under-matched literature,
  // but reliably indicative of over-matching when it clusters.
  const t = trialTotal(d), p = pubTotal(d);
  if (typeof t === "number" && typeof p === "number" && t > p && t > 0) {
    issues.push({
      level: "WARN", code: "trials-exceed-publications",
      orphaCode: d.orphaCode, detail: `${t} trials vs ${p} publications`,
    });
  }

  // Umbrella parents (CLN1 -> neuronal ceroid lipofuscinosis) currently get no
  // second tier because parent selection requires name containment.
  if (trialTotal(d) === 0 && !d?.trials?.parentCategory && (d?.mondoIds ?? []).length) {
    issues.push({
      level: "WARN", code: "no-parent-tier-despite-mondo-ancestry",
      orphaCode: d.orphaCode, detail: "zero specific trials, has Mondo ancestry, no parent tier",
    });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const asserts = issues.filter((i) => i.level === "ASSERT");
const warns = issues.filter((i) => i.level === "WARN");
const byCode = (list: Issue[]) =>
  Object.entries(
    list.reduce<Record<string, number>>((a, i) => ((a[i.code] = (a[i.code] ?? 0) + 1), a), {})
  ).sort((a, b) => b[1] - a[1]);

// Verified-clean subset: the honest number when contamination is present.
const verified = credible.filter((d) => nonGeneRecall(d).length === 0 && oncogeneRecall(d).length === 0);
const verifiedNoTrials = verified.filter((d) => trialTotal(d) === 0).length;

const summary = {
  auditedAt: new Date().toISOString(),
  artifact: path.basename(artifactPath),
  artifactGeneratedAt: art.generatedAt,
  sampling: art.sampling,
  totals: {
    diseases: diseases.length,
    credibleForTrials: credible.length,
    reportingTrials: withTrials.length,
    contaminated: contaminated.length,
    verifiedClean: verified.length,
  },
  headline: {
    published: agg.trialsDenominator ? +(agg.noTrials / agg.trialsDenominator).toFixed(4) : null,
    verifiedCleanSubset: verified.length ? +(verifiedNoTrials / verified.length).toFixed(4) : null,
    note: "A large gap between these two means contamination is materially moving the headline.",
  },
  assertions: byCode(asserts),
  warnings: byCode(warns),
};

console.log(JSON.stringify(summary, null, 2));

if (asserts.length) {
  console.error(`\n${asserts.length} ASSERTION FAILURE(S):`);
  for (const a of asserts.slice(0, 40)) {
    console.error(`  [${a.code}] ${a.orphaCode ? `ORPHA:${a.orphaCode} ` : ""}${a.detail}`);
  }
  if (asserts.length > 40) console.error(`  ...and ${asserts.length - 40} more`);
}

if (jsonOutDir) {
  fs.mkdirSync(jsonOutDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(jsonOutDir, `audit-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ summary, issues }, null, 2));
  console.log(`\nwrote ${out}`);
}

process.exit(asserts.length ? 1 : 0);
