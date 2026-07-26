import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { GlossaryText } from "@/components/GlossaryText";
import { LimitationsNote } from "@/components/LimitationsNote";
import { ResearchersBlock } from "@/components/ResearchersBlock";
import { ShareButton } from "@/components/ShareButton";
import { SignalGlyph } from "@/components/SignalGlyph";
import { Sparkline } from "@/components/Sparkline";
import { LiveTrialCheck } from "@/components/LiveTrialCheck";
import {
  diseasesArtifact,
  getAggregate,
  getAllDiseases,
  getDisease,
  getDistributions,
  indiaNprd,
  indiaStaleWarning,
  reportErrorUrl,
  UMBRELLA_ORGS,
} from "@/lib/data";
import { dataAsOfLabel, formatSnapshotDate } from "@/lib/dates";
import {
  formatCount,
  friendMeaningBlock,
  geneValidityPlain,
  prevalencePlain,
  publicationComparison,
  publicationsComparativeLine,
  trialsComparativeLine,
  trialsPlain,
} from "@/lib/plain-copy";
import { diseaseSignals } from "@/lib/signals";
import { SITE_NAME } from "@/lib/site";

export function generateStaticParams() {
  return getAllDiseases().map((d) => ({ orphacode: d.orphaCode }));
}

export function generateMetadata({
  params,
}: {
  params: { orphacode: string };
}): Metadata {
  const d = getDisease(params.orphacode);
  if (!d) return { title: "Disease not found", robots: { index: false } };
  const description = `Research attention for ${d.name} (ORPHA:${d.orphaCode}): ${formatCount(d.publications.total)} publications, ${formatCount(d.researchers.distinctCount)} researchers, ${formatCount(d.trials.total)} interventional trials — ${SITE_NAME}.`;
  const path = `/disease/${d.orphaCode}`;
  return {
    title: d.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${d.name} · ${SITE_NAME}`,
      description,
      url: path,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${d.name} · ${SITE_NAME}`,
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

  const signals = diseaseSignals(d);
  const distributions = getDistributions();
  const zeroTrials = d.trials.total === 0;
  const zeroPubs = d.publications.total === 0;
  const pubsUnknown = d.publications.total == null;
  const trialsUnknown = d.trials.total == null;
  const genePlain = geneValidityPlain(
    d.geneDiseaseValidity.classification,
    d.geneDiseaseValidity.genes
  );
  const prevalence = prevalencePlain(d.prevalenceClass);
  const friend = friendMeaningBlock(d);
  const plain = d.plainLanguageDefinition;
  const aggregate = getAggregate();
  const trialsCompare = trialsComparativeLine(d, aggregate);
  const pubsCompare = publicationsComparativeLine(d, distributions);
  const publishedAsOf = formatSnapshotDate(
    d.lastTrialCheck ??
      diseasesArtifact.lastRefresh ??
      diseasesArtifact.lastFullIngest ??
      diseasesArtifact.generatedAt
  );
  const observationalStudies = d.trials.observational ?? [];
  const observationalTotal = d.trials.observationalTotal ?? 0;
  const generalRegistries = d.trials.generalRegistries ?? [];
  const indiaStale = indiaStaleWarning();
  const ctgovSearchUrl = d.trials.query
    ? `https://clinicaltrials.gov/search?cond=${encodeURIComponent(d.trials.query)}`
    : null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-5">
            <SignalGlyph
              publications={signals.publications}
              researchers={signals.researchers}
              trials={signals.trials}
              size="lg"
              className="mt-1 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-mono text-xs text-mute">ORPHA:{d.orphaCode}</p>
              <h1 className="mt-2 font-serif text-display-sm text-ink">{d.name}</h1>
              <div className="mt-3">
                <ConfidenceBadge confidence={d.confidence} />
              </div>
            </div>
          </div>
        </div>
        <ShareButton
          title={`${d.name} — Is Anyone Working On This?`}
          path={`/disease/${d.orphaCode}`}
        />
      </div>

      {d.synonyms.length > 0 && (
        <p className="mt-6 font-sans text-sm leading-relaxed text-mute">
          <span className="text-ink">Also known as: </span>
          {d.synonyms.join(" · ")}
        </p>
      )}

      {d.nameCorrected && (
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          <span className="text-ink">Label correction detected: </span>
          the source name appears to read{" "}
          <span className="font-mono">{d.nameCorrected}</span>. We queried using
          both the original and corrected forms; the Orphanet source value is
          never overwritten.
        </p>
      )}

      {d.queryHealth?.status === "broken" && (
        <aside className="mt-6 border border-ink/30 bg-sand-50/70 px-5 py-4 font-sans text-sm leading-relaxed text-ink">
          We could not construct a reliable search for this condition name — every
          strategy we tried returned nothing on both Europe PMC and
          ClinicalTrials.gov. This is a limitation of our method, not evidence
          about the condition. This page is excluded from every site-wide
          statistic.{" "}
          <a
            href="/findings#nomenclature"
            className="underline decoration-line underline-offset-2 hover:opacity-80"
          >
            Why some official names return no results
          </a>
          .
        </aside>
      )}

      {d.queryHealth?.status === "suspect" && (
        <p className="mt-4 border-l-2 border-line pl-3 font-sans text-xs leading-relaxed text-mute">
          Query health: suspect — {d.queryHealth.reasons.join(" ")}
        </p>
      )}

      <nav
        aria-label="On this disease page"
        className="sticky top-[3.75rem] z-20 -mx-5 mt-8 overflow-x-auto border-y border-line bg-ground/95 px-2 backdrop-blur sm:top-[4.25rem] sm:mx-0 sm:px-0"
      >
        <div className="flex min-w-max items-center sm:min-w-0 sm:flex-wrap">
          {[
            ["overview", "Overview"],
            ["research", "Research"],
            ["trials-studies", "Trials & studies"],
            ["support", "Support"],
            ["india", "India"],
            ["methods", "Methods"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="min-h-11 whitespace-nowrap px-3 py-3 font-sans text-xs font-medium text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:px-4"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div id="overview" className="scroll-mt-16">
      {/* Two registers — plain first, clinical below */}
      {(plain || d.definition) && (
        <div className="mt-8 max-w-3xl space-y-5">
          {plain && (
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
                In plain terms
              </p>
              <p className="mt-2 font-sans text-lede leading-relaxed text-ink">
                <GlossaryText text={plain} />
              </p>
              <p className="mt-2 font-sans text-xs text-mute">
                Machine-generated from the Orphanet definition only — check the
                clinical text below.
              </p>
            </div>
          )}
          {d.definition && (
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
                Clinical definition (Orphanet)
              </p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
                <GlossaryText text={d.definition} />
              </p>
            </div>
          )}
        </div>
      )}

      {prevalence && (
        <p className="mt-6 max-w-2xl font-sans text-sm leading-relaxed text-mute">
          <span className="text-ink">How rare: </span>
          {prevalence}
        </p>
      )}

      <p className="mt-3 font-sans text-sm text-mute">
        <a
          href={d.expertLink}
          className="underline decoration-line underline-offset-2 hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          Orphanet entry
        </a>
      </p>

      {/* Friend's real question */}
      <aside className="mt-10 border border-ink/15 bg-sand-50/50 px-5 py-6 sm:px-7">
        <h2 className="font-serif text-title text-ink">
          What this research picture means
        </h2>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink/90">
          {friend.livingWith}
        </p>
        <h3 className="mt-6 font-sans text-sm font-medium text-ink">
          Potential next steps
        </h3>
        <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
          {friend.ifYouWantToHelp}
        </p>
      </aside>

      <div className="mt-10">
        <LimitationsNote orphaCode={d.orphaCode} name={d.name} />
      </div>

      {zeroPubs &&
        (d.geneDiseaseValidity.classification === "Definitive" ||
          d.geneDiseaseValidity.classification === "Strong") && (
          <aside className="mt-8 border border-line bg-sand-50/60 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
            No publications matched this name, but GenCC rates the gene–disease
            link as {d.geneDiseaseValidity.classification}
            {d.geneDiseaseValidity.genes.length
              ? ` (${d.geneDiseaseValidity.genes.join(", ")})`
              : ""}
            . Literature likely exists under another disease name — this page is
            excluded from the site-wide neglect count.
          </aside>
        )}
      </div>

      {/* Question-led signals */}
      <div id="research" className="scroll-mt-16">
      <section className="mt-12 grid gap-10 border-t border-line pt-10 sm:grid-cols-2">
        <div>
          <h2 className="font-serif text-title text-ink">Is anyone studying this?</h2>
          <p className="mt-3 font-mono text-3xl tabular-nums text-ink">
            {formatCount(d.publications.total)}
          </p>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            {publicationComparison(d.publications.total, distributions)}
          </p>
          {pubsCompare && (
            <p className="mt-2 font-sans text-sm leading-relaxed text-ink/90">
              {pubsCompare}
            </p>
          )}
          {!pubsUnknown && (
            <div className="mt-3">
              <Sparkline data={d.publications.byYear} />
              <p className="mt-1 font-mono text-[10px] text-mute">
                {formatCount(d.publications.last10Years)} in the last 10 years ·{" "}
                {d.confidence} confidence
                {d.publicationsPercentile != null
                  ? ` · ${d.publicationsPercentile}th percentile (publications denominator)`
                  : ""}
              </p>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-serif text-title text-ink">Is a treatment being tested?</h2>
          <p className="mt-3 font-mono text-3xl tabular-nums text-ink">
            {formatCount(d.trials.total)}
          </p>
          <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-mute">
            trials for this specific condition
          </p>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            {trialsPlain(d)}
          </p>
          <p className="mt-1 font-sans text-xs text-mute">
            {dataAsOfLabel(diseasesArtifact)}
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
          {d.trials.parentCategory &&
            (d.trials.parentCategory.total ?? 0) > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="font-mono text-2xl tabular-nums text-ink">
                  {formatCount(d.trials.parentCategory.total)}
                </p>
                <p className="mt-1 font-sans text-sm leading-relaxed text-ink/90">
                  trials for{" "}
                  <span className="text-ink">{d.trials.parentCategory.label}</span>
                  , the broader category this belongs to
                </p>
                <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
                  Trials registered for a broader category may or may not enrol
                  people with this specific subtype — eligibility criteria vary,
                  and the trial record often doesn&apos;t say. Worth raising with
                  a clinician.{" "}
                  <a
                    href="/about#how-we-count-trials"
                    className="underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    How we count trials
                  </a>
                  .
                </p>
              </div>
            )}
          {trialsCompare && (
            <p className="mt-2 font-sans text-sm leading-relaxed text-ink/90">
              {trialsCompare}
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] text-mute">
            {d.confidence} confidence
            {d.trialsPercentile != null
              ? ` · ${d.trialsPercentile}th percentile (trials denominator)`
              : ""}
          </p>
        </div>

        <div>
          <h2 className="font-serif text-title text-ink">Do we know what causes it?</h2>
          <p className="mt-3 font-sans text-lede text-ink">{genePlain.headline}</p>
          <p className="mt-2 font-mono text-xs text-mute">{genePlain.detail}</p>
        </div>

        <div>
          <h2 className="font-serif text-title text-ink">Who&apos;s working on it?</h2>
          <p className="mt-3 font-mono text-3xl tabular-nums text-ink">
            {formatCount(d.researchers.distinctCount)}
          </p>
          <p className="mt-2 font-sans text-sm text-mute">
            {d.researchers.distinctCount == null
              ? "Author sample unavailable (publications fetch failed)."
              : (() => {
                  const n = d.publications.papersSampledForAuthors ?? 0;
                  return `Distinct author names in ${n.toLocaleString("en")} sampled paper${n === 1 ? "" : "s"}${d.researchers.top.length > 0 ? " — named people below." : "."}`;
                })()}
          </p>
        </div>
      </section>

      <section className="mt-12">
        <ResearchersBlock authors={d.researchers.top} zeroTrials={zeroTrials} />
      </section>
      </div>

      <section
        id="trials-studies"
        className="mt-10 scroll-mt-16 border border-line px-5 py-6"
      >
        <h2 className="font-serif text-lg text-ink">
          Recruiting interventional trials
        </h2>
        <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-mute">
          Trials testing a treatment from the matched ClinicalTrials.gov set
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
            {d.trials.parentCategory &&
            (d.trials.parentCategory.total ?? 0) > 0 ? (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ink/90">
                {formatCount(d.trials.parentCategory.total)} interventional
                trial
                {d.trials.parentCategory.total === 1 ? "" : "s"} matched{" "}
                {d.trials.parentCategory.label}, the broader category — see the
                summary above. Those studies are not counted in the
                condition-specific total.
              </p>
            ) : (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ink/90">
                See who&apos;s working on it above — people publishing on this
                disease are often the practical next contact when no trial is
                listed.
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
              <ul className="mt-4 space-y-3">
                {d.trials.recruiting.map((t) => (
                  <li key={t.nctId}>
                    <a
                      href={t.url}
                      className="font-sans text-sm text-ink underline decoration-line underline-offset-2 hover:opacity-80"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="font-mono">{t.nctId}</span>
                      <span className="mx-2 text-mute">·</span>
                      {t.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {observationalTotal > 0 && (
        <section className="mt-10 border border-line bg-sand-50/40 px-5 py-6">
          <h2 className="font-serif text-lg text-ink">
            Observational and natural-history studies
          </h2>
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
              <ul className="mt-3 space-y-3">
                {observationalStudies.map((study) => (
                  <li key={study.nctId}>
                    <a
                      href={study.url}
                      className="font-sans text-sm text-ink underline decoration-line underline-offset-2 hover:opacity-80"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="font-mono">{study.nctId}</span>
                      <span className="mx-2 text-mute">·</span>
                      {study.title}
                    </a>
                  </li>
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
          <h2 className="font-serif text-lg text-ink">
            General rare disease registries you may be eligible for
          </h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            These studies enroll across many rare conditions. They are not
            counted as evidence that anyone is studying this specific disease.
          </p>
          <ul className="mt-4 space-y-3">
            {generalRegistries.map((t) => (
              <li key={t.nctId}>
                <a
                  href={t.url}
                  className="font-sans text-sm text-ink underline decoration-line underline-offset-2 hover:opacity-80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="font-mono">{t.nctId}</span>
                  <span className="mx-2 text-mute">·</span>
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        id="support"
        className="mt-10 scroll-mt-16 border border-line px-5 py-6"
      >
        <h2 className="font-serif text-title text-ink">Where to find support</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          We do not yet link condition-specific patient organisations. These
          umbrella groups support undiagnosed and ultra-rare families:
        </p>
        <ul className="mt-3 space-y-2">
          {UMBRELLA_ORGS.map((o) => (
            <li key={o.url}>
              <a
                href={o.url}
                className="font-sans text-sm underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                {o.name}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="india"
        className="mt-10 scroll-mt-16 border border-line px-5 py-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-title text-ink">India — NPRD</h2>
          <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
            Last verified {indiaNprd.lastVerified}
          </span>
        </div>
        {indiaStale && (
          <p className="mt-3 border border-line bg-sand-50/60 px-3 py-2 font-sans text-xs text-mute">
            This India policy layer was last verified more than six months ago —
            confirm current MoHFW guidance before acting on it.
          </p>
        )}
        {d.indiaNprd?.listed && d.indiaNprd.groups.length > 0 ? (
          <>
            {d.indiaNprd.via === "direct" ? (
              <p className="mt-3 font-sans text-sm text-ink">
                Directly listed under NPRD
                {d.indiaNprd.groups.length === 1
                  ? ` Group ${d.indiaNprd.groups[0]}`
                  : ` Groups ${d.indiaNprd.groups.join(" and ")}`}
                .
              </p>
            ) : (
              <p className="mt-3 font-sans text-sm text-ink">
                Likely covered — the policy lists{" "}
                <em>
                  {d.indiaNprd.matchedViaLabel ?? "a broader category"}
                </em>{" "}
                as a category
                {d.indiaNprd.groups.length === 1
                  ? ` (Group ${d.indiaNprd.groups[0]})`
                  : ` (Groups ${d.indiaNprd.groups.join(" and ")})`}
                , and this condition is a form of it. Confirm eligibility with a
                Centre of Excellence.
              </p>
            )}
            {d.indiaNprd.entitlements.map((ent) => (
              <div key={ent.label} className="mt-4">
                <p className="font-sans text-sm font-medium text-ink">{ent.label}</p>
                {ent.amountCeiling && (
                  <p className="mt-1 font-mono text-sm text-ink">{ent.amountCeiling}</p>
                )}
                <p className="mt-1 font-sans text-sm leading-relaxed text-mute">
                  {ent.mechanism}
                </p>
                <p className="mt-2 font-sans text-xs leading-relaxed text-mute">
                  {ent.caveat}
                  {ent.verifyUrl ? (
                    <>
                      {" "}
                      <a
                        href={ent.verifyUrl}
                        className="underline decoration-line underline-offset-2 hover:text-ink"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Verify
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            ))}
            <details className="mt-6 border-t border-line pt-4">
              <summary className="cursor-pointer font-sans text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Centres of Excellence ({indiaNprd.centresOfExcellence.length})
              </summary>
              <ul className="mt-3 space-y-2 font-sans text-sm text-mute">
                {indiaNprd.centresOfExcellence.map((c) => (
                  <li key={`${c.name}-${c.city}`}>
                    <span className="text-ink">{c.name}</span>
                    {" — "}
                    {c.city}, {c.state}
                    {c.department ? ` · ${c.department}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </li>
                ))}
              </ul>
            </details>
            <p className="mt-4 font-sans text-sm text-mute">
              Voluntary contributions / crowdfunding (separate from CoE funding):{" "}
              <a
                href={indiaNprd.crowdfundingPortal}
                className="underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                {indiaNprd.crowdfundingPortal}
              </a>
            </p>
          </>
        ) : (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            This ORPHAcode is not on our curated NPRD list (direct or Mondo-parent
            match). That does not decide clinical eligibility; families in India
            should ask a notified Centre of Excellence about current coverage.
          </p>
        )}
        <p className="mt-4 font-sans text-xs text-mute">{indiaNprd.disclaimer}</p>
      </section>

      <details
        id="methods"
        className="mt-10 scroll-mt-16 border border-line px-5 py-4"
      >
        <summary className="cursor-pointer font-serif text-lg text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          How we counted this
        </summary>
        <div className="mt-4 space-y-4 font-sans text-sm leading-relaxed text-mute">
          <p>
            Europe PMC query (preferred label + any corrected label + Orphanet
            and Mondo exact synonyms, stoplisted; unioned with MeSH where a
            cross-reference exists):
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap border border-line bg-ground p-3 font-mono text-xs text-ink">
            {d.query}
          </pre>
          <p>
            <a
              href={d.publications.europePmcUrl}
              className="underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              Run this search on Europe PMC
            </a>
          </p>
          {d.publications.meshQuery && (
            <p>
              MeSH descriptor terms unioned into the query:{" "}
              <span className="font-mono text-ink">{d.meshLabels.join("; ")}</span>
            </p>
          )}
          <p>ClinicalTrials.gov query (quoted phrases + MeSH via query.cond):</p>
          <pre className="overflow-x-auto whitespace-pre-wrap border border-line bg-ground p-3 font-mono text-xs text-ink">
            {d.trials.query || "(empty)"}
          </pre>
          {d.trials.matchedVia && d.trials.matchedVia.length > 0 && (
            <p>
              Interventional trials matched via:{" "}
              <span className="font-mono text-ink">
                {d.trials.matchedVia.join(", ")}
              </span>{" "}
              (mesh = a trial registered its condition under a MeSH descriptor no
              name phrase would catch).
            </p>
          )}
          {d.trials.registeredStudiesTotal != null && (
            <p>
              Study-type breakdown:{" "}
              <span className="font-mono text-ink">
                {d.trials.total ?? 0} interventional ·{" "}
                {d.trials.observationalTotal ?? 0} observational ·{" "}
                {d.trials.expandedAccessTotal ?? 0} expanded access
              </span>
              . Only interventional studies enter the trial headline.
            </p>
          )}
          {(d.identifiers?.mesh?.length ||
            d.identifiers?.omim?.length ||
            d.identifiers?.umls?.length ||
            d.identifiers?.ncit?.length) && (
            <p>
              Cross-references (from Mondo):{" "}
              <span className="font-mono text-ink">
                {[
                  ...(d.identifiers.mesh ?? []).map((x) => `MESH:${x}`),
                  ...(d.identifiers.omim ?? []).map((x) => `OMIM:${x}`),
                  ...(d.identifiers.umls ?? []).map((x) => `UMLS:${x}`),
                  ...(d.identifiers.ncit ?? []).map((x) => `NCIT:${x}`),
                ].join("  ")}
              </span>
            </p>
          )}
          <p>
            Query health:{" "}
            <span className="font-mono text-ink">
              {d.queryHealth?.status ?? "ok"}
            </span>{" "}
            — strategies attempted:{" "}
            {(d.queryHealth?.strategiesAttempted ?? ["phrase"]).join(", ")};
            with hits: {(d.queryHealth?.strategiesWithHits ?? []).join(", ") || "none"}
          </p>
          {ctgovSearchUrl && (
            <p>
              <a
                href={ctgovSearchUrl}
                className="underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Run this search on ClinicalTrials.gov
              </a>
            </p>
          )}
          {d.synonymsDropped.length > 0 && (
            <p>
              Synonyms dropped by stoplist:{" "}
              <span className="font-mono text-ink">
                {d.synonymsDropped.join("; ")}
              </span>
            </p>
          )}
          <p className="font-medium text-ink">Confidence reasoning</p>
          <ul className="list-disc space-y-1 pl-5">
            {d.confidenceReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </details>

      <p className="mt-10 font-sans text-sm">
        <a
          href={reportErrorUrl(d.orphaCode, d.name)}
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Report an error for ORPHA:{d.orphaCode}
        </a>
      </p>
    </div>
  );
}
