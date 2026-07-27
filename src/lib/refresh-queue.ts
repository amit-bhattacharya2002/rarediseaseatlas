import fs from "node:fs";
import path from "node:path";

export const REFRESH_LOG_PATH = path.join(
  process.cwd(),
  "data",
  "refresh-log.jsonl"
);

export type RefreshQueueReason =
  | "live-delta"
  | "missing-last-check"
  | "stale-check"
  | "manual";

export interface RefreshQueueEntry {
  kind: "refresh-queue";
  ranAt: string;
  orphaCode: string;
  reason: RefreshQueueReason;
  publishedTotal?: number | null;
  liveTotal?: number | null;
  publishedAsOf?: string | null;
}

/**
 * Queue an ORPHA code for the nightly artifact refresh.
 * Locally appends to data/refresh-log.jsonl; on Vercel logs structured JSON only.
 */
export function appendRefreshQueue(
  entry: Omit<RefreshQueueEntry, "kind" | "ranAt"> & { ranAt?: string }
): boolean {
  const full: RefreshQueueEntry = {
    kind: "refresh-queue",
    ranAt: entry.ranAt ?? new Date().toISOString(),
    orphaCode: entry.orphaCode,
    reason: entry.reason,
    publishedTotal: entry.publishedTotal ?? null,
    liveTotal: entry.liveTotal ?? null,
    publishedAsOf: entry.publishedAsOf ?? null,
  };

  console.info("REFRESH_QUEUE", JSON.stringify(full));

  if (process.env.VERCEL) return false;

  try {
    fs.mkdirSync(path.dirname(REFRESH_LOG_PATH), { recursive: true });
    fs.appendFileSync(REFRESH_LOG_PATH, `${JSON.stringify(full)}\n`, "utf8");
    return true;
  } catch (err) {
    console.warn("refresh-queue append failed", String(err));
    return false;
  }
}
