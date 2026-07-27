import fs from "node:fs";
import path from "node:path";

export const REFRESH_LOG_PATH = path.join(
  process.cwd(),
  "data",
  "refresh-log.jsonl"
);

export function appendRefreshLog(entry: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(REFRESH_LOG_PATH), { recursive: true });
  fs.appendFileSync(
    REFRESH_LOG_PATH,
    `${JSON.stringify(entry)}\n`,
    "utf8"
  );
}

export type RefreshQueueReason =
  | "live-delta"
  | "missing-last-check"
  | "stale-check"
  | "manual";

/** Queue an ORPHA code for nightly artifact refresh (append-only log). */
export function appendRefreshQueue(entry: {
  orphaCode: string;
  reason: RefreshQueueReason;
  publishedTotal?: number | null;
  liveTotal?: number | null;
  publishedAsOf?: string | null;
  ranAt?: string;
}): void {
  appendRefreshLog({
    kind: "refresh-queue",
    ranAt: entry.ranAt ?? new Date().toISOString(),
    orphaCode: entry.orphaCode,
    reason: entry.reason,
    publishedTotal: entry.publishedTotal ?? null,
    liveTotal: entry.liveTotal ?? null,
    publishedAsOf: entry.publishedAsOf ?? null,
  });
}

/**
 * Collect unique ORPHA codes from refresh-log queue / live-check lines
 * newer than `sinceMs` (Date.now() - window). Last occurrence wins (most recent).
 */
export function readQueuedOrphaCodes(options?: {
  sinceMs?: number;
  kinds?: string[];
}): string[] {
  const sinceMs = options?.sinceMs ?? Date.now() - 14 * 86_400_000;
  const kinds = new Set(
    options?.kinds ?? ["refresh-queue", "live-check"]
  );
  if (!fs.existsSync(REFRESH_LOG_PATH)) return [];

  const lastIndex = new Map<string, number>();
  const ordered: string[] = [];
  const text = fs.readFileSync(REFRESH_LOG_PATH, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row: {
      kind?: string;
      orphaCode?: string;
      ranAt?: string;
      at?: string;
    };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
    if (!row.kind || !kinds.has(row.kind)) continue;
    if (typeof row.orphaCode !== "string" || !/^\d+$/.test(row.orphaCode)) {
      continue;
    }
    const when = Date.parse(row.ranAt ?? row.at ?? "");
    if (Number.isFinite(when) && when < sinceMs) continue;
    const prev = lastIndex.get(row.orphaCode);
    if (prev != null) {
      ordered[prev] = ""; // tombstone
    }
    lastIndex.set(row.orphaCode, ordered.length);
    ordered.push(row.orphaCode);
  }
  return ordered.filter(Boolean);
}
