import type { ReadinessStage, TrialReadiness } from "@/lib/types";

const STATUS_STYLES: Record<
  ReadinessStage["status"],
  { bar: string; label: string }
> = {
  met: { bar: "bg-ink", label: "Present" },
  partial: { bar: "bg-ink/45", label: "Partial" },
  absent: { bar: "bg-line", label: "Not found" },
  unknown: { bar: "bg-line border border-dashed border-mute/40", label: "Not checked" },
  "not-applicable": { bar: "bg-transparent", label: "n/a" },
};

export function ReadinessRail({
  readiness,
}: {
  readiness: TrialReadiness;
}) {
  const scored = readiness.stages.filter((s) => s.status !== "not-applicable");
  return (
    <section
      id="readiness"
      className="mt-10 scroll-mt-16 border border-line px-5 py-6 sm:px-7"
      aria-labelledby="readiness-heading"
    >
      <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        Research stages
      </p>
      <h2 id="readiness-heading" className="mt-2 font-serif text-title text-ink">
        Trial readiness signals
      </h2>
      <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
        Where this condition sits on an open-data research pipeline — not how close
        a treatment is, and not medical advice. Empty stages often mean “not in
        these databases under this Mondo ID,” not “impossible.”
      </p>

      <div
        className="mt-6 flex gap-1.5"
        role="img"
        aria-label={`${readiness.filledCount} of ${readiness.scoredCount} research stages with a signal`}
      >
        {scored.map((s) => (
          <div
            key={s.id}
            title={`${s.label}: ${STATUS_STYLES[s.status].label}`}
            className={`h-2.5 flex-1 ${STATUS_STYLES[s.status].bar}`}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-xs text-mute">
        {readiness.filledCount}/{readiness.scoredCount} stages with a signal
      </p>

      <p className="mt-4 max-w-2xl font-sans text-sm leading-relaxed text-ink/90">
        {readiness.summary}
      </p>

      <ol className="mt-6 space-y-4">
        {readiness.stages.map((s) => (
          <li key={s.id} className="flex gap-3">
            <span
              className={`mt-1.5 size-2.5 shrink-0 ${STATUS_STYLES[s.status].bar}`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-sans text-sm font-medium text-ink">
                  {s.label}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-mute">
                  {STATUS_STYLES[s.status].label}
                </span>
              </div>
              <p className="mt-1 font-sans text-sm leading-relaxed text-mute">
                {s.detail}
                {s.evidenceUrl ? (
                  <>
                    {" "}
                    <a
                      href={s.evidenceUrl}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
