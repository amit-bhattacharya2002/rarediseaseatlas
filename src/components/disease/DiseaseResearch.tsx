import { ResearchersBlock } from "@/components/ResearchersBlock";
import { Sparkline } from "@/components/Sparkline";
import type { DiseasesArtifact, DiseaseRecord } from "@/lib/types";
import {
  formatCount,
  publicationComparison,
  publicationsComparativeLine,
} from "@/lib/plain-copy";

export function DiseaseResearch({
  d,
  distributions,
}: {
  d: DiseaseRecord;
  distributions: DiseasesArtifact["distributions"];
}) {
  const zeroTrials = d.trials.total === 0;
  const pubsUnknown = d.publications.total == null;
  const pubsCompare = publicationsComparativeLine(d, distributions);

  return (
    <div id="research" className="scroll-mt-16">
      <section className="mt-12 border-t border-line pt-10">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
          Literature
        </p>
        <h2 className="mt-2 font-serif text-title text-ink">
          Is anyone studying this?
        </h2>
        <div className="mt-8 grid gap-10 sm:grid-cols-2">
          <div>
            <p className="font-mono text-3xl tabular-nums text-ink">
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
            {(d.publications.phraseCount != null ||
              d.publications.meshCount != null) && (
              <p className="mt-3 font-sans text-xs text-mute">
                Phrase hits:{" "}
                <span className="font-mono text-ink">
                  {formatCount(d.publications.phraseCount)}
                </span>
                {d.publications.meshCount != null && (
                  <>
                    {" "}
                    · MeSH hits:{" "}
                    <span className="font-mono text-ink">
                      {formatCount(d.publications.meshCount)}
                    </span>
                  </>
                )}
              </p>
            )}
            <p className="mt-3 font-sans text-sm text-mute">
              <a
                href={d.publications.europePmcUrl}
                className="underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Europe PMC search
              </a>
            </p>
          </div>

          <div>
            <h3 className="font-sans text-sm font-medium text-ink">
              Who&apos;s working on it?
            </h3>
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
        </div>
      </section>

      <section className="mt-10">
        <ResearchersBlock authors={d.researchers.top} zeroTrials={zeroTrials} />
      </section>
    </div>
  );
}
