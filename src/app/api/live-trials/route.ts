import { NextResponse } from "next/server";
import { getDisease, diseasesArtifact } from "@/lib/data";
import { probeInterventionalTrials } from "@/lib/live-ctgov";
import { appendRefreshQueue } from "@/lib/refresh-queue";
import { formatSnapshotDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MS = 30 * 86_400_000; // 30 days

/**
 * Server-side CT.gov probe for a published disease query.
 * Never writes diseases.json — queues ORPHA for nightly merge on delta/stale.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const orphaCode = (url.searchParams.get("orphaCode") ?? "").trim();
  if (!/^\d+$/.test(orphaCode)) {
    return NextResponse.json(
      { ok: false, error: "orphaCode required" },
      { status: 400 }
    );
  }

  const d = getDisease(orphaCode);
  if (!d) {
    return NextResponse.json(
      { ok: false, error: "disease not found" },
      { status: 404 }
    );
  }

  const query = (d.trials.query ?? d.query ?? "").trim();
  const publishedTotal = d.trials.total;
  const asOfSource =
    d.lastTrialCheck ??
    diseasesArtifact.lastFullIngest ??
    diseasesArtifact.generatedAt ??
    new Date().toISOString();
  const publishedAsOf = formatSnapshotDate(asOfSource);

  if (!query || publishedTotal == null) {
    return NextResponse.json({
      ok: true,
      orphaCode,
      publishedTotal,
      liveTotal: null,
      query,
      asOf: publishedAsOf,
      queued: false,
      fullyScanned: null,
      skipped: publishedTotal == null ? "null-published-total" : "empty-query",
    });
  }

  try {
    const maxPages = Math.min(
      40,
      Math.max(5, Number(url.searchParams.get("maxPages") ?? 25) || 25)
    );
    const { liveTotal, pages, fullyScanned } = await probeInterventionalTrials(
      query,
      maxPages
    );

    const lastCheckMs = d.lastTrialCheck
      ? Date.parse(d.lastTrialCheck)
      : NaN;
    const missingCheck = !d.lastTrialCheck;
    const stale =
      Number.isFinite(lastCheckMs) && Date.now() - lastCheckMs > STALE_MS;
    const delta = liveTotal !== publishedTotal;

    let queued = false;
    let queueReason: "live-delta" | "missing-last-check" | "stale-check" | null =
      null;
    if (delta) queueReason = "live-delta";
    else if (missingCheck) queueReason = "missing-last-check";
    else if (stale) queueReason = "stale-check";

    if (queueReason) {
      queued = appendRefreshQueue({
        orphaCode,
        reason: queueReason,
        publishedTotal,
        liveTotal,
        publishedAsOf,
      });
    }

    return NextResponse.json({
      ok: true,
      orphaCode,
      publishedTotal,
      liveTotal,
      query,
      asOf: publishedAsOf,
      queued,
      queueReason,
      pages,
      fullyScanned,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: String(err),
        orphaCode,
        publishedTotal,
        liveTotal: null,
        query,
        asOf: publishedAsOf,
        queued: false,
      },
      { status: 502 }
    );
  }
}
