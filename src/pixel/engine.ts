// The kitchen as a tiny game: chefs that come in through the swing door, work
// their station (stir at the stove, chop at the board), carry plates to the
// pass and bubble when stuck, updated from the service state and drawn at
// native pixel resolution.

import { modelInfo } from "@/lib/brigade/models";
import type { ServiceState, StationState } from "@/lib/brigade/schemas";

import * as D from "./draw";
import { BUBBLES, BUBBLE_PALETTE, CHEF_FRAMES, CHEF_H, SENIOR_LOOK, TILE, chefPalette, drawLabel, lookFor, sprite, type Look } from "./sprites";
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
};

const WALK_SPEED = 56; // px per second
const WALK_FRAME = 0.12;
const WORK_FRAME = 0.3;
const DOOR_SWING = 1.1; // seconds the door stays open after someone comes through

export class KitchenWorld {
  layout: Layout;
  private chefs = new Map<string, Entity>();
  private head: Entity;
  private expo: Entity;
  private stations: StationState[] = [];
  private status: ServiceState["status"] | null = null;
  private prevStatus = new Map<string, string>();
  private plates: string[] = [];
  private t = 0;
  private doorOpenUntil = 0;
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

  focus(picked: string | null, hovered: string | null) {
    this.picked = picked;
    this.hovered = hovered;
  }

  /** One word for what someone is doing, for the hover label. */
  statusWord(id: string): string {
    if (id === "head") return this.status === "planning" ? "Planning" : this.status === "served" ? "Done" : this.status ? "Watching" : "Idle";
    if (id === "expo") return this.status === "plating" ? "Plating" : this.status === "served" ? "Served" : this.status === "failed" ? "Fire" : "Waiting";
    const e = this.chefs.get(id);
    const s = this.stations.find((x) => x.id === id);
    if (!e || !s) return "Idle";
    if (e.carrying) return "Serving";
    if (e.path.length > 0) return "Walking";
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

  private relayout(cols: number, rows: number) {
    this.layout = buildLayout(cols, rows, this.stations);
    place(this.head, this.layout.head);
    place(this.expo, this.layout.expo);
    for (const [id, chef] of this.chefs) {
      const slot = this.layout.slots.get(id);
      if (!slot) continue;
      chef.path = [];
      chef.tasks = [{ type: "goto", to: slot.chef }, { type: "do", fn: () => (chef.facing = "up") }];
      chef.carrying = false;
      chef.work = null;
      chef.workUntil = 0;
    }
  }

  /** Reads the service state: new chefs walk in, status changes become errands. */
  sync(state: ServiceState | null) {
    this.status = state?.status ?? null;
    this.stations = state?.stations ?? [];
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
      }
      chef.hat = modelInfo(s.model).hat;
      const was = this.prevStatus.get(s.id);
      this.prevStatus.set(s.id, s.status);
      if (s.status === "done" && was && was !== "done") {
        // Run the plate to the pass, then come back.
        const c = chef;
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
              if (!this.plates.includes(s.id)) this.plates.push(s.id);
            },
          },
          { type: "goto", to: slot.chef },
          {
            type: "do",
            fn: () => {
              c.facing = "down";
              c.happyUntil = this.t + 3;
            },
          },
        );
      } else if (was === "cooking" && s.status !== "cooking") {
        // Off the stove: back to the middle of the station.
        const c = chef;
        c.work = null;
        if (c.tasks.length === 0) c.tasks.push({ type: "goto", to: slot.chef }, { type: "do", fn: () => (c.facing = "down") });
      }
      if (s.status !== "done") this.plates = this.plates.filter((id) => id !== s.id);
    }
    for (const id of [...this.chefs.keys()]) if (!ids.has(id)) this.chefs.delete(id);
  }

  update(dt: number) {
    this.t += dt;
    for (const e of [...this.chefs.values(), this.head, this.expo]) this.step(e, dt);
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

  private bubbleOf(e: Entity, mode: Mode): keyof typeof BUBBLES | null {
    if (e.id === "head") return this.status === "planning" ? "pen" : this.status === "served" ? "check" : null;
    if (e.id === "expo") return this.status === "served" ? "bell" : this.status === "failed" ? "alert" : null;
    if (e.carrying) return null;
    if (mode === "wait") return "dots";
    if (mode === "burnt") return "alert";
    if (mode === "happy") return "check";
    return null;
  }

  /** What is under a point in native pixels: a station (by counter or chef), "head" or "expo". */
  hitTest(px: number, py: number): string | null {
    const L = this.layout;
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
    for (let y = WALL_ROWS; y < L.rows; y++) for (let x = 0; x < L.cols; x++) D.floorTile(ctx, x, y, y >= L.pass.y - 1);
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
    const lampsOn = this.status === "cooking" || this.status === "plating";
    for (let x = L.pass.x0 + 1; x + 1 <= L.pass.x1; x += 4) D.heatLamp(ctx, x * TILE, L.pass.y * TILE - 14, lampsOn, t + x);
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
    const all = [...this.chefs.values(), this.head, this.expo].sort((a, b) => a.y - b.y);
    for (const e of all) this.drawChef(ctx, e);
    D.desk(ctx, L.desk.x * TILE, L.desk.y * TILE);

    // plates on the pass, the final dish, steam, smoke and chopping bits
    const perRow = Math.floor(((L.pass.x1 - L.pass.x0 + 1) * TILE - 24) / 14);
    this.plates.forEach((id, i) => {
      const s = this.stations.find((x) => x.id === id);
      if (!s) return;
      D.plate(ctx, L.pass.x0 * TILE + 16 + (i % perRow) * 14, L.pass.y * TILE + 1 + Math.floor(i / perRow) * 4, modelInfo(s.model).hat);
    });
    if (this.status === "served") D.cloche(ctx, L.drop.x * TILE + 1, L.pass.y * TILE - 6);
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

    // bubbles, then the one-word label over whoever is hovered
    for (const e of all) {
      const kind = this.bubbleOf(e, this.modeOf(e));
      if (!kind) continue;
      const img = sprite(BUBBLES[kind], BUBBLE_PALETTE);
      ctx.drawImage(img, Math.round(e.x) + 4, Math.round(e.y) - 8 - CHEF_H + 10 - img.height + 2);
    }
    const target = this.hovered ? all.find((e) => e.id === this.hovered) : undefined;
    if (target) {
      const hasBubble = !!this.bubbleOf(target, this.modeOf(target));
      const headY = Math.round(target.y) - (CHEF_H - TILE) - 2 - (hasBubble ? 14 : 0);
      drawLabel(ctx, this.statusWord(target.id), Math.round(target.x) + TILE / 2, headY);
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
      const s = this.stations.find((st) => st.id === e.id);
      const color = s ? modelInfo(s.model).hat : "#e9c46a";
      if (e.facing === "down") D.plate(ctx, x + 3, y + 17, color);
      else if (e.facing === "right") D.plate(ctx, x + 10, y + 16, color);
      else if (e.facing === "left") D.plate(ctx, x - 4, y + 16, color);
    }
  }
}

function entity(id: string, hat: string, look: Look, tile: Tile, facing: Facing): Entity {
  return { id, hat, look, x: tile.x * TILE, y: tile.y * TILE, tile, facing, path: [], tasks: [], waitLeft: 0, frame: 0, frameTimer: 0, carrying: false, happyUntil: 0, work: null, workUntil: 0 };
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
