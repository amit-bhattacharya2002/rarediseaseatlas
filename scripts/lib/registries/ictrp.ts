import crypto from "node:crypto";
import { fetchText } from "../http";
import type { RegistryTrialRecord } from "../../../src/lib/types";
import {
  collectSecondaryIds,
  extractNctId,
  inferRegistrySource,
} from "./normalize";

const MAX_TERMS = 3;
const LIMIT = 40;

function tag(xml: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function parseWhoTrial(block: string): RegistryTrialRecord | null {
  const trialId =
    tag(block, "trial_id") ||
    tag(block, "trialID") ||
    tag(block, "MainID") ||
    "";
  const title =
    tag(block, "public_title") ||
    tag(block, "Public_title") ||
    tag(block, "scientific_title") ||
    tag(block, "Scientific_title") ||
    "";
  if (!trialId && !title) return null;
  const id = trialId || `ictrp-${crypto.createHash("sha1").update(title).digest("hex").slice(0, 12)}`;
  const url =
    tag(block, "url") ||
    tag(block, "web_address") ||
    `https://trialsearch.who.int/Trial2.aspx?TrialID=${encodeURIComponent(id)}`;
  const conditionsRaw =
    tag(block, "condition") ||
    tag(block, "Health_condition_or_problem_studied") ||
    "";
  const secondary =
    tag(block, "secondary_id") ||
    tag(block, "SecondaryID") ||
    tag(block, "secondary_ids") ||
    "";
  const nctId = extractNctId(id, url, secondary, title);
  const secondaryIds = collectSecondaryIds(id, secondary, url);
  return {
    id,
    nctId,
    secondaryIds,
    title: title || id,
    status: tag(block, "recruitment_status") || tag(block, "Recruitment_Status") || null,
    registry: inferRegistrySource(id) === "other" ? "ictrp" : inferRegistrySource(id),
    url,
    conditions: conditionsRaw
      ? conditionsRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
      : [],
    studyType: tag(block, "study_type") || tag(block, "Study_type") || null,
  };
}

/**
 * Best-effort ICTRP search.
 *
 * Official ICTRP SOAP/crawling services need a WHO partnership; the public
 * portal is an SPA without a documented search API. We try a few historical
 * XML export URLs and return [] + throw if none yield trials so the caller
 * can record sourceErrors.ictrp honestly.
 */
export async function searchIctrp(
  terms: string[]
): Promise<RegistryTrialRecord[]> {
  const q = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  if (q.length === 0) return [];

  const query = q[0];
  const urls = [
    // Historical / partner-adjacent patterns — most will 404/302 today.
    `https://apps.who.int/trialsearch/TrialExport.aspx?Condition=${encodeURIComponent(query)}`,
    `https://trialsearch.who.int/TrialExport.aspx?Condition=${encodeURIComponent(query)}`,
  ];

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const xml = await fetchText(url, {
        cacheKey: `ictrp:v1:${crypto.createHash("sha1").update(url).digest("hex")}`,
        timeoutMs: 45_000,
        maxRetries: 2,
      });
      if (!xml.includes("<") || xml.includes("<html")) {
        errors.push(`${url}: non-XML response`);
        continue;
      }
      const blocks = xml.split(/<\/trial>/i);
      const out: RegistryTrialRecord[] = [];
      for (const block of blocks) {
        if (!/<trial[\s>]/i.test(block) && !/<Trial[\s>]/i.test(block)) continue;
        const rec = parseWhoTrial(`${block}</trial>`);
        if (rec) out.push(rec);
      }
      if (out.length > 0) return out.slice(0, LIMIT);
      errors.push(`${url}: XML but 0 trials`);
    } catch (err) {
      errors.push(`${url}: ${String(err).slice(0, 160)}`);
    }
  }

  throw new Error(
    `ICTRP public search unavailable (WHO portal is SPA-only; SOAP needs partnership). Tried: ${errors.join(" | ")}`
  );
}
