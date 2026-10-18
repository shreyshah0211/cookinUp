import { modelInfo, TIER_NAMES, tierOf } from "./models";
import type { StationOutput, StationSpec, Turn } from "./schemas";

/** Earlier orders in this chat, oldest first, so a follow-up ("make it shorter", "now do the same for X") lands on the right thing. */
export function conversationBlock(context: Turn[]): string[] {
  if (context.length === 0) return [];
  return [
    "## Earlier in this conversation (oldest first)",
    "The task below is a follow-up. It may refer to these earlier answers; build on them rather than starting over, and keep names, choices and facts consistent with them unless asked to change them.",
    ...context.map((t, i) => `### Order ${i + 1}\nUser asked: ${t.task}\n\nKitchen answered:\n${t.answer}`),
    "",
  ];
}

/** What the kitchen remembers about this customer from earlier orders (Backboard memory; read-only here). */
export function memoryBlock(memory: string[] = []): string[] {
  if (memory.length === 0) return [];
  return ["## What the kitchen remembers about this customer", "From earlier orders. Follow these where they apply to this task; ignore any that don't.", ...memory.map((m) => `- ${m}`), ""];
}

export function headChefPrompt(task: string, models: string[], totalBudget: number, context: Turn[] = [], memory: string[] = []): string {
  return [
    "You are the head chef of a kitchen of AI agents. Break the user's task into 2-6 subtasks (stations) that are as independent as possible so they can run in parallel.",
    "For each station give: an id (short snake_case), a title, a goal, the ids it depends on (only when it truly needs their output), a model, a token budget (max output tokens), and tools.",
    "tools: [\"web\"] only for a station that needs facts from the live internet (news, prices, docs, recent events); [] for everything else. Most stations need no tools.",
    "Hire a chef (model) for each station yourself, matched to how hard that station is. The chefs you can hire, with their level and price per million tokens (in / out):",
    ...models.map((m) => {
      const info = modelInfo(m);
      return `- ${m}: ${TIER_NAMES[tierOf(m)]} (${"★".repeat(tierOf(m))}), $${info.inputPerM} / $${info.outputPerM}`;
    }),
    "Commis (★) for simple, short or mechanical work: lookups, lists, formatting, short copy. Sous chef (★★) for real writing, analysis or code. Chef de cuisine (★★★) only for a station that needs deep reasoning, hard code or careful synthesis, and at most one per menu. Stations run live in front of the user, so when in doubt pick the cheaper, faster chef.",
    `The token budgets must add up to at most ${totalBudget}. Give more to stations that produce long output.`,
    "Dependencies must form a DAG. Every depends_on id must be a station in this menu.",
    "Station goals must be self-contained: when the task refers to an earlier answer, restate in each goal what it needs from it (the chefs see the conversation too, but spell it out).",
    "",
    ...conversationBlock(context),
    ...memoryBlock(memory),
    `Task: ${task}`,
  ].join("\n");
}

export function lineCookPrompt(args: {
  task: string;
  station: StationSpec;
  upstream: StationOutput[];
  notes: string[];
  context?: Turn[];
  research?: string;
  memory?: string[];
}): string {
  const { task, station, upstream, notes, context = [], research, memory = [] } = args;
  const inputs =
    upstream.length === 0
      ? "(none - you are a first-course station)"
      : upstream
          .map((u) => `### ${u.station_id}\nSummary: ${u.summary}\nAssumptions: ${u.assumptions.join("; ") || "none"}\n\n${u.result}`)
          .join("\n\n");
  return [
    `You are the chef at the "${station.title}" station in a kitchen of AI agents.`,
    `Your goal: ${station.goal}`,
    `Overall task the kitchen is cooking: ${task}`,
    `Keep your result within about ${station.token_budget} tokens.`,
    "",
    ...conversationBlock(context),
    ...memoryBlock(memory),
    "## Inputs from other stations",
    inputs,
    "",
    "## Head chef's notes",
    notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "(none)",
    "",
    ...(research ? ["## Your research notes", research, ""] : []),
    `Produce the deliverable for your station. station_id is "${station.id}". Write \`result\` in clean Markdown (headings, lists, tables where they fit; no code block around prose). Write a two-sentence summary for downstream chefs and list the assumptions you made.`,
  ].join("\n");
}

/** Before cooking: look things up and ask upstream chefs, then write notes for yourself. */
export function researchPrompt(args: { task: string; station: StationSpec; upstream: StationOutput[]; canSearch: boolean; canAsk: boolean }): string {
  const { task, station, upstream, canSearch, canAsk } = args;
  return [
    `You are the chef at the "${station.title}" station in a kitchen of AI agents. Overall task: ${task}`,
    `Your goal: ${station.goal}`,
    "",
    "Before cooking, gather what you need:",
    canSearch ? "- Use web_search for facts you need from the live internet (at most two searches). Note the source URLs." : "",
    canAsk ? `- Use ask_chef to ask an upstream station a short, specific question about their work when something is unclear. Upstream stations: ${upstream.map((u) => u.station_id).join(", ")}.` : "",
    "",
    "Then reply with concise research notes (facts, figures, sources with URLs, answers you got). Do not write the deliverable yet. If you need nothing, reply 'No research needed.'",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function expediterPrompt(task: string, outputs: StationOutput[], burnt: StationSpec[], context: Turn[] = [], memory: string[] = []): string {
  return [
    `You are the expediter. Combine the work of several stations into one final answer for: ${task}`,
    "",
    ...conversationBlock(context),
    ...memoryBlock(memory),
    "## Station outputs",
    outputs.map((o) => `### ${o.station_id}\nAssumptions: ${o.assumptions.join("; ") || "none"}\n\n${o.result}`).join("\n\n"),
    burnt.length ? `\n## Stations that failed (work around them, and say so in the final)\n${burnt.map((b) => `- ${b.id}: ${b.title}`).join("\n")}` : "",
    "",
    "Produce the final deliverable in full (do not just describe it), written for the person who asked, as clean Markdown:",
    "- Start with a one-line title (a level-2 heading), then the content; use level-3 headings for sections when there is more than one part.",
    "- Use bullet or numbered lists for lists, tables for tabular data, bold for the few terms that matter, and short paragraphs otherwise.",
    "- Do not mention stations, chefs or the process; do not wrap the whole thing in a code block; no raw JSON inside `final`.",
    "Then list any contradictions between the stations' assumptions or results as conflicts: which station ids disagree and what the problem is. An empty list is fine.",
  ].join("\n");
}

export const JSON_RETRY_NOTE = "Your last reply was not valid JSON matching the schema. Return only the JSON.";
