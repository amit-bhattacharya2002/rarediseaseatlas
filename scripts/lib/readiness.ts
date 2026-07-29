/**
 * Trial-readiness stages — research pipeline signals, not clinical readiness.
 * Pure function over a DiseaseRecord; Monarch fields optional.
 */

import type {
  DiseaseRecord,
  GenCCClassification,
  ReadinessStage,
  TrialReadiness,
} from "../../src/lib/types";

const GENE_MET: GenCCClassification[] = [
  "Definitive",
  "Strong",
  "Moderate",
  "Limited",
  "Animal Model Only",
];

const GENE_PARTIAL: GenCCClassification[] = ["Disputed"];

function geneStage(d: DiseaseRecord): ReadinessStage {
  const cls = d.geneDiseaseValidity.classification;
  const genes = d.geneDiseaseValidity.genes ?? [];
  if (GENE_MET.includes(cls) && genes.length > 0) {
    return {
      id: "gene",
      status: "met",
      label: "Gene identified",
      detail: `${cls} — ${genes.slice(0, 5).join(", ")}${genes.length > 5 ? "…" : ""}`,
    };
  }
  if (GENE_MET.includes(cls) || genes.length > 0) {
    return {
      id: "gene",
      status: "partial",
      label: "Gene identified",
      detail:
        genes.length > 0
          ? `${cls} — ${genes.slice(0, 5).join(", ")}`
          : `GenCC ${cls} without a listed gene symbol`,
    };
  }
  if (GENE_PARTIAL.includes(cls)) {
    return {
      id: "gene",
      status: "partial",
      label: "Gene identified",
      detail: `GenCC ${cls}`,
    };
  }
  return {
    id: "gene",
    status: "absent",
    label: "Gene identified",
    detail: "No GenCC disease–gene assertion in this build",
  };
}

function literatureStage(d: DiseaseRecord): ReadinessStage {
  const total = d.publications.total;
  if (total == null) {
    return {
      id: "literature",
      status: "unknown",
      label: "Literature",
      detail: "Publication fetch failed or incomplete",
      evidenceUrl: d.publications.europePmcUrl,
    };
  }
  if (d.queryHealth?.status === "broken") {
    return {
      id: "literature",
      status: "unknown",
      label: "Literature",
      detail: "Query returned nothing — not evidence of absence",
      evidenceUrl: d.publications.europePmcUrl,
    };
  }
  if (total > 0) {
    const recent = d.publications.last10Years;
    return {
      id: "literature",
      status: "met",
      label: "Literature",
      detail:
        recent != null
          ? `${total.toLocaleString("en")} matched papers (${recent.toLocaleString("en")} in last 10 years)`
          : `${total.toLocaleString("en")} matched papers`,
      evidenceUrl: d.publications.europePmcUrl,
    };
  }
  return {
    id: "literature",
    status: "absent",
    label: "Literature",
    detail: "No matched Europe PMC hits under our query rules",
    evidenceUrl: d.publications.europePmcUrl,
  };
}

function phenotypeStage(d: DiseaseRecord): ReadinessStage {
  const m = d.monarch;
  const md = d.mydisease;
  if ((!m || m.phenotypeCount == null) && md && md.phenotypeCount > 0) {
    const sample = md.phenotypeSample
      .slice(0, 3)
      .map((p) => p.name)
      .join("; ");
    return {
      id: "phenotype",
      status: "met",
      label: "Phenotype characterised",
      detail: `${md.phenotypeCount.toLocaleString("en")} HPO annotations via MyDisease.info${sample ? ` (e.g. ${sample})` : ""}`,
      evidenceUrl: md.mondoId
        ? `https://mydisease.info/v1/disease/${encodeURIComponent(md.mondoId)}`
        : null,
    };
  }
  if (!m || m.phenotypeCount == null) {
    return {
      id: "phenotype",
      status: "unknown",
      label: "Phenotype characterised",
      detail: "Not yet enriched from Monarch / HPO",
    };
  }
  if (m.phenotypeCount > 0) {
    const sample = m.phenotypeSample.slice(0, 3).join("; ");
    return {
      id: "phenotype",
      status: "met",
      label: "Phenotype characterised",
      detail: `${m.phenotypeCount.toLocaleString("en")} HPO annotations${sample ? ` (e.g. ${sample})` : ""}`,
      evidenceUrl: d.mondoIds[0]
        ? `https://monarchinitiative.org/disease/${d.mondoIds[0]}`
        : null,
    };
  }
  return {
    id: "phenotype",
    status: "absent",
    label: "Phenotype characterised",
    detail: "No HPO disease–phenotype associations via Monarch for these Mondo IDs",
  };
}

function modelStage(d: DiseaseRecord): ReadinessStage {
  const m = d.monarch;
  if (!m) {
    return {
      id: "animal-model",
      status: "unknown",
      label: "Animal model",
      detail: "Not yet enriched from Monarch / Alliance",
    };
  }
  if (m.modelCount > 0) {
    const taxa = [
      ...new Set(
        m.models.map((x) => x.taxonLabel).filter((t): t is string => Boolean(t))
      ),
    ].slice(0, 3);
    return {
      id: "animal-model",
      status: "met",
      label: "Animal model",
      detail: `${m.modelCount} genotype model${m.modelCount === 1 ? "" : "s"}${
        taxa.length ? ` (${taxa.join(", ")})` : ""
      }`,
      evidenceUrl: d.mondoIds[0]
        ? `https://monarchinitiative.org/disease/${d.mondoIds[0]}`
        : null,
    };
  }
  return {
    id: "animal-model",
    status: "absent",
    label: "Animal model",
    detail: "No Alliance genotype “model of” associations via Monarch for these Mondo IDs",
  };
}

