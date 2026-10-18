// The kitchen as a tiny game: chefs that come in through the swing door, work
// their station (stir at the stove, chop at the board), carry plates to the
// pass and bubble when stuck, updated from the service state and drawn at
// native pixel resolution.

import { modelInfo, tierOf } from "@/lib/brigade/models";
import type { KitchenEvent, ServiceState, StationState } from "@/lib/brigade/schemas";

import * as D from "./draw";
import { ding } from "./sound";
import { BUBBLES, BUBBLE_PALETTE, CHEF_FRAMES, CHEF_H, DISH_W, SENIOR_LOOK, THOUGHT, THOUGHT_H, THOUGHT_W, TILE, chefPalette, dishFor, dishSprite, drawLabel, labelBox, lookFor, sprite, type Look } from "./sprites";

/** How long a said thing floats over a chef's head, and how long a closed cookbook stays out. */
const SAY_FOR = 6000;
const BOOK_LINGER = 2500;
/** The pixel font is uppercase and narrow: two short lines per bubble, the rest in the chef's card. */
function clipWords(s: string, perLine = 24, lines = 2): string {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine) {
      if (line) out.push(line);
      line = w;
      if (out.length === lines) break;
    } else line = (line + " " + w).trim();
  }
  if (out.length < lines && line) out.push(line);
  const used = out.join(" ").length;
  if (used < s.trim().length) out[out.length - 1] = out[out.length - 1].slice(0, perLine - 1).trimEnd() + "…";
  return out.slice(0, lines).join("\n");
}
import { WALL_ROWS, buildLayout, findPath, key, type Layout, type Tile } from "./world";

type Facing = "down" | "up" | "left" | "right";
type Mode = "idle" | "walk" | "stir" | "chop" | "wait" | "happy" | "burnt" | "write";
type Task = { type: "goto"; to: Tile } | { type: "wait"; ms: number } | { type: "do"; fn: () => void };

type Entity = {
  id: string;
  hat: string;
  look: Look;
  x: number; // px, top-left of the footprint tile
  y: number;
  tile: Tile;
  facing: Facing;
  path: Tile[];
  tasks: Task[];
  waitLeft: number;
  frame: number;
  frameTimer: number;
  carrying: boolean;
  happyUntil: number;
  /** The cooking loop: which work tile is next, and when to move on. */
  work: "stove" | "board" | null;
  workUntil: number;
  /** A finished dish that has not reached the pass yet (survives a relayout). */
  plateDue: boolean;
};

const WALK_SPEED = 56; // px per second
const WALK_FRAME = 0.12;
const WORK_FRAME = 0.3;
const DOOR_SWING = 1.1; // seconds the door stays open after someone comes through

export class KitchenWorld {
  layout: Layout;
  private chefs = new Map<string, Entity>();
  /** Chefs on their way out after a change of order; drawn until they reach the door. */
  private leaving: Entity[] = [];
  private serviceId: string | null = null;
  private head: Entity;
  private expo: Entity;
  private stations: StationState[] = [];
  private status: ServiceState["status"] | null = null;
  private prevStatus = new Map<string, string>();
  private plates: string[] = [];
  private t = 0;
  private doorOpenUntil = 0;
  private servedAt = -100;
  /** Kitchen talk from the service: who said or did what, for bubbles. */
  private talk: KitchenEvent[] = [];
  /** Where each thought bubble was drawn this frame, so a click can land on it. */
  private thoughtRects = new Map<string, { x: number; y: number; w: number; h: number }>();
  /** Learn mode: "?" badges on whatever was just explained. */
  private learn = true;
  private whyRects = new Map<string, { x: number; y: number; w: number; h: number }>();
  /** The newest explanation each place has been looked at, so its badge can stop pulsing. */
  private seenWhy = new Map<string, number>();
  /** The last few things that happened, for debugging (`__kitchen.log`). */
  log: string[] = [];
  hovered: string | null = null;
  picked: string | null = null;

  constructor(headHat: string, cols: number, rows: number) {
    this.layout = buildLayout(cols, rows, []);
    this.head = entity("head", headHat, SENIOR_LOOK, this.layout.head, "down");
    this.expo = entity("expo", headHat, lookFor("expediter"), this.layout.expo, "up");
  }

  get width() {
    return this.layout.cols * TILE;
  }
  get height() {
    return this.layout.rows * TILE;
  }

