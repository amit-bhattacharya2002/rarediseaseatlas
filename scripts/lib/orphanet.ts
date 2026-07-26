import { XMLParser } from "fast-xml-parser";
import { readBinaryCache, writeBinaryCache } from "./cache";
import { fetchText } from "./http";
import { log } from "./logger";

export const ORPHANET_PRODUCT1_URL =
  "https://www.orphadata.com/data/xml/en_product1.xml";
export const ORPHANET_PREVALENCE_URL =
  "https://www.orphadata.com/data/xml/en_product9_prev.xml";

export interface OrphanetDisease {
  orphaCode: string;
  name: string;
  synonyms: string[];
  definition: string | null;
  prevalenceClass: string | null;
  mondoIds: string[];
  expertLink: string;
  disorderGroup: string | null;
  disorderType: string | null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in node) {
    return String((node as { "#text": unknown })["#text"]);
  }
  return null;
}

async function loadXml(url: string, cacheFile: string): Promise<string> {
  const cached = readBinaryCache(cacheFile);
  if (cached) {
    log.info(`Using cached ${cacheFile}`);
    return cached.toString("utf8");
  }
  log.info(`Downloading ${url}`);
  const body = await fetchText(url, { timeoutMs: 180_000 });
  writeBinaryCache(cacheFile, Buffer.from(body, "utf8"));
  return body;
}

function assertShape(root: Record<string, unknown>, label: string): void {
  if (!root.JDBOR) {
    throw new Error(
      `${label}: expected root <JDBOR>; file shape has changed. Refusing to parse.`
    );
  }
  const jdbor = root.JDBOR as Record<string, unknown>;
  if (!jdbor.DisorderList) {
    throw new Error(
      `${label}: expected <DisorderList> under JDBOR; file shape has changed.`
    );
  }
}

