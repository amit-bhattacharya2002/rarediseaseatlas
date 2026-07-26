# Is Anyone Working On This?

An open rare disease research landscape. For every Orphanet condition in the build, the site answers: **does anyone appear to be working on this?**

Built for families who have just received a diagnosis they have never heard of, and for journalists or advocacy groups who need a defensible picture of research attention.

> **This is derived data, not medical advice.** Counts can be wrong. Nothing on this site is a diagnosis, prognosis, or care recommendation.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · static generation from `data/diseases.json` · deploy to Vercel with zero config.

No database. No runtime API calls. The pipeline is split so derivation can be
re-run offline without re-fetching:

1. **`scripts/ingest.ts`** — network + cache **only**. Fetches raw per-disease
   signals (publications, trials, MeSH/xref identifiers, parent-literature
   probes) and writes `data/diseases.json`.
2. **`scripts/derive.ts`** (`npm run derive`) — **no network**. Reads the
   artifact and recomputes `queryHealth`, `confidence`, `excludeFromNeglect`,
   aggregates, distributions, and percentiles. Runnable standalone against the
   existing artifact; ingest calls the same `deriveArtifact()` before writing.
3. **The Next.js app** — reads the file and statically generates pages.

The fetch cache in `.cache/` is keyed on the **exact query string** (not the
ORPHAcode), so changed queries correctly miss the cache while unchanged phrase
queries hit it — only new identifier-based queries make network calls on a
re-ingest.

Post-processing (not inside the per-disease ingest loop):

- `npm run derive` — recompute all derived fields offline
- `npm run validate` — run the pipeline against the gold standard (recall/precision)
- `npm run plain-language` — optional LLM rewrites of Orphanet definitions
- `npm run percentiles` — recompute percentiles / distributions (also part of derive)

## Quick start

```bash
npm install
npm run validate:india   # fails if India NPRD lastVerified > 12 months
npm run dev
```

A small ingest artifact is committed at `data/diseases.json` so the app runs after clone. Prefer `npm run ingest:sample` for validation statistics.

## Ingestion

```bash
npm run ingest         # --limit 50 (sorted; reproducible)
npm run ingest:test    # --limit 20
npm run ingest:sample  # --sample 300 --seed 42 (random draw for validation)
npm run ingest:full    # entire Orphanet set (hours)
npx tsx scripts/ingest.ts --sample 300 --resume
npx tsx scripts/ingest.ts --limit 0 --no-cache   # force fresh downloads

npm run derive         # recompute derived fields offline (no network)
npm run validate       # recall/precision vs tests/gold-standard.json
```

- Rate-limited to ~3 req/sec in `scripts/lib/http.ts` (shared by PMC + CT.gov) with retry + exponential backoff
- On-disk response cache in `.cache/` (`--no-cache` skips reads); Mondo JSON + ancestor index cached beside other sources
- Progress and failures append to `ingest.log`
- Atomic side-checkpoints every 25 diseases (`data/diseases.checkpoint.json`); live `diseases.json` publishes only when `diseases.length` matches the target and trial scans are complete; use `--resume`
- `--sample N` for unbiased validation (sorted `--limit` skews toward classical IEMs)
- Drops Orphanet names starting `OBSOLETE:` / `NON RARE IN EUROPE:` before indexing
- Artifact records `sampling: { mode, n, seed }` — `--resume` refuses to mix modes

### Per-signal credible sets (denominators)

Publication name-collision / over-matching flags must **not** remove diseases from trial percentages (those rows often have many trials; excluding them inflated “has a trial” rates).

| Aggregate field | Meaning |
| --- | --- |
| `publicationsDenominator` | Medium/high confidence, not `excludeFromNeglect`, successful publication fetch |
| `trialsDenominator` | Successful trial fetch **and** `fullyScanned` — publication confidence ignored |
| `intersectionDenominator` | In both sets — denominator for “no recent pubs and no interventional trials” |
| `noTrials` | No matched `INTERVENTIONAL` study, over `trialsDenominator` |
| `noRegisteredStudies` | No matched registered study of any type, over `trialsDenominator` |
| `noPublicationsLast10Years` | Over `publicationsDenominator` |
| `noRecentPubsNoTrials` | Over `intersectionDenominator` |
| `brokenQueryRows` | `queryHealth: "broken"` — **excluded from every denominator** |
| `noTrialsWithSubstantialLiterature` | No-trial rows whose recent pubs ≥ median (defensibility) |
| `noTrialsWithNoLiterature` | No-trial rows with little/no literature (likelier artifacts) |