  /** One line of state for debugging. */
  trace(): string {
    return `t=${this.t.toFixed(1)} ${this.layout.cols}x${this.layout.rows} ` + [...this.chefs.values()].map((e) => `${e.id}@${Math.round(e.x)},${Math.round(e.y)} p${e.path.length} k${e.tasks.length} ${e.work ?? "-"}`).join(" | ");
  }

  setLearn(on: boolean) {
    this.learn = on;
  }

  /** Someone looked at this place's explanation. */
  ack(id: string) {
    const last = this.latestWhy(id);
    if (last) this.seenWhy.set(id, last.id);
  }

  private latestWhy(id: string): KitchenEvent | undefined {
    for (let i = this.talk.length - 1; i >= 0; i--) if (this.talk[i].kind === "explain" && this.talk[i].from === id) return this.talk[i];
    return undefined;
  }

  /** A badge shows while the newest explanation is fresh and not yet looked at (or is being hovered). */
  private showWhy(id: string): boolean {
    if (!this.learn) return false;
    if (this.hovered === `why:${id}`) return true;
    const last = this.latestWhy(id);
    return !!last && (this.seenWhy.get(id) ?? 0) < last.id && Date.now() - last.at < 45_000;
  }

  focus(picked: string | null, hovered: string | null) {
    this.picked = picked;
    this.hovered = hovered;
  }

  /** One word for what someone is doing, for the hover label. */
  statusWord(id: string): string {
    if (id.startsWith("thought:")) return "Thinking";
    if (id.startsWith("why:")) return "Why?";
    if (id === "head") return this.status === "planning" ? "Planning" : this.status === "served" ? "Done" : this.status ? "Watching" : "Idle";
    if (id === "expo") return this.status === "plating" ? "Plating" : this.status === "served" ? "Served" : this.status === "failed" ? "Fire" : "Waiting";
    const e = this.chefs.get(id);
    const s = this.stations.find((x) => x.id === id);
    if (!e || !s) return "Idle";
    if (e.carrying) return "Serving";
    if (e.path.length > 0) return "Walking";
    const tool = this.activeTool(id);
    if (tool === "web_search") return "Reading";
    if (tool === "ask_chef") return "Asking";
    switch (s.status) {
      case "cooking":
        return e.work === "board" ? "Chopping" : "Cooking";
      case "waiting":
        return "Waiting";
      case "done":
        return "Ready";
      case "burnt":
        return "Burnt";
      default:
        return "Idle";
    }
  }

  /** Which dish a station serves: by its place in the menu, so one service shows different dishes. */
  private dishOf(id: string): number {
    const i = this.stations.findIndex((s) => s.id === id);
    return i >= 0 ? i : dishFor(id);
  }

  /** Where someone is drawn, in native pixels (top of the sprite), for labels. */
  positionOf(id: string): { x: number; y: number } | null {
    const e = id === "head" ? this.head : id === "expo" ? this.expo : this.chefs.get(id);
    return e ? { x: e.x, y: e.y - (CHEF_H - TILE) } : null;
  }

  /** The pane changed size: rebuild the room and send everyone to their new spot. */
  resize(cols: number, rows: number) {
    if (cols === this.layout.cols && rows === this.layout.rows) return;
    this.relayout(cols, rows);
  }

  private note(what: string) {
    this.log.push(`${this.t.toFixed(1)} ${what}`);
    if (this.log.length > 60) this.log.shift();
  }

  /** The latest thing someone said, while it still floats. */
  private saying(id: string): KitchenEvent | undefined {
    const now = Date.now();
    for (let i = this.talk.length - 1; i >= 0; i--) {
      const e = this.talk[i];
      if (e.from === id && e.kind === "say") return now - e.at < SAY_FOR ? e : undefined;
    }
    return undefined;
  }

  /** A tool a station is using right now (or just finished): the cookbook stays out a moment. */
  private activeTool(id: string): KitchenEvent["tool"] | null {
    const now = Date.now();
    for (let i = this.talk.length - 1; i >= 0; i--) {
      const e = this.talk[i];
      if (e.from !== id || e.kind !== "tool") continue;
      if (!e.done) return now - e.at < 90_000 ? (e.tool ?? null) : null;
      return now - e.at < BOOK_LINGER ? (e.tool ?? null) : null;
    }
    return null;
  }

  /** Someone is working something out: a thought cloud you can open. */
  private thinking(e: Entity): boolean {
    if (e.id === "head") return this.status === "planning";
    if (e.id === "expo") return this.status === "plating";
    const s = this.stations.find((x) => x.id === e.id);
    return s?.status === "cooking" && !e.carrying;
  }

