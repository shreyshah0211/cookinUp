// One service = one order cooked by the kitchen. Holds the live state, runs the
// scheduler (every station whose dependencies are done cooks in parallel),
// re-fires a station and its descendants on request, and tells listeners
// about every change.

import { merge, plan, rebalance, runStation } from "./engine";
import { modelInfo } from "./models";
import { hireable, type Keys } from "./providers";
import type { ServiceState, StationOutput, StationState, Turn, Usage } from "./schemas";

export type RerunOptions = { instruction?: string; model?: string; token_budget?: number };

type Listener = (state: ServiceState) => void;

const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 });

export class KitchenService {
  state: ServiceState;
  private keys: Keys;
  private listeners = new Set<Listener>();
  // Each station run gets a number; a result from an older run is dropped.
  private runs = new Map<string, number>();
  private aborts = new Map<string, AbortController>();
  private platingRun = 0;
  private platingAbort?: AbortController;

  // Earlier orders in this chat; every chef reads them, so follow-ups make sense.
  private context: Turn[];

  constructor(args: { id: string; task: string; keys: Keys; headChef: string; totalBudget: number; context?: Turn[] }) {
    this.keys = args.keys;
    this.context = args.context ?? [];
    this.state = {
      id: args.id,
      task: args.task,
      status: "planning",
      headChef: args.headChef,
      hireable: hireable(args.keys),
      totalBudget: args.totalBudget,
      stations: [],
      bill: zeroUsage(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.state = { ...this.state, bill: this.totalBill(), updatedAt: Date.now() };
    for (const l of this.listeners) l(this.state);
  }

  private totalBill(): Usage {
    const parts = [this.state.plannerUsage, this.state.platingUsage, ...this.state.stations.map((s) => s.usage)];
    const bill = zeroUsage();
    for (const p of parts) {
      if (!p) continue;
      bill.inputTokens += p.inputTokens;
      bill.outputTokens += p.outputTokens;
      bill.costUsd += p.costUsd;
    }
    return bill;
  }

  private station(id: string): StationState | undefined {
    return this.state.stations.find((s) => s.id === id);
  }

  private patch(id: string, change: (s: StationState) => StationState) {
    this.state = { ...this.state, stations: this.state.stations.map((s) => (s.id === id ? change(s) : s)) };
  }

  /** Keys added since the order was placed: more chefs become hireable. Blank keys change nothing. */
  updateKeys(keys: Keys) {
    const next = { anthropic: keys.anthropic || this.keys.anthropic, openai: keys.openai || this.keys.openai };
    if (next.anthropic === this.keys.anthropic && next.openai === this.keys.openai) return;
    this.keys = next;
    this.state = { ...this.state, hireable: hireable(next) };
    this.emit();
  }

  /** Order in: plan the menu, then cook. Resolves when the dish is served (or the kitchen failed). */
  async start(): Promise<ServiceState> {
    try {
      if (this.state.hireable.length === 0) throw new Error("No API keys: add an Anthropic or OpenAI key in the kitchen settings.");
      if (!this.state.hireable.includes(this.state.headChef)) {
        throw new Error(`No key for the head chef (${modelInfo(this.state.headChef).label}): pick another or add the key.`);
      }
      // The head chef hires at or below their own rate; promote any chef by hand afterwards.
      const rate = modelInfo(this.state.headChef).outputPerM;
      const onShift = this.state.hireable.filter((m) => modelInfo(m).outputPerM <= rate);
      const { object: menu, usage } = await plan({
        task: this.state.task,
        headChef: this.state.headChef,
        totalBudget: this.state.totalBudget,
        models: onShift.length > 0 ? onShift : this.state.hireable,
        context: this.context,
        keys: this.keys,
      });
      this.state = {
        ...this.state,
        status: "cooking",
        plannerUsage: usage,
        stations: menu.stations.map((s) => ({ ...s, status: "idle", notes: [], history: [] })),
      };
      this.emit();
      this.tick();
    } catch (error) {
      this.state = { ...this.state, status: "failed", error: String(error instanceof Error ? error.message : error) };
      this.emit();
    }
    return this.whenServed();
  }

  whenServed(): Promise<ServiceState> {
    const isOver = (s: ServiceState) => s.status === "served" || s.status === "failed";
    if (isOver(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve) => {
      // subscribe() calls back at once with the current state, so `off` is
      // only used from a later call.
      let off = () => {};
      off = this.subscribe((s) => {
        if (isOver(s)) {
          off();
          resolve(s);
        }
      });
    });
  }

  /** Head chef steps in: give a station a note, a new chef or a new budget, then re-fire it and everything downstream. */
  rerun(id: string, opts: RerunOptions = {}) {
    const st = this.station(id);
    if (!st) throw new Error(`No station "${id}"`);
    if (opts.model && !this.state.hireable.includes(opts.model)) {
      throw new Error(`No key for ${modelInfo(opts.model).label}: add one in the kitchen settings.`);
    }
    if (opts.token_budget !== undefined) {
      this.setBudget(id, opts.token_budget, false);
    }
    this.patch(id, (s) => ({
      ...s,
      model: opts.model ? modelInfo(opts.model).id : s.model,
      notes: opts.instruction ? [...s.notes, opts.instruction] : s.notes,
    }));
    for (const d of [id, ...this.descendants(id)]) this.invalidate(d);
    this.invalidatePlating();
    this.state = { ...this.state, status: "cooking", error: undefined };
    this.emit();
    this.tick();
  }

  /** Double-click a station: more ingredients for it, fewer for the rest. Re-fires only if it already cooked. */
  setBudget(id: string, budget: number, refire = true) {
    const stations = rebalance(this.state.stations, id, budget, this.state.totalBudget);
    this.state = { ...this.state, stations };
    if (refire && this.station(id)?.status !== "idle") {
      this.rerun(id);
    } else {
      this.emit();
    }
  }

  /** Send the expediter back to the pass after a failed (or unwanted) plating. */
  replate() {
    const settled = this.state.stations.length > 0 && this.state.stations.every((s) => s.status === "done" || s.status === "burnt");
    if (!settled) throw new Error("The stations are still cooking.");
    this.invalidatePlating();
    this.state = { ...this.state, error: undefined };
    void this.plate();
  }

  /** Take a chef off a station mid-cook: the call is aborted and the station marked burnt. */
  stop(id: string) {
    this.aborts.get(id)?.abort();
    this.runs.set(id, (this.runs.get(id) ?? 0) + 1);
    this.patch(id, (s) => ({ ...s, status: "burnt", error: "Stopped by the head chef", finishedAt: Date.now() }));
    this.emit();
    this.tick();
  }

  private descendants(id: string): string[] {
    const out: string[] = [];
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const s of this.state.stations) {
        if (s.depends_on.includes(cur) && !seen.has(s.id)) {
          seen.add(s.id);
          out.push(s.id);
          queue.push(s.id);
        }
      }
    }
    return out;
  }

