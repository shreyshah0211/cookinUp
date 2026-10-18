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

export function headChefPrompt(task: string, models: string[], totalBudget: number, context: Turn[] = []): string {
  return [
    "You are the head chef of a kitchen of AI agents. Break the user's task into 2-6 subtasks (stations) that are as independent as possible so they can run in parallel.",
    "For each station give: an id (short snake_case), a title, a goal, the ids it depends on (only when it truly needs their output), a model, and a token budget (max output tokens).",
    `Allowed models: ${models.join(", ")}. Stations run live in front of the user, so prefer fast, cheap models (sonnet, haiku, mini) and reserve the largest model for at most one station that needs hard reasoning or synthesis.`,
    `The token budgets must add up to at most ${totalBudget}. Give more to stations that produce long output.`,
    "Dependencies must form a DAG. Every depends_on id must be a station in this menu.",
    "Station goals must be self-contained: when the task refers to an earlier answer, restate in each goal what it needs from it (the chefs see the conversation too, but spell it out).",
    "",
    ...conversationBlock(context),
    `Task: ${task}`,
  ].join("\n");
}

export function lineCookPrompt(args: {
  task: string;
  station: StationSpec;
  upstream: StationOutput[];
  notes: string[];
  context?: Turn[];
}): string {
  const { task, station, upstream, notes, context = [] } = args;
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
    "## Inputs from other stations",
    inputs,
    "",
    "## Head chef's notes",
    notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "(none)",
    "",
    `Produce the deliverable for your station. station_id is "${station.id}". Write \`result\` in clean Markdown (headings, lists, tables where they fit; no code block around prose). Write a two-sentence summary for downstream chefs and list the assumptions you made.`,
  ].join("\n");
}

export function expediterPrompt(task: string, outputs: StationOutput[], burnt: StationSpec[], context: Turn[] = []): string {
  return [
    `You are the expediter. Combine the work of several stations into one final answer for: ${task}`,
    "",
    ...conversationBlock(context),
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
