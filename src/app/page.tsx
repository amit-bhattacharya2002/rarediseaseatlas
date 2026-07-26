import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import {
  getAggregate,
  getAllDiseases,
  getSearchIndex,
  diseasesArtifact,
} from "@/lib/data";
import { dataAsOfLabel } from "@/lib/dates";
import { trialsHeadline } from "@/lib/plain-copy";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    absolute: SITE_NAME,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

export default function HomePage() {
  const aggregate = getAggregate();
  const diseases = getAllDiseases();
  const searchIndex = getSearchIndex();
  const trials = trialsHeadline(aggregate, diseasesArtifact.validation);
  const noStudyPct =
    aggregate.trialsDenominator > 0
      ? Math.round(
          (1000 * aggregate.noRegisteredStudies) /
            aggregate.trialsDenominator
        ) / 10
      : null;
  const thin = aggregate.noRecentPubsNoTrials;
  const thinDen = aggregate.intersectionDenominator;
  const thinPct =
    thinDen > 0 ? Math.round((1000 * thin) / thinDen) / 10 : null;
  const total = aggregate.totalDiseases;
  const sampling = diseasesArtifact.sampling;

  return (
    <div className="mx-auto max-w-5xl px-5">
      <section className="pb-16 pt-14 sm:pt-20">
        <p className="animate-rise font-sans text-sm uppercase tracking-[0.14em] text-mute">
          An open rare disease research landscape
        </p>
        <h1 className="animate-rise mt-4 max-w-3xl font-serif text-display-sm text-ink sm:text-display">
          {SITE_NAME}
        </h1>
        <p className="animate-rise mt-5 max-w-xl font-serif text-title text-ink [animation-delay:60ms]">
          {SITE_TAGLINE}
        </p>
        <p className="animate-rise mt-4 max-w-xl font-sans text-lede text-mute [animation-delay:80ms]">
          For families facing a name they have never heard — and for anyone who
          needs a defensible picture of research attention.
        </p>

        <div className="mt-14 grid gap-12 border-t border-ink pt-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)] lg:gap-10">
        <div className="animate-count min-w-0">
          <p className="font-sans text-sm text-mute">
            Of {aggregate.trialsDenominator.toLocaleString("en")} diseases with
            usable interventional-trial matching in this build
            {total !== aggregate.trialsDenominator
              ? ` (${total.toLocaleString("en")} total records; incomplete trial fetches and uncapped scans excluded from this percentage)`
              : ""}
          </p>
          <p className="mt-3 font-mono text-[clamp(3.5rem,12vw,6.5rem)] font-medium leading-none tracking-tight text-ink">
            {aggregate.noTrials.toLocaleString("en")}
          </p>
          <p className="mt-5 max-w-2xl font-serif text-title text-ink">
            have no interventional trial under their specific condition name
            {trials.pct != null ? (
              <>
                {" "}
                —{" "}
                <span className="font-mono text-[0.85em]">{trials.pct}%</span>
                {trials.inclusivePct != null &&
                trials.inclusivePct !== trials.pct ? (
                  <>
                    {" "}
                    conservative; about{" "}
                    <span className="font-mono text-[0.85em]">
                      {trials.inclusivePct}%
                    </span>{" "}
                    if broader-category registrations count
                  </>
                ) : null}
              </>
            ) : null}
            .
          </p>
          <p className="mt-3 font-sans text-sm text-mute">
            {dataAsOfLabel(diseasesArtifact)}. Current-state claim — present
            tense.
          </p>
          <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-mute">
            {trials.text} Observational and natural-history studies are shown
            separately on disease pages because they are meaningful research and
            may be open to families, but they are not counted as interventional
            trials. Publication name-collision flags do not remove diseases from
            this trials denominator.
          </p>
          <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-mute">
            A fixed historical sample measurement (past tense) is on{" "}
            <Link
              href="/findings"
              className="underline decoration-line underline-offset-2 hover:text-ink"
            >
              Methods &amp; findings
            </Link>
            ; the live site may differ.
          </p>
          {noStudyPct != null && (
            <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-mute">
              Broader comparison:{" "}
              <span className="font-mono">
                {aggregate.noRegisteredStudies.toLocaleString("en")} of{" "}
                {aggregate.trialsDenominator.toLocaleString("en")}
              </span>{" "}
              ({noStudyPct}%) have no matched registered study of any type,
              including observational studies. The difference between this and
              the headline is an editorial definition, not a correction to the
              data. Both figures exclude pan-disease registries.
            </p>
          )}
          <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-mute">
            Of these no-trial diseases,{" "}
            <span className="font-mono">
              {aggregate.noTrialsWithSubstantialLiterature.toLocaleString("en")}
            </span>{" "}
            have substantial published literature — a name that demonstrably
            matches papers, making the trial zero far likelier to be real than a
            search artifact.{" "}
            {aggregate.brokenQueryRows > 0 ? (
              <>
                A further{" "}
                <span className="font-mono">
                  {aggregate.brokenQueryRows.toLocaleString("en")}
                </span>{" "}
                records returned nothing on either database and are excluded from
                every percentage as probable broken queries, not measured
                absence.
              </>
            ) : null}
          </p>

          <p className="mt-8 max-w-2xl font-sans text-sm leading-relaxed text-mute">
            Secondary finding: {thin.toLocaleString("en")} of{" "}
            {thinDen.toLocaleString("en")}
            {thinPct != null ? ` (${thinPct}%)` : ""} have no publication in the
            last ten years and no interventional trial — intersection of the
            publications and trials denominators (
            {aggregate.publicationsDenominator.toLocaleString("en")} and{" "}
            {aggregate.trialsDenominator.toLocaleString("en")} respectively).
            Obsolete and “non rare in Europe” Orphanet entries are removed
            before sampling.
          </p>
          {sampling && (
            <p className="mt-3 font-mono text-xs text-mute">
              Corpus: {sampling.mode}
              {sampling.n != null ? ` n=${sampling.n}` : ""}
              {sampling.seed != null ? ` seed=${sampling.seed}` : ""}
              {sampling.excludedObsoleteOrNonRare
                ? ` · excluded ${sampling.excludedObsoleteOrNonRare} obsolete/non-rare`
                : ""}
            </p>
          )}
        </div>

        <aside className="animate-rise min-w-0 border-t border-line pt-8 [animation-delay:120ms] lg:sticky lg:top-[6rem] lg:self-start lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <h2 className="font-serif text-title text-ink">Find a condition</h2>
          <p className="mb-6 mt-2 font-sans text-sm leading-relaxed text-mute">
            Search Orphanet preferred names, synonyms, or ORPHA codes — or{" "}
            <Link
              href="/landscape"
              className="underline decoration-line underline-offset-2 hover:text-ink"
            >
              see the whole landscape as a heat map
            </Link>
            .
          </p>
          <SearchBox diseases={searchIndex} inputId="homepage-disease-search" />
        </aside>
        </div>
      </section>

      <section className="border-t border-line py-12">
        <h2 className="font-serif text-title text-ink">Where the numbers come from</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="font-sans text-sm font-medium text-ink">Sources</h3>
            <ul className="mt-3 space-y-2 font-sans text-sm leading-relaxed text-mute">
              <li>Orphanet nomenclature (CC BY 4.0) — names, synonyms, definitions, prevalence class</li>
              <li>Mondo Disease Ontology — hierarchy for naming artifacts and India umbrella matching</li>
              <li>Europe PMC — publication counts, authors, yearly trend</li>
              <li>ClinicalTrials.gov — interventional trials headline; observational studies and pan-registries shown separately</li>
              <li>GenCC — gene–disease validity classification</li>
              <li>India NPRD 2021 — hand-curated policy layer</li>
            </ul>
          </div>
          <div>
            <h3 className="font-sans text-sm font-medium text-ink">Limits</h3>
            <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
              Counts are built from name matching. Synonyms help, but polysemy
              still produces false positives and gaps. Every disease page shows
              the exact query, a confidence label, and how to report errors.
              This is derived landscape data — not medical advice.
            </p>
            <p className="mt-3 font-mono text-xs text-mute">
              {dataAsOfLabel(diseasesArtifact)} · Orphanet{" "}
              {diseasesArtifact.sourceVersions.orphanetProduct1}
              {diseasesArtifact.corpusLevels
                ? ` · Disorder-level corpus ${diseasesArtifact.corpusLevels.commonlyCitedDisorderLevel.toLocaleString("en")}`
                : ""}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
