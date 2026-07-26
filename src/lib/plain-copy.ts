import type {
  DiseaseRecord,
  DiseasesArtifact,
  GenCCClassification,
} from "./types";

/** Breast cancer Europe PMC order-of-magnitude anchor (stable for copy, not live-queried). */
export const BREAST_CANCER_PUBS_ANCHOR = 700_000;

export function publicationComparison(
  total: number | null,
  distributions?: DiseasesArtifact["distributions"]
): string {
  if (total == null) {
    return "Publication count unavailable for this build (source fetch failed).";
  }
  if (total <= 0) {
    return "We found no papers under this exact name — work may still exist under another label.";
  }
  const median = distributions?.publicationsLast10Years.median;
  const medianNote =
    median != null && distributions
      ? ` Median papers in the last 10 years for a rare disease in this dataset (publications denominator n=${distributions.publicationsLast10Years.n}) is ${Math.round(median).toLocaleString("en")}.`
      : "";
  const vsBreast = BREAST_CANCER_PUBS_ANCHOR;
  if (total < 20) {
    return `${total.toLocaleString("en")} paper${total === 1 ? "" : "s"} have ever been indexed under this name. For scale, breast cancer has over ${vsBreast.toLocaleString("en")}.${medianNote}`;
  }
  if (total < 500) {
    return `${total.toLocaleString("en")} papers have ever been published on this condition (under this name). For scale, breast cancer has over ${vsBreast.toLocaleString("en")}.${medianNote}`;
  }
  if (total < 5000) {
    return `${total.toLocaleString("en")} papers have been published on this condition. That is a real research literature — still far smaller than common diseases (breast cancer: over ${vsBreast.toLocaleString("en")} papers).${medianNote}`;
  }
  return `${total.toLocaleString("en")} papers — among the better-studied rare conditions, though still a fraction of common-disease literature (breast cancer: over ${vsBreast.toLocaleString("en")}).${medianNote}`;
}

/** Comparative line under the raw publication total. */
export function publicationsComparativeLine(
  d: DiseaseRecord,
  distributions?: DiseasesArtifact["distributions"]
): string | null {
  if (d.publications.total == null) return null;
  const median = distributions?.publicationsLast10Years.median;
  const n = distributions?.publicationsLast10Years.n;
  if (d.publications.total === 0) {
    return null;
  }
  if (median == null || n == null) return null;
  return `${d.publications.total.toLocaleString("en")} papers since the earliest indexed year in this search — median last-10-year count for a rare disease in this dataset is ${Math.round(median).toLocaleString("en")} (publications denominator n=${n}).`;
}

/**
 * Comparative trial line. Numerator and denominator MUST both come from
 * aggregate (noTrials / trialsDenominator) — never from distributions.shareZero.
 */
export function trialsComparativeLine(
  d: DiseaseRecord,
  aggregate: DiseasesArtifact["aggregate"]
): string | null {
  if (d.trials.total == null) return null;
  const n = aggregate.trialsDenominator;
  const zeroCount = aggregate.noTrials;
  if (n <= 0 || typeof zeroCount !== "number") return null;
  if (zeroCount > n) {
    throw new Error(
      `trialsComparativeLine: noTrials (${zeroCount}) exceeds trialsDenominator (${n})`
    );
  }
  const pctZero = Math.round((1000 * zeroCount) / n) / 10;
  if (d.trials.total === 0) {
    return `No matched interventional trials. This is true for ${pctZero}% of diseases in the trials denominator (${zeroCount} of ${n}). Here are the researchers publishing on it.`;
  }
  const pct = d.trialsPercentile;
  if (pct == null) {
    return `${d.trials.total.toLocaleString("en")} interventional trial${d.trials.total === 1 ? "" : "s"} — ${pctZero}% of diseases in the trials denominator have none (${zeroCount} of ${n}).`;
  }
  return `${d.trials.total.toLocaleString("en")} interventional trial${d.trials.total === 1 ? "" : "s"} — more than ${pctZero}% of diseases in the trials denominator have none at all (${zeroCount} of ${n}; this disease is at the ${pct}th percentile).`;
}

export function prevalencePlain(prevalenceClass: string | null): string | null {
  if (!prevalenceClass) return null;
  const p = prevalenceClass.replace(/\s+/g, " ").trim();
  if (/<1\s*\/\s*1\s*000\s*000/i.test(p) || /<1\s*\/\s*1000000/i.test(p)) {
    return `${p} — fewer than one in a million. In a city the size of Kolkata, that might mean on the order of fifteen people.`;
  }
  if (/1-9\s*\/\s*1\s*000\s*000/i.test(p)) {
    return `${p} — roughly one to nine people per million. In a city the size of Kolkata, perhaps a few dozen.`;
  }
  if (/<1\s*\/\s*100\s*000/i.test(p)) {
    return `${p} — fewer than one in a hundred thousand. In a city the size of Kolkata, perhaps around a hundred and fifty people.`;
  }
  if (/1-9\s*\/\s*100\s*000/i.test(p)) {
    return `${p} — about one to nine people per hundred thousand.`;
  }
  if (/1-5\s*\/\s*10\s*000/i.test(p)) {
    return `${p} — about one to five people per ten thousand (still uncommon, but less ultra-rare).`;
  }
  if (/unknown/i.test(p)) {
    return "How common this is has not been clearly measured.";
  }
  return p;
}

