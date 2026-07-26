/**
 * Constrained plain-language rewrite of an Orphanet definition.
 *
 * Prefer an LLM when OPENAI_API_KEY or ANTHROPIC_API_KEY is set.
 * Otherwise returns null — the UI keeps the clinical definition alone.
 *
 * Hard rules for any model call:
 *  - Rephrase ONLY the given definition text
 *  - No outside knowledge, no prognosis, no treatment advice, no severity
 *  - One or two short sentences, everyday words
 */

import { log } from "./logger";

const SYSTEM = `You rewrite rare-disease definitions for a curious non-specialist friend.
Rules (non-negotiable):
1. Use ONLY facts stated in the source definition. Do not add knowledge from elsewhere.
2. Do NOT mention prognosis, survival, life expectancy, severity scores, or whether it is "mild" or "severe" unless those exact words appear in the source.
3. Do NOT give medical advice, treatment recommendations, or "what you should do."
4. Keep clinical terms that families will hear (e.g. hypotonia) but make the overall sentence plain.
5. One or two sentences. No bullet lists. No preface like "In plain terms".
6. If the source is too thin to rephrase safely, reply with exactly: INSUFFICIENT`;

export async function rewriteDefinitionPlain(
  definition: string | null,
  diseaseName: string
): Promise<string | null> {
  if (!definition?.trim()) return null;

  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  if (!openai && !anthropic) {
    return null;
  }

  const user = `Disease name: ${diseaseName}

Source definition:
${definition}

Rewrite now.`;

  try {
    if (anthropic) {
      return await callAnthropic(anthropic, user);
    }
    return await callOpenAI(openai!, user);
  } catch (err) {
    log.warn(`plain-language rewrite failed for ${diseaseName}: ${String(err)}`);
    return null;
  }
}

async function callOpenAI(apiKey: string, user: string): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.PLAIN_LANGUAGE_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 180,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return sanitize(data.choices?.[0]?.message?.content ?? "");
}

async function callAnthropic(
  apiKey: string,
  user: string
): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.PLAIN_LANGUAGE_MODEL || "claude-sonnet-4-20250514",
      max_tokens: 180,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return sanitize(text);
}

function sanitize(raw: string): string | null {
  const t = raw.trim().replace(/^["']|["']$/g, "");
  if (!t || /^INSUFFICIENT$/i.test(t)) return null;
  // Refuse obvious advice/prognosis leakage
  if (
    /\b(will die|fatal within|survival rate|life expectancy|you should|must take)\b/i.test(
      t
    )
  ) {
    return null;
  }
  return t.slice(0, 600);
}
