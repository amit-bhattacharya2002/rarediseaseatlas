/**
 * Post-process plain-language definitions on finished data/diseases.json.
 *
 *   npx tsx scripts/plain-language.ts
 *   npx tsx scripts/plain-language.ts --limit 20
 *
 * Requires OPENAI_API_KEY or ANTHROPIC_API_KEY.
 * Caches by SHA-256 of the source definition so unchanged text is never re-sent.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rewriteDefinitionPlain } from "./lib/plain-language";
import { ensureCacheDir, readCache, writeCache } from "./lib/cache";
import { log } from "./lib/logger";
import type { DiseasesArtifact } from "../src/lib/types";

function defHash(definition: string): string {
  return crypto.createHash("sha256").update(definition.trim()).digest("hex");
}

async function main() {
  const limitIdx = process.argv.indexOf("--limit");
  const limit =
    limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1] ?? "", 10) : Infinity;

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY to generate plain-language definitions."
    );
    process.exit(1);
  }

  ensureCacheDir();
  const p = path.join(process.cwd(), "data", "diseases.json");
  const artifact = JSON.parse(fs.readFileSync(p, "utf8")) as DiseasesArtifact;
  let n = 0;
  let written = 0;
  let cachedHits = 0;

  for (const d of artifact.diseases) {
    if (n >= limit) break;
    if (d.plainLanguageDefinition || !d.definition) continue;
    n += 1;

    const key = `plainlang:v1:${defHash(d.definition)}`;
    const cached = readCache<{ text: string }>(key);
    if (cached?.text) {
      d.plainLanguageDefinition = cached.text;
      written += 1;
      cachedHits += 1;
      log.info(`[${n}] ORPHA:${d.orphaCode} (cache hit)`);
      continue;
    }

    log.info(`[${n}] ORPHA:${d.orphaCode} ${d.name}`);
    const plain = await rewriteDefinitionPlain(d.definition, d.name);
    if (plain) {
      d.plainLanguageDefinition = plain;
      writeCache(key, { text: plain, diseaseName: d.name });
      written += 1;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
  log.info(
    `Done. wrote plain language for ${written} diseases (${cachedHits} from cache)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
