"use client";

import { useEffect, useState } from "react";

interface CtStudy {
  protocolSection?: {
    identificationModule?: { briefTitle?: string; officialTitle?: string };
    conditionsModule?: { conditions?: string[] };
    designModule?: { studyType?: string };
  };
}

interface CtResponse {
  totalCount?: number;
  studies?: CtStudy[];
  nextPageToken?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Count interventional studies whose conditions/title match a published query phrase. */
function countMatchingInterventional(
  studies: CtStudy[],
  query: string
): number {
  const phrases = query
    .split(/\s+OR\s+/i)
    .map((p) => normalize(p.replace(/"/g, "")))
    .filter((p) => p.length >= 4);
  if (phrases.length === 0) return 0;
  let n = 0;
  for (const s of studies) {
    if (s.protocolSection?.designModule?.studyType !== "INTERVENTIONAL") {
      continue;
    }
    const conditions = (
      s.protocolSection?.conditionsModule?.conditions ?? []
    ).map(normalize);
    const title = normalize(
      s.protocolSection?.identificationModule?.briefTitle ||
        s.protocolSection?.identificationModule?.officialTitle ||
        ""
    );
    const hit = phrases.some((phrase) => {
      const padded = ` ${phrase} `;
      return (
        conditions.some((c) => ` ${c} `.includes(padded)) ||
        ` ${title} `.includes(padded)
      );
    });
    if (hit) n += 1;
  }
  return n;
}

/**
 * Background CORS check against ClinicalTrials.gov. Renders nothing unless the
 * live interventional count differs from the published figure. Failures are silent.
 * Never writes back to diseases.json. Does not alter percentile / comparative copy.
 */
export function LiveTrialCheck({
  orphaCode,
  publishedTotal,
  publishedQuery,
  publishedAsOf,
}: {
  orphaCode: string;
  publishedTotal: number | null;
  publishedQuery: string;
  publishedAsOf: string;
}) {
  const [liveTotal, setLiveTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!publishedQuery || publishedTotal == null) return;
    let cancelled = false;

    (async () => {
      try {
        // Auto-fire for published zeros (highest value); still run elsewhere
        // but only render on delta.
        const collected: CtStudy[] = [];
        let token: string | undefined;
        let pages = 0;
        do {
          pages += 1;
          const base =
            `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(publishedQuery)}` +
            `&format=json&pageSize=100&countTotal=true`;
          const url = token
            ? `${base}&pageToken=${encodeURIComponent(token)}`
            : base;
          const res = await fetch(url);
          if (!res.ok) return;
          const data = (await res.json()) as CtResponse;
          collected.push(...(data.studies ?? []));
          token = data.nextPageToken;
          // Cap client scan — silent if truncated; prefer under-count to noise.
          if (pages >= 5) break;
        } while (token);

        if (cancelled) return;
        const total = countMatchingInterventional(collected, publishedQuery);
        setLiveTotal(total);

        if (total !== publishedTotal) {
          void fetch("/api/live-trial-delta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "live-check",
              orphaCode,
              publishedTotal,
              liveTotal: total,
              publishedAsOf,
              at: new Date().toISOString(),
            }),
          }).catch(() => {
            /* silent */
          });
        }
      } catch {
        /* silent — page is complete without the live result */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orphaCode, publishedQuery, publishedTotal, publishedAsOf]);

  if (
    liveTotal == null ||
    publishedTotal == null ||
    liveTotal === publishedTotal
  ) {
    return null;
  }

  const searchUrl = `https://clinicaltrials.gov/search?cond=${encodeURIComponent(publishedQuery)}`;

  if (publishedTotal === 0 && liveTotal > 0) {
    return (
      <p className="mt-3 font-sans text-sm italic leading-relaxed text-ink/90">
        {liveTotal.toLocaleString("en")} trial
        {liveTotal === 1 ? "" : "s"}{" "}
        {liveTotal === 1 ? "has" : "have"} been registered since this page&apos;s
        data was published on {publishedAsOf} —{" "}
        <a
          href={searchUrl}
          className="underline decoration-line underline-offset-2 hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          view them
        </a>
        . Comparison lines below still use the frozen dataset.
      </p>
    );
  }

  return (
    <p className="mt-3 font-sans text-sm italic leading-relaxed text-ink/90">
      Live ClinicalTrials.gov now reports about{" "}
      {liveTotal.toLocaleString("en")} interventional hit
      {liveTotal === 1 ? "" : "s"} for this query; this page still shows the
      published count of {publishedTotal.toLocaleString("en")} (as of{" "}
      {publishedAsOf}).{" "}
      <a
        href={searchUrl}
        className="underline decoration-line underline-offset-2 hover:text-ink"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open live search
      </a>
      .
    </p>
  );
}
