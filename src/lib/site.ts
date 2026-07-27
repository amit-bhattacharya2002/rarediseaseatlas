/** Canonical public site URL (custom domain). */
export const SITE_URL = "https://www.rarediseaseatlas.org";

export const SITE_NAME = "Rare Disease Research Atlas";

export const SITE_TAGLINE = "Is anyone working on this?";

export const SITE_DESCRIPTION =
  "Open atlas of rare disease research attention: publications, researchers, interventional trials, observational studies, and gene–disease validity for Orphanet conditions.";

/** Public GitHub repository for source + issue reports. */
export const GITHUB_REPO_URL =
  "https://github.com/amit-bhattacharya2002/rarediseaseatlas";

export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

export const INSTAGRAM_URL = "https://www.instagram.com/rarediseaseatlas/";

export const LINKEDIN_URL =
  "https://www.linkedin.com/in/amit-bhattacharya-551aa6202/";

/**
 * Inbox for non-GitHub error reports (families / researchers).
 * Override with NEXT_PUBLIC_REPORT_EMAIL at build time if needed.
 */
export const REPORT_EMAIL =
  process.env.NEXT_PUBLIC_REPORT_EMAIL?.trim() ||
  "contact@rarediseaseatlas.org";

export function githubNewIssueUrl(title: string, body: string): string {
  return `${GITHUB_ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export function reportProblemBody(orphaCode: string, name: string): string {
  return [
    `ORPHAcode: ${orphaCode}`,
    `Disease name: ${name}`,
    `Page: ${SITE_URL}/disease/${orphaCode}`,
    "",
    "What looks wrong?",
    "",
    "Suggested correction / source:",
    "",
  ].join("\n");
}

export function reportProblemMailtoUrl(orphaCode: string, name: string): string {
  const subject = `Data error: ORPHA:${orphaCode} — ${name}`;
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reportProblemBody(orphaCode, name))}`;
}

export function reportProblemGithubUrl(orphaCode: string, name: string): string {
  return githubNewIssueUrl(
    `Data error: ORPHA:${orphaCode} — ${name}`,
    [
      `**ORPHAcode:** ${orphaCode}`,
      `**Disease name:** ${name}`,
      "",
      "**What looks wrong?**",
      "<!-- e.g. publication count, trials, researchers, India panel, definition -->",
      "",
      "**Suggested correction / source:**",
      "",
      "**Page URL:**",
      `${SITE_URL}/disease/${orphaCode}`,
      "",
    ].join("\n")
  );
}
