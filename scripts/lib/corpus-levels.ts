import fs from "node:fs";
import path from "node:path";
import type { CorpusLevels } from "../../src/lib/types";

/** Parse Orphanet product1 XML into taxonomy level counts. */
export function corpusLevelsFromXml(xml: string): CorpusLevels {
  const chunks = xml.split(/<Disorder id="/);
  const byDisorderGroup: Record<string, number> = {};
  let product1Total = 0;
  let obsoleteOrNonRareAmongNonGroups = 0;
  let disorderLevel = 0;

  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const code = chunk.match(/<OrphaCode>(\d+)<\/OrphaCode>/)?.[1];
    const name = chunk.match(/<Name lang="en">([^<]*)<\/Name>/)?.[1];
    if (!code || !name) continue;
    product1Total += 1;
    const group =
      chunk.match(
        /<DisorderGroup[^>]*>[\s\S]*?<Name lang="en">([^<]*)<\/Name>/
      )?.[1] ?? "(missing)";
    byDisorderGroup[group] = (byDisorderGroup[group] ?? 0) + 1;
    if (group === "Disorder") disorderLevel += 1;
    if (group !== "Group of disorders") {
      if (
        name.startsWith("OBSOLETE:") ||
        name.startsWith("NON RARE IN EUROPE:")
      ) {
        obsoleteOrNonRareAmongNonGroups += 1;
      }
    }
  }

  const afterDroppingGroups =
    product1Total - (byDisorderGroup["Group of disorders"] ?? 0);
  const atlasUsableEstimate =
    afterDroppingGroups - obsoleteOrNonRareAmongNonGroups;

  return {
    product1Total,
    byDisorderGroup,
    afterDroppingGroups,
    excludedObsoleteOrNonRarePreferredNames: obsoleteOrNonRareAmongNonGroups,
    atlasUsableEstimate,
    commonlyCitedDisorderLevel: disorderLevel,
    reconciliationNote:
      "Orphanet product1 lists every nomenclature row: Disorder, Subtype of disorder, and Group of disorders. The figure 11,645 is that full row count. The commonly cited “about 7,000 rare diseases” aligns with the Disorder level alone (clinical disease entities), not with groups or every subtype. This atlas samples from usable non-group rows after dropping OBSOLETE: and NON RARE IN EUROPE: preferred names.",
  };
}

/** Load corpusLevels from cached product1 when present; null if cache missing. */
export function loadCorpusLevelsFromCache(): CorpusLevels | null {
  const p = path.join(process.cwd(), ".cache", "en_product1.xml");
  if (!fs.existsSync(p)) return null;
  return corpusLevelsFromXml(fs.readFileSync(p, "utf8"));
}
