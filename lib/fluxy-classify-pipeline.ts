import "server-only";

import type { Organization } from "@/lib/kv-organizations";
import { getAiTextCache, hashCacheKey, setAiTextCache } from "@/lib/ai-completion-cache";
import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { classifyIntentLocalSync } from "@/lib/fluxy-intent-local";
import type { FluxyClassifyContext, FluxyIntentKind, FluxyLocalClassification } from "@/lib/fluxy-intent-types";
import { fluxyLlmIntentSchema } from "@/lib/fluxy-intent-schema";
import { createAnthropicProvider, createTogetherProvider } from "@/lib/llm-provider";
import { resolveInteractiveLlmRoute } from "@/lib/org-ai-routing";
import { logFluxyClassifyTelemetry } from "@/lib/fluxy-intent-telemetry";

const THRESH_HIGH = 0.72;
const THRESH_MED = 0.6;

const HAIKU_MODEL = process.env.FLUXY_CLASSIFY_HAIKU_MODEL?.trim() || "claude-3-5-haiku-20241022";

function buildCacheKey(locale: string, text: string, context: FluxyClassifyContext): string {
  const digest = JSON.stringify({
    p: context.pathname ?? "",
    b: context.boardId ?? "",
  });
  return hashCacheKey(["fluxy_classify_v1", locale, text.trim().toLowerCase(), digest]);
}

