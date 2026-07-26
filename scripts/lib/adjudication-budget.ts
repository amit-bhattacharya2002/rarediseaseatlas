import fs from "node:fs";
import path from "node:path";
import { ensureCacheDir } from "./cache";

type Provider = "openai" | "anthropic";

interface Rates {
  input: number;
  output: number;
}

interface BudgetLedger {
  version: 1;
  budgetUsd: number;
  spentUsd: number;
  updatedAt: string;
  calls: number;
}

export interface BudgetReservation {
  maximumUsd: number;
  rates: Rates;
  inputTokenCeiling: number;
  outputTokenCeiling: number;
}

const KNOWN_RATES: Record<string, Rates> = {
  "openai:gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic:claude-haiku-4-5": { input: 1, output: 5 },
};

let ledger: BudgetLedger | null = null;

function ledgerPath(): string {
  ensureCacheDir();
  return path.join(process.cwd(), ".cache", "adjudication-budget.json");
}

function configuredBudget(): number {
  const value = Number(process.env.ADJUDICATION_BUDGET_USD ?? "5");
  if (!Number.isFinite(value) || value <= 0 || value > 5) {
    throw new Error(
      "ADJUDICATION_BUDGET_USD must be greater than 0 and no more than 5"
    );
  }
  return value;
}

function ratesFor(provider: Provider, model: string): Rates {
  const known = KNOWN_RATES[`${provider}:${model}`];
  if (known) return known;
  const prefix = provider === "openai" ? "OPENAI" : "ANTHROPIC";
  const input = Number(
    process.env[`ADJUDICATION_${prefix}_INPUT_USD_PER_MILLION`]
  );
  const output = Number(
    process.env[`ADJUDICATION_${prefix}_OUTPUT_USD_PER_MILLION`]
  );
  if (
    !Number.isFinite(input) ||
    input <= 0 ||
    !Number.isFinite(output) ||
    output <= 0
  ) {
    throw new Error(
      `Unknown pricing for ${provider}:${model}; set ADJUDICATION_${prefix}_INPUT_USD_PER_MILLION and ADJUDICATION_${prefix}_OUTPUT_USD_PER_MILLION`
    );
  }
  return { input, output };
}

function readLedger(): BudgetLedger {
  if (ledger) return ledger;
  const budgetUsd = configuredBudget();
  const file = ledgerPath();
  if (fs.existsSync(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as BudgetLedger;
    if (
      parsed.version !== 1 ||
      !Number.isFinite(parsed.spentUsd) ||
      parsed.spentUsd < 0
    ) {
      throw new Error(`Invalid adjudication budget ledger at ${file}`);
    }
    if (parsed.spentUsd > budgetUsd) {
      throw new Error(
        `Existing adjudication spend $${parsed.spentUsd.toFixed(4)} exceeds configured budget $${budgetUsd.toFixed(2)}`
      );
    }
    ledger = { ...parsed, budgetUsd };
  } else {
    ledger = {
      version: 1,
      budgetUsd,
      spentUsd: 0,
      updatedAt: new Date().toISOString(),
      calls: 0,
    };
  }
  return ledger;
}

function writeLedger(): void {
  if (!ledger) return;
  ledger.updatedAt = new Date().toISOString();
  const file = ledgerPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

/**
 * Reserves a deliberately conservative ceiling before a request. UTF-8 byte
 * length is used as an input-token ceiling, so the reservation cannot
 * underestimate tokenization. The full reservation is persisted before fetch;
 * a crash therefore overcounts rather than overspends.
 */
export function reserveAdjudicationBudget(args: {
  provider: Provider;
  model: string;
  prompt: string;
  maxOutputTokens: number;
}): BudgetReservation {
  const state = readLedger();
  const rates = ratesFor(args.provider, args.model);
  const inputTokenCeiling = Buffer.byteLength(args.prompt, "utf8");
  const outputTokenCeiling = args.maxOutputTokens;
  const maximumUsd =
    (inputTokenCeiling * rates.input +
      outputTokenCeiling * rates.output) /
    1_000_000;
  if (state.spentUsd + maximumUsd > state.budgetUsd + 1e-12) {
    throw new Error(
      `Adjudication budget exhausted: spent/reserved $${state.spentUsd.toFixed(4)} + next maximum $${maximumUsd.toFixed(4)} > $${state.budgetUsd.toFixed(2)}`
    );
  }
  state.spentUsd += maximumUsd;
  state.calls += 1;
  writeLedger();
  return {
    maximumUsd,
    rates,
    inputTokenCeiling,
    outputTokenCeiling,
  };
}

/** Refunds the conservative reservation down to provider-reported usage. */
export function settleAdjudicationBudget(
  reservation: BudgetReservation,
  usage: { inputTokens: number; outputTokens: number }
): void {
  const state = readLedger();
  const actualUsd =
    (usage.inputTokens * reservation.rates.input +
      usage.outputTokens * reservation.rates.output) /
    1_000_000;
  // Never increase after the preflight ceiling. Invalid usage keeps the full
  // reservation, which is safer than accepting an undercount.
  if (
    Number.isFinite(actualUsd) &&
    actualUsd >= 0 &&
    actualUsd <= reservation.maximumUsd
  ) {
    state.spentUsd -= reservation.maximumUsd - actualUsd;
    if (state.spentUsd < 0) state.spentUsd = 0;
    writeLedger();
  }
}

export function adjudicationBudgetStatus(): {
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  calls: number;
} {
  const state = readLedger();
  return {
    budgetUsd: state.budgetUsd,
    spentUsd: state.spentUsd,
    remainingUsd: Math.max(0, state.budgetUsd - state.spentUsd),
    calls: state.calls,
  };
}

