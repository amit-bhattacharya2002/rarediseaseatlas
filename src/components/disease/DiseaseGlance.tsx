import { formatCount } from "@/lib/plain-copy";
import type { DiseaseRecord } from "@/lib/types";

function GlanceCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 border-t border-line pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-xl tabular-nums text-ink sm:text-2xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 font-sans text-xs leading-snug text-mute">{hint}</p>
      ) : null}
    </div>
  );
}

export function DiseaseGlance({ d }: { d: DiseaseRecord }) {
  const geneValue =
    d.geneDiseaseValidity.genes.length > 0
      ? d.geneDiseaseValidity.genes.slice(0, 3).join(", ")
      : d.geneDiseaseValidity.classification === "None"
        ? "—"
        : d.geneDiseaseValidity.classification;

  const readiness = d.trialReadiness
    ? `${d.trialReadiness.filledCount}/${d.trialReadiness.scoredCount}`
    : "—";

  return (
    <section
      aria-label="At a glance"
      className="mt-8 grid grid-cols-2 gap-4 border border-line bg-sand-50/40 px-4 py-4 sm:grid-cols-5 sm:gap-0 sm:px-5 sm:py-5"
    >
      <GlanceCell
        label="Publications"
        value={formatCount(d.publications.total)}
        hint={
          d.publicationsPercentile != null
            ? `${d.publicationsPercentile}th percentile`
            : undefined
        }
      />
      <GlanceCell
        label="Trials"
        value={formatCount(d.trials.total)}
        hint="Interventional, condition-specific"
      />
      <GlanceCell
        label="Researchers"
        value={formatCount(d.researchers.distinctCount)}
        hint="Distinct authors in sample"
      />
      <GlanceCell
        label="Gene link"
        value={geneValue}
        hint={
          d.geneDiseaseValidity.genes.length > 0
            ? d.geneDiseaseValidity.classification
            : undefined
        }
      />
      <GlanceCell
        label="Readiness"
        value={readiness}
        hint="Stages with a signal"
      />
    </section>
  );
}
