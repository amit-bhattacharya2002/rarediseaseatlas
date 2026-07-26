import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

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
 * Log live-check deltas. Never writes diseases.json.
 * Locally appends to data/refresh-log.jsonl; on Vercel logs structured JSON.
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

  const entry = {
    kind: "live-check",
    ranAt: body.at ?? new Date().toISOString(),
    orphaCode: body.orphaCode,
    publishedTotal: body.publishedTotal,
    liveTotal: body.liveTotal,
    publishedAsOf: body.publishedAsOf ?? null,
  };

  console.info("LIVE_TRIAL_DELTA", JSON.stringify(entry));

  if (!process.env.VERCEL) {
    try {
      const logPath = path.join(process.cwd(), "data", "refresh-log.jsonl");
      fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (err) {
      console.warn("live-trial-delta append failed", String(err));
    }
  }

  return NextResponse.json({ ok: true });
}
