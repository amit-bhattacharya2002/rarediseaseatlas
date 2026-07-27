import { LiveTrialCheck } from "@/components/LiveTrialCheck";
import { TrialListItem } from "@/components/disease/TrialListItem";
import { dataAsOfLabel, formatSnapshotDate } from "@/lib/dates";
import type {
  DiseasesArtifact,
  DiseaseRecord,
  RegistryTrialRecord,
} from "@/lib/types";
import { formatCount, trialsComparativeLine, trialsPlain } from "@/lib/plain-copy";

function RegistryListItem({ trial }: { trial: RegistryTrialRecord }) {
  return (
    <li>
      <a
        href={trial.url}
        className="font-sans text-sm text-ink underline decoration-line underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="font-mono uppercase">{trial.registry}</span>
        <span className="mx-2 text-mute">·</span>
        <span className="font-mono">{trial.id}</span>
        {trial.status ? (
          <>
            <span className="mx-2 text-mute">·</span>
            <span className="font-mono text-xs uppercase tracking-wider text-mute">
              {trial.status}
            </span>
          </>
        ) : null}
        <span className="mx-2 text-mute">·</span>
        {trial.title}
      </a>
      {trial.relevance?.reason ? (
        <p className="mt-1 font-sans text-xs leading-relaxed text-mute">
          {trial.relevance.consensus === "relevant"
            ? "Confirmed"
            : trial.relevance.consensus === "parent-category"
              ? "Parent category"
              : trial.relevance.consensus === "uncertain"
                ? "Uncertain"
                : trial.relevance.consensus}{" "}
          — {trial.relevance.reason}
        </p>
      ) : null}
    </li>
  );
}