  private invalidate(id: string) {
    this.aborts.get(id)?.abort();
    this.runs.set(id, (this.runs.get(id) ?? 0) + 1);
    this.patch(id, (s) => ({ ...s, status: "idle", output: undefined, error: undefined, usage: s.usage, startedAt: undefined, finishedAt: undefined }));
  }

  private invalidatePlating() {
    this.platingAbort?.abort();
    this.platingRun += 1;
    this.state = { ...this.state, plating: undefined };
  }

  /** The scheduler: fire every ready station, and plate once the floor is clear. Safe to call any time. */
  private tick() {
    if (this.state.status === "failed") return;
    const done = new Set(this.state.stations.filter((s) => s.status === "done").map((s) => s.id));
    const burnt = new Set(this.state.stations.filter((s) => s.status === "burnt").map((s) => s.id));
    const toFire: StationState[] = [];
    for (const s of this.state.stations) {
      if (s.status !== "idle" && s.status !== "waiting") continue;
      if (s.depends_on.some((d) => burnt.has(d))) {
        this.patch(s.id, (x) => ({ ...x, status: "burnt", error: "An upstream station burnt", finishedAt: Date.now() }));
        burnt.add(s.id);
      } else if (s.depends_on.every((d) => done.has(d))) {
        toFire.push(s);
      } else if (s.status !== "waiting") {
        this.patch(s.id, (x) => ({ ...x, status: "waiting" }));
      }
    }
    for (const s of toFire) this.fire(s.id);
    const cooking = this.state.stations.some((s) => s.status === "cooking" || s.status === "waiting" || s.status === "idle");
    if (!cooking && this.state.stations.length > 0 && !this.state.plating && this.state.status !== "plating") {
      void this.plate();
    }
    this.emit();
  }

