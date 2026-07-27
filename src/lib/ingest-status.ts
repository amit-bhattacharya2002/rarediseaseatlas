import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { SamplingProvenance } from "./types";

/** Shared ingest progress file — written by ingest, read by the site. */
export interface IngestStatusFile {
  status: "running" | "complete" | "idle";
  done: number;
  target: number;
  /** Published diseases.json row count (frozen site data). */
  published: number;
  sampling: {
    mode: "sample" | "limit" | "full";
    n: number | null;
    seed: number | null;
  };
  updatedAt: string;
  message?: string;
}

const STATUS_PATH = path.join(process.cwd(), "data", "ingest-status.json");
const CHECKPOINT_PATH = path.join(
  process.cwd(),
  "data",
  "diseases.checkpoint.json"
);
const PUBLISH_PATH = path.join(process.cwd(), "data", "diseases.json");
const PUBLISH_GZ_PATH = path.join(process.cwd(), "data", "diseases.json.gz");

/** Fallback when neither checkpoint nor published artifact carries corpusLevels. */
const FALLBACK_ATLAS_USABLE = 8171;

/** Avoid re-parsing multi‑MB JSON on every banner poll / navigation. */
let cache: { at: number; value: IngestStatusFile | null } | null = null;
const CACHE_MS = 5_000;

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function countOrphaCodesInBuffer(buf: Buffer): number {
  const needle = Buffer.from('"orphaCode"');
  let count = 0;
  let from = 0;
  while (from < buf.length) {
    const idx = buf.indexOf(needle, from);
    if (idx === -1) break;
    count += 1;
    from = idx + needle.length;
  }
  return count;
}

/**
 * Cheap disease count for huge checkpoints — do NOT JSON.parse the whole file.
 * Counts top-level `"orphaCode"` keys (one per disease record in our schema).
 */
function countOrphaCodesInFile(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return countOrphaCodesInBuffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

function publishedDiseaseCount(): number | null {
  const fromJson = countOrphaCodesInFile(PUBLISH_PATH);
  if (fromJson != null) return fromJson;
  try {
    if (!fs.existsSync(PUBLISH_GZ_PATH)) return null;
    return countOrphaCodesInBuffer(
      zlib.gunzipSync(fs.readFileSync(PUBLISH_GZ_PATH))
    );
  } catch {
    return null;
  }
}

/** Pull a few top-level string/number fields without parsing the diseases array. */
function peekArtifactMeta(filePath: string): {
  generatedAt: string | null;
  sampling: SamplingProvenance | null;
  atlasUsable: number | null;
} {
  try {
    if (!fs.existsSync(filePath)) {
      return { generatedAt: null, sampling: null, atlasUsable: null };
    }
    // Read a prefix large enough for provenance headers (diseases array starts later).
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8");

    const generatedAt = head.match(/"generatedAt"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const mode = head.match(/"mode"\s*:\s*"(sample|limit|full)"/)?.[1] as
      | SamplingProvenance["mode"]
      | undefined;
    const sampleN = head.match(/"sampling"\s*:\s*\{[^}]*"n"\s*:\s*(\d+|null)/)?.[1];
    const seed = head.match(/"sampling"\s*:\s*\{[^}]*"seed"\s*:\s*(\d+|null)/)?.[1];
    const excluded = head.match(
      /"excludedObsoleteOrNonRare"\s*:\s*(\d+)/
    )?.[1];
    const atlas = head.match(/"atlasUsableEstimate"\s*:\s*(\d+)/)?.[1];

    const sampling: SamplingProvenance | null = mode
      ? {
          mode,
          n: sampleN && sampleN !== "null" ? Number(sampleN) : null,
          seed: seed && seed !== "null" ? Number(seed) : null,
          excludedObsoleteOrNonRare: excluded ? Number(excluded) : 0,
        }
      : null;

    return {
      generatedAt,
      sampling,
      atlasUsable: atlas ? Number(atlas) : null,
    };
  } catch {
    return { generatedAt: null, sampling: null, atlasUsable: null };
  }
}

function inferTarget(
  sampling: SamplingProvenance,
  corpusUsable: number | null,
  done: number
): number {
  if (sampling.mode === "sample" || sampling.mode === "limit") {
    return sampling.n ?? done;
  }
  return Math.max(corpusUsable ?? FALLBACK_ATLAS_USABLE, done);
}

function fromCheckpointLight(): IngestStatusFile | null {
  const pubMeta = peekArtifactMeta(PUBLISH_PATH);
  const ckMeta = peekArtifactMeta(CHECKPOINT_PATH);
  if (!ckMeta.generatedAt || !ckMeta.sampling) return null;

  const done = countOrphaCodesInFile(CHECKPOINT_PATH);
  const pubN = publishedDiseaseCount();
  if (done == null || pubN == null) return null;

  const sampling = ckMeta.sampling;
  const corpusUsable = ckMeta.atlasUsable ?? pubMeta.atlasUsable ?? FALLBACK_ATLAS_USABLE;
  const target = inferTarget(sampling, corpusUsable, done);
  const checkpointNewer =
    pubMeta.generatedAt != null &&
    Date.parse(ckMeta.generatedAt) > Date.parse(pubMeta.generatedAt);
  const incomplete =
    sampling.mode === "full"
      ? done < target
      : done < (sampling.n ?? target);
  if (!(checkpointNewer && incomplete)) return null;

  return {
    status: "running",
    done,
    target,
    published: pubN,
    sampling: {
      mode: sampling.mode,
      n: sampling.n,
      seed: sampling.seed,
    },
    updatedAt: ckMeta.generatedAt,
    message:
      "Ingest checkpoint in progress. Live site numbers still come from the last published artifact.",
  };
}

/**
 * Load ingest progress for display. Prefers data/ingest-status.json; falls back
 * to a lightweight checkpoint peek (never JSON.parses the full 60MB+ file).
 */
export function getIngestStatus(): IngestStatusFile | null {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const written = readJson<IngestStatusFile>(STATUS_PATH);

  // Hot path while ingest runs: trust the tiny status file. Parsing the
  // multi‑tens‑of‑MB checkpoint on every /api/ingest-status poll froze the site.
  if (written?.status === "running") {
    cache = { at: now, value: written };
    return written;
  }

  const ck = fromCheckpointLight();
  let value: IngestStatusFile | null = null;
  if (ck) value = ck;
  else if (written?.status === "complete") value = written;
  else value = written;

  cache = { at: now, value };
  return value;
}

export function ingestProgressPercent(status: IngestStatusFile): number | null {
  if (status.target <= 0) return null;
  return Math.min(100, Math.round((1000 * status.done) / status.target) / 10);
}

/** Test helper — clear memoization between calls. */
export function __resetIngestStatusCacheForTests(): void {
  cache = null;
}