Every percentage in the UI names which denominator it uses. The homepage
headlines the interventional-trial finding as a **bounded point estimate** (see
“Errors run in both directions” below), not a floor, and publishes
`noRegisteredStudies` beside it. Choosing interventional-only for the headline
is an editorial definition—not an error correction—so both figures remain
visible.

### Identifier-based matching

Names are the root cause of most data bugs, so we also match on structured
identifiers. From Mondo we extract each disease’s **MeSH / UMLS / OMIM / NCIT**
cross-references (`record.identifiers`) and resolve MeSH descriptor labels via
NLM. Those labels + Mondo `hasExactSynonym` values are unioned into both queries:

- **ClinicalTrials.gov** — quoted name phrases **OR** MeSH descriptor terms via
  `query.cond`; each hit is tagged `trials.matchedVia: ("phrase"|"mesh"|"both")`.
  This catches trials that register a broader MeSH condition (e.g. an LCHAD study
  filed under “Fatty Acid Oxidation Disorders”) that no name phrase would match.
- **Europe PMC** — phrase query unioned with `MESH:"…"`; stores `phraseCount`,
  `meshCount`, and the deduplicated union total.

Labels are normalised additively at parse time (`scripts/lib/normalize.ts`).
Safe **missing-boundary** splits (a non-word pure-alpha token that splits into
two frequent corpus words) are applied and queried alongside the original.
**Misspellings are flagged for review only, never applied** — edit-distance
cannot separate a typo from a legitimately different medical term
(measured false positives: `Ebstein`→`epstein`, `Rheumatic`→`rheumatoid`,
`Hydrolethalus`→`hydrocephalus`). In the current Orphanet XML there are **no**
genuine missing-space corruptions; the source preserves the spaces.

### Query health

`queryHealth: { status, reasons, strategiesAttempted, strategiesWithHits }`
(`scripts/lib/derive.ts`):

- **`broken`** — every strategy returned zero across **both** databases. Almost
  always a query problem, not absence of research. Excluded from all aggregates
  and shown a distinct page message; the count is reported separately.
- **`suspect`** — a label correction was detected, a source fetch failed, or only
  one of several strategies returned hits.
- **`ok`** — a strategy returned hits.

### Automated accuracy benchmark (`npm run accuracy`)

`tests/gold-standard.json` remains as a legacy seed list of ~33 deliberately
difficult diseases, but automated results are **not** described as a human gold
standard. `npm run adjudicate:gold` generates
`tests/automated-benchmark.json` from an exhaustive union of production matches
and an independent broad search using GenCC genes, Mondo parents, synonyms,
MeSH labels, and rare significant words.

OpenAI and Anthropic independently receive only the disease definition/aliases
and trial title/condition fields. Discovery source is hidden. Only `true+true`
and `false+false` consensus verdicts enter precision/recall; disagreements,
malformed responses, and either provider returning `uncertain` are reported and
excluded. Ten deterministic controls must score at least 8/10 for each
provider. Verdicts are cached by exact evidence, prompt version, provider, and
model.

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export ADJUDICATION_OPENAI_MODEL=...
export ADJUDICATION_ANTHROPIC_MODEL=...