function extractJsonObject(raw: string): string | null {
  const t = raw.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

async function runAnthropicClassifier(params: {
  model: string;
  maxTokens: number;
  userPrompt: string;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number } | null> {
  const p = createAnthropicProvider();
  const res = await p.chat(
    [
      {
        role: "user",
        content: params.userPrompt,
      },
    ],
    undefined,
    { model: params.model, maxTokens: params.maxTokens, temperature: 0.1 }
  );
  if (!res.ok) return null;
  return {
    text: res.assistantText,
    inputTokens: res.usage?.inputTokens,
    outputTokens: res.usage?.outputTokens,
  };
}

async function runTogetherClassifier(params: { userPrompt: string; maxTokens: number }): Promise<{
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
} | null> {
  const p = createTogetherProvider();
  const res = await p.chat(
    [{ role: "user", content: params.userPrompt }],
    undefined,
    { maxTokens: params.maxTokens, temperature: 0.1 }
  );
  if (!res.ok) return null;
  return { text: res.assistantText, inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens, model: res.model };
}

function buildUserPrompt(locale: string, text: string, context: FluxyClassifyContext): string {
  return [
    `Locale: ${locale}.`,
    `Pathname: ${context.pathname ?? "(none)"}.`,
    `BoardId hint: ${context.boardId ?? "(none)"}.`,
    "",
    `User message: ${text}`,
    "",
    'Classify intent. Reply JSON only: {"kind":"<kind>","confidence":0..1,"speech":"<one short line in user language>"}',
    "Kinds: nav_boards | nav_portfolio | nav_routines | nav_equipe | open_command_palette | board_copilot | board_nlq | board_new_card | unknown",
    "Use board_* only when user is clearly asking about the current board (filters, copilot, new card).",
  ].join("\n");
}

function parseLlmIntent(raw: string): { kind: FluxyIntentKind; confidence: number; speech?: string } | null {
  const slice = extractJsonObject(raw);
  if (!slice) return null;
  try {
    const parsed = fluxyLlmIntentSchema.safeParse(JSON.parse(slice));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export type ClassifyPipelineResult = FluxyLocalClassification & {
  tier: "local" | "haiku" | "sonnet" | "together_fast" | "together_full";
  cacheHit: boolean;
  budgetBlocked: boolean;
};

export async function runFluxyClassifyPipeline(params: {
  text: string;
  locale: string;
  context: FluxyClassifyContext;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  org: Organization | null;
}): Promise<ClassifyPipelineResult> {
  const { text, locale, context, orgId, userId, isAdmin, org } = params;
  const local = classifyIntentLocalSync(text, locale === "en" ? "en" : "pt-BR");

  if (context.localOnly) {
    return { ...local, tier: "local", cacheHit: false, budgetBlocked: false };
  }

  if (local.confidence >= THRESH_HIGH) {
    return { ...local, tier: "local", cacheHit: false, budgetBlocked: false };
  }

  const keyHash = buildCacheKey(locale === "en" ? "en" : "pt-BR", text, context);
  const cached = await getAiTextCache(keyHash);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as FluxyLocalClassification & { tier?: ClassifyPipelineResult["tier"] };
      if (parsed && typeof parsed.intent === "string" && typeof parsed.confidence === "number") {
        return {
          intent: parsed.intent as FluxyIntentKind,
          confidence: parsed.confidence,
          speech: parsed.speech || local.speech,
          tier: parsed.tier ?? "sonnet",
          cacheHit: true,
          budgetBlocked: false,
        };
      }
    } catch {
      /* ignore */
    }
  }

  const budget = await assertOrgAiBudget(orgId);
  if (!budget.ok) {
    return { ...local, tier: "local", cacheHit: false, budgetBlocked: true };
  }

  const { route, anthropicModel } = resolveInteractiveLlmRoute(org, { userId, isAdmin });
  const userPrompt = buildUserPrompt(locale, text, context);

  let tier: ClassifyPipelineResult["tier"] = "local";
  let merged: FluxyLocalClassification = local;

  const tryLog = async (
    t: ClassifyPipelineResult["tier"],
    intentKind: string,
    provider: "anthropic" | "together" | undefined,
    model: string | undefined,
    usage?: { in?: number; out?: number }
  ) => {
    await logFluxyClassifyTelemetry({
      orgId,
      userId,
      tier: t,
      intentKind,
      provider,
      model,
      inputTokens: usage?.in,
      outputTokens: usage?.out,
      cacheHit: false,
      userText: text,
    });
  };

  if (route === "anthropic") {
    const pass1 = await runAnthropicClassifier({ model: HAIKU_MODEL, maxTokens: 220, userPrompt });
    const parsed = pass1 ? parseLlmIntent(pass1.text) : null;
    tier = "haiku";
    const haikuOk = Boolean(parsed && parsed.confidence >= 0.55);
    if (haikuOk) {
      merged = {
        intent: parsed!.kind,
        confidence: Math.max(parsed!.confidence, local.confidence),
        speech: parsed!.speech || local.speech,
      };
      await tryLog("haiku", merged.intent, "anthropic", HAIKU_MODEL, { in: pass1?.inputTokens, out: pass1?.outputTokens });
    }
    const sonnetGate = local.confidence < THRESH_MED || !haikuOk;
    if (sonnetGate) {
      const pass2 = await runAnthropicClassifier({ model: anthropicModel, maxTokens: 400, userPrompt });
      const p2 = pass2 ? parseLlmIntent(pass2.text) : null;
      tier = "sonnet";
      if (p2) {
        merged = {
          intent: p2.kind,
          confidence: Math.max(p2.confidence, local.confidence),
          speech: p2.speech || merged.speech,
        };
      }
      await tryLog("sonnet", merged.intent, "anthropic", anthropicModel, {
        in: pass2?.inputTokens,
        out: pass2?.outputTokens,
      });
    }
  } else {
    const passT = await runTogetherClassifier({ userPrompt, maxTokens: 320 });
    tier = "together_full";
    const parsed = passT ? parseLlmIntent(passT.text) : null;
    if (parsed) {
      merged = {
        intent: parsed.kind,
        confidence: Math.max(parsed.confidence, local.confidence),
        speech: parsed.speech || local.speech,
      };
    }
    await tryLog("together_full", merged.intent, "together", passT?.model, {
      in: passT?.inputTokens,
      out: passT?.outputTokens,
    });
  }

  await setAiTextCache(
    keyHash,
    JSON.stringify({ intent: merged.intent, confidence: merged.confidence, speech: merged.speech, tier }),
    3600
  );

  return { ...merged, tier, cacheHit: false, budgetBlocked: false };
}