  private fire(id: string) {
    const st = this.station(id)!;
    const run = (this.runs.get(id) ?? 0) + 1;
    this.runs.set(id, run);
    const abort = new AbortController();
    this.aborts.set(id, abort);
    const instruction = st.notes.at(-1) ?? (st.history.length ? "Re-fired by the head chef" : "Order in");
    const startedAt = Date.now();
    this.patch(id, (s) => ({
      ...s,
      status: "cooking",
      startedAt,
      finishedAt: undefined,
      error: undefined,
      history: [...s.history, { instruction, at: startedAt }],
    }));
    const upstream = st.depends_on.map((d) => this.station(d)?.output).filter((o): o is StationOutput => !!o);
    void runStation({
      task: this.state.task,
      station: st,
      upstream,
      notes: st.notes,
      context: this.context,
      keys: this.keys,
      signal: abort.signal,
    })
      .then(({ object, usage }) => {
        if (this.runs.get(id) !== run) return;
        this.patch(id, (s) => ({
          ...s,
          status: "done",
          output: object,
          usage: addUsage(s.usage, usage),
          finishedAt: Date.now(),
          history: s.history.map((h, i) => (i === s.history.length - 1 ? { ...h, output: object } : h)),
        }));
        this.tick();
      })
      .catch((error: unknown) => {
        if (this.runs.get(id) !== run) return;
        const message = error instanceof Error ? error.message : String(error);
        this.patch(id, (s) => ({
          ...s,
          status: "burnt",
          error: message,
          finishedAt: Date.now(),
          history: s.history.map((h, i) => (i === s.history.length - 1 ? { ...h, error: message } : h)),
        }));
        this.tick();
      });
  }

  private async plate() {
    const run = ++this.platingRun;
    const abort = new AbortController();
    this.platingAbort = abort;
    this.state = { ...this.state, status: "plating" };
    this.emit();
    const outputs = this.state.stations.map((s) => s.output).filter((o): o is StationOutput => !!o);
    const burnt = this.state.stations.filter((s) => s.status === "burnt");
    try {
      if (outputs.length === 0) throw new Error("Every station burnt; nothing to plate.");
      const { object, usage } = await merge({
        task: this.state.task,
        headChef: this.state.headChef,
        outputs,
        burnt,
        context: this.context,
        keys: this.keys,
        // The final dish restates the stations' work, so it needs about as much room as all of them.
        maxOutputTokens: Math.max(6000, this.state.totalBudget),
        signal: abort.signal,
      });
      if (this.platingRun !== run) return;
      this.state = { ...this.state, status: "served", plating: object, platingUsage: addUsage(this.state.platingUsage, usage) };
    } catch (error) {
      if (this.platingRun !== run) return;
      this.state = { ...this.state, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    this.emit();
  }
}

function addUsage(a: Usage | undefined, b: Usage): Usage {
  if (!a) return b;
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd };
}
