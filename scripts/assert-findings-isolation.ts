/**
 * Fail the build if findings loader / body import the live diseases artifact.
 * Route pages may import live aggregates only for the one-line cross-link.
 *
 *   npx tsx scripts/assert-findings-isolation.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STRICT = [
  path.join(ROOT, "src", "lib", "findings.ts"),
  path.join(ROOT, "src", "components", "FindingsBody.tsx"),
];

const FORBIDDEN = [
  /diseases\.json/,
  /@\/lib\/data/,
  /diseasesArtifact/,
  /findings-latest\.json/,
  /getAggregate/,
  /getAllDiseases/,
  /getDisease/,
];

function main(): void {
  const violations: string[] = [];
  for (const file of STRICT) {
    if (!fs.existsSync(file)) {
      violations.push(`missing required file: ${file}`);
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        violations.push(`${path.relative(ROOT, file)}: matched /${re.source}/`);
      }
    }
  }

  // Route pages must not import diseases.json or findings-latest directly.
  const routes = [
    path.join(ROOT, "src", "app", "findings", "page.tsx"),
    path.join(ROOT, "src", "app", "findings", "[date]", "page.tsx"),
  ];
  for (const file of routes) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/diseases\.json/.test(text) || /findings-latest\.json/.test(text)) {
      violations.push(
        `${path.relative(ROOT, file)}: must not import diseases.json or findings-latest.json`
      );
    }
  }

  if (violations.length > 0) {
    console.error("Findings isolation assert failed:");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log("Findings isolation OK.");
}

main();
