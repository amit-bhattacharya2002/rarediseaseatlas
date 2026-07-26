import {
  ADJUDICATION_PROMPT_VERSION,
  adjudicationCacheKey,
  parseModelVerdict,
  type BenchmarkCandidate,
  type BenchmarkEntry,
  type ModelVerdict,
} from "./automated-benchmark";
import { readCache, writeCache } from "./cache";
import {
  reserveAdjudicationBudget,
  settleAdjudicationBudget,
} from "./adjudication-budget";

const SYSTEM = `You adjudicate whether a ClinicalTrials.gov record is genuinely about a specified rare disease.

Use ONLY the disease name, definition, aliases, trial title, study type, and condition fields supplied.
Do not use outside knowledge. Do not infer from the NCT number. Do not generate or estimate counts.

Return exactly one JSON object:
{"relevant":true|false|"uncertain"|"relevant-to-parent-category","reason":"one concise sentence"}

Rules:
1. relevant=true only when the supplied text supports that this exact disease or an explicit subtype of it is enrolled or studied.
2. relevant="relevant-to-parent-category" when the record is about a broader named disease that contains this entity (a parent/umbrella category), without confirming the specific subtype.
3. relevant=false when the record is about another condition, merely shares a word, or is not INTERVENTIONAL.
4. relevant="uncertain" when the supplied text cannot distinguish relevance.
5. Never resolve ambiguity in either direction. Never treat a parent/umbrella match as relevant=true.`;

interface CachedVerdict {
  verdict: ModelVerdict;
}

export function buildAdjudicationEvidence(
  entry: BenchmarkEntry,
  candidate: BenchmarkCandidate
): {
  disease: { name: string; definition: string | null; aliases: string[] };
  trial: {
    nctId: string;
    title: string;
    studyType: string | null;
    conditions: string[];
  };
} {
  return {
    disease: {
      name: entry.orphanetName,
      definition: entry.definition,
      aliases: entry.aliases,
    },
    trial: {
      nctId: candidate.nctId,
      title: candidate.title,
      studyType: candidate.studyType,
      conditions: candidate.conditions,
    },
  };
}

export async function adjudicateCandidate(
  provider: "openai" | "anthropic",
  model: string,
  entry: BenchmarkEntry,
  candidate: BenchmarkCandidate
): Promise<ModelVerdict> {
  const cacheKey = adjudicationCacheKey({
    provider,
    model,
    diseaseName: entry.orphanetName,
    definition: entry.definition,
    aliases: entry.aliases,
    candidate,
  });
  const cached = readCache<CachedVerdict>(cacheKey);
  if (
    cached?.verdict?.model === model &&
    cached.verdict.promptVersion === ADJUDICATION_PROMPT_VERSION
  ) {
    return cached.verdict;
  }

  const user = JSON.stringify(
    buildAdjudicationEvidence(entry, candidate),
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
      const verdict: ModelVerdict = {
        provider,
        model,
        promptVersion: ADJUDICATION_PROMPT_VERSION,
        verdict: parsed.verdict,
        reason: parsed.reason,
        adjudicatedAt: new Date().toISOString(),
      };
      writeCache(cacheKey, { verdict });
      return verdict;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }

  const verdict: ModelVerdict = {
    provider,
    model,
    promptVersion: ADJUDICATION_PROMPT_VERSION,
    verdict: "uncertain",
    reason: `Provider response failed validation after retries: ${String(lastError).slice(0, 300)}`,
    adjudicatedAt: new Date().toISOString(),
  };
  writeCache(cacheKey, { verdict });
  return verdict;
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

