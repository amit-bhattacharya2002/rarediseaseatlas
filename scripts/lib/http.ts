import { readCache, writeCache } from "./cache";

const MIN_INTERVAL_MS = Number(process.env.RRD_HTTP_MIN_INTERVAL_MS ?? 220); // ~4.5 req/sec default
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

export interface FetchJsonPostOptions extends FetchJsonOptions {
  body?: unknown;
  method?: "POST" | "PUT";
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
          "User-Agent":
            "IsAnyoneWorkingOnThis/0.1 (research-landscape; contact via GitHub issues)",
          ...headers,
        },
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        const backoff =
          Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }

      const body = await res.text();
      if (cacheKey)
        writeCache(cacheKey, { body, fetchedAt: new Date().toISOString(), url });
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const msg = String(err);
      if (/\bHTTP 4\d\d\b/.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
      const backoff =
        Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(
    `Failed after ${maxRetries} retries: ${url} — ${String(lastError)}`
  );
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const text = await fetchText(url, options);
  return JSON.parse(text) as T;
}

/** POST/PUT JSON helper (CTIS search, etc.). Honors the shared rate limiter. */
export async function fetchJsonPost<T>(
  url: string,
  options: FetchJsonPostOptions = {}
): Promise<T> {
  const {
    cacheKey,
    maxRetries = 5,
    timeoutMs = 60_000,
    headers = {},
    body = {},
    method = "POST",
  } = options;

  if (cacheKey) {
    const cached = readCache<{ body: string }>(cacheKey);
    if (cached?.body != null) return JSON.parse(cached.body) as T;
  }

  let attempt = 0;
  let lastError: unknown;
  const payload = JSON.stringify(body);

  while (attempt < maxRetries) {
    attempt += 1;
    await rateLimit();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent":
            "IsAnyoneWorkingOnThis/0.1 (research-landscape; contact via GitHub issues)",
          ...headers,
        },
        body: payload,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        const backoff =
          Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const text = await res.text();
      if (cacheKey) {
        writeCache(cacheKey, {
          body: text,
          fetchedAt: new Date().toISOString(),
          url,
        });
      }
      return JSON.parse(text) as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const msg = String(err);
      if (/\bHTTP 4\d\d\b/.test(msg)) {
        throw err instanceof Error ? err : new Error(msg);
      }
      const backoff =
        Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw new Error(
    `Failed after ${maxRetries} retries: ${url} — ${String(lastError)}`
  );
}
