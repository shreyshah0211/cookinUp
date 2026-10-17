// The three calls the kitchen makes: plan a menu, cook one station, plate the dish.

import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";

import { costUsd } from "./models";
import { expediterPrompt, headChefPrompt, JSON_RETRY_NOTE, lineCookPrompt } from "./prompts";
import { languageModel, providerOptions, type Keys } from "./providers";
import {
  MenuSchema,
  PlatingSchema,
  StationOutputSchema,
  type Menu,
  type Plating,
  type StationOutput,
  type StationSpec,
  type Usage,
} from "./schemas";

type Call<T> = { object: T; usage: Usage };

async function callJson<S extends z.ZodType>(args: {
  modelId: string;
  keys: Keys;
  prompt: string;
  schema: S;
  maxOutputTokens: number;
  effort: "low" | "medium";
  signal?: AbortSignal;
}): Promise<Call<z.infer<S>>> {
  const model = languageModel(args.modelId, args.keys);
  const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const attempt = async (prompt: string, maxOutputTokens: number) => {
    const r = await generateText({
      model,
      prompt,
      output: Output.object({ schema: args.schema }),
      // Reasoning tokens count against the cap on both providers.
      maxOutputTokens: maxOutputTokens + 1500,
      providerOptions: providerOptions(args.modelId, args.effort),
      abortSignal: args.signal,
    });
    usage.inputTokens += r.usage.inputTokens ?? 0;
    usage.outputTokens += r.usage.outputTokens ?? 0;
    return r.output as z.infer<S>;
  };
  let object: z.infer<S>;
  try {
    object = await attempt(args.prompt, args.maxOutputTokens);
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    // One retry. Cut off by the cap: twice the room. Bad JSON: ask for JSON only.
    // Usage of the failed call counts too, when the SDK reports it.
    usage.inputTokens += error.usage?.inputTokens ?? 0;
    usage.outputTokens += error.usage?.outputTokens ?? 0;
    const cutOff = error.finishReason === "length";
    try {
      object = cutOff ? await attempt(args.prompt, args.maxOutputTokens * 2) : await attempt(`${args.prompt}\n\n${JSON_RETRY_NOTE}`, args.maxOutputTokens);
    } catch (again) {
      if (!NoObjectGeneratedError.isInstance(again)) throw again;
      usage.inputTokens += again.usage?.inputTokens ?? 0;
      usage.outputTokens += again.usage?.outputTokens ?? 0;
      throw new Error(
        again.finishReason === "length"
          ? `Ran out of ingredients: the reply was cut off at ${again.usage?.outputTokens ?? "?"} tokens. Give this station a bigger budget.`
          : `The chef did not return valid JSON (${again.finishReason ?? "unknown reason"}).`,
      );
    }
  }
  usage.costUsd = costUsd(args.modelId, usage.inputTokens, usage.outputTokens);
  return { object, usage };
}

/** Head Chef: task -> menu. Models are normalised to the hireable list and budgets scaled to the total. */
export async function plan(args: {
  task: string;
  headChef: string;
  totalBudget: number;
  /** Model ids there are keys for; the first is the fallback. */
  models: string[];
  keys: Keys;
}): Promise<Call<Menu>> {
  const { object, usage } = await callJson({
    modelId: args.headChef,
    keys: args.keys,
    prompt: headChefPrompt(args.task, args.models, args.totalBudget),
    schema: MenuSchema,
    maxOutputTokens: 4000,
    effort: "medium",
  });
  const ids = new Set(object.stations.map((s) => s.id));
  const stations = object.stations.map((s) => ({
    ...s,
    model: args.models.includes(s.model) ? s.model : args.models[0],
    depends_on: s.depends_on.filter((d) => d !== s.id && ids.has(d)),
    token_budget: Math.max(200, s.token_budget),
  }));
  return { object: { task: args.task, stations: fitBudget(stations, args.totalBudget) }, usage };
}

/** Line Cook: one station, given its upstream outputs and the head chef's notes. */
export async function runStation(args: {
  task: string;
  station: StationSpec;
  upstream: StationOutput[];
  notes: string[];
  keys: Keys;
  signal?: AbortSignal;
}): Promise<Call<StationOutput>> {
  const { object, usage } = await callJson({
    modelId: args.station.model,
    keys: args.keys,
    prompt: lineCookPrompt(args),
    schema: StationOutputSchema,
    // Room for the JSON wrapper around the budgeted result.
    maxOutputTokens: Math.round(args.station.token_budget * 1.3) + 300,
    effort: "low",
    signal: args.signal,
  });
  return { object: { ...object, station_id: args.station.id }, usage };
}

/** Expediter: all outputs -> final dish + conflicts. */
export async function merge(args: {
  task: string;
  headChef: string;
  outputs: StationOutput[];
  burnt: StationSpec[];
  keys: Keys;
  maxOutputTokens: number;
  signal?: AbortSignal;
}): Promise<Call<Plating>> {
  return callJson({
    modelId: args.headChef,
    keys: args.keys,
    prompt: expediterPrompt(args.task, args.outputs, args.burnt),
    schema: PlatingSchema,
    maxOutputTokens: args.maxOutputTokens,
    effort: "low",
    signal: args.signal,
  });
}

/** Scales budgets so they sum to `total`, keeping every station at least 200. */
export function fitBudget<T extends { token_budget: number }>(stations: T[], total: number): T[] {
  const sum = stations.reduce((n, s) => n + s.token_budget, 0);
  if (sum === 0) return stations;
  const scale = total / sum;
  return stations.map((s) => ({ ...s, token_budget: Math.max(200, Math.round(s.token_budget * scale)) }));
}

/** Gives one station `budget` and takes the difference from the others, pro rata, keeping the total. */
export function rebalance<T extends { id: string; token_budget: number }>(stations: T[], id: string, budget: number, total: number): T[] {
  const target = Math.min(Math.max(200, Math.round(budget)), total - 200 * (stations.length - 1));
  const others = stations.filter((s) => s.id !== id);
  const rest = total - target;
  const fitted = fitBudget(others, rest);
  return stations.map((s) => (s.id === id ? { ...s, token_budget: target } : fitted.find((o) => o.id === s.id)!));
}
