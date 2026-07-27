/**
 * Dual-model trial relevance for CT.gov rows and secondary-registry hits.
 * Reuses adjudication prompt rules; does not mutate headline counts.
 */
import crypto from "node:crypto";
import {
  ADJUDICATION_PROMPT_VERSION,
  consensusVerdict,
  parseModelVerdict,
  type AutomatedVerdict,
} from "./automated-benchmark";
import {
  reserveAdjudicationBudget,
  settleAdjudicationBudget,
} from "./adjudication-budget";
import { readCache, writeCache } from "./cache";
import type {
  RelevanceConsensus,
  TrialRelevance,
  TrialRelevanceModelVote,
} from "../../src/lib/types";

const SYSTEM = `You adjudicate whether a clinical-trial registry record is genuinely about a specified rare disease.

Use ONLY the disease name, definition, aliases, trial title, study type, and condition fields supplied.
Do not use outside knowledge. Do not infer from registry IDs. Do not generate or estimate counts.

Return exactly one JSON object:
{"relevant":true|false|"uncertain"|"relevant-to-parent-category","reason":"one concise sentence"}

Rules:
1. relevant=true only when the supplied text supports that this exact disease or an explicit subtype of it is enrolled or studied.
2. relevant="relevant-to-parent-category" when the record is about a broader named disease that contains this entity (a parent/umbrella category), without confirming the specific subtype.
3. relevant=false when the record is about another condition, merely shares a word, or is clearly not a study of this disease.
4. relevant="uncertain" when the supplied text cannot distinguish relevance.
5. Never resolve ambiguity in either direction. Never treat a parent/umbrella match as relevant=true.`;

export interface RelevanceSubject {
  id: string;
  title: string;
  studyType: string | null;
  conditions: string[];
}

export interface RelevanceDiseaseContext {
  name: string;
  definition: string | null;
  aliases: string[];
}

interface CachedVote {
  vote: TrialRelevanceModelVote & { promptVersion: string; adjudicatedAt: string };
}

function cacheKey(
  provider: "openai" | "anthropic",
  model: string,
  disease: RelevanceDiseaseContext,
  subject: RelevanceSubject
): string {
  const h = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        v: ADJUDICATION_PROMPT_VERSION,
        provider,
        model,
        disease,
        subject,
      })
    )
    .digest("hex")
    .slice(0, 32);
  return `trial-relevance:v1:${h}`;
}

async function callOpenAI(model: string, user: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");
  const reservation = reserveAdjudicationBudget({
    provider: "openai",
    model,
    prompt: `${SYSTEM}\n${user}`,
    maxOutputTokens: 220,
  });
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (
    body.usage?.prompt_tokens != null &&
    body.usage.completion_tokens != null
  ) {
    settleAdjudicationBudget(reservation, {
      inputTokens: body.usage.prompt_tokens,
      outputTokens: body.usage.completion_tokens,
    });
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  return content;
}

async function callAnthropic(model: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing");
  const reservation = reserveAdjudicationBudget({
    provider: "anthropic",
    model,
    prompt: `${SYSTEM}\n${user}`,
    maxOutputTokens: 220,
  });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Anthropic HTTP ${response.status}: ${await response.text()}`
    );
  }
  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (body.usage?.input_tokens != null && body.usage.output_tokens != null) {
    settleAdjudicationBudget(reservation, {
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
    });
  }
  const content = body.content?.find((item) => item.type === "text")?.text;
  if (!content) throw new Error("Anthropic returned no content");
  return content;
}

async function adjudicateOne(
  provider: "openai" | "anthropic",
  model: string,
  disease: RelevanceDiseaseContext,
  subject: RelevanceSubject
): Promise<TrialRelevanceModelVote> {
  const key = cacheKey(provider, model, disease, subject);
  const cached = readCache<CachedVote>(key);
  if (
    cached?.vote?.model === model &&
    cached.vote.promptVersion === ADJUDICATION_PROMPT_VERSION
  ) {
    return {
      relevant: cached.vote.relevant,
      reason: cached.vote.reason,
      model: cached.vote.model,
    };
  }

  const user = JSON.stringify(
    {
      disease: {
        name: disease.name,
        definition: disease.definition,
        aliases: disease.aliases,
      },
      trial: {
        id: subject.id,
        title: subject.title,
        studyType: subject.studyType,
        conditions: subject.conditions,
      },
    },
    null,
    2
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const raw =
        provider === "openai"
          ? await callOpenAI(model, user)
          : await callAnthropic(model, user);
      const parsed = parseModelVerdict(raw);
      const vote: TrialRelevanceModelVote = {
        relevant: parsed.verdict,
        reason: parsed.reason,
        model,
      };
      writeCache(key, {
        vote: {
          ...vote,
          promptVersion: ADJUDICATION_PROMPT_VERSION,
          adjudicatedAt: new Date().toISOString(),
        },
      });
      return vote;
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }

  return {
    relevant: "uncertain",
    reason: `Provider failed: ${String(lastError).slice(0, 240)}`,
    model,
  };
}

export function loadRelevanceModels(): {
  openai: string;
  anthropic: string;
} | null {
  const openai = process.env.ADJUDICATION_OPENAI_MODEL?.trim();
  const anthropic = process.env.ADJUDICATION_ANTHROPIC_MODEL?.trim();
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) return null;
  if (!openai || !anthropic) return null;
  return { openai, anthropic };
}

export async function reviewTrialRelevance(
  disease: RelevanceDiseaseContext,
  subject: RelevanceSubject,
  models: { openai: string; anthropic: string }
): Promise<TrialRelevance> {
  const [openai, anthropic] = await Promise.all([
    adjudicateOne("openai", models.openai, disease, subject),
    adjudicateOne("anthropic", models.anthropic, disease, subject),
  ]);
  const { verdict, reason } = consensusVerdict(
    openai.relevant as AutomatedVerdict,
    anthropic.relevant as AutomatedVerdict
  );
  return {
    consensus: verdict as RelevanceConsensus,
    reason,
    openai,
    anthropic,
    promptVersion: ADJUDICATION_PROMPT_VERSION,
    reviewedAt: new Date().toISOString(),
  };
}

export function skippedRelevance(reason: string): TrialRelevance {
  return {
    consensus: "skipped",
    reason,
    promptVersion: ADJUDICATION_PROMPT_VERSION,
    reviewedAt: new Date().toISOString(),
  };
}
