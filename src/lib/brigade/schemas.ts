import { z } from "zod";

// What the Head Chef writes.
export const StationSpecSchema = z.object({
  id: z.string().describe("short snake_case id, unique within the menu"),
  title: z.string().describe("short station name, e.g. 'Write the page copy'"),
  goal: z.string().describe("what this chef must produce"),
  depends_on: z.array(z.string()).describe("ids of stations whose output this one needs"),
  model: z.string().describe("one of the allowed model ids"),
  token_budget: z.number().int().describe("max output tokens for this station"),
  tools: z.array(z.enum(["web"])).describe("'web' only when the station needs facts from the live internet (news, prices, docs, recent events); otherwise an empty list"),
});
export type StationSpec = z.infer<typeof StationSpecSchema>;

export const MenuSchema = z.object({
  task: z.string(),
  stations: z.array(StationSpecSchema).min(1).max(8),
});
export type Menu = z.infer<typeof MenuSchema>;

// What every Line Cook must return.
export const StationOutputSchema = z.object({
  station_id: z.string(),
  result: z.string().describe("the full deliverable for this station"),
  summary: z.string().describe("two sentences for downstream chefs"),
  assumptions: z.array(z.string()),
});
export type StationOutput = z.infer<typeof StationOutputSchema>;

// What the Expediter returns.
export const PlatingSchema = z.object({
  final: z.string().describe("the final deliverable, combining all stations"),
  conflicts: z.array(
    z.object({
      station_ids: z.array(z.string()),
      problem: z.string(),
    }),
  ),
});
export type Plating = z.infer<typeof PlatingSchema>;

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number };

/** One earlier order in the same chat: what was asked and what the kitchen served. */
export type Turn = { task: string; answer: string };

/**
 * Something that happened in the kitchen, for the bubbles: a chef thinking,
 * using a tool (a cookbook for the web), or saying something to someone.
 * `from`/`to` are station ids, "head" or "expo".
 */
export type KitchenEvent = {
  id: number;
  at: number;
  from: string;
  to?: string;
  kind: "say" | "think" | "tool" | "explain";
  /** For explanations: which lesson this is an example of. */
  topic?: import("./lessons").Topic;
  text: string;
  detail?: string;
  tool?: "web_search" | "ask_chef";
  /** For tools: the call finished. */
  done?: boolean;
};

export type StationStatus = "idle" | "waiting" | "cooking" | "done" | "burnt";

export type StationState = StationSpec & {
  status: StationStatus;
  output?: StationOutput;
  error?: string;
  usage?: Usage;
  startedAt?: number;
  finishedAt?: number;
  /** Head chef's notes handed to this station, in order. */
  notes: string[];
  /** Every run: the instruction that triggered it and what came out. */
  history: { instruction: string; output?: StationOutput; error?: string; at: number }[];
};

export type ServiceStatus = "planning" | "review" | "cooking" | "plating" | "served" | "failed";

export type ServiceState = {
  id: string;
  task: string;
  status: ServiceStatus;
  headChef: string;
  /** Model ids this service has keys for. */
  hireable: string[];
  totalBudget: number;
  stations: StationState[];
  plating?: Plating;
  plannerUsage?: Usage;
  platingUsage?: Usage;
  bill: Usage;
  events: KitchenEvent[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};