export function geneValidityPlain(
  classification: GenCCClassification,
  genes: string[]
): { headline: string; detail: string } {
  const geneList =
    genes.length > 0
      ? genes.length === 1
        ? genes[0]
        : genes.slice(0, 3).join(", ") + (genes.length > 3 ? "…" : "")
      : null;

  switch (classification) {
    case "Definitive":
    case "Strong":
      return {
        headline: geneList
          ? `Yes — we know a specific gene responsible (${geneList}).`
          : "Yes — experts rate the gene link as well established.",
        detail: `GenCC classification: ${classification}.`,
      };
    case "Moderate":
      return {
        headline: geneList
          ? `Probably — there is moderate evidence for ${geneList}.`
          : "Probably — there is moderate evidence for a gene link.",
        detail: `GenCC classification: ${classification}.`,
      };
    case "Limited":
      return {
        headline: geneList
          ? `Possibly — only limited evidence so far for ${geneList}.`
          : "Possibly — only limited evidence so far.",
        detail: `GenCC classification: ${classification}.`,
      };
    case "Disputed":
    case "Refuted":
      return {
        headline: "Uncertain — earlier gene claims are disputed or refuted.",
        detail: `GenCC classification: ${classification}.`,
      };
    case "Animal Model Only":
      return {
        headline: "Only in animal models so far — not yet settled for people.",
        detail: `GenCC classification: ${classification}.`,
      };
    case "No Known Disease Relationship":
    case "None":
    default:
      return {
        headline: "Not yet — the cause hasn't been pinned down in GenCC.",
        detail: "No strong gene–disease assertion joined for this Orphanet entity.",
      };
  }
}

export function trialsPlain(d: DiseaseRecord): string {
  if (d.sourceErrors?.trials || d.trials.total == null) {
    return "We could not load trial data for this condition right now.";
  }
  const parent = d.trials.parentCategory;
  const parentNote =
    parent && (parent.total ?? 0) > 0
      ? ` ${parent.total!.toLocaleString("en")} trial${parent.total === 1 ? "" : "s"} are registered for ${parent.label}, the broader category — shown separately because they may or may not enrol this specific subtype.`
      : "";
  if (d.trials.total === 0) {
    const observational = d.trials.observationalTotal ?? 0;
    const base =
      observational > 0
        ? `No interventional trial testing a treatment matched this specific condition name. ${observational.toLocaleString("en")} observational stud${observational === 1 ? "y did" : "ies did"} — shown below because natural-history and cohort work can be an important step toward a trial.`
        : "No interventional trial testing a treatment matched this specific condition name on ClinicalTrials.gov (observational studies and pan-disease registries are listed separately when present).";
    return `${base}${parentNote}`;
  }
  const recruiting = d.trials.recruitingCount ?? 0;
  if (recruiting === 0) {
    return `${d.trials.total.toLocaleString("en")} interventional trial${d.trials.total === 1 ? "" : "s"} matched this specific condition name; none in our sample are currently recruiting.${parentNote}`;
  }
  return `${d.trials.total.toLocaleString("en")} interventional trial${d.trials.total === 1 ? "" : "s"} matched this specific condition name; ${recruiting} currently recruiting in our sample.${parentNote}`;
}

