import type { RelevanceConsensus, TrialRecord } from "@/lib/types";

const MATCH_VIA_LABEL: Record<NonNullable<TrialRecord["matchedVia"]>, string> = {
  mesh: "MeSH",
  phrase: "name phrase",
  both: "name + MeSH",
  "recall-expansion": "recall expansion",
};

const RELEVANCE_LABEL: Record<RelevanceConsensus, string> = {
  relevant: "Confirmed",
  "parent-category": "Parent",
  irrelevant: "Likely noise",
  uncertain: "Uncertain",
  skipped: "Not reviewed",
};

export function TrialListItem({ trial }: { trial: TrialRecord }) {
  const via = trial.matchedVia ? MATCH_VIA_LABEL[trial.matchedVia] : null;
  const conditions = (trial.conditions ?? []).filter(Boolean).slice(0, 4);
  const relevance = trial.relevance?.consensus;

  return (
    <li>
      <a
        href={trial.url}
        className="font-sans text-sm text-ink underline decoration-line underline-offset-2 hover:opacity-80"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="font-mono">{trial.nctId}</span>
        {trial.status ? (
          <>
            <span className="mx-2 text-mute">·</span>
            <span className="font-mono text-xs uppercase tracking-wider text-mute no-underline">
              {trial.status.replace(/_/g, " ")}
            </span>
          </>
        ) : null}
        <span className="mx-2 text-mute">·</span>
        {trial.title}
      </a>
      {(conditions.length > 0 || via || relevance) && (
        <p className="mt-1 font-sans text-xs leading-relaxed text-mute">
          {relevance ? (
            <span className="font-mono uppercase tracking-wider text-ink/80">
              {RELEVANCE_LABEL[relevance]}
            </span>
          ) : null}
          {relevance && (conditions.length > 0 || via) ? (
            <span className="mx-1.5">·</span>
          ) : null}
          {conditions.length > 0 && (
            <span>Conditions: {conditions.join(" · ")}</span>
          )}
          {conditions.length > 0 && via ? <span className="mx-1.5">·</span> : null}
          {via ? <span>Matched via {via}</span> : null}
          {trial.relevance?.reason && relevance && relevance !== "skipped" ? (
            <span className="block mt-0.5 text-mute/90">
              {trial.relevance.reason}
            </span>
          ) : null}
        </p>
      )}
    </li>
  );
}
