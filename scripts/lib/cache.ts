import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CACHE_DIR = path.join(process.cwd(), ".cache");

/** When true, skip reading cached API responses (still may write unless disabled). */
let cacheReadsDisabled = false;

export function setCacheReadsDisabled(disabled: boolean): void {
  cacheReadsDisabled = disabled;
}

export function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(key: string): string {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

export function readCache<T>(key: string): T | null {
  if (cacheReadsDisabled) return null;
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  ensureCacheDir();
  fs.writeFileSync(cachePath(key), JSON.stringify(value), "utf8");
}

export function binaryCachePath(filename: string): string {
  ensureCacheDir();
  return path.join(CACHE_DIR, filename);
}

export function readBinaryCache(filename: string): Buffer | null {
  if (cacheReadsDisabled) return null;
  const p = binaryCachePath(filename);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export function writeBinaryCache(filename: string, data: Buffer): void {
  ensureCacheDir();
  fs.writeFileSync(binaryCachePath(filename), data);
}
