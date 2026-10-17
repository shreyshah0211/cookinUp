// The chefs you can hire: every model the kitchen can run a station on, with
// the price used for the bill (USD per 1M tokens, first-party API rates).

export type Provider = "anthropic" | "openai";

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
];

export const MODEL_IDS = MODELS.map((m) => m.id);
// Testing defaults: the cheapest chef everywhere. Change in the head chef's card.
export const DEFAULT_MODEL = "claude-haiku-4-5";
export const DEFAULT_HEAD_CHEF = "claude-haiku-4-5";
export const DEFAULT_BUDGET = 4000;
/** Who is on shift by default: just the cheapest model while testing. */
export const DEFAULT_SHIFT = ["claude-haiku-4-5"];

export function modelInfo(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
}

export function costUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const m = modelInfo(modelId);
  return (inputTokens * m.inputPerM + outputTokens * m.outputPerM) / 1_000_000;
}