  private relayout(cols: number, rows: number) {
    this.note(`relayout ${cols}x${rows} stations=${this.stations.length} chefs=${this.chefs.size}`);
    this.layout = buildLayout(cols, rows, this.stations);
    place(this.head, this.layout.head);
    place(this.expo, this.layout.expo);
    for (const [id, chef] of this.chefs) {
      const slot = this.layout.slots.get(id);
      if (!slot) continue;
      chef.path = [];
      chef.tasks = [];
      chef.waitLeft = 0;
      chef.work = null;
      chef.workUntil = 0;
      if (chef.plateDue) {
        // Still holding a finished dish: carry on to the (moved) pass.
        this.errand(chef, id, slot.chef);
      } else {
        chef.carrying = false;
        chef.tasks.push({ type: "goto", to: slot.chef }, { type: "do", fn: () => (chef.facing = "up") });
      }
    }
  }

  /** Everyone at a station walks back out through the swing door. */
  private dismiss() {
    for (const chef of this.chefs.values()) {
      const c = chef;
      c.path = [];
      c.tasks = [];
      c.waitLeft = 0;
      c.carrying = false;
      c.plateDue = false;
      c.work = null;
      c.tasks.push(
        { type: "goto", to: this.layout.door },
        { type: "do", fn: () => (this.doorOpenUntil = this.t + DOOR_SWING) },
        { type: "do", fn: () => (c.facing = "up") },
        { type: "wait", ms: 250 },
        { type: "do", fn: () => (this.leaving = this.leaving.filter((e) => e !== c)) },
      );
      this.leaving.push(c);
    }
    if (this.chefs.size) this.note(`dismiss ${this.chefs.size}`);
    this.chefs.clear();
  }

  /** Run the plate to the pass, leave it there, and come back to the station. */
  private errand(c: Entity, stationId: string, home: Tile) {
    c.plateDue = true;
    c.work = null;
    c.tasks.push(
      { type: "do", fn: () => (c.carrying = true) },
      { type: "goto", to: this.layout.drop },
      { type: "do", fn: () => (c.facing = "down") },
      { type: "wait", ms: 350 },
      {
        type: "do",
        fn: () => {
          c.carrying = false;
          c.plateDue = false;
          this.note(`plate ${stationId}`);
          if (!this.plates.includes(stationId)) this.plates.push(stationId);
        },
      },
      { type: "goto", to: home },
      {
        type: "do",
        fn: () => {
          c.facing = "down";
          c.happyUntil = this.t + 3;
        },
      },
    );
  }

  /** Reads the service state: new chefs walk in, status changes become errands. */
  sync(state: ServiceState | null) {
    if ((state?.id ?? null) !== this.serviceId) {
      // A different order (or none): this brigade leaves, the next one comes in.
      // An order that was already served when we got here rings no bell.
      this.dismiss();
      this.serviceId = state?.id ?? null;
      this.prevStatus.clear();
      this.plates = [];
      this.servedAt = -100;
      this.status = state?.status === "served" ? "served" : null;
    }
    if (state?.status === "served" && this.status !== "served") {
      this.servedAt = this.t;
      ding();
    }
    this.status = state?.status ?? null;
    this.stations = state?.stations ?? [];
    this.talk = state?.events ?? [];
    if (state) {
      this.head.hat = modelInfo(state.headChef).hat;
      this.expo.hat = this.head.hat;
    }
    // Rebuild the room when the set of stations or their places change.
    const ids = new Set(this.stations.map((s) => s.id));
    const fresh = buildLayout(this.layout.cols, this.layout.rows, this.stations);
    if (slotsKey(fresh) !== slotsKey(this.layout)) this.relayout(this.layout.cols, this.layout.rows);
    let entering = 0;
    for (const s of this.stations) {
      const slot = this.layout.slots.get(s.id);
      if (!slot) continue;
      let chef = this.chefs.get(s.id);
      if (!chef) {
        // In through the swing door, one after another.
        const c = entity(s.id, modelInfo(s.model).hat, lookFor(s.id), this.layout.door, "down");
        const delay = 450 * entering++;
        c.tasks.push(
          { type: "wait", ms: delay },
          { type: "do", fn: () => (this.doorOpenUntil = this.t + DOOR_SWING) },
          { type: "goto", to: slot.chef },
          { type: "do", fn: () => (c.facing = "up") },
        );
        this.chefs.set(s.id, c);
        chef = c;
        this.note(`enter ${s.id} status=${s.status}`);
        // Reopening a chat whose dish is already done: it is on the pass already.
        if (s.status === "done" && !this.plates.includes(s.id)) this.plates.push(s.id);
      }
      chef.hat = modelInfo(s.model).hat;
      const was = this.prevStatus.get(s.id);
      this.prevStatus.set(s.id, s.status);
      if (was !== s.status) this.note(`${s.id} ${was ?? "new"} -> ${s.status}`);
      if (s.status === "done" && was && was !== "done") {
        this.note(`errand ${s.id}`);
        this.errand(chef, s.id, slot.chef);
      } else if (was === "cooking" && s.status !== "cooking") {
        // Off the stove: back to the middle of the station.
        const c = chef;
        c.work = null;
        if (c.tasks.length === 0) c.tasks.push({ type: "goto", to: slot.chef }, { type: "do", fn: () => (c.facing = "down") });
      }
      if (s.status !== "done") {
        this.plates = this.plates.filter((id) => id !== s.id);
        chef.plateDue = false;
      }
    }
    for (const id of [...this.chefs.keys()]) if (!ids.has(id)) this.chefs.delete(id);
  }

