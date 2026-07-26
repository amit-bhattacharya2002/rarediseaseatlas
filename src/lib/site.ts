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

export function githubNewIssueUrl(title: string, body: string): string {
  return `${GITHUB_ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
