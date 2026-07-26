import assert from "node:assert/strict";
import { formatLogParts } from "./lib/logger";

assert.equal(
  formatLogParts("DNMT3A-related", "microcephalic", "dwarfism"),
  "DNMT3A-related microcephalic dwarfism"
);
assert.equal(
  formatLogParts("microcephalic dwarfism"),
  "microcephalic dwarfism"
);
console.log("Logger space-preservation tests passed.");
