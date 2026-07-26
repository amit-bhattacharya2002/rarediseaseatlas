import type { ReactNode } from "react";
import Link from "next/link";
import {
  findingsDatedFilename,
  type FindingsSnapshot,
} from "@/lib/findings";
import { formatSnapshotDate } from "@/lib/dates";

function OrphaLink({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`https://www.orpha.net/en/disease/detail/${code}`}
      className="underline decoration-line underline-offset-2 hover:text-ink"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

export function FindingsBody({
  f,
  allDates,
  liveHeadline,
}: {
  f: FindingsSnapshot;
  allDates: string[];
  /** Present-tense live site share, for the cross-link note. */
  liveHeadline: string | null;
}) {
  const cl = f.corpusLevels;
  const s = f.searchability;
  const t = f.trials;
  const defects = f.labelDefects.defects;
  const asOf = formatSnapshotDate(f.snapshotDate);
  const datedFile = findingsDatedFilename(f);

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="font-sans text-xs uppercase tracking-[0.14em] text-mute">
        Methods &amp; findings · historical freeze · {f.snapshotDate}
      </p>
      <h1 className="mt-3 font-serif text-display-sm text-ink">
        What querying rare-disease names at scale showed
      </h1>
      <p className="mt-5 font-sans text-lede text-mute">
        As of {asOf}, a random sample of {f.sampling.n} Orphanet entities (seed{" "}
        {f.sampling.seed}) drawn from{" "}
        {cl.atlasUsableEstimate.toLocaleString("en")} usable non-group entries
        after housekeeping exclusions. Orphanet product1 dated{" "}
        {f.orphanetVersion}; Mondo {f.mondoVersion ?? "n/a"}; GenCC{" "}
        {f.genccVersion}. Snapshot file{" "}
        <span className="font-mono text-ink">{datedFile}</span>.
      </p>
      <p className="mt-4 rounded-none border border-line bg-sand-50/60 px-4 py-3 font-sans text-sm leading-relaxed text-mute">
        This page is a fixed historical measurement. Numbers below do not update
        when the live atlas refreshes.{" "}
        {liveHeadline ? (
          <>
            Current site-wide figure:{" "}
            <Link href="/" className="underline decoration-line underline-offset-2 hover:text-ink">
              {liveHeadline}
            </Link>
            .
          </>
        ) : (
          <>
            See the{" "}
            <Link href="/" className="underline decoration-line underline-offset-2 hover:text-ink">
              live homepage
            </Link>{" "}
            for current-state counts.
          </>
        )}
      </p>
      {allDates.length > 1 ? (
        <p className="mt-4 font-sans text-xs text-mute">
          Published snapshots:{" "}
          {allDates.map((d, i) => (
            <span key={d}>
              {i > 0 ? " · " : null}
              {d === f.snapshotDate ? (
                <span className="font-mono text-ink">{d}</span>
              ) : (
                <Link
                  href={`/findings/${d}`}
                  className="font-mono underline decoration-line underline-offset-2 hover:text-ink"
                >
                  {d}
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}
      <p className="mt-4 font-sans text-sm leading-relaxed text-mute">
        As of {asOf}, {s.brokenQueryRows} of {s.sampled} preferred names (
        {s.brokenSharePct}%) returned no results in either Europe PMC or
        ClinicalTrials.gov under our queries. Depending on whether broader
        parent-category trial registrations counted,{" "}
        {t.noTrialsParentInclusivePct}%–{t.noTrialsSpecificPct}% of the{" "}
        {t.trialsDenominator} diseases sampled with usable trial matching had no
        registered interventional trial (preliminary). Official nomenclature and
        the language of papers and registries often diverged — even when preferred
        labels were carefully curated.
      </p>

      <nav
        aria-label="On this page"
        className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-y border-line py-3 font-sans text-xs text-mute"
      >
        {[
          ["why", "Why this exists"],
          ["nomenclature", "Nomenclature"],
          ["housekeeping", "Housekeeping entries"],
          ["hyper-specific", "Hyper-specific labels"],
          ["trials", "Trial measurement"],
          ["method-fragility", "Method fragility"],
          ["methods", "Methods"],
          ["limitations", "Limitations"],
          ["reproduce", "Reproduce"],
          ["corrections", "Corrections"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="why" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Why this exists</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Rare disease reference data is built for looking up one condition at a
          time. Querying thousands of official names against literature and trial
          registries surfaces mismatches that are invisible at single-record
          scale. These notes are findings about that scale problem. They depend
          on Orphanet as an open public nomenclature — the comparisons are
          possible because the data can be read systematically.
        </p>
      </section>

      <section id="corpus" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          What “11,645” and “about 7,000” each mean
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Orphanet product1 in this freeze contains{" "}
          <span className="font-mono text-ink">
            {cl.product1Total.toLocaleString("en")}
          </span>{" "}
          nomenclature rows, not {cl.product1Total.toLocaleString("en")}{" "}
          independent clinical diseases. Rows classify as:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 font-sans text-sm text-mute">
          <li>
            <span className="font-mono text-ink">
              {cl.byDisorderGroup.Disorder.toLocaleString("en")}
            </span>{" "}
            Disorder
          </li>
          <li>
            <span className="font-mono text-ink">
              {cl.byDisorderGroup["Subtype of disorder"].toLocaleString("en")}
            </span>{" "}
            Subtype of disorder
          </li>
          <li>
            <span className="font-mono text-ink">
              {cl.byDisorderGroup["Group of disorders"].toLocaleString("en")}
            </span>{" "}
            Group of disorders
          </li>
        </ul>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The commonly cited figure of roughly 7,000 rare diseases aligns with
          the Disorder level alone (
          <span className="font-mono text-ink">
            {cl.commonlyCitedDisorderLevel.toLocaleString("en")}
          </span>{" "}
          in this dump), not with groups or every subtype. This atlas drops
          groups, then drops preferred names marked{" "}
          <span className="font-mono">OBSOLETE:</span> or{" "}
          <span className="font-mono">NON RARE IN EUROPE:</span> (
          {cl.excludedObsoleteOrNonRarePreferredNames.toLocaleString("en")}{" "}
          such names among non-group rows), leaving about{" "}
          <span className="font-mono text-ink">
            {cl.atlasUsableEstimate.toLocaleString("en")}
          </span>{" "}
          usable entities. The sample of {f.sampling.n} is drawn from that
          usable set.
        </p>
      </section>

      <section id="nomenclature" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          1. Official nomenclature and publication/registry language diverge
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          In the sample of {s.sampled},{" "}
          <span className="font-mono text-ink">
            {s.brokenQueryRows.toLocaleString("en")}
          </span>{" "}
          preferred names ({s.brokenSharePct}%) returned no results in either
          Europe PMC or ClinicalTrials.gov under phrase, MeSH (when available),
          and recall-expansion queries. That is not evidence that research is
          absent; it is evidence that those official strings do not function as
          search terms in those databases.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Separately, publication metrics use a stricter credibility set:{" "}
          <span className="font-mono text-ink">
            {s.publicationsDenominator.toLocaleString("en")}
          </span>{" "}
          of {s.sampled} ({pctIncluded(s.publicationsDenominator, s.sampled)}%)
          remain in the publications denominator. The other{" "}
          <span className="font-mono text-ink">
            {s.publicationsExcludedFromDenom.toLocaleString("en")}
          </span>{" "}
          ({s.publicationsExcludedPct}%) are excluded because the name does not
          reliably retrieve literature under our rules (including
          name-collision / neglect flags and queries that return nothing). Roughly
          a third of sampled entries therefore do not support a clean
          literature count from the preferred label alone.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Orphanet&apos;s preferred-label curation is excellent by ordinary
          catalogue standards: among{" "}
          {f.labelDefects.disorderEntriesInProduct1.toLocaleString("en")}{" "}
          product1 rows we verified only{" "}
          {f.labelDefects.upstreamPreferredLabelMisspellings} clear
          character-level misspellings in preferred names (
          {f.labelDefects.upstreamShareOfProduct1Pct}% of rows). The
          searchability gap is therefore not explained by typographical quality.
          Official names and the names used in papers and trial registrations
          behave like different vocabularies.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Examples of names that returned nothing in either database in this
          sample:
        </p>
        <ul className="mt-3 space-y-2 font-sans text-sm text-mute">
          {s.examples.map((ex) => (
            <li key={ex.orphaCode}>
              <OrphaLink code={ex.orphaCode}>ORPHA:{ex.orphaCode}</OrphaLink>{" "}
              <span className="text-ink">{ex.name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-sans text-xs text-mute">
          Reproduce: load{" "}
          <span className="font-mono">{datedFile}</span>, field{" "}
          <span className="font-mono">searchability</span>; per-disease query
          strings are on each disease page.
        </p>
      </section>

      <section id="housekeeping" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          2. {f.housekeeping.excludedObsoleteOrNonRare.toLocaleString("en")}{" "}
          corpus entries are housekeeping labels
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Before sampling, this atlas excludes preferred names that begin with{" "}
          <span className="font-mono">OBSOLETE:</span> or{" "}
          <span className="font-mono">NON RARE IN EUROPE:</span> —{" "}
          <span className="font-mono text-ink">
            {f.housekeeping.excludedObsoleteOrNonRare.toLocaleString("en")}
          </span>{" "}
          such rows among non-group entities in this product1 freeze. Those
          prefixes are operational markers in the nomenclature file. A literal
          search for a string such as{" "}
          <span className="font-mono">
            &quot;NON RARE IN EUROPE: Tourette syndrome&quot;
          </span>{" "}
          returns nothing in the literature databases, which would incorrectly
          describe a well-studied condition as unresearched if the prefix were
          queried as part of the name.
        </p>
      </section>

      <section id="hyper-specific" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          3. Hyper-specific labels behave like index entries, not search names
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Long multi-feature syndrome strings and{" "}
          <span className="font-mono">&lt;GENE&gt;-related …</span> constructions
          often return no (or almost no) publications under the preferred label,
          while a broader Mondo parent concept still has substantial indexed
          literature. In this sample,{" "}
          {f.hyperSpecificLabels.countZeroWithInformativeParent} entities had
          zero publications under the preferred name yet an informative parent
          probe with at least 50 hits. Examples:
        </p>
        <ul className="mt-4 space-y-4 font-sans text-sm text-mute">
          {f.hyperSpecificLabels.examples.map((ex) => (
            <li key={ex.orphaCode}>
              <OrphaLink code={ex.orphaCode}>ORPHA:{ex.orphaCode}</OrphaLink>{" "}
              <span className="text-ink">{ex.name}</span>
              <br />
              Preferred-label publications:{" "}
              <span className="font-mono text-ink">{ex.publicationTotal}</span>
              {ex.mondoParentLabel && ex.mondoParentPublications != null ? (
                <>
                  ; Mondo parent &ldquo;{ex.mondoParentLabel}&rdquo;:{" "}
                  <span className="font-mono text-ink">
                    {ex.mondoParentPublications.toLocaleString("en")}
                  </span>{" "}
                  publications in the parent probe
                </>
              ) : null}
              .
            </li>
          ))}
        </ul>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The sample also contains{" "}
          {f.hyperSpecificLabels.geneRelatedInSample} labels matching a{" "}
          <span className="font-mono">GENE-related …</span> pattern, including
          cases that return nothing under that exact string.
        </p>
      </section>

      <section id="trials" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          4. Measurement sensitivity: parent category versus specific name
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          <span className="font-mono text-ink">Preliminary.</span>{" "}
          {t.preliminaryNote}
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          As of {asOf}, among{" "}
          <span className="font-mono text-ink">
            {t.trialsDenominator.toLocaleString("en")}
          </span>{" "}
          diseases with usable interventional-trial matching:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-sans text-sm text-mute">
          <li>
            <span className="font-mono text-ink">
              {t.noTrialsSpecific.toLocaleString("en")}
            </span>{" "}
            of {t.trialsDenominator.toLocaleString("en")} (
            {t.noTrialsSpecificPct}%) had no interventional trial under the
            specific condition name
          </li>
          <li>
            <span className="font-mono text-ink">
              {t.noTrialsParentInclusive.toLocaleString("en")}
            </span>{" "}
            of {t.trialsDenominator.toLocaleString("en")} (
            {t.noTrialsParentInclusivePct}
            %) still had none if broader parent-category registrations were
            treated as filling a zero
          </li>
        </ul>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          As of {asOf}, {t.noTrialsParentInclusivePct}% of the{" "}
          {t.trialsDenominator} diseases sampled had no registered interventional
          trial when parent-category hits counted; {t.noTrialsSpecificPct}% had
          none under the specific condition name alone.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The {t.noTrialsParentInclusivePct}%–{t.noTrialsSpecificPct}% spread is
          a finding about measurement difficulty: whether a subtype “inherits”
          its parent disease’s trials is a judgment, and both answers change the
          headline in the same underlying data. Disease pages show both tiers
          when a parent category exists.
        </p>
      </section>

      <section id="method-fragility" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          5. Method fragility: a single character can erase retrievability
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Character-level misspellings in preferred labels are rare —{" "}
          {f.labelDefects.upstreamPreferredLabelMisspellings} verified upstream
          cases among{" "}
          {f.labelDefects.disorderEntriesInProduct1.toLocaleString("en")}{" "}
          product1 rows ({f.labelDefects.upstreamShareOfProduct1Pct}%). That
          rate is consistent with careful curation. They matter here as an
          illustration of method fragility under the nomenclature finding: exact
          string matching has no tolerance for a missing letter.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          <OrphaLink code="436159">ORPHA:436159</OrphaLink> shows this clearly.
          The preferred label reads &ldquo;
          {defects.find((d) => d.orphaCode === "436159")?.preferredLabel}
          &rdquo; (one character short of &ldquo;haploinsufficiency&rdquo;). One
          synonym repeats the same spelling; another spells it correctly — so
          retrieval is partly rescued by synonym coverage the preferred label
          does not control. Verified upstream (not introduced by our parser):
        </p>
        <ul className="mt-3 space-y-3 font-sans text-sm text-mute">
          {defects.map((d) => (
            <li key={d.orphaCode}>
              <OrphaLink code={d.orphaCode}>ORPHA:{d.orphaCode}</OrphaLink>{" "}
              <span className="text-ink">{d.preferredLabel}</span>
              {d.synonyms.length > 0 ? (
                <>
                  {" "}
                  — synonyms include{" "}
                  {d.synonyms.map((syn, i) => (
                    <span key={syn}>
                      {i > 0 ? "; " : null}
                      <span className="font-mono">{syn}</span>
                    </span>
                  ))}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section id="methods" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Methods</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Sources: Orphanet / Orphadata product1 and prevalence products;
          Mondo hierarchy and exact synonyms; GenCC gene–disease validity;
          Europe PMC for publications; ClinicalTrials.gov API v2 for studies.
          Versions are those recorded in the snapshot header above.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Sampling: uniform random draw of {f.sampling.n} entities with seed{" "}
          {f.sampling.seed} from usable non-group Orphanet rows after dropping{" "}
          <span className="font-mono">OBSOLETE:</span> /{" "}
          <span className="font-mono">NON RARE IN EUROPE:</span> preferred names.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Queries: quoted preferred-name and synonym phrases; MeSH descriptor
          labels when Mondo xrefs resolve; gene symbols and carefully filtered
          recall expansions for trials. Names that return nothing on both
          literature and trials are excluded from site-wide denominators.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Two-tier trials: the headline numerator counts only interventional
          studies matched to the specific condition name. A separate
          parent-category tier (singular Mondo name-parent, when present) is
          shown on disease pages and used only for the sensitivity comparison
          above. See also{" "}
          <Link
            href="/about#how-we-count-trials"
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            How we count trials
          </Link>
          .
        </p>
      </section>

      <section id="limitations" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Limitations</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-sans text-sm text-mute">
          <li>
            Findings are from a {f.sampling.n}-disease sample, not the full
            usable corpus of ~{cl.atlasUsableEstimate.toLocaleString("en")}.
          </li>
          <li>
            Trial relevance is not yet fully human-validated; the sensitivity
            range is preliminary.
          </li>
          <li>
            Publication counts are noisy (indexing delays, name variants, full
            text versus structured fields).
          </li>
          <li>
            Matching errors run in both directions: false positives and false
            negatives.
          </li>
          <li>
            The India NPRD policy mapping on disease pages is hand-curated and
            may be incomplete.
          </li>
        </ul>
      </section>

      <section id="reproduce" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Reproduce this</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Numbers on this page come only from the dated freeze{" "}
          <span className="font-mono text-ink">{datedFile}</span>, built from{" "}
          <span className="font-mono">{f.artifactSource}</span> and{" "}
          <span className="font-mono">{f.defectProvenanceSource}</span>. New
          measurements write a new dated file; existing snapshots are never
          overwritten. Defect provenance:{" "}
          <span className="font-mono">npx tsx scripts/verify-defects.ts</span>{" "}
          (reads cached Orphanet XML only). Repository licence: Apache-2.0.
        </p>
      </section>

      <section id="corrections" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Corrections log</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Snapshots are append-only. Corrections ship as a new dated freeze, not
          by editing this file in place.
        </p>
      </section>
    </div>
  );
}

function pctIncluded(numer: number, denom: number): string {
  if (denom <= 0) return "—";
  return (Math.round((1000 * numer) / denom) / 10).toFixed(1);
}
