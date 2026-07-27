/**
 * Fail the build if analysis / annotated / audit / remediation artifacts
 * resolve under a path Next.js serves statically (public/).
 *
 * Annotated trial counts are intentionally stale; serving them is a
 * publish-by-accident hazard that a WARNING field cannot prevent.
 *
 *   npx tsx scripts/assert-no-analysis-in-public.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

/** Basename (case-insensitive) must not match these when under public/. */
const FORBIDDEN_BASENAME =
  /(annotated|audit|manifest|remediation|quality-flags)/i;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (FORBIDDEN_BASENAME.test(ent.name)) {
      out.push(path.relative(ROOT, full));
    }
  }
}

function main(): void {
  const hits: string[] = [];
  walk(PUBLIC_DIR, hits);
  if (hits.length > 0) {
    console.error(
      "Served-path analysis guard failed — move these out of public/ " +
        "(e.g. data/analysis/) before building:"
    );
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log("Served-path analysis guard ok (no annotated/audit/manifest under public/).");
}

main();
