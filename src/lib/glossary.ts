/**
 * Short plain glosses for terms families hear from clinicians.
 * Keep jargon on the page; make it tappable.
 */
export const GLOSSARY: Record<string, string> = {
  hypotonia: "Low muscle tone; babies may feel floppy.",
  hypertonia: "High muscle tone; muscles feel stiff.",
  ataxia: "Trouble with balance and coordinated movement.",
  dystrophy: "A condition where tissue (often muscle) weakens over time.",
  encephalopathy: "A disorder affecting how the brain works.",
  myopathy: "A disease of the muscles.",
  neuropathy: "Damage or disease affecting the nerves.",
  cardiomyopathy: "A disease of the heart muscle.",
  hepatomegaly: "An enlarged liver.",
  splenomegaly: "An enlarged spleen.",
  hepatosplenomegaly: "Enlarged liver and spleen.",
  hypoglycemia: "Low blood sugar.",
  hyperammonemia: "Too much ammonia in the blood.",
  acidosis: "When the blood becomes too acidic.",
  seizures: "Sudden bursts of abnormal electrical activity in the brain.",
  epilepsy: "A tendency to have repeated seizures.",
  dysplasia: "Tissue that developed in an unusual way.",
  malformation: "A body part that formed differently before birth.",
  congenital: "Present from birth.",
  hereditary: "Passed down in families through genes.",
  autosomal: "Related to the non-sex chromosomes.",
  recessive: "Usually needs a changed gene copy from both parents to show up.",
  dominant: "Usually needs a changed gene copy from one parent to show up.",
  mitochondrial: "Related to mitochondria — the energy-making parts of cells.",
  metabolic: "Related to how the body processes food and chemicals for energy.",
  enzyme: "A protein that helps a chemical reaction happen in the body.",
  phenotype: "The observable signs and features of a condition.",
  genotype: "The genetic makeup related to a condition.",
  pathogenesis: "How a disease develops in the body.",
  etiology: "The cause of a condition.",
  idiopathic: "Cause not yet identified.",
  progressive: "Tends to change or worsen over time.",
  neonatal: "In the newborn period.",
  infantile: "In early childhood / infancy.",
  prenatal: "Before birth.",
  "failure to thrive": "Not gaining weight or growing as expected.",
  "developmental delay": "Skills such as sitting, walking, or talking arrive later than usual.",
  "intellectual disability": "Significant limits in learning and everyday reasoning skills.",
  dysmorphic: "Facial or body features that look different from typical patterns.",
  "gene therapy": "Treatment that tries to fix or replace a faulty gene.",
  "enzyme replacement": "Treatment that supplies an enzyme the body is missing.",
};

/** Terms sorted longest-first so multi-word phrases match before singles. */
export const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort(
  (a, b) => b.length - a.length
);