export async function loadOrphanetDiseases(): Promise<{
  /** Disorder-level entities (groups dropped) — atlas corpus */
  diseases: OrphanetDisease[];
  /** ORPHA → Mondo for every Orphanet entity including groups (India umbrella matching) */
  orphaMondoByCode: Map<string, string[]>;
  /** Every OrphaCode in product1 (including groups) */
  allOrphaCodes: Set<string>;
  product1Date: string;
  prevalenceDate: string;
}> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
    // Orphanet files contain many &amp;/&lt; entities across 10k+ disorders
    processEntities: {
      enabled: true,
      maxTotalExpansions: 50_000_000,
      maxExpandedLength: 200_000_000,
      maxEntityCount: 1_000_000,
      maxEntitySize: 1_000_000,
    },
  });

  const product1Xml = await loadXml(ORPHANET_PRODUCT1_URL, "en_product1.xml");
  const prevXml = await loadXml(ORPHANET_PREVALENCE_URL, "en_product9_prev.xml");

  const product1 = parser.parse(product1Xml) as Record<string, unknown>;
  const prevalence = parser.parse(prevXml) as Record<string, unknown>;

  assertShape(product1, "en_product1.xml");
  assertShape(prevalence, "en_product9_prev.xml");

  const p1Jdbor = product1.JDBOR as Record<string, unknown>;
  const prevJdbor = prevalence.JDBOR as Record<string, unknown>;
  const product1Date = String(p1Jdbor["@_date"] ?? "unknown");
  const prevalenceDate = String(prevJdbor["@_date"] ?? "unknown");

  // Prevalence class map: orphaCode -> class name
  const prevalenceClassByOrpha = new Map<string, string>();
  const prevList = (prevJdbor.DisorderList as Record<string, unknown>)?.Disorder;
  for (const d of asArray(prevList)) {
    const code = textOf((d as Record<string, unknown>).OrphaCode);
    if (!code) continue;
    const prevs = asArray(
      ((d as Record<string, unknown>).PrevalenceList as Record<string, unknown>)
        ?.Prevalence
    );
    // Prefer Worldwide Point prevalence with a class
    let chosen: string | null = null;
    let fallback: string | null = null;
    for (const p of prevs) {
      const rec = p as Record<string, unknown>;
      const typeName = textOf((rec.PrevalenceType as Record<string, unknown>)?.Name);
      const geo = textOf((rec.PrevalenceGeographic as Record<string, unknown>)?.Name);
      const cls = textOf((rec.PrevalenceClass as Record<string, unknown>)?.Name);
      if (!cls) continue;
      const cleaned = cls.replace(/<\/?i>/gi, "").trim();
      if (!cleaned) continue;
      if (typeName === "Point prevalence" && geo === "Worldwide") {
        chosen = cleaned;
        break;
      }
      if (!fallback) fallback = cleaned;
    }
    if (chosen || fallback) {
      prevalenceClassByOrpha.set(code, chosen ?? fallback!);
    }
  }

  const disorders = asArray(
    (p1Jdbor.DisorderList as Record<string, unknown>)?.Disorder
  );
  if (disorders.length === 0) {
    throw new Error("en_product1.xml: DisorderList is empty — refusing to continue.");
  }

  const diseases: OrphanetDisease[] = [];

  for (const d of disorders) {
    const rec = d as Record<string, unknown>;
    const orphaCode = textOf(rec.OrphaCode);
    const name = textOf(rec.Name);
    if (!orphaCode || !name) {
      log.warn("Skipping disorder missing OrphaCode or Name");
      continue;
    }

    // Prefer disorders over groups/categories for the atlas MVP
    const disorderGroup = textOf(
      (rec.DisorderGroup as Record<string, unknown>)?.Name
    );
    const disorderType = textOf(
      (rec.DisorderType as Record<string, unknown>)?.Name
    );

    const synonyms = asArray(
      (rec.SynonymList as Record<string, unknown>)?.Synonym
    )
      .map((s) => textOf(s))
      .filter((s): s is string => Boolean(s));

    let definition: string | null = null;
    const summaries = asArray(
      (rec.SummaryInformationList as Record<string, unknown>)?.SummaryInformation
    );
    for (const sum of summaries) {
      const sections = asArray(
        ((sum as Record<string, unknown>).TextSectionList as Record<string, unknown>)
          ?.TextSection
      );
      for (const sec of sections) {
        const srec = sec as Record<string, unknown>;
        const sectionType = textOf(
          (srec.TextSectionType as Record<string, unknown>)?.Name
        );
        if (sectionType === "Definition") {
          const contents = textOf(srec.Contents);
          if (contents) {
            definition = contents
              .replace(/<\/?i>/gi, "")
              .replace(/<[^>]+>/g, "")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .trim();
          }
        }
      }
    }

    const mondoIds: string[] = [];
    const refs = asArray(
      (rec.ExternalReferenceList as Record<string, unknown>)?.ExternalReference
    );
    for (const ref of refs) {
      const r = ref as Record<string, unknown>;
      const source = textOf(r.Source);
      const reference = textOf(r.Reference);
      if (source === "MONDO" && reference) {
        const id = reference.startsWith("MONDO:")
          ? reference
          : `MONDO:${reference.padStart(7, "0")}`;
        mondoIds.push(id);
      }
    }

    const expertLink =
      textOf(rec.ExpertLink) ??
      `https://www.orpha.net/en/disease/detail/${orphaCode}`;

    diseases.push({
      orphaCode,
      name,
      synonyms,
      definition,
      prevalenceClass: prevalenceClassByOrpha.get(orphaCode) ?? null,
      mondoIds,
      expertLink: expertLink.replace(/^http:/, "https:"),
      disorderGroup,
      disorderType,
    });
  }

  // Prefer Disorder-level entities; keep subtypes; drop pure Groups for signal clarity
  const filtered = diseases.filter((d) => d.disorderGroup !== "Group of disorders");

  const orphaMondoByCode = new Map<string, string[]>();
  const allOrphaCodes = new Set<string>();
  for (const d of diseases) {
    allOrphaCodes.add(d.orphaCode);
    orphaMondoByCode.set(d.orphaCode, d.mondoIds);
  }

  log.info(
    `Orphanet loaded: ${diseases.length} entities, ${filtered.length} after dropping groups`
  );

  return {
    diseases: filtered,
    orphaMondoByCode,
    allOrphaCodes,
    product1Date,
    prevalenceDate,
  };
}
