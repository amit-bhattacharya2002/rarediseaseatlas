import type { MetadataRoute } from "next";
import { getAllDiseases } from "@/lib/data";
import { listFindingsDates } from "@/lib/findings";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/search",
    "/landscape",
    "/neglected",
    "/findings",
    "/about",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  const findings = listFindingsDates().map((date) => ({
    url: `${SITE_URL}/findings/${date}`,
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.5,
  }));

  const diseases = getAllDiseases().map((d) => ({
    url: `${SITE_URL}/disease/${d.orphaCode}`,
    lastModified: d.lastTrialCheck
      ? new Date(d.lastTrialCheck)
      : new Date(d.ingestedAt),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...findings, ...diseases];
}