  update(dt: number) {
    this.t += dt;
    for (const e of [...this.chefs.values(), ...this.leaving, this.head, this.expo]) this.step(e, dt);
    // The cooking loop: a few seconds at the stove, a few at the board, and back.
    for (const s of this.stations) {
      const e = this.chefs.get(s.id);
      const slot = this.layout.slots.get(s.id);
      if (!e || !slot || s.status !== "cooking" || e.path.length > 0 || e.tasks.length > 0 || e.carrying) continue;
      if (this.t < e.workUntil) continue;
      const next = e.work === "stove" ? "board" : "stove";
      const to = next === "stove" ? slot.stove : slot.board;
      e.tasks.push(
        { type: "goto", to },
        {
          type: "do",
          fn: () => {
            e.facing = "up";
            e.work = next;
            e.workUntil = this.t + (next === "stove" ? 4 : 3) + Math.random() * 2;
          },
        },
      );
    }
  }

  private step(e: Entity, dt: number) {
    e.frameTimer += dt;
    if (e.path.length === 0 && e.tasks.length > 0) {
      const task = e.tasks[0];
      if (task.type === "goto") {
        e.path = findPath(e.tile, task.to, this.layout);
        e.tasks.shift();
        if (e.path.length === 0) return;
      } else if (task.type === "wait") {
        e.waitLeft = e.waitLeft || task.ms / 1000;
        e.waitLeft -= dt;
        if (e.waitLeft <= 0) {
          e.waitLeft = 0;
          e.tasks.shift();
        }
        return;
      } else {
        task.fn();
        e.tasks.shift();
        return;
      }
    }
    if (e.path.length > 0) {
      const next = e.path[0];
      const tx = next.x * TILE;
      const ty = next.y * TILE;
      const dx = tx - e.x;
      const dy = ty - e.y;
      e.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      const stepLen = WALK_SPEED * dt;
      const dist = Math.hypot(dx, dy);
      if (dist <= stepLen) {
        e.x = tx;
        e.y = ty;
        e.tile = next;
        e.path.shift();
      } else {
        e.x += (dx / dist) * stepLen;
        e.y += (dy / dist) * stepLen;
      }
      if (e.frameTimer >= WALK_FRAME) {
        e.frameTimer = 0;
        e.frame = (e.frame + 1) % 4;
      }
    } else if (e.frameTimer >= WORK_FRAME) {
      e.frameTimer = 0;
      e.frame = (e.frame + 1) % 4;
    }
  }

  private modeOf(e: Entity): Mode {
    if (e.path.length > 0) return "walk";
    if (e.id === "head") return this.status === "planning" ? "write" : "idle";
    if (e.id === "expo") return this.status === "plating" ? "stir" : "idle";
    const s = this.stations.find((x) => x.id === e.id);
    const slot = this.layout.slots.get(e.id);
    if (!s || !slot || e.tasks.length > 0) return "idle";
    if (s.status === "cooking") {
      if (key(e.tile) === key(slot.stove)) return "stir";
      if (key(e.tile) === key(slot.board)) return "chop";
      return "idle";
    }
    if (s.status === "waiting") return "wait";
    if (s.status === "burnt") return "burnt";
    if (s.status === "done" && this.t < e.happyUntil) return "happy";
    return "idle";
  }

