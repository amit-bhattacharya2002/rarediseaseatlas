import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiseaseBiology } from "@/components/disease/DiseaseBiology";
import { DiseaseGlance } from "@/components/disease/DiseaseGlance";
import { DiseaseHero } from "@/components/disease/DiseaseHero";
import { DiseaseIndia } from "@/components/disease/DiseaseIndia";
import { DiseaseMeaning } from "@/components/disease/DiseaseMeaning";
import { DiseaseMethods } from "@/components/disease/DiseaseMethods";
import { DiseaseOverview } from "@/components/disease/DiseaseOverview";
import { DiseaseResearch } from "@/components/disease/DiseaseResearch";
import { DiseaseSectionNav } from "@/components/disease/DiseaseSectionNav";
import { DiseaseSupport } from "@/components/disease/DiseaseSupport";
import { DiseaseTrials } from "@/components/disease/DiseaseTrials";
import { ReadinessRail } from "@/components/ReadinessRail";
import {
  diseasesArtifact,
  getAggregate,
  getDisease,
  getDistributions,
} from "@/lib/data";
import { formatSnapshotDate } from "@/lib/dates";
import { formatCount, trialsComparativeLine } from "@/lib/plain-copy";
import { SITE_NAME } from "@/lib/site";
import { ReportProblem } from "@/components/ReportProblem";

/**
 * Do not prebuild all ~8k disease URLs at deploy time — that doubled build
 * cost with OG images (~16k outputs). Pages render on first request and are
 * cached via ISR (revalidate).
 */
export const dynamicParams = true;
export const revalidate = 86400; // 24h

export function generateStaticParams() {
  // Empty = no disease HTML at build; still allows /disease/[code] on demand.
  return [];
}

export function generateMetadata({
  params,
}: {
  params: { orphacode: string };
}): Metadata {
  const d = getDisease(params.orphacode);
  if (!d) return { title: "Disease not found", robots: { index: false } };
  const displayName = d.nameCorrected ?? d.name;
  const description = `Research attention for ${displayName} (ORPHA:${d.orphaCode}): ${formatCount(d.publications.total)} publications, ${formatCount(d.researchers.distinctCount)} researchers, ${formatCount(d.trials.total)} interventional trials — ${SITE_NAME}.`;
  const path = `/disease/${d.orphaCode}`;
  return {
    title: displayName,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${displayName} · ${SITE_NAME}`,
      description,
      url: path,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${displayName} · ${SITE_NAME}`,
      description,
    },
  };
}

export default function DiseasePage({
  params,
}: {
  params: { orphacode: string };
}) {
  const d = getDisease(params.orphacode);
  if (!d) notFound();

  const distributions = getDistributions();
  const aggregate = getAggregate();
  const trialsCompare = trialsComparativeLine(d, aggregate);
  const publishedAsOf = formatSnapshotDate(
    d.lastTrialCheck ??
      diseasesArtifact.lastRefresh ??
      diseasesArtifact.lastFullIngest ??
      diseasesArtifact.generatedAt
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <DiseaseHero d={d} />
      <DiseaseGlance d={d} />
      <DiseaseSectionNav
        orphaCode={d.orphaCode}
        name={d.nameCorrected ?? d.name}
      />
      <DiseaseOverview d={d} />
      <DiseaseMeaning d={d} />
      {d.trialReadiness ? (
        <ReadinessRail readiness={d.trialReadiness} />
      ) : (
        <section
          id="readiness"
          className="mt-10 scroll-mt-16 border border-line px-5 py-6"
        >
          <h2 className="font-serif text-title text-ink">
            Trial readiness signals
          </h2>
          <p className="mt-2 font-sans text-sm text-mute">
            Readiness stages were not derived for this record in the current
            build.
          </p>
        </section>
      )}
      <DiseaseBiology d={d} />
      <DiseaseResearch d={d} distributions={distributions} />
      <DiseaseTrials
        d={d}
        artifact={diseasesArtifact}
        publishedAsOf={publishedAsOf}
        trialsCompare={trialsCompare}
      />
      <DiseaseSupport />
      <DiseaseIndia d={d} />
      <DiseaseMethods d={d} />
      <div className="mt-10">
        <ReportProblem
          orphaCode={d.orphaCode}
          name={d.nameCorrected ?? d.name}
        />
      </div>
    </div>
  );
}
