/**
 * Glossary for the Rare Disease Research Atlas.
 * - Clinical short glosses power inline tappable terms in definitions.
 * - Site/methodology entries appear on /glossary with fuller detail.
 */

export type GlossaryCategoryId =
  | "how-we-measure"
  | "data-sources"
  | "clinical";

export interface GlossaryCategory {
  id: GlossaryCategoryId;
  title: string;
  blurb: string;
}

export interface GlossaryEntry {
  id: string;
  term: string;
  /** One-line meaning shown on the glossary page and (for clinical) in inline chips. */
  definition: string;
  /** Optional longer note — how this site uses the term, caveats, etc. */
  detail?: string;
  category: GlossaryCategoryId;
  /** Extra strings that should match in inline GlossaryText (clinical only). */
  matchTerms?: string[];
}

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  {
    id: "how-we-measure",
    title: "How we measure research attention",
    blurb:
      "Terms that appear in headlines, disease pages, and methodology notes.",
  },
  {
    id: "data-sources",
    title: "Data sources & identifiers",
    blurb: "Where numbers come from, and what the codes on a disease page mean.",
  },
  {
    id: "clinical",
    title: "Clinical language",
    blurb:
      "Plain glosses for medical words that often appear in Orphanet definitions. Tapping a dotted term on a disease page shows the same short meaning.",
  },
];

