/**
 * Mondo Disease Ontology — download, cache, ancestor map, xrefs + synonyms.
 * Used for (a) zero-publication naming-artifact detection, (b) India NPRD
 * umbrella matching, (c) structured cross-references (MeSH/UMLS/OMIM/NCIT),
 * and (d) exact-synonym union for name matching.
 */

import fs from "node:fs";
import path from "node:path";
import { binaryCachePath, ensureCacheDir, readBinaryCache, writeBinaryCache } from "./cache";
import { fetchText } from "./http";
import { log } from "./logger";

const MONDO_URL =
  "https://github.com/monarch-initiative/mondo/releases/latest/download/mondo.json";
const MONDO_FILE = "mondo.json";
const INDEX_FILE = "mondo-index-v2.json";

interface ObographEdge {
  sub?: string;
  pred?: string;
  obj?: string;
}

interface ObographSynonym {
  pred?: string;
  val?: string;
}

interface ObographNode {
  id?: string;
  lbl?: string;
  type?: string;
  meta?: {
    xrefs?: { val?: string }[];
    synonyms?: ObographSynonym[];
  };
}

interface MondoIndex {
  version: string;
  builtAt: string;
  /** Immediate is_a parents */
  parents: Record<string, string[]>;
  labels: Record<string, string>;
  /** Raw xref strings, e.g. "MESH:D000544", "OMIM:201470" */
  xrefs: Record<string, string[]>;
  /** hasExactSynonym values */
  exactSynonyms: Record<string, string[]>;
}

export interface MondoHierarchy {
  version: string;
  label(id: string): string | null;
  parentsOf(id: string): string[];
  /** Ancestors nearest-first (excludes self). */
  ancestors(id: string, maxDepth?: number): string[];
  xrefsOf(id: string): string[];
  exactSynonymsOf(id: string): string[];
}

function curieFromIri(iri: string): string | null {
  const m = iri.match(/MONDO[_:](\d+)/i);
  if (!m) return null;
  return `MONDO:${m[1].padStart(7, "0")}`;
}

function buildIndex(raw: {
  graphs?: {
    nodes?: ObographNode[];
    edges?: ObographEdge[];
    meta?: { version?: string };
  }[];
}): MondoIndex {
  const g = raw.graphs?.[0];
  if (!g) throw new Error("Mondo JSON: missing graphs[0]");

  const labels: Record<string, string> = {};
  const xrefs: Record<string, string[]> = {};
  const exactSynonyms: Record<string, string[]> = {};
  for (const n of g.nodes ?? []) {
    if (!n.id || n.type !== "CLASS") continue;
    const curie = curieFromIri(n.id);
    if (!curie) continue;
    if (n.lbl) labels[curie] = n.lbl;
    const xs = (n.meta?.xrefs ?? [])
      .map((x) => (x.val ?? "").trim())
      .filter(Boolean);
    if (xs.length) xrefs[curie] = [...new Set(xs)];
    const syns = (n.meta?.synonyms ?? [])
      .filter((s) => s.pred === "hasExactSynonym" && s.val)
      .map((s) => s.val!.trim())
      .filter(Boolean);
    if (syns.length) exactSynonyms[curie] = [...new Set(syns)];
  }

  const parents: Record<string, string[]> = {};
  for (const e of g.edges ?? []) {
    if (e.pred !== "is_a") continue;
    if (!e.sub || !e.obj) continue;
    const child = curieFromIri(e.sub);
    const parent = curieFromIri(e.obj);
    if (!child || !parent) continue;
    const list = parents[child] ?? [];
    if (!list.includes(parent)) list.push(parent);
    parents[child] = list;
  }

  const version =
    (g as { meta?: { version?: string } }).meta?.version ||
    new Date().toISOString().slice(0, 10);

  return {
    version,
    builtAt: new Date().toISOString(),
    parents,
    labels,
    xrefs,
    exactSynonyms,
  };
}

function indexToHierarchy(index: MondoIndex): MondoHierarchy {
  return {
    version: index.version,
    label(id: string) {
      return index.labels[normalizeMondoId(id)] ?? null;
    },
    parentsOf(id: string) {
      return index.parents[normalizeMondoId(id)] ?? [];
    },
    ancestors(id: string, maxDepth = 12) {
      const start = normalizeMondoId(id);
      const out: string[] = [];
      const seen = new Set<string>([start]);
      let frontier = [...(index.parents[start] ?? [])];
      let depth = 0;
      while (frontier.length && depth < maxDepth) {
        const next: string[] = [];
        for (const p of frontier) {
          if (seen.has(p)) continue;
          seen.add(p);
          out.push(p);
          for (const gp of index.parents[p] ?? []) {
            if (!seen.has(gp)) next.push(gp);
          }
        }
        frontier = next;
        depth += 1;
      }
      return out;
    },
    xrefsOf(id: string) {
      return index.xrefs[normalizeMondoId(id)] ?? [];
    },
    exactSynonymsOf(id: string) {
      return index.exactSynonyms[normalizeMondoId(id)] ?? [];
    },
  };
}

export function normalizeMondoId(id: string): string {
  const c = curieFromIri(id) ?? id.trim().toUpperCase().replace("_", ":");
  if (c.startsWith("MONDO:")) {
    const num = c.slice(6).replace(/\D/g, "");
    return `MONDO:${num.padStart(7, "0")}`;
  }
  return c;
}

async function ensureMondoJson(): Promise<Buffer> {
  ensureCacheDir();
  const cached = readBinaryCache(MONDO_FILE);
  if (cached && cached.length > 1_000_000) return cached;

  log.info(`Downloading Mondo ontology (${MONDO_URL})…`);
  const text = await fetchText(MONDO_URL, {
    cacheKey: undefined,
    timeoutMs: 300_000,
    maxRetries: 3,
  });
  const buf = Buffer.from(text, "utf8");
  writeBinaryCache(MONDO_FILE, buf);
  log.info(`Mondo JSON cached (${(buf.length / 1e6).toFixed(1)} MB)`);
  return buf;
}

function loadCachedIndex(): MondoIndex | null {
  const p = binaryCachePath(INDEX_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as MondoIndex;
  } catch {
    return null;
  }
}

function writeCachedIndex(index: MondoIndex): void {
  ensureCacheDir();
  const p = binaryCachePath(INDEX_FILE);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(index), "utf8");
  fs.renameSync(tmp, p);
}

export async function loadMondoHierarchy(): Promise<MondoHierarchy> {
  const existing = loadCachedIndex();
  const mondoPath = binaryCachePath(MONDO_FILE);
  if (existing && existing.xrefs && fs.existsSync(mondoPath)) {
    log.info(
      `Mondo index: ${Object.keys(existing.labels).length} labels, ${Object.keys(existing.xrefs).length} xref sets, version=${existing.version}`
    );
    return indexToHierarchy(existing);
  }

  const buf = await ensureMondoJson();
  log.info("Building Mondo index (labels, parents, xrefs, synonyms)…");
  const rawParsed = JSON.parse(buf.toString("utf8")) as Parameters<typeof buildIndex>[0];
  const index = buildIndex(rawParsed);
  writeCachedIndex(index);
  log.info(
    `Mondo index built: ${Object.keys(index.labels).length} labels, ${Object.keys(index.parents).length} parent entries, ${Object.keys(index.xrefs).length} xref sets, version=${index.version}`
  );
  return indexToHierarchy(index);
}

export function mondoCacheDir(): string {
  return path.dirname(binaryCachePath(MONDO_FILE));
}
