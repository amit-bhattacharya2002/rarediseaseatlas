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