function orphanStage(d: DiseaseRecord): ReadinessStage {
  const o = d.orphanDesignation;
  if (!o) {
    return {
      id: "orphan-designation",
      status: "unknown",
      label: "Orphan designation",
      detail: "FDA orphan-drug designation not enriched yet",
      evidenceUrl:
        "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",
    };
  }
  if (o.matched && o.designationCount > 0) {
    const approved = o.approvedOrphanIndicationCount;
    const sample = o.designations[0];
    return {
      id: "orphan-designation",
      status: approved > 0 ? "met" : "partial",
      label: "Orphan designation",
      detail:
        approved > 0
          ? `${o.designationCount} FDA designation${o.designationCount === 1 ? "" : "s"} (${approved} with orphan-indication approval)${
              sample ? ` — e.g. ${sample.genericName}` : ""
            }`
          : `${o.designationCount} FDA designation${o.designationCount === 1 ? "" : "s"} (none yet approved for the orphan indication)${
              sample ? ` — e.g. ${sample.genericName}` : ""
            }`,
      evidenceUrl:
        "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",
    };
  }
  return {
    id: "orphan-designation",
    status: "absent",
    label: "Orphan designation",
    detail:
      "No FDA orphan-drug designation matched this disease via UMLS or preferred name in the OOPD mirror",
    evidenceUrl: "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",
  };
}

function trialStage(d: DiseaseRecord): ReadinessStage {
  const total = d.trials.total;
  if (total == null || d.sourceErrors?.trials) {
    return {
      id: "interventional-trial",
      status: "unknown",
      label: "Interventional trial",
      detail: "Trial fetch failed or incomplete",
    };
  }
  if (d.queryHealth?.status === "broken") {
    return {
      id: "interventional-trial",
      status: "unknown",
      label: "Interventional trial",
      detail: "Broken query — trial zero not trusted",
    };
  }
  if (total > 0) {
    const recruiting = d.trials.recruitingCount ?? 0;
    return {
      id: "interventional-trial",
      status: "met",
      label: "Interventional trial",
      detail: `${total.toLocaleString("en")} matched on ClinicalTrials.gov${
        recruiting > 0 ? ` (${recruiting} recruiting in sample)` : ""
      }`,
    };
  }
  const parent = d.trials.parentCategory?.total ?? 0;
  if (parent > 0) {
    return {
      id: "interventional-trial",
      status: "partial",
      label: "Interventional trial",
      detail: `None under the specific name; ${parent} for broader category ${d.trials.parentCategory?.label}`,
    };
  }
  return {
    id: "interventional-trial",
    status: "absent",
    label: "Interventional trial",
    detail: "No matched interventional trial under our ClinicalTrials.gov rules",
  };
}

function buildSummary(stages: ReadinessStage[], d: DiseaseRecord): string {
  const byId = Object.fromEntries(stages.map((s) => [s.id, s])) as Record<
    string,
    ReadinessStage
  >;
  const gene = byId.gene?.status;
  const model = byId["animal-model"]?.status;
  const trial = byId["interventional-trial"]?.status;
  const lit = byId.literature?.status;

  if (trial === "met") {
    return "An interventional trial matched this condition name on ClinicalTrials.gov — see trials below.";
  }
  if (trial === "partial") {
    return "No specific-condition interventional trial, but broader-category trials exist — discuss eligibility with a clinician.";
  }
  if (
    trial === "absent" &&
    (gene === "met" || gene === "partial") &&
    model === "met"
  ) {
    return "No matched interventional trial, but a gene association and an animal model are on record — often described as translation-ready / stalled at the clinical step.";
  }
  if (trial === "absent" && (gene === "met" || gene === "partial") && lit === "met") {
    return "No matched interventional trial; the gene is known and literature exists — preclinical or natural-history work may still be the practical next step.";
  }
  if (trial === "absent" && gene === "absent" && model !== "met" && lit !== "met") {
    return "Sparse research signals under our rules — treat zeros cautiously when the query is broken or the name is hard to search.";
  }
  if (d.queryHealth?.status === "broken") {
    return "Search queries returned nothing — this usually means a naming mismatch, not proof that nothing exists.";
  }
  return "Research-stage checklist from open sources (GenCC, literature, Monarch when enriched, ClinicalTrials.gov). Not a prognosis or care recommendation.";
}

/** Recompute readiness for one disease (network-free). */
export function computeTrialReadiness(d: DiseaseRecord): TrialReadiness {
  const stages: ReadinessStage[] = [
    geneStage(d),
    literatureStage(d),
    phenotypeStage(d),
    modelStage(d),
    orphanStage(d),
    trialStage(d),
  ];
  const scored = stages.filter((s) => s.status !== "not-applicable");
  const filled = scored.filter(
    (s) => s.status === "met" || s.status === "partial"
  );
  return {
    summary: buildSummary(stages, d),
    filledCount: filled.length,
    scoredCount: scored.length,
    stages,
  };
}
