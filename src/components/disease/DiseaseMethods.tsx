import type { DiseaseRecord } from "@/lib/types";

export function DiseaseMethods({ d }: { d: DiseaseRecord }) {
  const ctgovSearchUrl = d.trials.query
    ? `https://clinicaltrials.gov/search?cond=${encodeURIComponent(d.trials.query)}`
    : null;

  return (
    <details
      id="methods"
      className="mt-10 scroll-mt-16 border border-line px-5 py-4"
    >
      <summary className="cursor-pointer font-serif text-lg text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
        How we counted this
      </summary>
      <div className="mt-4 space-y-4 font-sans text-sm leading-relaxed text-mute">
        <p>
          Europe PMC query (preferred label + any corrected label + Orphanet and
          Mondo exact synonyms, stoplisted; unioned with resolved MeSH labels when
          available). UMLS / OMIM / NCIT cross-references are stored on the
          overview but are not added to the query string.
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
        <p>
          ClinicalTrials.gov query (quoted phrases + MeSH via query.cond, plus
          recall-expansion terms when used):
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap border border-line bg-ground p-3 font-mono text-xs text-ink">
          {d.trials.query || "(empty)"}
        </pre>
        {(d.trials.recallTerms?.length ?? 0) > 0 && (
          <p>
            Recall-expansion terms:{" "}
            <span className="font-mono text-ink">
              {d.trials.recallTerms!.join(", ")}
            </span>
          </p>
        )}
        {d.trials.matchedVia && d.trials.matchedVia.length > 0 && (
          <p>
            Interventional trials matched via:{" "}
            <span className="font-mono text-ink">
              {d.trials.matchedVia.join(", ")}
            </span>{" "}
            (mesh = registered under a MeSH descriptor no name phrase would catch;
            recall-expansion = gene / selected parent terms used only for trials).
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
        {d.trials.parentCategory?.query && (
          <div>
            <p>Parent-category trials query:</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap border border-line bg-ground p-3 font-mono text-xs text-ink">
              {d.trials.parentCategory.query}
            </pre>
          </div>
        )}
        <p>
          Query health:{" "}
          <span className="font-mono text-ink">
            {d.queryHealth?.status ?? "ok"}
          </span>{" "}
          — strategies attempted:{" "}
          {(d.queryHealth?.strategiesAttempted ?? ["phrase"]).join(", ")};
          with hits:{" "}
          {(d.queryHealth?.strategiesWithHits ?? []).join(", ") || "none"}
        </p>
        {d.parentLiteratureProbe && (
          <p>
            Parent literature probe:{" "}
            <span className="font-mono text-ink">
              {d.parentLiteratureProbe.label} ({d.parentLiteratureProbe.mondoId})
              — {d.parentLiteratureProbe.hits} hits
            </span>
          </p>
        )}
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
        {d.sourceErrors && (
          <p>
            Source errors:{" "}
            <span className="font-mono text-ink">
              {[
                d.sourceErrors.publications
                  ? `publications: ${d.sourceErrors.publications}`
                  : null,
                d.sourceErrors.trials ? `trials: ${d.sourceErrors.trials}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        )}
        <p className="font-medium text-ink">Confidence reasoning</p>
        <ul className="list-disc space-y-1 pl-5">
          {d.confidenceReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="font-mono text-[10px] text-mute">
          Ingested {d.ingestedAt}
          {d.excludeFromNeglect ? " · excluded from neglect metrics" : ""}
        </p>
      </div>
    </details>
  );
}
