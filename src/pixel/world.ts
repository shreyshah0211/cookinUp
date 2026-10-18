// The kitchen map in tiles, built for whatever size the pane gives it: a
// swing door in the back wall, the head chef's desk at the top, a fixed 3x3
// grid of stations filling the room, decor along the walls, and the pass
// across the bottom. Also which tiles block, and a BFS path.

import type { StationState } from "@/lib/brigade/schemas";

export const WALL_ROWS = 3;
export const MIN_COLS = 20;
export const GRID = { cols: 3, rows: 3 };
/** First counter row; above it: the head chef (row 3), the desk (4), a walkway (5). */
const FIRST_TIER_ROW = 6;
const TIER_ROWS = 3;

export type Tile = { x: number; y: number };
export type Spot = {
  index: number;
  /** Left tile of the 3-wide counter: stove, counter, board. */
  counter: Tile;
  /** Where the chef stands, in front of the counter, and the two work tiles. */
  chef: Tile;
  stove: Tile;
  board: Tile;
};
export type StationSlot = Spot & { id: string };
export type DecorKind = "crate" | "sack" | "trolley" | "mop" | "plant" | "plant2";
export type Decor = { kind: DecorKind; tile: Tile };

export type Layout = {
  cols: number;
  rows: number;
  head: Tile;
  /** Left tile of the two-wide desk. */
  desk: Tile;
  /** The swing door in the back wall (left tile of two), and the floor tile below it where chefs appear. */
  doorWall: Tile;
  door: Tile;
  fridge: Tile;
  sink: Tile;
  bin: Tile;
  decor: Decor[];
  /** The pass: one row, from x0 to x1 inclusive. */
  pass: { y: number; x0: number; x1: number };
  /** Where a chef stands to put a plate on the pass. */
  drop: Tile;
  expo: Tile;
  /** All nine stations, assigned or not. */
  spots: Spot[];
  /** The stations in service, by id. */
  slots: Map<string, StationSlot>;
  blocked: Set<string>;
};

export const key = (t: Tile) => `${t.x},${t.y}`;

/** Stations in course order: everything a station needs comes earlier, so upstream work sits higher in the room. */
export function courseOrder(stations: StationState[]): StationState[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const d = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const s = byId.get(id);
    const v = !s || s.depends_on.length === 0 ? 0 : 1 + Math.max(...s.depends_on.map((p) => d(p, seen)));
    depth.set(id, v);
    return v;
  };
  return stations.map((s, i) => ({ s, i, c: d(s.id) })).sort((a, b) => a.c - b.c || a.i - b.i).map((x) => x.s);
}

/** Rows the room needs: head zone, three tiers, a walkway, the pass, the expediter, a margin. */
export const rowsNeeded = () => FIRST_TIER_ROW + GRID.rows * TIER_ROWS + 4;
export const colsNeeded = () => Math.max(MIN_COLS, GRID.cols * 5 + 2);

export function buildLayout(cols: number, rows: number, stations: StationState[]): Layout {
  const cx = Math.floor(cols / 2);
  const passY = rows - 3;
  // Three tiers spread between the head chef and the pass, leaving a clear row of floor above the pass.
  const pitch = Math.min(7, Math.max(TIER_ROWS, Math.floor((passY - 4 - FIRST_TIER_ROW) / (GRID.rows - 1))));
  const colW = (cols - 2) / GRID.cols;
  const spots: Spot[] = [];
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const x = 1 + Math.floor(c * colW + (colW - 3) / 2);
      const y = FIRST_TIER_ROW + r * pitch;
      spots.push({ index: spots.length, counter: { x, y }, chef: { x: x + 1, y: y + 1 }, stove: { x, y: y + 1 }, board: { x: x + 2, y: y + 1 } });
    }
  }
  const slots = new Map<string, StationSlot>();
  courseOrder(stations)
    .slice(0, spots.length)
    .forEach((s, i) => slots.set(s.id, { ...spots[i], id: s.id }));
  // Odds and ends along the side walls, never in a walkway between stations.
  const decor: Decor[] = [
    { kind: "plant", tile: { x: 0, y: 3 } },
    { kind: "crate", tile: { x: 0, y: FIRST_TIER_ROW } },
    { kind: "sack", tile: { x: 0, y: FIRST_TIER_ROW + 1 } },
    { kind: "mop", tile: { x: 0, y: FIRST_TIER_ROW + pitch + 1 } },
    { kind: "plant2", tile: { x: 0, y: passY } },
    { kind: "trolley", tile: { x: cols - 1, y: FIRST_TIER_ROW + 1 } },
    { kind: "crate", tile: { x: cols - 1, y: FIRST_TIER_ROW + pitch } },
    { kind: "plant2", tile: { x: cols - 1, y: FIRST_TIER_ROW + 2 * pitch + 1 } },
    { kind: "plant", tile: { x: cols - 1, y: rows - 1 } },
  ];
  const layout: Layout = {
    cols,
    rows,
    head: { x: cx - 1, y: 3 },
    desk: { x: cx - 1, y: 4 },
    doorWall: { x: 2, y: 1 },
    door: { x: 2, y: 3 },
    fridge: { x: cols - 1, y: 2 },
    sink: { x: cols - 1, y: passY },
    bin: { x: cols - 2, y: passY },
    decor,
    pass: { y: passY, x0: 3, x1: cols - 4 },
    drop: { x: cx, y: passY - 1 },
    expo: { x: cx, y: passY + 1 },
    spots,
    slots,
    blocked: new Set(),
  };
  const block = (x: number, y: number) => layout.blocked.add(`${x},${y}`);
  for (let x = 0; x < cols; x++) for (let y = 0; y < WALL_ROWS; y++) block(x, y);
  // the counter, plus the beacon post beside it
  for (const s of spots) for (let i = 0; i < 4; i++) block(s.counter.x + i, s.counter.y);
  for (let x = layout.pass.x0; x <= layout.pass.x1; x++) block(x, passY);
  block(layout.desk.x, layout.desk.y);
  block(layout.desk.x + 1, layout.desk.y);
  // Nobody walks through the head chef.
  block(layout.head.x, layout.head.y);
  block(layout.fridge.x, layout.fridge.y + 1);
  block(layout.sink.x, layout.sink.y);
  block(layout.bin.x, layout.bin.y);
  for (const d of decor) block(d.tile.x, d.tile.y);
  return layout;
}

/** Shortest 4-way path between tiles over the free floor, excluding the start tile. */
export function findPath(from: Tile, to: Tile, layout: Layout): Tile[] {
  if (from.x === to.x && from.y === to.y) return [];
  const free = (t: Tile) => t.x >= 0 && t.x < layout.cols && t.y >= WALL_ROWS && t.y < layout.rows && (!layout.blocked.has(key(t)) || key(t) === key(to));
  const prev = new Map<string, string | null>([[key(from), null]]);
  const queue: Tile[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (!free(n) || prev.has(key(n))) continue;
      prev.set(key(n), key(cur));
      queue.push(n);
    }
  }
  if (!prev.has(key(to))) return [to];
  const path: Tile[] = [];
  let k: string | null = key(to);
  while (k && k !== key(from)) {
    const [x, y] = k.split(",").map(Number);
    path.unshift({ x, y });
    k = prev.get(k) ?? null;
  }
  return path;
}
