import fs from "node:fs";
import path from "node:path";

const LOG_PATH = path.join(process.cwd(), "ingest.log");

function stamp(): string {
  return new Date().toISOString();
}

/** Join log parts with spaces — never concatenate bare args (space-drop bug). */
export function formatLogParts(...parts: unknown[]): string {
  return parts.map((p) => String(p)).join(" ");
}

function write(level: string, message: string): void {
  const line = `[${stamp()}] ${level} ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
}

export const log = {
  info: (...parts: unknown[]) => write("INFO", formatLogParts(...parts)),
  warn: (...parts: unknown[]) => write("WARN", formatLogParts(...parts)),
  error: (...parts: unknown[]) => write("ERROR", formatLogParts(...parts)),
  fail: (...parts: unknown[]) => write("FAIL", formatLogParts(...parts)),
};
