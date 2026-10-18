// The three calls the kitchen makes: plan a menu, cook one station, plate the dish.

import { generateText, NoObjectGeneratedError, Output, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";

import { costUsd } from "./models";
import { expediterPrompt, headChefPrompt, JSON_RETRY_NOTE, lineCookPrompt, researchPrompt } from "./prompts";
import { languageModel, providerOptions, webSearchTool, type Keys } from "./providers";
import {
  MenuSchema,
  PlatingSchema,
  StationOutputSchema,
  type Menu,
  type Plating,
  type StationOutput,
  type StationSpec,
  type Turn,
  type Usage,
} from "./schemas";

/** What a station reports while it works, for the bubbles in the kitchen. */
export type StationHook = {
  onTool?: (e: { tool: "web_search" | "ask_chef"; text: string; detail?: string; done: boolean; to?: string }) => void;
  /** Ask an upstream chef a question; resolves to their answer. */
  askChef?: (stationId: string, question: string) => Promise<{ answer: string; usage: Usage }>;
};

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
  context?: Turn[];
  twist?: string;
  memory?: string[];
  keys: Keys;
}): Promise<Call<Menu>> {
  const { object, usage } = await callJson({
    modelId: args.headChef,
    keys: args.keys,
    prompt: headChefPrompt(args.task, args.models, args.totalBudget, args.context, args.memory) + (args.twist ? `\n\nNote from the customer: ${args.twist}` : ""),
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
    tools: s.tools ?? [],
  }));
  return { object: { task: args.task, stations: fitBudget(stations, args.totalBudget) }, usage };
}

/** Line Cook: one station, given its upstream outputs and the head chef's notes. */
export async function runStation(args: {
  task: string;
  station: StationSpec;
  upstream: StationOutput[];
  notes: string[];
  context?: Turn[];
  memory?: string[];
  keys: Keys;
  signal?: AbortSignal;
  hook?: StationHook;
}): Promise<Call<StationOutput>> {
  const research = await researchPhase(args);
  const { object, usage } = await callJson({
    modelId: args.station.model,
    keys: args.keys,
    prompt: lineCookPrompt({ ...args, research: research?.notes }),
    schema: StationOutputSchema,
    // Room for the JSON wrapper around the budgeted result.
    maxOutputTokens: Math.round(args.station.token_budget * 1.3) + 300,
    effort: "low",
    signal: args.signal,
  });
  return { object: { ...object, station_id: args.station.id }, usage: research ? addUsage(usage, research.usage) : usage };
}

/**
 * The tool phase, only for stations that have tools to use: the cookbook (web
 * search) and a word with an upstream chef. Ends in notes the cook reads next.
 */