export function friendMeaningBlock(d: DiseaseRecord): {
  livingWith: string;
  ifYouWantToHelp: string;
} {
  const evidence: string[] = [];
  const recent = d.publications.last10Years;
  if (recent == null) {
    evidence.push("recent-publication data is unavailable");
  } else if (recent === 0) {
    evidence.push("no papers matched in the last ten years");
  } else {
    evidence.push(
      `${recent.toLocaleString("en")} paper${recent === 1 ? "" : "s"} matched in the last ten years`
    );
  }

  if (d.trials.total == null) {
    evidence.push("interventional-trial data is unavailable");
  } else if (d.trials.total === 0) {
    const parentTotal = d.trials.parentCategory?.total ?? 0;
    if (parentTotal > 0 && d.trials.parentCategory) {
      evidence.push(
        `no interventional trial matched this specific name (${parentTotal.toLocaleString("en")} for broader category ${d.trials.parentCategory.label})`
      );
    } else {
      evidence.push("no interventional trial matched this specific name");
    }
  } else {
    evidence.push(
      `${d.trials.total.toLocaleString("en")} interventional trial${d.trials.total === 1 ? "" : "s"} matched this specific name`
    );
  }

  const observational = d.trials.observationalTotal ?? 0;
  if (observational > 0) {
    evidence.push(
      `${observational.toLocaleString("en")} observational stud${observational === 1 ? "y" : "ies"} matched`
    );
  }

  const livingWith =
    d.queryHealth.status === "broken"
      ? `For ${d.name}, the searches were not reliable enough to describe the research picture. A zero on this page should not be read as absence of research.`
      : `For ${d.name}, this build found ${evidence.join(", ")}. These figures describe visible research activity under the matched names—not prognosis, care quality, or what any one person should expect.`;

  const recruiting = d.trials.recruitingCount ?? 0;
  const observationalRecruiting = d.trials.observationalRecruitingCount ?? 0;
  let ifYouWantToHelp: string;
  if (recruiting > 0) {
    ifYouWantToHelp = `${recruiting} matched interventional trial${recruiting === 1 ? " is" : "s are"} currently recruiting. Open the trial records below and ask the person’s clinical team whether any eligibility criteria are relevant.`;
  } else if (observationalRecruiting > 0) {
    ifYouWantToHelp = `${observationalRecruiting} matched observational stud${observationalRecruiting === 1 ? "y is" : "ies are"} recruiting or preparing to recruit. Natural-history participation can be useful even when no treatment trial is open.`;
  } else if (d.researchers.top.length > 0) {
    ifYouWantToHelp =
      "No matched study is currently recruiting, but the publishing researchers listed below are a concrete starting point for finding specialist centres or ongoing work.";
  } else {
    ifYouWantToHelp =
      "This dataset does not surface a recruiting study or named researcher. Check the Orphanet entry and support links below, and treat the search-confidence notes as part of the result.";
  }

  if (d.indiaNprd?.listed) {
    ifYouWantToHelp +=
      d.indiaNprd.via === "direct"
        ? " For families in India, this condition is directly listed in the NPRD panel below."
        : " For families in India, the NPRD panel below shows a possible category-level match that needs confirmation.";
  }

  return { livingWith, ifYouWantToHelp };
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en");
}

/**
 * Corpus-level trials finding as a sensitivity range.
 * Conservative = specific condition name only; inclusive = also treating
 * broader parent-category registrations as filling a zero.
 */
export function trialsHeadline(
  aggregate: DiseasesArtifact["aggregate"],
  validation?: DiseasesArtifact["validation"]
): {
  pct: number | null;
  inclusivePct: number | null;
  text: string;
} {
  const den = aggregate.trialsDenominator;
  if (den <= 0 || aggregate.noTrials == null) {
    return {
      pct: null,
      inclusivePct: null,
      text: "Trial aggregates unavailable for this build.",
    };
  }
  const pct = Math.round((1000 * aggregate.noTrials) / den) / 10;
  const inclusiveRaw = aggregate.noTrialsParentInclusive ?? aggregate.noTrials;
  const inclusivePct = Math.round((1000 * inclusiveRaw) / den) / 10;
  const low = Math.min(inclusivePct, pct);
  const high = Math.max(inclusivePct, pct);

  const errorNote =
    validation?.method === "automated-dual-model-consensus"
      ? ` Against a dual-provider automated benchmark, trial matching recall is ${Math.round(validation.trialsRecall * 100)}% and precision ${Math.round(validation.trialsPrecision * 100)}%; ${Math.round(validation.consensusCoverage * 100)}% of candidates received a consensus verdict. This is model-based evidence, not a full human gold standard.`
      : validation != null
        ? ` Against a ${validation.count.toLocaleString("en")}-disease gold set (dual-model adjudication with light human fix of disagreements), trial matching recall is ${Math.round(validation.trialsRecall * 100)}% and precision ${Math.round(validation.trialsPrecision * 100)}%. Precision is among NCT IDs already labelled in that gold set. Full unaided human validation is not yet complete.`
        : " Matching produces errors in both directions — see methodology.";

  const rangeNote =
    low === high
      ? `In this build, ${pct}% of diseases in the trials denominator have no matched interventional trial under the specific condition name (${aggregate.noTrials.toLocaleString("en")} of ${den.toLocaleString("en")}).`
      : `Between roughly ${low}% and ${high}% of diseases in the trials denominator have no interventional clinical trial — depending on whether broader-category registrations count. Counting only the specific condition name gives ${pct}% (${aggregate.noTrials.toLocaleString("en")} of ${den.toLocaleString("en")}); counting parent-category trials as filling a zero gives ${inclusivePct}% (${inclusiveRaw.toLocaleString("en")} of ${den.toLocaleString("en")}). We report the conservative figure and show parent-category trials on each disease page. Prior matching choices in this project landed in the mid-50s to mid-70s — that spread is itself a finding about how poorly disease naming maps between literature and trial registries.`;

  return {
    pct,
    inclusivePct,
    text: `${rangeNote}${errorNote}`,
  };
}
