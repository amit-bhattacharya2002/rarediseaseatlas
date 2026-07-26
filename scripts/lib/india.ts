/**
 * India NPRD matching: direct ORPHAcode, then Mondo-ancestor umbrella match.
 *
 * Category policy rows often point at Orphanet *groups* (dropped from the atlas
 * corpus) or imperfect ORPHAcodes — we therefore index Mondo IDs from the full
 * Orphanet crosswalk (including groups) and fall back to exact Mondo label match
 * on the policy entry name.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  GroupEntitlement,
  IndiaMatchVia,
  IndiaNprdData,
} from "../../src/lib/types";
import type { MondoHierarchy } from "./mondo";
import { normalizeMondoId } from "./mondo";
import { log } from "./logger";

export interface IndiaHit {
  listed: boolean;
  via: IndiaMatchVia | null;
  matchedVia: string | null;
  matchedViaLabel: string | null;
  groups: Array<1 | 2 | 3>;
  entitlements: GroupEntitlement[];
}

interface NprdEntry {
  orphaCode: string | null;
  name: string;
  group: 1 | 2 | 3;
  mondoIds: string[];
}

function mondoIdsForPolicyEntry(
  d: IndiaNprdData["diseases"][number],
  orphaToMondo: Map<string, string[]>,
  _mondo: MondoHierarchy,
  labelIndex: Map<string, string>
): string[] {
  const ids = new Set<string>();
  if (d.orphaCode) {
    for (const m of orphaToMondo.get(d.orphaCode) ?? []) {
      ids.add(normalizeMondoId(m));
    }
  }
  // Exact Mondo label match on the policy category name (and stripped parentheticals)
  const candidates = [
    d.name,
    d.name.replace(/\s*[—(].*$/, "").trim(),
    d.name.replace(/\s*—.*$/, "").trim(),
  ];
  // Common NPRD wording → Mondo preferred labels
  const aliases: Record<string, string[]> = {
    "organic acidemia": ["inborn organic aciduria", "classic organic aciduria"],
    "urea cycle disorder": ["urea cycle disorder"],
    "urea cycle enzyme defects": ["urea cycle disorder"],
    osteopetrosis: ["osteopetrosis"],
    "neuronal ceroid lipofuscinosis": ["neuronal ceroid lipofuscinosis"],
    "congenital adrenal hyperplasia": ["congenital adrenal hyperplasia"],
    "spinal muscular atrophy": ["spinal muscular atrophy"],
  };
  for (const c of candidates) {
    const key = c.toLowerCase();
    const hit = labelIndex.get(key);
    if (hit) ids.add(hit);
    for (const [prefix, alts] of Object.entries(aliases)) {
      if (key === prefix || key.startsWith(prefix)) {
        for (const a of alts) {
          const m = labelIndex.get(a);
          if (m) ids.add(m);
        }
      }
    }
  }
  return [...ids];
}

export function buildIndiaMatcher(args: {
  india: IndiaNprdData;
  /** orphaCode → mondoIds from the full Orphanet load (including groups) */
  orphaToMondo: Map<string, string[]>;
  mondo: MondoHierarchy;
}): {
  lookup: (orphaCode: string, mondoIds: string[]) => IndiaHit;
  validateAgainstCorpus: (knownOrpha: Set<string>) => void;
} {
  const { india, orphaToMondo, mondo } = args;

  const labelIndex = new Map<string, string>();
  const indexPath = path.join(process.cwd(), ".cache", "mondo-index.json");
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
        labels: Record<string, string>;
      };
      for (const [id, lbl] of Object.entries(idx.labels)) {
        if (/^obsolete /i.test(lbl)) continue;
        const key = lbl.toLowerCase();
        if (!labelIndex.has(key)) labelIndex.set(key, id);
      }
    } catch {
      /* label fallback optional */
    }
  }

  const byOrpha = new Map<string, NprdEntry[]>();
  const entries: NprdEntry[] = [];

  for (const d of india.diseases) {
    const entry: NprdEntry = {
      orphaCode: d.orphaCode,
      name: d.name,
      group: d.group,
      mondoIds: mondoIdsForPolicyEntry(d, orphaToMondo, mondo, labelIndex),
    };
    entries.push(entry);
    if (!d.orphaCode) continue;
    const list = byOrpha.get(d.orphaCode) ?? [];
    list.push(entry);
    byOrpha.set(d.orphaCode, list);
  }

  /** Mondo ID → NPRD entries */
  const byMondo = new Map<string, NprdEntry[]>();
  for (const e of entries) {
    for (const m of e.mondoIds) {
      const list = byMondo.get(m) ?? [];
      if (!list.some((x) => x.name === e.name && x.group === e.group)) {
        list.push(e);
      }
      byMondo.set(m, list);
    }
  }

  function entitlementsFor(groups: Array<1 | 2 | 3>): GroupEntitlement[] {
    const out: GroupEntitlement[] = [];
    for (const g of groups) {
      const ent = india.groupEntitlements[String(g)];
      if (ent) out.push(ent);
    }
    return out;
  }

  function pack(
    matched: NprdEntry[],
    via: IndiaMatchVia,
    matchedVia: string | null,
    matchedViaLabel: string | null
  ): IndiaHit {
    const groups = [...new Set(matched.map((e) => e.group))].sort(
      (a, b) => a - b
    ) as Array<1 | 2 | 3>;
    return {
      listed: true,
      via,
      matchedVia,
      matchedViaLabel,
      groups,
      entitlements: entitlementsFor(groups),
    };
  }

  function lookup(orphaCode: string, mondoIds: string[]): IndiaHit {
    const direct = byOrpha.get(orphaCode);
    if (direct?.length) {
      return pack(direct, "direct", null, null);
    }

    const seed = mondoIds.map(normalizeMondoId);
    const seenMondo = new Set<string>(seed);
    for (const m of seed) {
      for (const anc of mondo.ancestors(m)) {
        if (seenMondo.has(anc)) continue;
        seenMondo.add(anc);
        const hits = byMondo.get(anc);
        if (hits?.length) {
          return pack(hits, "parent", anc, hits[0].name);
        }
      }
    }

    return {
      listed: false,
      via: null,
      matchedVia: null,
      matchedViaLabel: null,
      groups: [],
      entitlements: [],
    };
  }

  function validateAgainstCorpus(knownOrpha: Set<string>): void {
    const missing: string[] = [];
    for (const d of india.diseases) {
      if (!d.orphaCode) continue;
      if (!knownOrpha.has(d.orphaCode)) {
        missing.push(`${d.orphaCode} (${d.name})`);
      }
    }
    if (missing.length) {
      throw new Error(
        `India NPRD ORPHAcodes not in Orphanet corpus:\n  ${missing.join("\n  ")}`
      );
    }

    const unique = new Set(
      india.diseases.filter((d) => d.orphaCode).map((d) => d.orphaCode!)
    );
    const claim = india.officialDiseaseCountClaim;
    const entryCount = india.diseases.length;
    const delta = unique.size - claim;
    const dupNames = india.diseases
      .filter((d) => d.orphaCode)
      .reduce<Record<string, string[]>>((acc, d) => {
        const k = d.orphaCode!;
        (acc[k] ??= []).push(`${d.name} (G${d.group})`);
        return acc;
      }, {});
    const crossListed = Object.entries(dupNames)
      .filter(([, names]) => names.length > 1)
      .map(([code, names]) => `ORPHA:${code}: ${names.join("; ")}`);

    const withMondo = entries.filter((e) => e.mondoIds.length > 0).length;
    log.info(
      `India NPRD: ${entryCount} entries, ${unique.size} unique ORPHAcodes, claim=${claim}, delta(unique-claim)=${delta}, mondoIndexed=${withMondo}/${entries.length}` +
        (crossListed.length
          ? `\n  Cross-group / duplicate mappings (${crossListed.length}):\n  ${crossListed.slice(0, 12).join("\n  ")}${crossListed.length > 12 ? "\n  …" : ""}`
          : "")
    );
    if (Math.abs(delta) > 0) {
      log.warn(
        `India NPRD unique ORPHAcode count (${unique.size}) differs from officialDiseaseCountClaim (${claim}) by ${delta} — expected when the same code appears in multiple groups; see officialDiseaseCounts for sourced 55/63 figures.`
      );
    }
  }

  return { lookup, validateAgainstCorpus };
}