const SITE_ENTRIES: GlossaryEntry[] = [
  {
    id: "interventional-trial",
    term: "Interventional trial",
    definition:
      "A registered clinical study that assigns participants to an intervention (for example a drug, device, or procedure) to test its effects.",
    detail:
      "On this site, the headline “no trial” count uses only interventional studies from ClinicalTrials.gov that match the specific condition name. Observational studies and expanded-access records are shown separately and do not fill a zero in the headline.",
    category: "how-we-measure",
  },
  {
    id: "observational-study",
    term: "Observational study",
    definition:
      "A registered study that follows people without assigning a treatment as the main intervention — including natural-history and cohort studies.",
    detail:
      "These can still matter for families (recruiting registries, better disease understanding) but they are not counted as interventional trials in our headline percentages.",
    category: "how-we-measure",
  },
  {
    id: "expanded-access",
    term: "Expanded access",
    definition:
      "A pathway for using an investigational product outside a clinical trial, often when no satisfactory alternatives exist.",
    detail:
      "ClinicalTrials.gov lists some expanded-access records. We surface them when matched but do not count them toward the interventional-trial headline.",
    category: "how-we-measure",
  },
  {
    id: "specific-condition-name",
    term: "Specific condition name",
    definition:
      "Matching a trial or paper using this disease’s preferred label, synonyms, and resolved MeSH — not only a broader parent category.",
    detail:
      "Our conservative headline requires a specific-condition match. Trials registered only under a broader Mondo parent are shown on the disease page but do not reduce the no-trial share unless we report the parent-inclusive sensitivity figure.",
    category: "how-we-measure",
  },
  {
    id: "parent-category-trial",
    term: "Parent-category trial",
    definition:
      "An interventional trial matched to a broader disease category this condition belongs to in Mondo (for example a Gaucher subtype under Gaucher disease).",
    detail:
      "Those studies may or may not enrol people with the specific subtype — eligibility varies and the registry record often does not say. We show the count separately so you can discuss it with a clinician.",
    category: "how-we-measure",
  },
  {
    id: "trials-denominator",
    term: "Trials denominator",
    definition:
      "The set of diseases in this build used when computing “share with no interventional trial.”",
    detail:
      "Incomplete trial fetches, uncapped scans, and probable broken queries are excluded. Percentages are of this denominator, not of every Orphanet row or every rare disease worldwide.",
    category: "how-we-measure",
  },
  {
    id: "publications-denominator",
    term: "Publications denominator",
    definition:
      "The set of diseases whose preferred names support a credible literature count under our rules.",
    detail:
      "Names flagged for collision / neglect risk, or that return nothing in Europe PMC under our queries, are excluded so zeros are less likely to be search artifacts.",
    category: "how-we-measure",
  },
  {
    id: "broken-query",
    term: "Broken query",
    definition:
      "A preferred name that returned no results in either Europe PMC or ClinicalTrials.gov under our phrase and MeSH strategies (and trial recall-expansion where used).",
    detail:
      "This is usually evidence that the official string does not work as a search term — not proof that research is absent. Broken-query rows are excluded from site-wide percentages.",
    category: "how-we-measure",
  },
  {
    id: "name-matching-confidence",
    term: "Name-matching confidence",
    definition:
      "A high / medium / low label for how trustworthy the publication and trial counts are for this name.",
    detail:
      "Low confidence often means the name is ambiguous, ultra-specific, or failed to retrieve results cleanly. Always read the query and confidence note on the disease page before treating a zero as neglect.",
    category: "how-we-measure",
  },
  {
    id: "mesh",
    term: "MeSH",
    definition:
      "Medical Subject Headings — NLM’s controlled vocabulary for indexing biomedical topics.",
    detail:
      "When Mondo links a disease to a MeSH ID and we can resolve a descriptor label, that label is unioned into Europe PMC and ClinicalTrials.gov queries. A trial registered under a MeSH condition name can match even when no free-text phrase would.",
    category: "how-we-measure",
  },
  {
    id: "recall-expansion",
    term: "Recall-expansion",
    definition:
      "Extra carefully filtered search terms (for example gene symbols or selected Mondo parents) used to find trials that phrase/MeSH matching alone might miss.",
    detail:
      "Used for ClinicalTrials.gov matching, not as the basis for publication denominators. Disease pages record when a trial matched via recall-expansion.",
    category: "how-we-measure",
  },
  {
    id: "thin-attention",
    term: "Thin attention",
    definition:
      "Diseases with no publication in the last ten years and no matched interventional trial, within the intersection of the publications and trials denominators.",
    detail:
      "The Thin attention list is a landscape signal, not a diagnosis of neglect. Broken queries and naming mismatches still matter — open the disease page.",
    category: "how-we-measure",
  },
  {
    id: "percentile",
    term: "Percentile",
    definition:
      "Where this disease’s count sits relative to others in the same denominator (0–100).",
    detail:
      "A trials percentile near 100 means relatively many matched interventional trials compared with other diseases in the trials denominator of this build.",
    category: "how-we-measure",
  },
  {
    id: "build",
    term: "Build / sampling",
    definition:
      "The published snapshot of diseases currently powering the live site (sample, limit, or full usable corpus).",
    detail:
      "Until a full ingest finishes and replaces diseases.json, the live site may be a random sample (for example n=300). Findings pages are fixed historical measurements and may differ from the live homepage.",
    category: "how-we-measure",
  },
  {
    id: "dual-model-validation",
    term: "Dual-model validation",
    definition:
      "An accuracy check where two independent model providers judge whether matched trials are relevant, with light human fix of disagreements.",
    detail:
      "Reported recall and precision come from that gold set. Precision is among NCT IDs already labelled there — not over every trial the pipeline returns. It is not a full unaided human review of every disease.",
    category: "how-we-measure",
  },
  {
    id: "orphanet",
    term: "Orphanet",
    definition:
      "A European reference resource for rare diseases: nomenclature, definitions, synonyms, and related clinical information.",
    detail:
      "This atlas starts from Orphanet / Orphadata product1 names (CC BY 4.0). Groups of disorders and preferred names marked OBSOLETE: or NON RARE IN EUROPE: are dropped before sampling.",
    category: "data-sources",
  },
  {
    id: "orphacode",
    term: "ORPHAcode",
    definition:
      "Orphanet’s stable numeric identifier for a rare disease entity (shown as ORPHA:12345).",
    detail:
      "Each disease page URL uses the ORPHAcode. Use it when reporting errors so the right record can be checked.",
    category: "data-sources",
  },
  {
    id: "mondo",
    term: "Mondo",
    definition:
      "The Mondo Disease Ontology — a merged disease vocabulary with hierarchy and cross-references to other ID systems.",
    detail:
      "We use Mondo for parent/umbrella matching, exact synonyms, zero-publication naming-artifact checks, and cross-references (MeSH, UMLS, OMIM, NCIT). Only resolved MeSH labels enter search queries today.",
    category: "data-sources",
  },
  {
    id: "europe-pmc",
    term: "Europe PMC",
    definition:
      "A life-sciences literature database and API (EMBL-EBI) covering PubMed and full-text sources.",
    detail:
      "Publication totals, author samples, and yearly trends on disease pages come from Europe PMC searches built from names, synonyms, and MeSH labels.",
    category: "data-sources",
  },
  {
    id: "clinicaltrials-gov",
    term: "ClinicalTrials.gov",
    definition:
      "The U.S. National Library of Medicine registry of clinical studies (API v2).",
    detail:
      "We query the condition field with quoted phrases and MeSH, plus recall-expansion when applicable. Study-type filters separate interventional, observational, and expanded-access records.",
    category: "data-sources",
  },
  {
    id: "gencc",
    term: "GenCC",
    definition:
      "The Gene Curation Coalition — expert assertions about gene–disease validity.",
    detail:
      "Joined on MONDO / ORPHA identifiers. Classifications (Definitive, Strong, Moderate, Limited, etc.) appear in plain language on disease pages when present.",
    category: "data-sources",
  },
  {
    id: "india-nprd",
    term: "India NPRD",
    definition:
      "India’s National Policy for Rare Diseases and related notified-disease lists from MoHFW / PIB sources.",
    detail:
      "A hand-curated layer in data/india-nprd.json marks conditions on or under those lists (including Mondo-parent umbrellas). Official notified counts are inconsistent across public sources.",
    category: "data-sources",
  },
  {
    id: "umls-omim-ncit",
    term: "UMLS, OMIM, NCIT",
    definition:
      "Other biomedical identifier systems often linked from Mondo (unified concepts, Mendelian genes/diseases, NCI thesaurus).",
    detail:
      "Cross-references are shown on disease pages for transparency. They are not currently unioned into Europe PMC or ClinicalTrials.gov query strings — only MeSH labels are.",
    category: "data-sources",
  },
];