export function DiseaseTrials({
  d,
  artifact,
  publishedAsOf,
  trialsCompare,
}: {
  d: DiseaseRecord;
  artifact: DiseasesArtifact;
  publishedAsOf: string;
  trialsCompare: string | null;
}) {
  const zeroTrials = d.trials.total === 0;
  const trialsUnknown = d.trials.total == null;
  const observationalStudies = d.trials.observational ?? [];
  const observationalTotal = d.trials.observationalTotal ?? 0;
  const generalRegistries = d.trials.generalRegistries ?? [];
  const parent = d.trials.parentCategory;
  const secondary = d.trials.secondaryRegistries;
  const ctgovSearchUrl = d.trials.query
    ? `https://clinicaltrials.gov/search?cond=${encodeURIComponent(d.trials.query)}`
    : null;

  return (
    <div id="trials-studies" className="scroll-mt-16">
      <section className="mt-12 border-t border-line pt-10">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
          Clinical research
        </p>
        <h2 className="mt-2 font-serif text-title text-ink">
          Is a treatment being tested?
        </h2>
        <p className="mt-3 font-mono text-3xl tabular-nums text-ink">
          {formatCount(d.trials.total)}
        </p>
        <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-mute">
          interventional trials for this specific condition
        </p>
        <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
          {trialsPlain(d)}
        </p>
        <p className="mt-1 font-sans text-xs text-mute">
          {dataAsOfLabel(artifact)}
          {d.lastTrialCheck
            ? ` · last trial check ${formatSnapshotDate(d.lastTrialCheck)}`
            : ""}
        </p>
        <LiveTrialCheck
          orphaCode={d.orphaCode}
          publishedTotal={d.trials.total}
          publishedQuery={d.trials.query}
          publishedAsOf={publishedAsOf}
        />
        {trialsCompare && (
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-ink/90">
            {trialsCompare}
          </p>
        )}
        <p className="mt-1 font-mono text-[10px] text-mute">
          {d.confidence} confidence
          {d.trialsPercentile != null
            ? ` · ${d.trialsPercentile}th percentile (trials denominator)`
            : ""}
        </p>
      </section>

      <section className="mt-10 border border-line px-5 py-6">
        <h3 className="font-serif text-lg text-ink">
          Recruiting interventional trials
        </h3>
        <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-mute">
          From the matched ClinicalTrials.gov set
        </p>
        {trialsUnknown ? (
          <p className="mt-3 font-sans text-sm text-mute">
            Trial data could not be loaded for this build. This is not the same
            as finding zero interventional trials.
          </p>
        ) : zeroTrials ? (
          <div className="mt-3">
            <p className="font-sans text-sm text-mute">
              No interventional trial testing a treatment was found for this
              specific condition name on ClinicalTrials.gov.
            </p>
            {parent && (parent.total ?? 0) > 0 ? (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ink/90">
                {formatCount(parent.total)} interventional trial
                {parent.total === 1 ? "" : "s"} matched {parent.label}, the
                broader category — listed below. Those studies are not counted in
                the condition-specific total.
              </p>
            ) : parent ? (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ink/90">
                Broader category{" "}
                <span className="text-ink">{parent.label}</span> also has no
                matched interventional trial. See who&apos;s working on it —
                people publishing on this disease are often the practical next
                contact when no trial is listed.
              </p>
            ) : (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ink/90">
                See who&apos;s working on it — people publishing on this disease
                are often the practical next contact when no trial is listed.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mt-3 font-sans text-sm text-mute">
              {formatCount(d.trials.total)} interventional trials matched after
              quoted-phrase search and title/condition post-filter
              {d.trials.fullyScanned ? "" : " (lower bound; result set capped)"}
              .
            </p>
            {d.trials.recruiting.length === 0 ? (
              <p className="mt-3 font-sans text-sm text-mute">
                No currently recruiting studies in the matched set.{" "}
                {ctgovSearchUrl && (
                  <a
                    href={ctgovSearchUrl}
                    className="underline decoration-line underline-offset-2 hover:text-ink"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the same search on ClinicalTrials.gov
                  </a>
                )}
                .
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {d.trials.recruiting.map((t) => (
                  <TrialListItem key={t.nctId} trial={t} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {parent && (
        <section className="mt-10 border border-line px-5 py-6">
          <h3 className="font-serif text-lg text-ink">
            Broader category: {parent.label}
          </h3>
          <p className="mt-2 font-mono text-2xl tabular-nums text-ink">
            {formatCount(parent.total)}
          </p>
          <p className="mt-1 font-sans text-sm leading-relaxed text-mute">
            Interventional trials for the parent category, exclusive of NCT IDs
            already counted above. Eligibility for this subtype is not guaranteed.
          </p>
          {(parent.total ?? 0) > 0 ? (
            <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
              Worth raising with a clinician.{" "}
              <a
                href="/about#how-we-count-trials"
                className="underline decoration-line underline-offset-2 hover:text-ink"
              >
                How we count trials
              </a>
              .
            </p>
          ) : (
            <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
              Parent-category matching found a broader label but no interventional
              trials under it.{" "}
              <a
                href="/about#how-we-count-trials"
                className="underline decoration-line underline-offset-2 hover:text-ink"
              >
                How we count trials
              </a>
              .
            </p>
          )}
          {(parent.recruiting?.length ?? 0) > 0 && (
            <>
              <p className="mt-4 font-sans text-xs uppercase tracking-[0.12em] text-mute">
                Recruiting under the broader category
              </p>
              <ul className="mt-3 space-y-4">
                {parent.recruiting.map((t) => (
                  <TrialListItem key={t.nctId} trial={t} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {observationalTotal > 0 && (
        <section className="mt-10 border border-line bg-sand-50/40 px-5 py-6">
          <h3 className="font-serif text-lg text-ink">
            Observational and natural-history studies
          </h3>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            {observationalTotal.toLocaleString("en")} observational stud
            {observationalTotal === 1 ? "y matches" : "ies match"} this
            condition. These do not test a treatment and are not counted in the
            interventional-trial headline, but they are genuine research:
            natural-history work often defines the endpoints needed for a future
            rare-disease trial, and families may be able to enroll.
          </p>
          {observationalStudies.length > 0 ? (
            <>
              <p className="mt-3 font-sans text-xs uppercase tracking-[0.12em] text-mute">
                Recruiting or not-yet-recruiting
              </p>
              <ul className="mt-3 space-y-4">
                {observationalStudies.map((study) => (
                  <TrialListItem key={study.nctId} trial={study} />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 font-sans text-sm text-mute">
              None of the matched observational studies is currently listed as
              recruiting.
            </p>
          )}
          {ctgovSearchUrl && (
            <p className="mt-4 font-sans text-sm text-mute">
              <a
                href={ctgovSearchUrl}
                className="underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the complete matched search on ClinicalTrials.gov
              </a>
            </p>
          )}
        </section>
      )}

      {generalRegistries.length > 0 && (
        <section className="mt-10 border border-line px-5 py-6">
          <h3 className="font-serif text-lg text-ink">
            General rare disease registries you may be eligible for
          </h3>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            These studies enroll across many rare conditions. They are not
            counted as evidence that anyone is studying this specific disease.
          </p>
          <ul className="mt-4 space-y-4">
            {generalRegistries.map((t) => (
              <TrialListItem key={t.nctId} trial={t} />
            ))}
          </ul>
        </section>
      )}

      {secondary && (
        <section className="mt-10 border border-line bg-sand-50/30 px-5 py-6">
          <h3 className="font-serif text-lg text-ink">
            Other registries (secondary)
          </h3>
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
            Broader net from EU CTIS, ISRCTN, and ICTRP when available — deduped
            against ClinicalTrials.gov IDs already counted above. Dual-model LLM
            relevance gates what we keep. These rows are{" "}
            <span className="text-ink">not</span> added to the interventional
            headline.
          </p>
          <p className="mt-2 font-mono text-[11px] text-mute">
            raw {secondary.rawFetched} · after dedupe {secondary.afterDedupe} ·
            already on CT.gov {secondary.alreadyOnCtgov} · kept{" "}
            {secondary.kept.length} · parent {secondary.parentCategory.length} ·
            uncertain {secondary.uncertain.length} · dropped{" "}
            {secondary.droppedCount}
            {secondary.fetchedAt
              ? ` · fetched ${secondary.fetchedAt.slice(0, 10)}`
              : ""}
          </p>
          {secondary.sourceErrors &&
            Object.keys(secondary.sourceErrors).length > 0 && (
              <p className="mt-2 font-sans text-xs leading-relaxed text-mute">
                Source notes:{" "}
                {Object.entries(secondary.sourceErrors)
                  .map(([k, v]) => `${k}: ${v.slice(0, 120)}`)
                  .join(" · ")}
              </p>
            )}
          {secondary.kept.length > 0 ? (
            <ul className="mt-4 space-y-4">
              {secondary.kept.map((t) => (
                <RegistryListItem key={`${t.registry}-${t.id}`} trial={t} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 font-sans text-sm text-mute">
              No secondary-registry studies passed dual-model relevance for this
              condition name (after dedupe).
            </p>
          )}
          {secondary.parentCategory.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer font-sans text-sm font-medium text-ink">
                Broader / parent-category hits ({secondary.parentCategory.length})
              </summary>
              <ul className="mt-3 space-y-4">
                {secondary.parentCategory.map((t) => (
                  <RegistryListItem key={`p-${t.registry}-${t.id}`} trial={t} />
                ))}
              </ul>
            </details>
          )}
          {secondary.uncertain.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer font-sans text-sm font-medium text-ink">
                Uncertain / not reviewed ({secondary.uncertain.length})
              </summary>
              <ul className="mt-3 space-y-4">
                {secondary.uncertain.slice(0, 25).map((t) => (
                  <RegistryListItem key={`u-${t.registry}-${t.id}`} trial={t} />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