  /** Icon bubbles are for moments that need you; the station light carries the status. */
  private bubbleOf(e: Entity, mode: Mode): keyof typeof BUBBLES | null {
    if (e.id === "expo") return this.status === "failed" ? "alert" : null;
    if (e.carrying) return null;
    if (mode === "burnt") return "alert";
    return null;
  }

  /** What is under a point in native pixels: a thought bubble ("thought:<id>"), a station (by counter or chef), "head" or "expo". */
  hitTest(px: number, py: number): string | null {
    const L = this.layout;
    for (const [id, r] of this.whyRects) {
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return `why:${id}`;
    }
    for (const [id, r] of this.thoughtRects) {
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return `thought:${id}`;
    }
    for (const e of [...this.chefs.values(), this.head, this.expo]) {
      if (px >= e.x && px < e.x + TILE && py >= e.y - 8 && py < e.y + TILE) return e.id;
    }
    for (const s of L.slots.values()) {
      const x = s.counter.x * TILE;
      const y = s.counter.y * TILE;
      if (px >= x && px < x + 3 * TILE && py >= y - 4 && py < y + TILE) return s.id;
    }
    if (px >= L.desk.x * TILE && px < (L.desk.x + 2) * TILE && py >= L.desk.y * TILE && py < (L.desk.y + 1) * TILE) return "head";
    if (px >= L.pass.x0 * TILE && px < (L.pass.x1 + 1) * TILE && py >= L.pass.y * TILE - 8 && py < (L.pass.y + 1) * TILE) return "expo";
    return null;
  }