async function researchPhase(args: Parameters<typeof runStation>[0]): Promise<{ notes: string; usage: Usage } | null> {
  const { station, upstream, keys, hook } = args;
  const canSearch = (station.tools ?? []).includes("web");
  const canAsk = !!hook?.askChef && upstream.length > 0;
  if (!canSearch && !canAsk) return null;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const tools: ToolSet = {};
  if (canSearch) tools.web_search = webSearchTool(station.model, keys);
  if (canAsk) {
    tools.ask_chef = tool({
      description: "Ask the chef at an upstream station a short, specific question about their work.",
      inputSchema: z.object({ station_id: z.enum(upstream.map((u) => u.station_id) as [string, ...string[]]), question: z.string() }),
      execute: async ({ station_id, question }) => {
        hook!.onTool?.({ tool: "ask_chef", text: question, to: station_id, done: false });
        const r = await hook!.askChef!(station_id, question);
        usage.inputTokens += r.usage.inputTokens;
        usage.outputTokens += r.usage.outputTokens;
        usage.costUsd += r.usage.costUsd;
        hook!.onTool?.({ tool: "ask_chef", text: question, detail: r.answer, to: station_id, done: true });
        return r.answer;
      },
    });
  }
  // The provider runs its searches inside one step and reports them after, so the
  // cookbook comes out now and goes away when the lookups are in.
  let searched = false;
  if (canSearch) hook?.onTool?.({ tool: "web_search", text: "Opening the cookbook", done: false });
  const r = await generateText({
    model: languageModel(station.model, keys),
    prompt: researchPrompt({ task: args.task, station, upstream, canSearch, canAsk }),
    tools,
    stopWhen: stepCountIs(4),
    maxOutputTokens: 1500,
    providerOptions: providerOptions(station.model, "low"),
    abortSignal: args.signal,
    onStepFinish: (step) => {
      // Provider-run searches show up here as call/result pairs.
      for (const part of step.content) {
        if (part.type === "tool-call" && part.toolName === "web_search") {
          // Already shown as started (the cookbook is out); the result line says what was searched.
        } else if (part.type === "tool-result" && part.toolName === "web_search") {
          // OpenAI says what it searched for in the result, Anthropic in the call.
          const out = part.output as { title?: string | null; url?: string }[] | { action?: unknown; sources?: { url?: string; name?: string }[] } | undefined;
          const q = searchQuery(Array.isArray(out) ? part.input : { ...(part.input as object), ...(out ?? {}) });
          const list = Array.isArray(out) ? out.map((h) => h.title || h.url) : (out?.sources ?? []).map((h) => h.url ?? h.name);
          const hits = list.filter(Boolean).slice(0, 4).join("\n");
          searched = true;
          hook?.onTool?.({ tool: "web_search", text: q, detail: hits, done: true });
        }
      }
    },
  });
  if (canSearch && !searched) hook?.onTool?.({ tool: "web_search", text: "Nothing to look up", done: true });
  usage.inputTokens += r.usage.inputTokens ?? 0;
  usage.outputTokens += r.usage.outputTokens ?? 0;
  usage.costUsd += costUsd(station.model, r.usage.inputTokens ?? 0, r.usage.outputTokens ?? 0);
  return { notes: r.text.trim() || "No research needed.", usage };
}

/** The query behind a provider's web search call; Anthropic sends `query`, OpenAI an `action`. */
function searchQuery(input: unknown): string {
  const i = input as { query?: string; action?: { query?: string; queries?: string[]; url?: string | null } } | undefined;
  return i?.query || i?.action?.query || i?.action?.queries?.[0] || i?.action?.url || "the web";
}

/** A short answer from a chef about the work they already did, for a colleague who asked. */
export async function answerColleague(args: { station: StationSpec; output: StationOutput; from: string; question: string; keys: Keys; signal?: AbortSignal }): Promise<{ answer: string; usage: Usage }> {
  const r = await generateText({
    model: languageModel(args.station.model, args.keys),
    prompt: [
      `You are the chef at the "${args.station.title}" station. You already produced this:`,
      args.output.result,
      "",
      `The chef at "${args.from}" asks: ${args.question}`,
      "Answer in at most 120 words, plainly, based on your work above.",
    ].join("\n"),
    maxOutputTokens: 400,
    providerOptions: providerOptions(args.station.model, "low"),
    abortSignal: args.signal,
  });
  const usage = { inputTokens: r.usage.inputTokens ?? 0, outputTokens: r.usage.outputTokens ?? 0, costUsd: 0 };
  usage.costUsd = costUsd(args.station.model, usage.inputTokens, usage.outputTokens);
  return { answer: r.text.trim(), usage };
}

const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd });

/** Expediter: all outputs -> final dish + conflicts. */
export async function merge(args: {
  task: string;
  headChef: string;
  outputs: StationOutput[];
  burnt: StationSpec[];
  context?: Turn[];
  memory?: string[];
  keys: Keys;
  maxOutputTokens: number;
  signal?: AbortSignal;
}): Promise<Call<Plating>> {
  return callJson({
    modelId: args.headChef,
    keys: args.keys,
    prompt: expediterPrompt(args.task, args.outputs, args.burnt, args.context, args.memory),
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
