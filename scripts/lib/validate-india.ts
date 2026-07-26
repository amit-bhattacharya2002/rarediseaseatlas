/**
 * Validate data/india-nprd.json — ORPHAcode resolution helpers, count reconciliation,
 * and lastVerified staleness (warn >6 months, fail >12).
 */

import fs from "node:fs";
import path from "node:path";
import type { IndiaNprdData } from "../../src/lib/types";
import { log } from "./logger";

const MS_DAY = 86_400_000;

export function indiaAgeDays(lastVerified: string, now = new Date()): number {
  const d = new Date(lastVerified + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) {
    throw new Error(`India NPRD lastVerified is not a valid date: ${lastVerified}`);
  }
  return (now.getTime() - d.getTime()) / MS_DAY;
}

export function assertIndiaFreshness(
  india: IndiaNprdData,
  opts: { failOverDays?: number; warnOverDays?: number } = {}
): { ageDays: number; warn: boolean } {
  const failOverDays = opts.failOverDays ?? 365;
  const warnOverDays = opts.warnOverDays ?? 183;
  const ageDays = indiaAgeDays(india.lastVerified);
  if (ageDays > failOverDays) {
    throw new Error(
      `India NPRD lastVerified (${india.lastVerified}) is ${Math.floor(ageDays)} days old — older than ${failOverDays} days. Re-verify data/india-nprd.json before building.`
    );
  }
  const warn = ageDays > warnOverDays;
  if (warn) {
    log.warn(
      `India NPRD lastVerified (${india.lastVerified}) is ${Math.floor(ageDays)} days old (>${warnOverDays} days). Re-verify soon.`
    );
  }
  return { ageDays, warn };
}

export function loadIndiaNprd(): IndiaNprdData {
  const p = path.join(process.cwd(), "data", "india-nprd.json");
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as IndiaNprdData;
}

export function validateIndiaStructure(india: IndiaNprdData): void {
  if (!india.crowdfundingPortal) {
    throw new Error("India NPRD missing crowdfundingPortal");
  }
  if (!india.officialDiseaseCounts?.length) {
    throw new Error("India NPRD missing officialDiseaseCounts");
  }
  if (india.centresOfExcellence.length !== 15) {
    log.warn(
      `India NPRD centresOfExcellence count is ${india.centresOfExcellence.length}, expected 15`
    );
  }
  for (const c of india.centresOfExcellence) {
    if (!c.source) throw new Error(`CoE missing source: ${c.name}`);
  }
  for (const [k, ent] of Object.entries(india.groupEntitlements)) {
    if (!ent.label || !ent.mechanism || !ent.caveat) {
      throw new Error(`groupEntitlements[${k}] missing label/mechanism/caveat`);
    }
  }
  for (const d of india.diseases) {
    if (!d.source || !d.mappingConfidence) {
      throw new Error(`Disease entry missing source/mappingConfidence: ${d.name}`);
    }
  }

  const unique = new Set(
    india.diseases.filter((d) => d.orphaCode).map((d) => d.orphaCode!)
  );
  log.info(
    `India NPRD structure ok: ${india.diseases.length} entries, ${unique.size} unique codes, claim=${india.officialDiseaseCountClaim}, CoEs=${india.centresOfExcellence.length}`
  );
}
