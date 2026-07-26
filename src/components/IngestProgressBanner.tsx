"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { IngestStatusFile } from "@/lib/ingest-status";

function formatDay(iso: string): string {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Polls /api/ingest-status so local ingest progress updates without a rebuild.
 * Renders nothing when idle/complete.
 */
export function IngestProgressBanner() {
  const [status, setStatus] = useState<IngestStatusFile | null>(null);
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/ingest-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: IngestStatusFile | null;
          percent: number | null;
        };
        if (cancelled) return;
        setStatus(data.status);
        setPercent(data.percent);
      } catch {
        /* silent */
      }
    };

    void load();
    const id = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!status || status.status !== "running") return null;

  const label =
    percent != null
      ? `${status.done.toLocaleString("en")} / ${status.target.toLocaleString("en")} (${percent}%)`
      : `${status.done.toLocaleString("en")} diseases`;

  return (
    <div className="border-b border-line bg-sand-50/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 font-sans text-xs text-mute sm:px-5">
        <p>
          Corpus ingest in progress:{" "}
          <span className="font-mono text-ink">{label}</span>
          <span className="text-mute">
            {" "}
            · site still shows the last published build
          </span>
        </p>
        <Link
          href="/status"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Details · updated {formatDay(status.updatedAt)}
        </Link>
      </div>
    </div>
  );
}
