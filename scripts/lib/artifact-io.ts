/**
 * Published corpus I/O. Canonical git object is data/diseases.json.gz
 * (~11MB); local scripts also keep an extracted data/diseases.json (gitignored)
 * for convenience and mid-run checkpoints.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { DiseasesArtifact } from "../../src/lib/types";

export const ARTIFACT_JSON = path.join(process.cwd(), "data", "diseases.json");
export const ARTIFACT_GZ = path.join(
  process.cwd(),
  "data",
  "diseases.json.gz"
);

export function readArtifact(filePath?: string): DiseasesArtifact {
  if (filePath) {
    if (filePath.endsWith(".gz")) {
      const buf = zlib.gunzipSync(fs.readFileSync(filePath));
      return JSON.parse(buf.toString("utf8")) as DiseasesArtifact;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as DiseasesArtifact;
  }
  if (fs.existsSync(ARTIFACT_JSON)) {
    return JSON.parse(
      fs.readFileSync(ARTIFACT_JSON, "utf8")
    ) as DiseasesArtifact;
  }
  if (fs.existsSync(ARTIFACT_GZ)) {
    const buf = zlib.gunzipSync(fs.readFileSync(ARTIFACT_GZ));
    return JSON.parse(buf.toString("utf8")) as DiseasesArtifact;
  }
  throw new Error(
    `Missing artifact: expected ${ARTIFACT_JSON} or ${ARTIFACT_GZ}`
  );
}

function writeAtomicFile(filePath: string, contents: Buffer | string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

/** Write pretty JSON locally and gzip canonical copy for git / deploy. */
export function writeArtifact(artifact: DiseasesArtifact): void {
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  writeAtomicFile(ARTIFACT_JSON, json);
  writeAtomicFile(ARTIFACT_GZ, zlib.gzipSync(Buffer.from(json, "utf8")));
}

/** Ensure diseases.json exists locally (extract from .gz if needed). */
export function ensureArtifactJson(): string {
  if (fs.existsSync(ARTIFACT_JSON)) return ARTIFACT_JSON;
  if (!fs.existsSync(ARTIFACT_GZ)) {
    throw new Error(`Missing ${ARTIFACT_JSON} and ${ARTIFACT_GZ}`);
  }
  const buf = zlib.gunzipSync(fs.readFileSync(ARTIFACT_GZ));
  writeAtomicFile(ARTIFACT_JSON, buf);
  return ARTIFACT_JSON;
}
