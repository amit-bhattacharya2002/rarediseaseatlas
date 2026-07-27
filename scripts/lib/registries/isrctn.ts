import crypto from "node:crypto";
import { fetchText } from "../http";
import type { RegistryTrialRecord } from "../../../src/lib/types";
import { collectSecondaryIds, extractNctId } from "./normalize";

const MAX_TERMS = 3;
const LIMIT = 40;

function tag(xml: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function parseWhoFormat(xml: string): RegistryTrialRecord[] {
  const out: RegistryTrialRecord[] = [];
  const blocks = xml.split(/<\/trial>/i);
  for (const raw of blocks) {
    if (!/<trial[\s>]/i.test(raw)) continue;
    const block = `${raw}</trial>`;
    const trialId = tag(block, "trial_id");
    if (!trialId) continue;
    const title =
      tag(block, "public_title") || tag(block, "scientific_title") || trialId;
    const secondary = tag(block, "secondary_id");
    const url = tag(block, "url") || `https://www.isrctn.com/${trialId}`;
    out.push({
      id: trialId.toUpperCase().startsWith("ISRCTN")
        ? trialId.toUpperCase()
        : `ISRCTN${trialId.replace(/\D/g, "")}`,
      nctId: extractNctId(trialId, secondary, url, title),
      secondaryIds: collectSecondaryIds(trialId, secondary, url),
      title,
      status: tag(block, "recruitment_status") || null,
      registry: "isrctn",
      url,
      conditions: (tag(block, "condition") || "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      studyType: tag(block, "study_type") || null,
    });
  }
  return out;
}

function parseDefaultFormat(xml: string): RegistryTrialRecord[] {
  const out: RegistryTrialRecord[] = [];
  const blocks = xml.split(/<\/fullTrial>/i);
  for (const raw of blocks) {
    if (!/<fullTrial[\s>]/i.test(raw)) continue;
    const block = `${raw}</fullTrial>`;
    const isrctn =
      tag(block, "isrctn") ||
      (block.match(/publicIdentifierCanonical="(ISRCTN\d+)"/i)?.[1] ?? "");
    if (!isrctn) continue;
    const id = isrctn.toUpperCase().startsWith("ISRCTN")
      ? isrctn.toUpperCase()
      : `ISRCTN${isrctn.replace(/\D/g, "")}`;
    const title =
      tag(block, "title") || tag(block, "scientificTitle") || id;
    const secondary = [
      tag(block, "externalRef"),
      tag(block, "secondaryIdentifiers"),
    ]
      .filter(Boolean)
      .join(" ");
    out.push({
      id,
      nctId: extractNctId(id, secondary, title),
      secondaryIds: collectSecondaryIds(id, secondary),
      title,
      status: tag(block, "overallStatus") || tag(block, "recruitmentStatus") || null,
      registry: "isrctn",
      url: `https://www.isrctn.com/${id}`,
      conditions: (tag(block, "condition") || tag(block, "conditions") || "")
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      studyType: tag(block, "primaryStudyDesign") || tag(block, "studyType") || null,
    });
  }
  return out;
}

export async function searchIsrctn(
  terms: string[]
): Promise<RegistryTrialRecord[]> {
  const q = terms
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, MAX_TERMS);
  if (q.length === 0) return [];

  const out: RegistryTrialRecord[] = [];
  const seen = new Set<string>();

  for (const term of q) {
    // Prefer WHO format (stable fields); fall back to default.
    for (const format of ["who", "default"] as const) {
      const url = `https://www.isrctn.com/api/query/format/${format}?q=${encodeURIComponent(term)}&limit=${LIMIT}`;
      const cacheKey = `isrctn:v1:${crypto
        .createHash("sha1")
        .update(url)
        .digest("hex")}`;
      try {
        const xml = await fetchText(url, { cacheKey, timeoutMs: 45_000 });
        const parsed =
          format === "who" ? parseWhoFormat(xml) : parseDefaultFormat(xml);
        for (const rec of parsed) {
          if (seen.has(rec.id)) continue;
          seen.add(rec.id);
          out.push(rec);
        }
        if (parsed.length > 0) break;
      } catch {
        // try next format / term
      }
    }
  }

  return out;
}
