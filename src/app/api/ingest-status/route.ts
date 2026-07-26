import { NextResponse } from "next/server";
import { getIngestStatus, ingestProgressPercent } from "@/lib/ingest-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const status = getIngestStatus();
  return NextResponse.json({
    status,
    percent: status ? ingestProgressPercent(status) : null,
  });
}
