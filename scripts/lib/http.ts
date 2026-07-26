import { readCache, writeCache } from "./cache";

const MIN_INTERVAL_MS = 340; // ~3 req/sec
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

async function rateLimit(): Promise<void> {
  const run = async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  };
  queue = queue.then(run, run);
  await queue;
}

export interface FetchJsonOptions {
  cacheKey?: string;
  maxRetries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchText(
  url: string,
  options: FetchJsonOptions = {}
): Promise<string> {
  const { cacheKey, maxRetries = 5, timeoutMs = 60_000, headers = {} } = options;

  if (cacheKey) {
    const cached = readCache<{ body: string }>(cacheKey);
    if (cached?.body != null) return cached.body;
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt += 1;
    await rateLimit();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "IsAnyoneWorkingOnThis/0.1 (research-landscape; contact via GitHub issues)",
          ...headers,
        },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // Client errors (incl. 400 over-long query) must not become silent zeros
      // via retry-then-collapse. Fail fast so callers can null the field.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      const body = await res.text();
      if (cacheKey) writeCache(cacheKey, { body, fetchedAt: new Date().toISOString(), url });
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const msg = String(err);
      // Do not retry permanent client errors (especially HTTP 400).
      if (/\bHTTP 4\d\d\b/.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
      const backoff = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(`Failed after ${maxRetries} retries: ${url} — ${String(lastError)}`);
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const text = await fetchText(url, options);
  return JSON.parse(text) as T;
}
