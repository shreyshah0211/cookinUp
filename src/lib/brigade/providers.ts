import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { MODELS, modelInfo, type Provider } from "./models";

/** Bring-your-own keys. Held in memory for one service; never logged or stored. */
export type Keys = { anthropic?: string; openai?: string };

/** The providers a service can actually call: a key from the browser, or a dev key in the env. */
export function availableProviders(keys: Keys): Provider[] {
  const out: Provider[] = [];
  if (keys.anthropic || process.env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (keys.openai || process.env.OPENAI_API_KEY) out.push("openai");
  return out;
}

/** Model ids the kitchen can hire with these keys, catalog order. */
export function hireable(keys: Keys): string[] {
  const providers = availableProviders(keys);
  return MODELS.filter((m) => providers.includes(m.provider)).map((m) => m.id);
}

export function languageModel(modelId: string, keys: Keys): LanguageModel {
  const info = modelInfo(modelId);
  if (info.provider === "anthropic") {
    const apiKey = keys.anthropic || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("No Anthropic API key: add one in the kitchen settings.");
    return createAnthropic({ apiKey })(modelId);
  }
  const apiKey = keys.openai || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key: add one in the kitchen settings.");
  return createOpenAI({ apiKey })(modelId);
}

/**
 * Per-provider knobs for one call. Line cooks run at low effort (fast, cheap);
 * the head chef and expediter at medium. Both providers count reasoning
 * tokens against the output cap, so callers add headroom to maxOutputTokens.
 */
export function providerOptions(modelId: string, effort: "low" | "medium"): Record<string, Record<string, string>> {
  if (modelInfo(modelId).provider === "openai") return { openai: { reasoningEffort: effort, textVerbosity: "low" } };
  // Haiku 4.5 predates `effort` and rejects it; it runs without thinking anyway.
  if (modelId.startsWith("claude-haiku")) return {};
  return { anthropic: { effort } };
}