  render(ctx: CanvasRenderingContext2D) {
    const L = this.layout;
    const t = this.t;
    const cx = Math.floor(L.cols / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = D.C.outside;
    ctx.fillRect(0, 0, this.width, this.height);

    // floor and walls; the pass end of the room gets the checker tiles
    for (let y = WALL_ROWS; y < L.rows; y++) for (let x = 0; x < L.cols; x++) D.floorTile(ctx, x, y, y >= L.pass.y);
    D.wall(ctx, L.cols, WALL_ROWS);

    // the back wall, left to right: swing door, ticket rail, window, pictures,
    // clock over the desk, menu board, spice rack, pan rack, calendar, extinguisher
    const doorOpen = this.doorOpenUntil > t ? Math.min(1, (this.doorOpenUntil - t) / DOOR_SWING) : 0;
    D.wallDoor(ctx, L.doorWall.x * TILE, L.doorWall.y * TILE + 2, doorOpen);
    D.ticketRail(ctx, (L.doorWall.x + 2) * TILE + 6, 8, this.stations.length ? Math.min(4, this.stations.length) : 0);
    D.window_(ctx, (L.doorWall.x + 2) * TILE + 2, 24);
    D.picture(ctx, (cx - 6) * TILE + 2, 12, 0);
    D.picture(ctx, (cx - 5) * TILE + 4, 26, 1);
    D.herbPots(ctx, (cx - 4) * TILE + 2, 32);
    D.clock(ctx, cx * TILE - 7, 8, t);
    D.menuBoard(ctx, (cx + 1) * TILE + 2, 10);
    D.spiceRack(ctx, (cx + 3) * TILE + 6, 32);
    if (L.cols >= 22) D.panRack(ctx, (cx + 4) * TILE, 10);
    if (L.cols >= 22) D.calendar(ctx, (L.cols - 4) * TILE + 2, 10);
    if (L.cols >= 24) D.picture(ctx, (L.cols - 6) * TILE + 2, 9, 2);
    D.shelf(ctx, (L.cols - 4) * TILE - 18, 24);
    D.extinguisher(ctx, (L.cols - 2) * TILE + 4, 26);
    D.fridge(ctx, L.fridge.x * TILE, L.fridge.y * TILE - 4);
    for (let x = 4; x < L.cols - 4; x += 6) D.hangingLamp(ctx, x * TILE + 3, 0);

    // floor decor along the walls
    let plantNo = 0;
    for (const d of L.decor) {
      const x = d.tile.x * TILE;
      const y = d.tile.y * TILE;
      if (d.kind === "crate") D.crate(ctx, x, y, d.tile.x === 0 ? "#e76f51" : "#5aa866");
      else if (d.kind === "sack") D.sack(ctx, x, y);
      else if (d.kind === "trolley") D.trolley(ctx, x, y);
      else if (d.kind === "mop") D.mopBucket(ctx, x, y);
      else D.plant(ctx, x, y, plantNo++);
    }
    D.sink(ctx, L.sink.x * TILE, L.sink.y * TILE);
    D.bin(ctx, L.bin.x * TILE, L.bin.y * TILE);

    // the pass across the bottom, lamps hanging over it, plates stacked at the ends
    for (let x = L.pass.x0; x <= L.pass.x1; x++) D.passTop(ctx, x * TILE, L.pass.y * TILE, x === L.pass.x0, x === L.pass.x1);
    const lampsOn = this.status === "cooking" || this.status === "plating" || this.status === "served";
    D.plateStack(ctx, L.pass.x0 * TILE + 2, L.pass.y * TILE - 2);
    D.plateStack(ctx, L.pass.x1 * TILE + 2, L.pass.y * TILE - 2);

    // mats, then all nine stations; the ones in service get a pot, flames, a highlight
    for (const spot of L.spots) D.mat(ctx, spot.counter.x * TILE, spot.chef.y * TILE);
    const byIndex = new Map([...L.slots.values()].map((s) => [s.index, s.id]));
    const maxBudget = Math.max(1, ...this.stations.map((o) => o.token_budget));
    for (const spot of L.spots) {
      const id = byIndex.get(spot.index);
      const s = id ? this.stations.find((st) => st.id === id) : undefined;
      const x = spot.counter.x * TILE;
      const y = spot.counter.y * TILE;
      const cooking = s?.status === "cooking";
      D.stove(ctx, x, y, !!cooking, t);
      D.counter(ctx, x + TILE, y);
      D.board(ctx, x + 2 * TILE, y, s ? s.token_budget / maxBudget : 0);
      if (cooking || s?.status === "burnt") D.pot(ctx, x + 4, y + 1);
      if (s) D.tierTrim(ctx, x, y, tierOf(s.model));
      if (s) D.tokenMeter(ctx, x + 9, y - 5, s.usage?.outputTokens ?? 0, s.token_budget, cooking, t);
      // the cookbook comes out on the counter while the chef looks something up
      if (id && this.activeTool(id) === "web_search") D.cookbook(ctx, x + TILE + 1, y - 2, Math.floor(t * 3));
      // the station beacon, standing on the floor just right of the counter
      D.beacon(ctx, x + 3 * TILE + 4, y + 1, s?.status ?? "idle", t + spot.index);
      if (id && (id === this.picked || id === this.hovered)) {
        ctx.strokeStyle = id === this.picked ? "#ffffff" : "#ffffff88";
        ctx.strokeRect(x - 0.5, y - 0.5, 3 * TILE + 1, TILE + 1);
      }
    }
    if (this.picked === "head" || this.hovered === "head") {
      ctx.strokeStyle = this.picked === "head" ? "#ffffff" : "#ffffff88";
      ctx.strokeRect(L.desk.x * TILE - 0.5, L.desk.y * TILE - 0.5, 2 * TILE + 1, TILE + 1);
    }

    // chefs, back to front
    const all = [...this.chefs.values(), ...this.leaving, this.head, this.expo].sort((a, b) => a.y - b.y);
    for (const e of all) this.drawChef(ctx, e);
    D.desk(ctx, L.desk.x * TILE, L.desk.y * TILE);

    // plates on the pass, the final dish, steam, smoke and chopping bits
    const perRow = Math.max(1, Math.floor(((L.pass.x1 - L.pass.x0 + 1) * TILE - 28) / (DISH_W + 3)));
    this.plates.forEach((id, i) => {
      ctx.drawImage(dishSprite(this.dishOf(id)), L.pass.x0 * TILE + 16 + (i % perRow) * (DISH_W + 3), L.pass.y * TILE - 3 + Math.floor(i / perRow) * 5);
    });
    // the call bell on the pass; when the order is up: the cloche, sparkles on the bell, the call
    const bx = L.drop.x * TILE + 1;
    const by = L.pass.y * TILE - 6;
    const since = t - this.servedAt;
    const ringing = this.status === "served" && since < 8;
    D.dinger(ctx, bx + 18, by + 3, ringing, t);
    if (this.status === "served") {
      D.cloche(ctx, bx, by);
      D.sparkles(ctx, bx + 23, by + 4, t);
      if (ringing && Math.floor(t * 2) % 2 === 0) drawLabel(ctx, "ORDER UP!", bx + 14, by - 10);
    }
    for (const s of this.stations) {
      const slot = L.slots.get(s.id);
      if (!slot) continue;
      const x = slot.counter.x * TILE;
      const y = slot.counter.y * TILE;
      if (s.status === "cooking") D.steam(ctx, x + 5, y - 2, t + slot.counter.x);
      if (s.status === "burnt") D.smoke(ctx, x + 5, y - 2, t + slot.counter.x);
      const e = this.chefs.get(s.id);
      if (e && this.modeOf(e) === "chop" && e.frame % 2 === 1) D.chopBits(ctx, x + 2 * TILE, y + 1, t);
    }
    if (this.status === "plating") D.steam(ctx, L.drop.x * TILE + 6, L.pass.y * TILE - 2, t);

    // the gantry and heat lamps over the pass, above everyone walking by
    const railY = L.pass.y * TILE - 24;
    D.passGantry(ctx, L.pass.x0 * TILE, (L.pass.x1 + 1) * TILE, railY, L.pass.y * TILE);
    for (let x = L.pass.x0 + 1; x + 1 <= L.pass.x1; x += 4) D.heatLamp(ctx, x * TILE, railY, L.pass.y * TILE, lampsOn, t + x);

    // kitchen talk: a dotted line to whoever is being spoken to, then the words;
    // thought clouds over anyone working something out; icon bubbles; the hover label
    this.thoughtRects.clear();
    const headOf = (e: Entity) => ({ x: Math.round(e.x) + TILE / 2, y: Math.round(e.y) - (CHEF_H - TILE) - 2 });
    const byId = (id: string) => (id === "head" ? this.head : id === "expo" ? this.expo : this.chefs.get(id));
    for (const e of all) {
      const said = this.saying(e.id);
      if (!said?.to) continue;
      const other = byId(said.to);
      if (!other) continue;
      const a = headOf(e);
      const b = headOf(other);
      D.chatter(ctx, a.x, a.y + 6, b.x, b.y + 6, t);
    }
    // Speech bubbles stack upward instead of covering each other.
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    const overlaps = (a: { x: number; y: number; w: number; h: number }) => taken.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    for (const e of [...all].sort((a, b) => b.y - a.y)) {
      const said = this.saying(e.id);
      const h = headOf(e);
      if (said) {
        const text = clipWords(said.text);
        let tipY = h.y;
        let box = labelBox(text, h.x, tipY);
        for (let i = 0; i < 6 && overlaps(box); i++) {
          tipY -= box.h - 3;
          box = labelBox(text, h.x, tipY);
        }
        taken.push(box);
        drawLabel(ctx, text, h.x, tipY);
        continue;
      }
      if (this.thinking(e)) {
        const img = sprite(THOUGHT, BUBBLE_PALETTE);
        const bx = h.x - 3;
        const by = h.y - THOUGHT_H - 1;
        ctx.drawImage(img, bx, by);
        // three dots, the active one lifted
        const beat = Math.floor(t * 3) % 3;
        ctx.fillStyle = "#2b2520";
        for (let i = 0; i < 3; i++) ctx.fillRect(bx + 4 + i * 3, by + 4 - (beat === i ? 1 : 0), 1, 1);
        const hot = this.hovered === `thought:${e.id}`;
        if (hot) {
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(bx - 0.5, by - 0.5, THOUGHT_W + 1, 9 + 1);
        }
        this.thoughtRects.set(e.id, { x: bx, y: by, w: THOUGHT_W, h: THOUGHT_H });
        continue;
      }
      const kind = this.bubbleOf(e, this.modeOf(e));
      if (!kind) continue;
      const img = sprite(BUBBLES[kind], BUBBLE_PALETTE);
      ctx.drawImage(img, Math.round(e.x) + 4, Math.round(e.y) - 8 - CHEF_H + 10 - img.height + 2);
    }
    // "?" badges: by the token meter for a station, beside the head for the head chef and expediter.
    this.whyRects.clear();
    for (const [id, slot] of L.slots) {
      if (!this.showWhy(id)) continue;
      const x = slot.counter.x * TILE - 4;
      const y = slot.counter.y * TILE - 14;
      D.whyBadge(ctx, x, y, t + slot.index, this.hovered === `why:${id}`);
      this.whyRects.set(id, { x: x - 2, y: y - 2, w: 11, h: 14 });
    }
    for (const e of [this.head, this.expo]) {
      if (!this.showWhy(e.id)) continue;
      const x = Math.round(e.x) + TILE + 1;
      const y = Math.round(e.y) - (CHEF_H - TILE) + 2;
      D.whyBadge(ctx, x, y, t, this.hovered === `why:${e.id}`);
      this.whyRects.set(e.id, { x: x - 2, y: y - 2, w: 11, h: 14 });
    }
    const hoveredId = this.hovered?.startsWith("why:") ? null : this.hovered?.startsWith("thought:") ? this.hovered.slice(8) : this.hovered;
    const target = hoveredId ? all.find((e) => e.id === hoveredId) : undefined;
    if (target) {
      const h = headOf(target);
      const busy = this.saying(target.id) ? 12 : this.thinking(target) ? THOUGHT_H + 2 : this.bubbleOf(target, this.modeOf(target)) ? 14 : 0;
      drawLabel(ctx, this.statusWord(this.hovered!), h.x, h.y - busy);
    }
  }

  private drawChef(ctx: CanvasRenderingContext2D, e: Entity) {
    const mode = this.modeOf(e);
    const pal = chefPalette(e.hat, e.look);
    const x = Math.round(e.x);
    let y = Math.round(e.y) - (CHEF_H - TILE);
    let rows;
    let flip = false;
    if (mode === "stir") rows = CHEF_FRAMES.stir[e.frame % 4];
    else if (mode === "chop") rows = CHEF_FRAMES.chop[e.frame % 2];
    else if (mode === "write") rows = CHEF_FRAMES.write[e.frame % 2];
    else if (mode === "burnt") {
      rows = CHEF_FRAMES.burnt[0];
      if (e.frame % 2) ctx.translate(e.frame % 4 === 1 ? 1 : -1, 0);
    } else if (e.carrying && e.facing !== "up") {
      const set = e.facing === "down" ? CHEF_FRAMES.carryDown : CHEF_FRAMES.carrySide;
      flip = e.facing === "left";
      rows = mode === "walk" ? set[[0, 1, 0, 2][e.frame % 4]] : set[0];
    } else if (mode === "wait") {
      // Looking around while the prep comes in.
      const look = Math.floor(this.t * 0.6 + e.x / 7) % 4;
      flip = look === 3;
      rows = look === 1 || look === 3 ? CHEF_FRAMES.right[0] : CHEF_FRAMES.down[e.frame % 4 === 3 ? 2 : 0];
    } else {
      const set = e.facing === "up" ? CHEF_FRAMES.up : e.facing === "down" ? CHEF_FRAMES.down : CHEF_FRAMES.right;
      flip = e.facing === "left";
      rows = mode === "walk" ? set[e.frame % 4] : mode === "happy" ? set[e.frame % 2 ? 2 : 0] : set[0];
      if (mode === "happy" && e.frame % 2) y -= 2;
    }
    D.chefShadow(ctx, x, Math.round(e.y) + TILE - 2);
    if (e.id === this.picked || e.id === this.hovered) {
      ctx.fillStyle = e.id === this.picked ? "#ffffff99" : "#ffffff55";
      ctx.fillRect(x + 2, Math.round(e.y) + TILE - 1, 12, 1);
    }
    ctx.drawImage(sprite(rows, pal, flip), x, y);
    if (mode === "burnt") ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (e.carrying) {
      const dish = dishSprite(this.dishOf(e.id));
      if (e.facing === "down") ctx.drawImage(dish, x + 2, y + 12);
      else if (e.facing === "right") ctx.drawImage(dish, x + 9, y + 11);
      else if (e.facing === "left") ctx.drawImage(dish, x - 5, y + 11);
    }
  }
}

function entity(id: string, hat: string, look: Look, tile: Tile, facing: Facing): Entity {
  return { id, hat, look, x: tile.x * TILE, y: tile.y * TILE, tile, facing, path: [], tasks: [], waitLeft: 0, frame: 0, frameTimer: 0, carrying: false, happyUntil: 0, work: null, workUntil: 0, plateDue: false };
}

const slotsKey = (l: Layout) =>
  [...l.slots.values()]
    .map((s) => `${s.id}:${s.counter.x},${s.counter.y}`)
    .sort()
    .join(";");

function place(e: Entity, tile: Tile) {
  e.tile = tile;
  e.x = tile.x * TILE;
  e.y = tile.y * TILE;
  e.path = [];
  e.tasks = [];
}
