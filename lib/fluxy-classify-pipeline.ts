import "server-only";

import type { Organization } from "@/lib/kv-organizations";
import { getAiTextCache, hashCacheKey, setAiTextCache } from "@/lib/ai-completion-cache";
import { assertOrgAiBudget } from "@/lib/ai-org-budget";
import { classifyIntentLocalSync } from "@/lib/fluxy-intent-local";
import type { FluxyClassifyContext, FluxyIntentKind, FluxyLocalClassification } from "@/lib/fluxy-intent-types";
import { fluxyLlmIntentSchema } from "@/lib/fluxy-intent-schema";
import { createOpenAiCompatProvider } from "@/lib/llm-provider";
import { resolveOrgLlmRuntime } from "@/lib/org-llm-runtime";
import { logFluxyClassifyTelemetry } from "@/lib/fluxy-intent-telemetry";

const THRESH_HIGH = 0.72;
const THRESH_MED = 0.6;

const FAST_MODEL =
  process.env.FLUXY_CLASSIFY_FAST_MODEL?.trim() ||
  process.env.TOGETHER_MODEL?.trim() ||
  "meta-llama/Llama-3.3-70B-Instruct-Turbo";

function buildCacheKey(locale: string, text: string, context: FluxyClassifyContext): string {
  const digest = JSON.stringify({
    p: context.pathname ?? "",
    b: context.boardId ?? "",
  });
  return hashCacheKey(["fluxy_classify_v2", locale, text.trim().toLowerCase(), digest]);
}

function extractJsonObject(raw: string): string | null {
  const t = raw.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return t.slice(start, end + 1);
}

async function runOpenAiCompatClassifier(params: {
  runtime: NonNullable<ReturnType<typeof resolveOrgLlmRuntime>>;
  model: string;
  maxTokens: number;
  userPrompt: string;
}): Promise<{ text: string; inputTokens?: number; outputTokens?: number } | null> {
  const p = createOpenAiCompatProvider(params.runtime);
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
  tier: "local" | "compat_fast" | "compat_full";
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
  void isAdmin;
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
          tier: parsed.tier ?? "compat_full",
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

  const runtime = resolveOrgLlmRuntime(org);
  if (!runtime) {
    return { ...local, tier: "local", cacheHit: false, budgetBlocked: false };
  }

  const userPrompt = buildUserPrompt(locale, text, context);
  const fullModel = runtime.model;

  let tier: ClassifyPipelineResult["tier"] = "local";
  let merged: FluxyLocalClassification = local;

  const tryLog = async (
    t: ClassifyPipelineResult["tier"],
    intentKind: string,
    model: string | undefined,
    usage?: { in?: number; out?: number }
  ) => {
    await logFluxyClassifyTelemetry({
      orgId,
      userId,
      tier: t,
      intentKind,
      provider: "openai_compat",
      model,
      inputTokens: usage?.in,
      outputTokens: usage?.out,
      cacheHit: false,
      userText: text,
    });
  };

  const pass1 = await runOpenAiCompatClassifier({
    runtime,
    model: FAST_MODEL,
    maxTokens: 220,
    userPrompt,
  });
  const parsed1 = pass1 ? parseLlmIntent(pass1.text) : null;
  tier = "compat_fast";
  const fastOk = Boolean(parsed1 && parsed1.confidence >= 0.55);
  if (fastOk) {
    merged = {
      intent: parsed1!.kind,
      confidence: Math.max(parsed1!.confidence, local.confidence),
      speech: parsed1!.speech || local.speech,
    };
    await tryLog("compat_fast", merged.intent, FAST_MODEL, { in: pass1?.inputTokens, out: pass1?.outputTokens });
  }

  const secondGate = local.confidence < THRESH_MED || !fastOk;
  if (secondGate) {
    const pass2 = await runOpenAiCompatClassifier({
      runtime,
      model: fullModel,
      maxTokens: 400,
      userPrompt,
    });
    tier = "compat_full";
    const p2 = pass2 ? parseLlmIntent(pass2.text) : null;
    if (p2) {
      merged = {
        intent: p2.kind,
        confidence: Math.max(p2.confidence, local.confidence),
        speech: p2.speech || merged.speech,
      };
    }
    await tryLog("compat_full", merged.intent, fullModel, {
      in: pass2?.inputTokens,
      out: pass2?.outputTokens,
    });
  }

  await setAiTextCache(
    keyHash,
    JSON.stringify({ intent: merged.intent, confidence: merged.confidence, speech: merged.speech, tier }),
    3600
  );

  return { ...merged, tier, cacheHit: false, budgetBlocked: false };
}
