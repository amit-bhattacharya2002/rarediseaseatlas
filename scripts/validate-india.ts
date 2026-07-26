/**
 * CLI: validate India NPRD staleness + structure (used as prebuild).
 *
 *   npx tsx scripts/validate-india.ts
 */

import {
  assertIndiaFreshness,
  loadIndiaNprd,
  validateIndiaStructure,
} from "./lib/validate-india";
import { log } from "./lib/logger";

async function main(): Promise<void> {
  const india = loadIndiaNprd();
  validateIndiaStructure(india);
  const { ageDays, warn } = assertIndiaFreshness(india);
  log.info(
    `India NPRD lastVerified=${india.lastVerified} ageDays=${Math.floor(ageDays)}${warn ? " (stale warning)" : ""}`
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
