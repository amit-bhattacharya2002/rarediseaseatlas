import { NextResponse } from "next/server";
import { appendRefreshQueue } from "@/lib/refresh-queue";

export const runtime = "nodejs";

interface DeltaBody {
  kind?: string;
  orphaCode?: string;
  publishedTotal?: number;
  liveTotal?: number;
  publishedAsOf?: string;
  at?: string;
}

/**
 * Log live-check deltas and queue for nightly merge. Never writes diseases.json.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: DeltaBody;
  try {
    body = (await request.json()) as DeltaBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (
    body.kind !== "live-check" ||
    typeof body.orphaCode !== "string" ||
    !/^\d+$/.test(body.orphaCode) ||
    typeof body.publishedTotal !== "number" ||
    typeof body.liveTotal !== "number"
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const queued = appendRefreshQueue({
    orphaCode: body.orphaCode,
    reason: "live-delta",
    publishedTotal: body.publishedTotal,
    liveTotal: body.liveTotal,
    publishedAsOf: body.publishedAsOf ?? null,
    ranAt: body.at,
  });

  console.info(
    "LIVE_TRIAL_DELTA",
    JSON.stringify({
      kind: "live-check",
      ranAt: body.at ?? new Date().toISOString(),
      orphaCode: body.orphaCode,
      publishedTotal: body.publishedTotal,
      liveTotal: body.liveTotal,
      publishedAsOf: body.publishedAsOf ?? null,
      queued,
    })
  );

  return NextResponse.json({ ok: true, queued });
}