npm run adjudicate:gold
npm run adjudicate:gold -- --resume
npm run adjudicate:gold -- --code 70
npm run accuracy
```

`npm run validate` recomputes the production matcher against consensus labels,
writes provenance and consensus coverage into `artifact.validation`, and
compares only with a baseline built from the exact same query version, prompt,
and models. Publication query counts are retained as diagnostics; without
independent labels they are not called publication accuracy. The older
`verify:gold` command remains available for optional human review.

### Errors run in both directions

“No interventional trial” errors are not one-sided. **False positives** (matching another
condition’s trial) undercount `noTrials`, so the true share is *higher*; **false
negatives** (broken query, MeSH mismatch, missing name) overcount it, so the true
share is *lower*. Both are present, so the headline is a bounded estimate. The
strongest sanity check — `noTrialsWithSubstantialLiterature` — counts no-trial
diseases whose name demonstrably matches literature (recent pubs ≥ median),
making their trial zero far likelier to be real than a search artifact. Caveat:
Europe PMC searches abstracts/full text while ClinicalTrials.gov matches a
structured condition field, so trial matching underperforms for a systematic
reason independent of bugs.

### Mondo hierarchy

Cached Mondo Disease Ontology (`mondo.json`) builds an `is_a` ancestor map used for:

1. **Zero-publication naming artifacts** — if a disease has 0 pubs but a Mondo ancestor label has substantial Europe PMC hits, set `excludeFromNeglect` with an explicit reason (alongside the GenCC contradiction rule).
2. **India NPRD umbrella matching** — direct ORPHAcode first; else walk Mondo ancestors to a policy category (`via: "parent"`). Parent matches are never rendered as direct listings.

Records with `definition: null` and `mondoIds: []` are capped at low confidence (taxonomy scaffolding).

### Pan-disease registries

`scripts/pan-registry-nctids.ts` lists umbrella registries (e.g. NCT01793168). They are stored on each disease as `trials.generalRegistries[]` and rendered under a separate heading — not counted in `trials.total`.

### ClinicalTrials.gov

Quoted phrases via `query.cond` (same discipline as Europe PMC), then
token-boundary post-filter on conditions/titles. Only records with
`studyType: "INTERVENTIONAL"` enter `trials.total`; observational and
expanded-access records are research activity but are not described as clinical
trials.

### Data sources

| Source | What we take | Licence |
| --- | --- | --- |
| Orphadata `en_product1.xml` + `en_product9_prev.xml` | ORPHAcode, preferred label, synonyms, definition, prevalence class, MONDO ids | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — © Orphanet / INSERM |
| [Mondo](https://mondo.monarchinitiative.org/) | Disease hierarchy (`is_a`) | CC BY 4.0 |
| [Europe PMC](https://europepmc.org/) REST API | `hitCount`, authors/affiliations (~200 records), 15-year trend | Public API |
| [ClinicalTrials.gov](https://clinicaltrials.gov/) API v2 | Study count, recruiting sample (NCT + title) | Public API |
| [GenCC](https://thegencc.org/) submissions TSV | Strongest gene–disease validity class | CC0 |
| `data/india-nprd.json` | NPRD groups, structured entitlements, 15 CoEs, crowdfunding portal | Hand-curated |

Orphanet attribution is shown in the UI footer and on `/about`.

### Name matching (the hard problem)

Each Europe PMC query is built from the preferred label **plus all Orphanet synonyms**, each as a quoted phrase, OR'd together.

`scripts/stoplist.ts` drops:

- anything under 5 characters
- bare acronyms under 4 characters
- single common English words

Every dropped synonym is logged. The exact query string is stored on each disease and shown behind **How we counted this**, with a link to re-run it on Europe PMC.

`confidence` is `high | medium | low`, driven by label distinctiveness, stoplist drops, collisions, plus post-hoc rules (zero pubs + Definitive/Strong GenCC or Mondo-parent literature → low + exclude from publication neglect; prevalence/publication outliers; scaffolding). The glyph is three bars (publications, researchers, trials).

**Known weaknesses:** polysemous names still over-count; a zero often means “named differently”; author deduplication is imperfect.

### Cross-corpus comparison

After ingest, each disease gets `publicationsPercentile` / `trialsPercentile` within the appropriate denominator, plus a top-level `distributions` block (median, quartiles, share with zero trials). Disease pages render a comparative line under raw counts — the one thing a single Google + CT.gov search cannot do.

### India NPRD

- Direct vs Mondo-parent match copy (hedged for screenshots / WhatsApp forwards)
- Structured `groupEntitlements` (`label`, `amountCeiling`, `mechanism`, `caveat`, `verifyUrl`) — Group 2 leads with **state** support, not the central ₹50 lakh ceiling
- 15 CoEs with per-entry `source` (OM / PIB); phone/department left null until verified
- `crowdfundingPortal` → https://rarediseases.mohfw.gov.in/
- `lastVerified`: warn >6 months in UI; **fail build** past 12 months (`prebuild` + `src/lib/data.ts`)
- Official counts recorded as both 63 and ~55 with sources/dates

## Pages

- `/` — interventional-trial headline plus all-registered-study comparison, defensibility + broken-query counts, thin-attention intersection, search, source limits
- `/disease/[orphacode]` — social questions, comparative lines, plain + clinical definitions, researchers, interventional trials, observational studies, general registries, India NPRD, methodology
- `/neglected` — where research attention is thinnest (framed for researchers/funders)
- `/about` — methodology, licences, re-ingest instructions

Open Graph cards are generated per disease via `next/og` at `/disease/[orphacode]/opengraph-image`.

### Plain-language definitions

Run separately after ingest: `npm run plain-language` when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set. Cached by hash of the source definition. The model may only rephrase the Orphanet definition — no outside knowledge, prognosis, or advice. Output is labelled machine-generated and shown above the clinical text.

## Deploy

Connect the repo to Vercel. No environment variables required. `next build` runs India staleness validation then statically generates all disease pages from `data/diseases.json`.

## Licence

Apache-2.0 for this software. Upstream datasets remain under their own licences (Orphanet CC BY 4.0 must be attributed).
