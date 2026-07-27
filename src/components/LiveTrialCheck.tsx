"use client";

import { useEffect, useState } from "react";

interface LiveTrialsResponse {
  ok: boolean;
  publishedTotal?: number | null;
  liveTotal?: number | null;
  query?: string;
  asOf?: string;
  queued?: boolean;
  fullyScanned?: boolean | null;
  skipped?: string;
  error?: string;
}

/**
 * Server-proxied CT.gov check. Renders when live total differs from published.
 * Queues ORPHA for nightly artifact merge; never writes diseases.json itself.
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
  const [asOf, setAsOf] = useState(publishedAsOf);
  const [query, setQuery] = useState(publishedQuery);

  useEffect(() => {
    if (!publishedQuery || publishedTotal == null) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/live-trials?orphaCode=${encodeURIComponent(orphaCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as LiveTrialsResponse;
        if (cancelled || !data.ok || typeof data.liveTotal !== "number") return;
        setLiveTotal(data.liveTotal);
        if (data.asOf) setAsOf(data.asOf);
        if (data.query) setQuery(data.query);
      } catch {
        /* silent — page is complete without the live result */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orphaCode, publishedQuery, publishedTotal]);

  if (
    liveTotal == null ||
    publishedTotal == null ||
    liveTotal === publishedTotal
  ) {
    return null;
  }

  const searchUrl = `https://clinicaltrials.gov/search?cond=${encodeURIComponent(query)}`;

  if (publishedTotal === 0 && liveTotal > 0) {
    return (
      <p className="mt-3 font-sans text-sm italic leading-relaxed text-ink/90">
        Live ClinicalTrials.gov now shows about{" "}
        {liveTotal.toLocaleString("en")} interventional trial
        {liveTotal === 1 ? "" : "s"} for this query (page still shows the
        published 0 from {asOf}). Comparison lines below still use the frozen
        dataset — this disease is queued for the nightly artifact refresh.{" "}
        <a
          href={searchUrl}
          className="underline decoration-line underline-offset-2 hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          View live search
        </a>
        .
      </p>
    );
  }

  return (
    <p className="mt-3 font-sans text-sm italic leading-relaxed text-ink/90">
      Live ClinicalTrials.gov now reports about{" "}
      {liveTotal.toLocaleString("en")} interventional hit
      {liveTotal === 1 ? "" : "s"} for this query; this page still shows the
      published count of {publishedTotal.toLocaleString("en")} (as of {asOf}).
      Comparison lines below still use the frozen dataset; a nightly job merges
      refreshed counts into the published artifact.{" "}
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
