import fs from "node:fs";
import path from "node:path";
import type { DiseasesArtifact, SamplingProvenance } from "./types";

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

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
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
  return Math.max(corpusUsable ?? done, done);
}

/**
 * Load ingest progress for display. Prefers data/ingest-status.json; falls back
 * to comparing checkpoint vs published artifact so a mid-run site still works.
 */
export function getIngestStatus(): IngestStatusFile | null {
  const written = readJson<IngestStatusFile>(STATUS_PATH);
  const published = readJson<DiseasesArtifact>(PUBLISH_PATH);
  const checkpoint = readJson<DiseasesArtifact>(CHECKPOINT_PATH);

  const fromCheckpoint = (): IngestStatusFile | null => {
    if (!published || !checkpoint) return null;
    const done = checkpoint.diseases.length;
    const pubN = published.diseases.length;
    const sampling = checkpoint.sampling;
    const corpusUsable =
      checkpoint.corpusLevels?.atlasUsableEstimate ??
      published.corpusLevels?.atlasUsableEstimate ??
      null;
    const target = inferTarget(sampling, corpusUsable, done);
    const checkpointNewer =
      Date.parse(checkpoint.generatedAt) > Date.parse(published.generatedAt);
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
      updatedAt: checkpoint.generatedAt,
      message:
        "Ingest checkpoint in progress. Live site numbers still come from the last published artifact.",
    };
  };

  const ck = fromCheckpoint();

  if (written?.status === "running") {
    // Prefer the higher done count / fresher timestamp (checkpoint may advance
    // before the next ingest-status write on an older running process).
    if (ck && ck.done >= written.done) return ck;
    return written;
  }

  if (ck) return ck;
  if (written?.status === "complete") return written;
  return written;
}

export function ingestProgressPercent(status: IngestStatusFile): number | null {
  if (status.target <= 0) return null;
  return Math.min(100, Math.round((1000 * status.done) / status.target) / 10);
}
