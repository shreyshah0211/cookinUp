// The chefs you can hire: every model the kitchen can run a station on, with
// the price used for the bill (USD per 1M tokens, first-party API rates).

export type Provider = "anthropic" | "openai" | "google";

export type ModelInfo = {
  id: string;
  label: string;
  provider: Provider;
  /** Hat colour on the chef sprite. */
  hat: string;
  inputPerM: number;
  outputPerM: number;
};

export const MODELS: ModelInfo[] = [
  { id: "claude-opus-5", label: "Opus 5", provider: "anthropic", hat: "#D97706", inputPerM: 5, outputPerM: 25 },
  { id: "claude-sonnet-5", label: "Sonnet 5", provider: "anthropic", hat: "#F59E0B", inputPerM: 2, outputPerM: 10 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic", hat: "#FCD34D", inputPerM: 1, outputPerM: 5 },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", hat: "#10B981", inputPerM: 5, outputPerM: 30 },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: "openai", hat: "#6EE7B7", inputPerM: 0.75, outputPerM: 4.5 },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "google", hat: "#4285F4", inputPerM: 2, outputPerM: 12 },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google", hat: "#8AB4F8", inputPerM: 0.75, outputPerM: 3.75 },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", provider: "google", hat: "#C2D7FB", inputPerM: 0.3, outputPerM: 2.5 },
];

export const MODEL_IDS = MODELS.map((m) => m.id);
// Testing defaults: the cheapest chef everywhere. Change in the head chef's card.
export const DEFAULT_MODEL = "claude-haiku-4-5";
export const DEFAULT_HEAD_CHEF = "claude-haiku-4-5";
export const DEFAULT_BUDGET = 4000;

/** Chef level by what the model costs to run: 1 commis, 2 sous chef, 3 chef de cuisine. Shows in the hat, the counter and the card. */
export type Tier = 1 | 2 | 3;
export const TIER_NAMES: Record<Tier, string> = { 1: "Commis", 2: "Sous chef", 3: "Chef de cuisine" };
export function tierOf(id: string): Tier {
  const m = modelInfo(id);
  return m.outputPerM <= 5 ? 1 : m.outputPerM <= 10 ? 2 : 3;
}

export function modelInfo(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
}

export function costUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const m = modelInfo(modelId);
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}