const CLINICAL_ENTRIES: GlossaryEntry[] = [
  {
    id: "hypotonia",
    term: "Hypotonia",
    definition: "Low muscle tone; babies may feel floppy.",
    category: "clinical",
  },
  {
    id: "hypertonia",
    term: "Hypertonia",
    definition: "High muscle tone; muscles feel stiff.",
    category: "clinical",
  },
  {
    id: "ataxia",
    term: "Ataxia",
    definition: "Trouble with balance and coordinated movement.",
    category: "clinical",
  },
  {
    id: "dystrophy",
    term: "Dystrophy",
    definition:
      "A condition where tissue (often muscle) weakens over time.",
    category: "clinical",
  },
  {
    id: "encephalopathy",
    term: "Encephalopathy",
    definition: "A disorder affecting how the brain works.",
    category: "clinical",
  },
  {
    id: "myopathy",
    term: "Myopathy",
    definition: "A disease of the muscles.",
    category: "clinical",
  },
  {
    id: "neuropathy",
    term: "Neuropathy",
    definition: "Damage or disease affecting the nerves.",
    category: "clinical",
  },
  {
    id: "cardiomyopathy",
    term: "Cardiomyopathy",
    definition: "A disease of the heart muscle.",
    category: "clinical",
  },
  {
    id: "hepatomegaly",
    term: "Hepatomegaly",
    definition: "An enlarged liver.",
    category: "clinical",
  },
  {
    id: "splenomegaly",
    term: "Splenomegaly",
    definition: "An enlarged spleen.",
    category: "clinical",
  },
  {
    id: "hepatosplenomegaly",
    term: "Hepatosplenomegaly",
    definition: "Enlarged liver and spleen.",
    category: "clinical",
  },
  {
    id: "hypoglycemia",
    term: "Hypoglycemia",
    definition: "Low blood sugar.",
    category: "clinical",
  },
  {
    id: "hyperammonemia",
    term: "Hyperammonemia",
    definition: "Too much ammonia in the blood.",
    category: "clinical",
  },
  {
    id: "acidosis",
    term: "Acidosis",
    definition: "When the blood becomes too acidic.",
    category: "clinical",
  },
  {
    id: "seizures",
    term: "Seizures",
    definition:
      "Sudden bursts of abnormal electrical activity in the brain.",
    category: "clinical",
  },
  {
    id: "epilepsy",
    term: "Epilepsy",
    definition: "A tendency to have repeated seizures.",
    category: "clinical",
  },
  {
    id: "dysplasia",
    term: "Dysplasia",
    definition: "Tissue that developed in an unusual way.",
    category: "clinical",
  },
  {
    id: "malformation",
    term: "Malformation",
    definition: "A body part that formed differently before birth.",
    category: "clinical",
  },
  {
    id: "congenital",
    term: "Congenital",
    definition: "Present from birth.",
    category: "clinical",
  },
  {
    id: "hereditary",
    term: "Hereditary",
    definition: "Passed down in families through genes.",
    category: "clinical",
  },
  {
    id: "autosomal",
    term: "Autosomal",
    definition: "Related to the non-sex chromosomes.",
    category: "clinical",
  },
  {
    id: "recessive",
    term: "Recessive",
    definition:
      "Usually needs a changed gene copy from both parents to show up.",
    category: "clinical",
  },
  {
    id: "dominant",
    term: "Dominant",
    definition:
      "Usually needs a changed gene copy from one parent to show up.",
    category: "clinical",
  },
  {
    id: "mitochondrial",
    term: "Mitochondrial",
    definition:
      "Related to mitochondria — the energy-making parts of cells.",
    category: "clinical",
  },
  {
    id: "metabolic",
    term: "Metabolic",
    definition:
      "Related to how the body processes food and chemicals for energy.",
    category: "clinical",
  },
  {
    id: "enzyme",
    term: "Enzyme",
    definition: "A protein that helps a chemical reaction happen in the body.",
    category: "clinical",
  },
  {
    id: "phenotype",
    term: "Phenotype",
    definition: "The observable signs and features of a condition.",
    category: "clinical",
  },
  {
    id: "genotype",
    term: "Genotype",
    definition: "The genetic makeup related to a condition.",
    category: "clinical",
  },
  {
    id: "pathogenesis",
    term: "Pathogenesis",
    definition: "How a disease develops in the body.",
    category: "clinical",
  },
  {
    id: "etiology",
    term: "Etiology",
    definition: "The cause of a condition.",
    category: "clinical",
  },
  {
    id: "idiopathic",
    term: "Idiopathic",
    definition: "Cause not yet identified.",
    category: "clinical",
  },
  {
    id: "progressive",
    term: "Progressive",
    definition: "Tends to change or worsen over time.",
    category: "clinical",
  },
  {
    id: "neonatal",
    term: "Neonatal",
    definition: "In the newborn period.",
    category: "clinical",
  },
  {
    id: "infantile",
    term: "Infantile",
    definition: "In early childhood / infancy.",
    category: "clinical",
  },
  {
    id: "prenatal",
    term: "Prenatal",
    definition: "Before birth.",
    category: "clinical",
  },
  {
    id: "failure-to-thrive",
    term: "Failure to thrive",
    definition: "Not gaining weight or growing as expected.",
    category: "clinical",
    matchTerms: ["failure to thrive"],
  },
  {
    id: "developmental-delay",
    term: "Developmental delay",
    definition:
      "Skills such as sitting, walking, or talking arrive later than usual.",
    category: "clinical",
    matchTerms: ["developmental delay"],
  },
  {
    id: "intellectual-disability",
    term: "Intellectual disability",
    definition:
      "Significant limits in learning and everyday reasoning skills.",
    category: "clinical",
    matchTerms: ["intellectual disability"],
  },
  {
    id: "dysmorphic",
    term: "Dysmorphic",
    definition:
      "Facial or body features that look different from typical patterns.",
    category: "clinical",
  },
  {
    id: "gene-therapy",
    term: "Gene therapy",
    definition: "Treatment that tries to fix or replace a faulty gene.",
    category: "clinical",
    matchTerms: ["gene therapy"],
  },
  {
    id: "enzyme-replacement",
    term: "Enzyme replacement",
    definition: "Treatment that supplies an enzyme the body is missing.",
    category: "clinical",
    matchTerms: ["enzyme replacement"],
  },
];

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  ...SITE_ENTRIES,
  ...CLINICAL_ENTRIES,
];

/**
 * Short plain glosses for terms families hear from clinicians.
 * Keep jargon on the page; make it tappable via GlossaryText.
 */
export const GLOSSARY: Record<string, string> = Object.fromEntries(
  CLINICAL_ENTRIES.flatMap((e) => {
    const keys = e.matchTerms?.length
      ? e.matchTerms
      : [e.term.toLowerCase()];
    return keys.map((k) => [k.toLowerCase(), e.definition] as const);
  })
);

/** Map lowercase match key → glossary entry id (for deep links from chips). */
export const GLOSSARY_TERM_IDS: Record<string, string> = Object.fromEntries(
  CLINICAL_ENTRIES.flatMap((e) => {
    const keys = e.matchTerms?.length
      ? e.matchTerms
      : [e.term.toLowerCase()];
    return keys.map((k) => [k.toLowerCase(), e.id] as const);
  })
);

/** Terms sorted longest-first so multi-word phrases match before singles. */
export const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort(
  (a, b) => b.length - a.length
);

export function entriesForCategory(
  category: GlossaryCategoryId
): GlossaryEntry[] {
  return GLOSSARY_ENTRIES.filter((e) => e.category === category).sort((a, b) =>
    a.term.localeCompare(b.term, "en")
  );
}
