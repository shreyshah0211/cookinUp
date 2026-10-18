import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { JSONValue, LanguageModel } from "ai";

import { MODELS, modelInfo, type Provider } from "./models";

/** Bring-your-own keys. Held in memory for one service; never logged or stored. */
/** `ownOnly`: the visitor brought keys, so the house's (env) keys are not used for them. */
export type Keys = { anthropic?: string; openai?: string; google?: string; ownOnly?: boolean };

/** A house (env) key, unless this visitor cooks on their own keys only. */
const env = (keys: Keys, name: string) => (keys.ownOnly ? undefined : process.env[name]);

/** The keys the browser sent with a request (headers only; never stored). */
export function keysFromRequest(request: Request): Keys {
  const keys: Keys = {
    anthropic: request.headers.get("x-anthropic-key") || undefined,
    openai: request.headers.get("x-openai-key") || undefined,
    google: request.headers.get("x-google-key") || undefined,
  };
  // Bring any key of your own and you cook on your keys only.
  return { ...keys, ownOnly: !!(keys.anthropic || keys.openai || keys.google) };
}

/** The providers a service can actually call: a key from the browser, or a dev key in the env. */
export function availableProviders(keys: Keys): Provider[] {
  const out: Provider[] = [];
  if (keys.anthropic || env(keys, "ANTHROPIC_API_KEY")) out.push("anthropic");
  if (keys.openai || env(keys, "OPENAI_API_KEY")) out.push("openai");
  if (keys.google || env(keys, "GOOGLE_GENERATIVE_AI_API_KEY")) out.push("google");
  return out;
}

/** Model ids the kitchen can hire with these keys, catalog order. */
export function hireable(keys: Keys): string[] {
  const providers = availableProviders(keys);
  return MODELS.filter((m) => providers.includes(m.provider)).map((m) => m.id);
}

function anthropicFor(keys: Keys) {
  const apiKey = keys.anthropic || env(keys, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("No Anthropic API key: add one in the kitchen settings.");
  return createAnthropic({ apiKey });
}
function openaiFor(keys: Keys) {
  const apiKey = keys.openai || env(keys, "OPENAI_API_KEY");
  if (!apiKey) throw new Error("No OpenAI API key: add one in the kitchen settings.");
  return createOpenAI({ apiKey });
}

function googleFor(keys: Keys) {
  const apiKey = keys.google || env(keys, "GOOGLE_GENERATIVE_AI_API_KEY");
  if (!apiKey) throw new Error("No Gemini API key: add one in the kitchen settings.");
  return createGoogleGenerativeAI({ apiKey });
}

export function languageModel(modelId: string, keys: Keys): LanguageModel {
  const p = modelInfo(modelId).provider;
  return p === "anthropic" ? anthropicFor(keys)(modelId) : p === "google" ? googleFor(keys)(modelId) : openaiFor(keys)(modelId);
}

/** The provider's own web search, run on their side: the chef's cookbook. */
export function webSearchTool(modelId: string, keys: Keys) {
  const info = modelInfo(modelId);
  if (info.provider === "google") return googleFor(keys).tools.googleSearch({});
  return info.provider === "anthropic" ? anthropicFor(keys).tools.webSearch_20250305({ maxUses: 2 }) : openaiFor(keys).tools.webSearch({});
}

/**
 * Per-provider knobs for one call. Line cooks run at low effort (fast, cheap);
 * the head chef and expediter at medium. Both providers count reasoning
 * tokens against the output cap, so callers add headroom to maxOutputTokens.
 */
export function providerOptions(modelId: string, effort: "low" | "medium"): Record<string, Record<string, JSONValue>> {
  const provider = modelInfo(modelId).provider;
  if (provider === "openai") return { openai: { reasoningEffort: effort, textVerbosity: "low" } };
  if (provider === "google") return { google: { thinkingConfig: { thinkingLevel: effort } } };
  // Haiku 4.5 predates `effort` and rejects it; it runs without thinking anyway.
  if (modelId.startsWith("claude-haiku")) return {};
  return { anthropic: { effort } };
}
