import type { AuthorRecord } from "@/lib/types";

export function ResearchersBlock({
  authors,
  zeroTrials,
}: {
  authors: AuthorRecord[];
  zeroTrials?: boolean;
}) {
  if (authors.length === 0) {
    return (
      <div className="border border-line px-5 py-5">
        <h2 className="font-serif text-title text-ink">Who&apos;s working on it?</h2>
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          No author names could be extracted from the sampled publications.
          Try the Europe PMC query in “How we counted this,” or contact an
          umbrella rare-disease organisation for researcher referrals.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-ink/20 bg-sand-50/40 px-5 py-6 sm:px-7">
      <h2 className="font-serif text-title text-ink">Who&apos;s working on it?</h2>
      <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
        {zeroTrials
          ? "No interventional trial matched this name; these authors publish on it in the sampled literature — a practical starting point for contact."
          : "People publishing on this condition (sampled Europe PMC records). Affiliation is the most recent found in that sample."}
      </p>
      <ol className="mt-6 space-y-5">
        {authors.map((a, i) => (
          <li key={a.name} className="flex gap-4">
            <span className="font-mono text-sm text-mute tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif text-lg text-ink">{a.name}</span>
                <span className="font-mono text-xs text-mute">
                  {a.count} paper{a.count === 1 ? "" : "s"}
                  {a.mostRecentYear ? ` · ${a.mostRecentYear}` : ""}
                </span>
              </div>
              {a.affiliation && (
                <p className="mt-1 font-sans text-sm text-mute">{a.affiliation}</p>
              )}
              <a
                href={`https://europepmc.org/search?query=${encodeURIComponent(a.europePmcAuthorQuery)}`}
                className="mt-1 inline-block font-sans text-sm underline decoration-line underline-offset-2 hover:text-ink"
                target="_blank"
                rel="noopener noreferrer"
              >
                Papers in Europe PMC
              </a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
