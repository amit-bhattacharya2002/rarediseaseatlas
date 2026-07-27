import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ShareButton } from "@/components/ShareButton";
import { SignalGlyph } from "@/components/SignalGlyph";
import { SITE_NAME } from "@/lib/site";
import type { DiseaseRecord } from "@/lib/types";
import { diseaseSignals } from "@/lib/signals";

export function DiseaseHero({ d }: { d: DiseaseRecord }) {
  const signals = diseaseSignals(d);
  const displayName = d.nameCorrected ?? d.name;

  return (
    <>
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
              <h1 className="mt-2 font-serif text-display-sm text-ink">
                {displayName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ConfidenceBadge confidence={d.confidence} />
                {d.disorderGroup ? (
                  <span className="font-sans text-xs text-mute">
                    {d.disorderGroup}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <ShareButton
          title={`${displayName} — ${SITE_NAME}`}
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
          <span className="text-ink">Orphanet source label (encoding artifact): </span>
          <span className="font-mono">{d.name}</span>. We display and query the
          corrected form <span className="font-mono">{d.nameCorrected}</span>; the
          Orphanet source value is never overwritten in the artifact.
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
    </>
  );
}
