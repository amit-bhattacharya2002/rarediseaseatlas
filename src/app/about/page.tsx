import type { Metadata } from "next";
import Link from "next/link";
import { diseasesArtifact, getAggregate, indiaNprd } from "@/lib/data";
import {
  GITHUB_ISSUES_URL,
  INSTAGRAM_URL,
  LINKEDIN_URL,
  REPORT_EMAIL,
} from "@/lib/site";

function samplingBlurb(): string {
  const s = diseasesArtifact.sampling;
  if (s.mode === "sample" && s.n != null) {
    return `a random sample of ${s.n.toLocaleString("en")} usable Orphanet diseases (seed ${s.seed ?? "—"})`;
  }
  if (s.mode === "limit" && s.n != null) {
    return `the first ${s.n.toLocaleString("en")} usable Orphanet diseases in this build`;
  }
  return "every usable Orphanet disease in this build (groups and obsolete / non-rare-in-Europe labels excluded)";
}

export const metadata: Metadata = {
  title: "About & methodology",
  description:
    "Methodology, data sources, licences, and how to report errors for the Rare Disease Research Atlas.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const aggregate = getAggregate();
  const validation = diseasesArtifact.validation;
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-serif text-display-sm text-ink">About</h1>
      <p className="mt-5 font-sans text-lede text-mute">
        This site answers one question for {samplingBlurb()}: does anyone appear
        to be working on it — in the published literature, in interventional
        trials, observational studies, or in gene–disease curation? Percentages
        use that build&apos;s credible denominators, not the full Orphanet
        product1 row count.
      </p>
      <p className="mt-4 font-sans text-sm text-mute">
        Author:{" "}
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Amit Bhattacharya
        </a>
        {" · "}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Instagram
        </a>
      </p>

      <p className="mt-4 font-sans text-sm text-mute">
        Plain definitions for site terms and clinical language:{" "}
        <Link
          href="/glossary"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Glossary
        </Link>
        .
      </p>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Not medical advice</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Everything here is derived landscape data. It is not a diagnosis, not a
          prognosis, and not a recommendation about care. Decisions about health
          should be made with qualified clinicians. Counts can be wrong.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Data sources & licences</h2>
        <ul className="mt-4 space-y-4 font-sans text-sm leading-relaxed text-mute">
          <li>
            <strong className="text-ink">Orphanet / Orphadata</strong> — rare
            disease nomenclature (en_product1.xml) and prevalence classes
            (en_product9_prev.xml). © Orphanet / INSERM. Licence:{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="underline decoration-line underline-offset-2 hover:text-ink"
            >
              CC BY 4.0
            </a>
            . Attribution required. Product dates in this build:{" "}
            <span className="font-mono text-ink">
              {diseasesArtifact.sourceVersions.orphanetProduct1}
            </span>
            .
          </li>
          <li>
            <strong className="text-ink">Europe PMC</strong> — publication search
            API (EMBL-EBI). Used for hit counts, author extraction, and yearly
            trends.
          </li>
          <li>
            <strong className="text-ink">ClinicalTrials.gov</strong> — API v2
            (U.S. NLM). Interventional-study totals and recruiting sample;
            observational and expanded-access records are not counted as
            clinical trials.
          </li>
          <li>
            <strong className="text-ink">GenCC</strong> — gene–disease validity
            submissions export (CC0). Joined on MONDO / ORPHA identifiers.
          </li>
          <li>
            <strong className="text-ink">Mondo Disease Ontology</strong> — is_a
            hierarchy for zero-publication naming-artifact detection and India
            NPRD umbrella (parent) matching, plus exact synonyms and
            cross-references (MeSH, UMLS, OMIM, NCIT). Cross-references are
            stored on each disease page; only resolved MeSH labels enter search
            queries today.
          </li>
          <li>
            <strong className="text-ink">NLM MeSH</strong> — descriptor / concept
            labels resolved from Mondo MeSH cross-references, unioned into both
            the Europe PMC and ClinicalTrials.gov queries when resolution
            succeeds.
          </li>
          <li>
            <strong className="text-ink">MyDisease.info</strong> — BioThings
            disease annotation (CTD chemicals / pathways and HPO phenotype
            samples), joined on Mondo IDs. Optional post-ingest enrichment;
            never changes trial totals.
          </li>
          <li>
            <strong className="text-ink">FDA OOPD</strong> — orphan-drug
            designations matched via UMLS and preferred name (cached OOPD
            mirror). Feeds the orphan-designation readiness stage.
          </li>
          <li>
            <strong className="text-ink">Open Targets Platform</strong> — drugs
            and clinical candidates for each Mondo ID. Shown on disease pages
            only; never merged into the interventional-trial headline.
          </li>
          <li>
            <strong className="text-ink">India NPRD layer</strong> — hand-curated
            from the National Policy for Rare Diseases 2021 and later MoHFW/PIB
            lists. Last verified{" "}
            <span className="font-mono text-ink">{indiaNprd.lastVerified}</span>.
            Editable at <span className="font-mono">data/india-nprd.json</span>.
            Official notified-disease counts are inconsistent across sources
            (recorded as both ~55 and 63 with citations).
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Matching by name and by identifier</h2>
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The root cause of most data errors here is matching on disease name
          strings — names are misspelled, differ between databases, or are
          hyper-specific. We reduce this by matching on structured MeSH
          identifiers as well as names. From Mondo we extract MeSH, UMLS, OMIM
          and NCIT cross-references (shown on disease pages), resolve MeSH
          descriptor labels when the NLM id service responds, and union those
          MeSH labels into Europe PMC and ClinicalTrials.gov queries.
          Publication queries also expand with GenCC gene symbols (and
          name-inferred symbols such as <span className="font-mono">ZMYND11</span>{" "}
          from &ldquo;ZMYND11-related …&rdquo; labels) plus generated patterns like{" "}
          <span className="font-mono">GENE syndrome</span> /{" "}
          <span className="font-mono">GENE-related</span> — literature is often
          organised around genes, not long Orphanet labels. High-frequency
          oncogenes are excluded from that expansion. Trial matching on the
          specific-condition tier does <em>not</em> use gene symbols (they
          contaminate CT.gov with unrelated oncology studies); it uses name,
          MeSH, and a safe shortest synonym. Broader Mondo parents appear only
          in a separate parent-category trial tier. A trial that registers its
          condition as a broader MeSH descriptor (e.g. &ldquo;Fatty Acid Oxidation
          Disorders&rdquo; for an LCHAD-deficiency study) can then be found even
          when no name phrase would match. Each disease page records whether a
          trial matched via <span className="font-mono">phrase</span>,{" "}
          <span className="font-mono">mesh</span>,{" "}
          <span className="font-mono">recall-expansion</span>, or both.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Each Europe PMC query is the Orphanet preferred label plus Orphanet and
          Mondo exact synonyms, each as a quoted phrase, OR&apos;d together,
          unioned with MeSH where a cross-reference exists, and unioned with the
          gene/alias expansion above when GenCC or the disease name yields a
          safe gene symbol. A stoplist drops terms under 5 characters, bare
          acronyms under 4 characters, single common English words, and
          hyphenated/spaced numeric-prefix + single letter generics (e.g. Poly-X,
          Tetra X). Dropped synonyms are logged and shown on each disease page.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Labels are normalised additively at parse time and the source value is
          never overwritten. A pure-alphabetic token that is not itself a corpus
          word but splits cleanly into two frequent words (a missing word
          boundary) is corrected and queried alongside the original. Suspected
          misspellings are detected but only flagged for human review, never
          silently applied — edit-distance cannot distinguish a typo from a
          legitimately different medical term (&ldquo;Ebstein
          anomaly&rdquo;&ne;&ldquo;epstein&rdquo;), and guessing would corrupt the
          very source we are trying to represent. In the current Orphanet build
          this detector found no genuine missing-space corruptions; the earlier
          examples do not exist in the source XML.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Credibility is per-signal. The{" "}
          <span className="font-mono">publicationsDenominator</span> excludes
          low-confidence / naming-artifact rows and failed publication fetches.
          The <span className="font-mono">trialsDenominator</span> excludes only
          failed ClinicalTrials.gov fetches and incomplete scans — a publication
          name-collision flag does not remove a disease from trial percentages.
          The headline counts only interventional trials, while the methodology
          also reports matched observational and other registered studies. Combined
          “thin attention” uses the intersection of both sets. Every percentage
          on the site names which denominator it uses.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Post-hoc rules: zero publications with GenCC Definitive/Strong, or with
          a Mondo parent that has substantial literature, force low confidence and
          exclude from publication neglect metrics. Trials use quoted phrases via
          ClinicalTrials.gov <span className="font-mono">query.cond</span>, then
          post-filtered. Only records whose study type is{" "}
          <span className="font-mono">INTERVENTIONAL</span> enter trial totals;
          observational and expanded-access records do not. Pan-disease
          registries (e.g. NCT01793168) are stored separately and not counted in
          trial totals. Percentiles compare each disease to the appropriate
          denominator after ingest.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Query health</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Confidence reasons about ambiguity; query health reasons about whether
          the search itself worked. A record is{" "}
          <span className="font-mono">broken</span> when every strategy returns
          zero across both Europe PMC and ClinicalTrials.gov — that pattern almost
          always means a query-construction problem, not a global absence of
          research, so broken records are excluded from every denominator and
          reported separately. In this build,{" "}
          <span className="font-mono text-ink">
            {aggregate.brokenQueryRows.toLocaleString("en")}
          </span>{" "}
          records were excluded as broken. A record is{" "}
          <span className="font-mono">suspect</span> when a label correction was
          detected, a source fetch failed, or only one of several strategies
          returned hits.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Errors run in both directions</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          We no longer claim the &ldquo;no trial&rdquo; share is a lower bound.
          Matching produces <strong className="text-ink">false positives</strong>{" "}
          (we match a trial that belongs to another condition, which undercounts
          no-trial and pushes the true share higher) and{" "}
          <strong className="text-ink">false negatives</strong> (a broken query or
          a MeSH mismatch misses a real trial, which overcounts no-trial and
          pushes the true share lower). Both are present, so the headline is a
          bounded point estimate, not a floor.
        </p>
        {validation?.method === "automated-dual-model-consensus" ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            Against a dual-provider automated benchmark (
            {validation.count.toLocaleString("en")} diseases), trial-matching
            recall is{" "}
            <span className="font-mono text-ink">
              {Math.round(validation.trialsRecall * 100)}%
            </span>{" "}
            and precision{" "}
            <span className="font-mono text-ink">
              {Math.round(validation.trialsPrecision * 100)}%
            </span>
            . The two models reached a usable consensus on{" "}
            <span className="font-mono text-ink">
              {Math.round(validation.consensusCoverage * 100)}%
            </span>{" "}
            of trial candidates; disagreements and uncertain verdicts were
            excluded. This is reproducible model-based evidence, not a human gold
            standard. Publication query counts remain diagnostics and are not
            presented as labelled accuracy. Run{" "}
            <span className="font-mono">npm run accuracy</span> to reproduce.
          </p>
        ) : validation ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            Against a {validation.count.toLocaleString("en")}-disease gold set
            (dual-model adjudication with light human fix of disagreements),
            trial-matching recall is{" "}
            <span className="font-mono text-ink">
              {Math.round(validation.trialsRecall * 100)}%
            </span>{" "}
            and precision{" "}
            <span className="font-mono text-ink">
              {Math.round(validation.trialsPrecision * 100)}%
            </span>
            . Precision is measured only among NCT IDs already labelled relevant
            or irrelevant in that gold set — not over every trial the pipeline
            returns. Full unaided human validation of trial relevance is not yet
            complete.
          </p>
        ) : (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            Automated recall and precision are produced by independent OpenAI
            and Anthropic verdicts over an exhaustive broad candidate set.
            Results are published only when both providers, hidden controls, and
            full scans complete successfully.
          </p>
        )}
      </section>

      <section id="how-we-count-trials" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">
          How we count trials, and why the number is uncertain
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Deciding whether a trial &ldquo;counts&rdquo; for a rare disease is a
          judgment call, not a lookup. Disease names differ between medical
          literature, trial registries, and reference databases, and a trial may
          register under a broad category name while enrolling only a specific
          subtype — or the reverse.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          We take the conservative approach: a trial counts toward the headline
          only when it names the specific condition. Trials registered for a
          broader Mondo parent category (for example, &ldquo;Gaucher
          disease&rdquo; when the page is a Gaucher subtype) are shown separately
          on the disease page rather than counted.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          This choice matters. In this build, counting only specific-condition
          matches puts the share of diseases in the trials denominator with no
          interventional trial at{" "}
          <span className="font-mono text-ink">
            {aggregate.trialsDenominator > 0
              ? (
                  Math.round(
                    (1000 * aggregate.noTrials) / aggregate.trialsDenominator
                  ) / 10
                ).toFixed(1)
              : "—"}
            %
          </span>{" "}
          (
          <span className="font-mono text-ink">
            {aggregate.noTrials.toLocaleString("en")} of{" "}
            {aggregate.trialsDenominator.toLocaleString("en")}
          </span>
          ). Treating parent-category registrations as filling a zero puts it at{" "}
          <span className="font-mono text-ink">
            {aggregate.trialsDenominator > 0
              ? (
                  Math.round(
                    (1000 *
                      (aggregate.noTrialsParentInclusive ?? aggregate.noTrials)) /
                      aggregate.trialsDenominator
                  ) / 10
                ).toFixed(1)
              : "—"}
            %
          </span>{" "}
          (
          <span className="font-mono text-ink">
            {(
              aggregate.noTrialsParentInclusive ?? aggregate.noTrials
            ).toLocaleString("en")}{" "}
            of {aggregate.trialsDenominator.toLocaleString("en")}
          </span>
          ). Both are defensible. We report the conservative figure and show you
          the other so you can judge. Earlier matching choices in this project
          landed in the mid-50s to mid-70s — that spread is itself a finding
          about how poorly disease naming maps between literature and trial
          registries.
        </p>
        {aggregate.brokenQueryRows > 0 ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            We also exclude{" "}
            <span className="font-mono text-ink">
              {aggregate.brokenQueryRows.toLocaleString("en")}
            </span>{" "}
            diseases (
            {aggregate.totalDiseases > 0
              ? Math.round(
                  (100 * aggregate.brokenQueryRows) / aggregate.totalDiseases
                )
              : 0}
            % of this sample) whose official names return nothing in either
            database — not because no research exists, but because we can&apos;t
            search for them reliably. Their pages say so.
          </p>
        ) : null}
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">
          Interventional trials versus all registered studies
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The headline is an editorial definition, not a correction to the data:{" "}
          <span className="font-mono text-ink">
            {aggregate.noTrials.toLocaleString("en")} of{" "}
            {aggregate.trialsDenominator.toLocaleString("en")}
          </span>{" "}
          diseases have no matched interventional trial testing a treatment,
          while{" "}
          <span className="font-mono text-ink">
            {aggregate.noRegisteredStudies.toLocaleString("en")} of{" "}
            {aggregate.trialsDenominator.toLocaleString("en")}
          </span>{" "}
          have no matched registered study of any type. Observational and
          natural-history studies are not trials, but they are genuine progress:
          regulators encourage them in rare disease because endpoints often
          cannot be designed until disease progression is understood. They are
          therefore shown prominently on disease pages and may offer families an
          actionable way to participate. Both figures exclude pan-disease
          registries, which remain listed separately.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">
          Is the trial zero real, or a search failure?
        </h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          The strongest single check on the headline: of the diseases with no
          interventional trial,{" "}
          <span className="font-mono text-ink">
            {aggregate.noTrialsWithSubstantialLiterature.toLocaleString("en")}
          </span>{" "}
          have substantial published literature (at least the median recent
          publication count). If a name were broken, Europe PMC would find
          nothing either — so a name that demonstrably matches papers makes the
          trial zero far likelier to be real than a query artifact. A further{" "}
          <span className="font-mono text-ink">
            {aggregate.noTrialsWithNoLiterature.toLocaleString("en")}
          </span>{" "}
          have little or no literature and are the likelier query artifacts.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          This is supportive evidence, not proof. Europe PMC searches abstracts
          and full text, while ClinicalTrials.gov matches a structured condition
          field using standard clinical terminology — so trial matching
          underperforms publication matching for a systematic reason, independent
          of our bugs.
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Other known weaknesses: polysemous names still over-count; rare
          spellings and non-English literature under-count; author deduplication
          is imperfect; a zero often means &ldquo;named differently,&rdquo; not
          neglected.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Re-running ingestion</h2>
        <pre className="mt-4 overflow-x-auto border border-line bg-sand-50/40 p-4 font-mono text-xs text-ink">
{`npm run ingest         # --limit 50 (sorted; reproducible)
npm run ingest:sample  # --sample 300 (random draw; use for neglect-rate estimates)
npm run ingest:full    # all usable non-group Orphanet rows (~8k; hours)
# --resume   skip codes already in data/diseases.checkpoint.json
# --no-cache ignore .cache/ reads (monthly refresh)`}
        </pre>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Responses are cached under <span className="font-mono">.cache/</span>.
          Progress and failures append to{" "}
          <span className="font-mono">ingest.log</span>. Mid-run checkpoints go
          to <span className="font-mono">data/diseases.checkpoint.json</span>;
          the live <span className="font-mono">diseases.json</span> is published
          only when the target set is complete and fully scanned. Rate limiting
          (~3 req/sec) is in{" "}
          <span className="font-mono">scripts/lib/http.ts</span>.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Report a problem</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          No GitHub account needed. Email{" "}
          <a
            href={`mailto:${REPORT_EMAIL}`}
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            {REPORT_EMAIL}
          </a>{" "}
          with the ORPHAcode and what looks wrong. Technical contributors can
          also open a prefilled{" "}
          <a
            href={GITHUB_ISSUES_URL}
            className="underline decoration-line underline-offset-2 hover:text-ink"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub issue
          </a>
          . Every disease page has both actions. Corrections to the India list
          can also be proposed as edits to{" "}
          <span className="font-mono">data/india-nprd.json</span>.
        </p>
      </section>

      <section id="contact" className="mt-12 scroll-mt-16">
        <h2 className="font-serif text-title text-ink">Get in touch</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          Questions about the atlas, collaborations, corrections outside a
          specific disease page, or press: email{" "}
          <a
            href={`mailto:${REPORT_EMAIL}`}
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            {REPORT_EMAIL}
          </a>
          , reach the author on LinkedIn, or follow the project on Instagram.
        </p>
        <ul className="mt-4 space-y-2 font-sans text-sm text-mute">
          <li>
            <a
              href={LINKEDIN_URL}
              className="underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              Amit Bhattacharya on LinkedIn
            </a>
          </li>
          <li>
            <a
              href={INSTAGRAM_URL}
              className="underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              @rarediseaseatlas on Instagram
            </a>
          </li>
          <li>
            <a
              href={GITHUB_ISSUES_URL}
              className="underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub issues
            </a>{" "}
            — data errors and feature requests
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-title text-ink">Licence</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          This software is Apache-2.0. Upstream data remain under their own
          licences (notably Orphanet CC BY 4.0).
        </p>
      </section>
    </div>
  );
}
