import type { Metadata } from "next";
import Link from "next/link";
import {
  getIngestStatus,
  ingestProgressPercent,
} from "@/lib/ingest-status";
import { formatSnapshotDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ingest status",
  description: "Progress of the corpus ingest — separate from published site numbers.",
};

export default function StatusPage() {
  const status = getIngestStatus();
  const pct = status ? ingestProgressPercent(status) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="font-sans text-xs uppercase tracking-[0.14em] text-mute">
        Pipeline
      </p>
      <h1 className="mt-3 font-serif text-display-sm text-ink">Ingest status</h1>
      <p className="mt-5 font-sans text-lede text-mute">
        This page tracks corpus rebuild progress. It does not change the homepage
        or disease-page numbers — those stay on the last published artifact until
        ingest finishes and publishes.
      </p>

      {!status ? (
        <p className="mt-10 font-sans text-sm text-mute">
          No ingest status on disk. When{" "}
          <span className="font-mono">npm run ingest:full</span> (or a sample
          run) is active, progress appears here from{" "}
          <span className="font-mono">data/ingest-status.json</span> and the
          checkpoint file.
        </p>
      ) : (
        <section className="mt-10">
          <p className="font-sans text-sm text-mute">
            Status:{" "}
            <span className="font-mono text-ink">{status.status}</span>
            {" · "}
            mode{" "}
            <span className="font-mono text-ink">{status.sampling.mode}</span>
            {status.sampling.n != null ? (
              <>
                {" "}
                (n=
                <span className="font-mono text-ink">{status.sampling.n}</span>)
              </>
            ) : null}
          </p>
          <p className="mt-6 font-mono text-[clamp(2.5rem,8vw,4rem)] font-medium leading-none tabular-nums text-ink">
            {status.done.toLocaleString("en")}
            <span className="text-mute"> / </span>
            {status.target.toLocaleString("en")}
          </p>
          <p className="mt-3 font-sans text-sm text-mute">
            diseases written to the checkpoint
            {pct != null ? (
              <>
                {" "}
                — <span className="font-mono text-ink">{pct}%</span>
              </>
            ) : null}
          </p>
          {pct != null ? (
            <div
              className="mt-6 h-2 w-full max-w-md bg-line"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Ingest progress"
            >
              <div
                className="h-2 bg-ink transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
          <p className="mt-6 font-sans text-sm leading-relaxed text-mute">
            Published site currently serves{" "}
            <span className="font-mono text-ink">
              {status.published.toLocaleString("en")}
            </span>{" "}
            diseases. Last status write:{" "}
            <span className="font-mono text-ink">
              {formatSnapshotDate(status.updatedAt)}
            </span>{" "}
            ({status.updatedAt}).
          </p>
          {status.message ? (
            <p className="mt-4 font-sans text-sm leading-relaxed text-mute">
              {status.message}
            </p>
          ) : null}
        </section>
      )}

      <p className="mt-12 font-sans text-sm text-mute">
        <Link
          href="/"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Back to the live atlas
        </Link>
        {" · "}
        <Link
          href="/findings"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Historical findings
        </Link>
      </p>
    </div>
  );
}
