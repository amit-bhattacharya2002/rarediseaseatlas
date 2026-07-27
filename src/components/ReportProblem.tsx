import {
  REPORT_EMAIL,
  reportProblemGithubUrl,
  reportProblemMailtoUrl,
} from "@/lib/site";

export function ReportProblem({
  orphaCode,
  name,
  variant = "panel",
}: {
  orphaCode: string;
  name: string;
  /** panel = bordered block; inline = compact sentence; nav = sticky-nav chip */
  variant?: "panel" | "inline" | "nav";
}) {
  const emailHref = reportProblemMailtoUrl(orphaCode, name);
  const githubHref = reportProblemGithubUrl(orphaCode, name);
  const displayName = name;

  if (variant === "nav") {
    return (
      <a
        href="#report-problem"
        className="min-h-11 whitespace-nowrap px-3 py-3 font-sans text-xs font-medium text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:px-4"
      >
        Report
      </a>
    );
  }

  if (variant === "inline") {
    return (
      <span>
        <a
          href={emailHref}
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Email us
        </a>
        {" · "}
        <a
          href={githubHref}
          className="underline decoration-line underline-offset-2 hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub issue
        </a>
      </span>
    );
  }

  return (
    <aside
      id="report-problem"
      className="scroll-mt-16 border border-line bg-sand-50/50 px-5 py-5"
      aria-labelledby="report-problem-heading"
    >
      <h2
        id="report-problem-heading"
        className="font-serif text-title text-ink"
      >
        Report a problem
      </h2>
      <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
        Spotted a wrong count, missing trial, bad definition, or India-panel
        issue for <span className="text-ink">{displayName}</span>{" "}
        (ORPHA:{orphaCode})? No GitHub account needed — email is the default.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <a
          href={emailHref}
          className="inline-flex min-h-11 items-center justify-center border border-ink bg-ink px-4 py-2 font-sans text-sm font-medium text-ground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Email us
        </a>
        <a
          href={githubHref}
          className="inline-flex min-h-11 items-center justify-center border border-line px-4 py-2 font-sans text-sm text-ink hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open a GitHub issue
        </a>
      </div>
      <p className="mt-3 font-mono text-[11px] text-mute">{REPORT_EMAIL}</p>
    </aside>
  );
}
