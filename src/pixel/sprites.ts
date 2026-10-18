// Pixel art as text: one string per row, one character per pixel, mapped to
// a palette. Sprites are baked to offscreen canvases and cached.

export type Palette = Record<string, string>;
export type Rows = string[];

export const TILE = 16;
export const CHEF_W = 16;
export const CHEF_H = 24;

// Chef frames, 16x24. `h`/`L`/`H` toque and its light/dark pleats, `a`/`A` apron,
// `n` neckerchief: the hired model's colour. Skin `s`/`S`, hair `d`/`D` vary per chef.
const DOWN_IDLE: Rows = [
  "....kkkkkkkk....",
  "...kLLhhhhhhk...",
  "..kLhhhhhhhhHk..",
  "..kLhhhHhhhhHk..",
  "..khhhhhhhhHHk..",
  "...kHHHHHHHHk...",
  "...kLhhhhhhHk...",
  "...kkkkkkkkkk...",
  "...kdddsssddk...",
  "...kdwessewdk...",
  "...kssssNsssk...",
  "...ksRssssRsk...",
  "....kSSmmSSk....",
  "..kkkkjnnjkkkk..",
  ".kJjjjjknnkjjjJk",
  ".kJjjjjkjnkjjjJk",
  ".kJjjjaaaaaajjJk",
  ".kssjaaaaaaaajsk",
  "..kkaaaaaaaaakk.",
  "...kaaaaaaaaak..",
  "...kAaakkkaaAk..",
  "...kppppkppppk..",
  "...kpPppkppPpk..",
  "...kbbbBkbbbBk..",
];

const UP_IDLE: Rows = [
  "....kkkkkkkk....",
  "...kLLhhhhhhk...",
  "..kLhhhhhhhhHk..",
  "..kLhhhHhhhhHk..",
  "..khhhhhhhhHHk..",
  "...kHHHHHHHHk...",
  "...kLhhhhhhHk...",
  "...kkkkkkkkkk...",
  "...kddddddddk...",
  "...kdddddddDk...",
  "...kDddddddDk...",
  "....kdddddDk....",
  ".....kSSSSk.....",
  "..kkkkjjjjkkkk..",
  ".kJjjjjjjjjjjjk.",
  ".kJjjjjjjjjjjjk.",
  ".kJjjjjjkkjjjjjk",
  ".ksjjjjjkkjjjjsk",
  "..kkjjjjjjjjjkk.",
  "...kjjjjjjjjjk..",
  "...kJJJJJJJJJk..",
  "...kppppkppppk..",
  "...kpPppkppPpk..",
  "...kbbbBkbbbBk..",
];

// Facing right; left is the mirror.
const SIDE_IDLE: Rows = [
  "....kkkkkkkk....",
  "...kLLhhhhhhk...",
  "..kLhhhhhhhhHk..",
  "..kLhhhHhhhhHk..",
  "..khhhhhhhhHHk..",
  "...kHHHHHHHHk...",
  "...kLhhhhhhHk...",
  "...kkkkkkkkkk...",
  "...kdddsssssk...",
  "...kdSdssswesk..",
  "...kdSdSsssNk...",
  "....kddssRssk...",
  ".....kSSSSmk....",
  "...kkkjjjjkkk...",
  "...kJjjjjjjkk...",
  "...kJjjkjjjjk...",
  "...kJjjkaaaak...",
  "...kjjskaaaak...",
  "....kkkaaaak....",
  "....kaaaaaak....",
  "....kAAAAAAk....",
  "....kppppppk....",
  "....kpPpppPk....",
  "....kbbbBbbk....",
];

const shiftUp = (rows: Rows): Rows => [...rows.slice(1), ".".repeat(CHEF_W)];
const withRows = (rows: Rows, edits: Record<number, string>): Rows => rows.map((row, i) => edits[i] ?? row);

// Walking: feet apart, then a bob, with the arms swinging on the side view.
const DOWN_STEP = withRows(DOWN_IDLE, { 22: "...kppppkppppk..", 23: "..kbbbbk..kbbbbk" });
const UP_STEP = withRows(UP_IDLE, { 22: "...kppppkppppk..", 23: "..kbbbbk..kbbbbk" });
const SIDE_STEP = withRows(SIDE_IDLE, { 16: "...kJjskaaaak...", 17: "...kjjjkaaaask..", 22: "....kppppppk....", 23: "...kbbbk..kbbbk." });

// Stirring at the stove, from behind: hands on the counter, then a lid lifted high.
const STIR1 = withRows(UP_IDLE, { 14: "skJjjjjjjjjjjjks", 15: "kkJjjjjjjjjjjjkk", 17: ".kkjjjjjkkjjjjkk" });
const STIR2 = withRows(UP_IDLE, { 13: "skkkkkjjjjkkkkks", 14: "kkJjjjjjjjjjjjkk", 15: ".kJjjjjjjjjjjjk.", 17: ".kkjjjjjkkjjjjkk" });
const STIR3 = withRows(UP_IDLE, { 12: ".....kSSSSk...s.", 13: "..kkkkjjjjkkkksk", 14: "skJjjjjjjjjjjjk.", 15: "kkJjjjjjjjjjjjk.", 17: ".kkjjjjjkkjjjjkk" });
// Chopping at the board: knife up, knife down.
const CHOP_UP = withRows(UP_IDLE, { 11: "....kdddddDk..w.", 12: ".....kSSSSk..ws.", 13: "..kkkkjjjjkkkksk", 14: ".kJjjjjjjjjjjjkk", 17: ".ksjjjjjkkjjjjkk" });
const CHOP_DOWN = withRows(UP_IDLE, { 14: ".kJjjjjjjjjjjjks", 15: ".kJjjjjjjjjjjjkw", 17: ".ksjjjjjkkjjjjkk" });
// Carrying a plate in front (the plate is drawn separately).
const CARRY_DOWN = withRows(DOWN_IDLE, { 17: ".kjjjassssaajjjk" });
const CARRY_SIDE = withRows(SIDE_IDLE, { 16: "...kJjjkaaaask..", 17: "...kjjjkaaaassk." });
// Hands on head: the dish burnt.
const BURNT = withRows(DOWN_IDLE, { 12: ".s..kSSmmSSk..s.", 13: ".kskkkjnnjkkksk.", 17: ".kjjaaaaaaaaajjk" });
// Writing the menu, facing the room: one hand up with a pencil.
const WRITE1 = withRows(DOWN_IDLE, { 16: ".kjjjjaaaaaajjsk", 17: ".ksjjaaaaaaaakwk" });
const WRITE2 = withRows(DOWN_IDLE, { 15: ".kjjjjjkjjkjjjsk", 16: ".kjjjjaaaaaajkwk", 17: ".ksjjaaaaaaaajjk" });

export const CHEF_FRAMES = {
  down: [DOWN_IDLE, DOWN_STEP, shiftUp(DOWN_IDLE), DOWN_STEP],
  up: [UP_IDLE, UP_STEP, shiftUp(UP_IDLE), UP_STEP],
  right: [SIDE_IDLE, SIDE_STEP, shiftUp(SIDE_IDLE), SIDE_STEP],
  stir: [STIR1, STIR2, STIR1, STIR3],
  chop: [CHOP_UP, CHOP_DOWN],
  carryDown: [CARRY_DOWN, withRows(CARRY_DOWN, { 22: "...kppppkppppk..", 23: "..kbbbbk..kbbbbk" }), shiftUp(CARRY_DOWN)],
  carrySide: [CARRY_SIDE, withRows(CARRY_SIDE, { 22: "....kppppppk....", 23: "...kbbbk..kbbbk." }), shiftUp(CARRY_SIDE)],
  burnt: [BURNT],
  write: [WRITE1, WRITE2],
} as const;

/** Who the chef is under the hat: skin and hair, picked per chef. */
export type Look = { skin: string; skinShade: string; hair: string; hairShade: string; blush: string };

const SKINS: [string, string, string][] = [
  ["#f1c9a5", "#d9a06f", "#e9a79c"],
  ["#e3b088", "#c08457", "#d9907f"],
  ["#c48a5a", "#9c6538", "#b87560"],
  ["#8d5a3b", "#6b4028", "#8d5a3b"],
  ["#5c3a26", "#3f2719", "#5c3a26"],
];
const HAIRS: [string, string][] = [
  ["#4a3426", "#3a2719"],
  ["#22181a", "#120c0e"],
  ["#c89b4a", "#a67c2e"],
  ["#a44a2a", "#7d3419"],
  ["#6b4b3a", "#4e3528"],
  ["#2f2a4a", "#1f1b33"],
];

/** A stable look for an id: the same chef always gets the same face. */
export function lookFor(id: string): Look {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[Math.floor(h / 7) % HAIRS.length];
  return { skin: skin[0], skinShade: skin[1], blush: skin[2], hair: hair[0], hairShade: hair[1] };
}
export const SENIOR_LOOK: Look = { skin: "#e3b088", skinShade: "#c08457", blush: "#d9907f", hair: "#9a9a9a", hairShade: "#777777" };

export function chefPalette(hat: string, look: Look = lookFor("chef")): Palette {
  return {
    ".": "",
    k: "#2b2520",
    h: hat,
    L: shade(hat, 30),
    H: shade(hat, -34),
    n: hat,
    a: hat,
    A: shade(hat, -34),
    s: look.skin,
    S: look.skinShade,
    N: look.skinShade,
    R: look.blush,
    m: "#5a2f2a",
    e: "#2b2520",
    d: look.hair,
    D: look.hairShade,
    j: "#f6f3ec",
    J: "#d8d2c6",
    p: "#3b3340",
    P: "#4a4152",
    b: "#1f1b22",
    B: "#3a343f",
    w: "#ffffff",
  };
}

// Speech bubbles, 11x13 with a tail, in the pixel-agents spirit.
const BUBBLE_BOX = (body: Rows): Rows => [
  "_BBBBBBBBB_",
  ...body.map((r) => `B${r}B`),
  "_BBBBBBBBB_",
  "____BBB____",
  "____BF_____",
  "____B______",
];
export const BUBBLES: Record<string, Rows> = {
  dots: BUBBLE_BOX(["FFFFFFFFF", "FFFFFFFFF", "FFFFFFFFF", "FKFFKFFKF", "FKFFKFFKF", "FFFFFFFFF", "FFFFFFFFF", "FFFFFFFFF"]),
  check: BUBBLE_BOX(["FFFFFFFFF", "FFFFFFFGF", "FFFFFFGFF", "FFGFFGFFF", "FFFGGFFFF", "FFFFGFFFF", "FFFFFFFFF", "FFFFFFFFF"]),
  alert: BUBBLE_BOX(["FFFFRFFFF", "FFFFRFFFF", "FFFFRFFFF", "FFFFRFFFF", "FFFFRFFFF", "FFFFFFFFF", "FFFFRFFFF", "FFFFFFFFF"]),
  bell: BUBBLE_BOX(["FFFFYFFFF", "FFFYYYFFF", "FFYYYYYFF", "FFYYYYYFF", "FFYYYYYFF", "FYYYYYYYF", "FFFFKFFFF", "FFFFFFFFF"]),
  pen: BUBBLE_BOX(["FFFFFFFFF", "FFFFFFKKF", "FFFFFKKKF", "FFFFKKKFF", "FFFKKKFFF", "FFKKKFFFF", "FKKFFFFFF", "FFFFFFFFF"]),
  zzz: BUBBLE_BOX(["FFFFFFFFF", "FFFFFKKKF", "FFFFFFKFF", "FFFFFKKKF", "FKKKFFFFF", "FFKFFFFFF", "FKKKFFFFF", "FFFFFFFFF"]),
};
/** A thought cloud, 15x13 with two trailing puffs; the dots are drawn live so they can move. */
export const THOUGHT: Rows = [
  "___BBBBBBBBB___",
  "__BFFFFFFFFFB__",
  "_BFFFFFFFFFFFB_",
  "BFFFFFFFFFFFFFB",
  "BFFFFFFFFFFFFFB",
  "BFFFFFFFFFFFFFB",
  "_BFFFFFFFFFFFB_",
  "__BFFFFFFFFFB__",
  "___BBBBBBBBB___",
  "____BBB________",
  "____BFB________",
  "____BBB________",
  "______B________",
];
export const THOUGHT_W = 15;
export const THOUGHT_H = 13;

export const BUBBLE_PALETTE: Palette = { _: "", B: "#2b2520", F: "#fffdf5", K: "#2b2520", G: "#2a9d8f", R: "#e76f51", Y: "#e9c46a", W: "#ffffff" };

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amount));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Bakes rows + palette into a canvas (cached by content), optionally mirrored. */
export function sprite(rows: Rows, palette: Palette, flip = false): HTMLCanvasElement {
  const key = rows.join("|") + JSON.stringify(palette) + (flip ? "f" : "");
  const hit = cache.get(key);
  if (hit) return hit;
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`sprite row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

// A 3x5 pixel font, capitals and a few marks, for labels drawn in the scene.
const GLYPHS: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "/": ["001", "001", "010", "100", "100"],
  " ": ["000", "000", "000", "000", "000"],
  "!": ["010", "010", "010", "000", "010"],
  "?": ["110", "001", "010", "000", "010"],
  ".": ["000", "000", "000", "000", "010"],
  ",": ["000", "000", "000", "010", "100"],
  ":": ["000", "010", "000", "010", "000"],
  "'": ["010", "010", "000", "000", "000"],
  '"': ["101", "101", "000", "000", "000"],
  "…": ["000", "000", "000", "000", "101"],
  "-": ["000", "000", "111", "000", "000"],
  "&": ["010", "101", "010", "101", "011"],
  "(": ["001", "010", "010", "010", "001"],
  ")": ["100", "010", "010", "010", "100"],
  "%": ["101", "001", "010", "100", "101"],
  "+": ["000", "010", "111", "010", "000"],
  "=": ["000", "111", "000", "111", "000"],
};

export const FONT_H = 5;
export const textWidth = (text: string) => text.length * 4 - 1;

/** Draws `text` in the pixel font at native resolution; unknown characters become a dot. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  // Typographic quotes and dashes come back from the models; the font has the plain ones.
  const plain = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");
  [...plain.toUpperCase()].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    g.forEach((row, gy) => {
      for (let gx = 0; gx < 3; gx++) if (row[gx] === "1") ctx.fillRect(x + i * 4 + gx, y + gy, 1, 1);
    });
  });
}

/** The box a label will take, tail included, for keeping bubbles apart. */
export function labelBox(text: string, tipX: number, tipY: number) {
  const lines = text.split("\n");
  const w = Math.max(...lines.map(textWidth)) + 6;
  const h = lines.length * (FONT_H + 2) - 2 + 6;
  return { x: Math.round(tipX - w / 2) - 1, y: tipY - h - 4, w: w + 2, h: h + 5 };
}

/** A pixel label bubble with a tail at the bottom centre, anchored by the tail's tip. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, tipX: number, tipY: number) {
  const lines = text.split("\n");
  const w = Math.max(...lines.map(textWidth)) + 6;
  const h = lines.length * (FONT_H + 2) - 2 + 6;
  const x = Math.round(tipX - w / 2);
  const y = tipY - h - 3;
  ctx.fillStyle = "#2b2520";
  ctx.fillRect(x - 1, y, w + 2, h);
  ctx.fillRect(x, y - 1, w, h + 2);
  ctx.fillRect(Math.round(tipX) - 2, y + h, 5, 1);
  ctx.fillRect(Math.round(tipX) - 1, y + h + 1, 3, 1);
  ctx.fillRect(Math.round(tipX), y + h + 2, 1, 1);
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(x, y, w, h);
  ctx.fillRect(Math.round(tipX) - 1, y + h, 3, 1);
  ctx.fillRect(Math.round(tipX), y + h + 1, 1, 1);
  lines.forEach((line, i) => drawText(ctx, line, x + 3, y + 3 + i * (FONT_H + 2), "#2b2520"));
}

// Plants, 16x20: outline `k`, three leaf shades, pot with rim, soil.
const PLANT_PALETTE: Palette = { ".": "", k: "#2b2520", g: "#3d8b4a", G: "#2f6f3a", l: "#6cc27a", y: "#e9c46a", p: "#b8603a", P: "#8a4428", r: "#d47a4e", s: "#4a3222", w: "#ffffff" };
export const PLANTS: Rows[] = [
  // a bushy fern
  [
    "................",
    "......kk..kk....",
    "..kk.kggkkggk...",
    ".kggkkglgkglgk..",
    ".kglgkgggkgggk..",
    "..kggkkgkkgkk...",
    "...kggkggkgk....",
    "..kkglgggglgkk..",
    ".kgggkggggkgggk.",
    ".kGggGkggkGggGk.",
    "..kGGGkGGkGGGk..",
    "...kkkkkkkkkk...",
    "...krrrrrrrrk...",
    "...kppppppppk...",
    "....kpwppppk....",
    "....kppppPpk....",
    "....kppppPpk....",
    ".....kPPPPk.....",
    "......kkkk......",
    "................",
  ],
  // a monstera with broad split leaves
  [
    "................",
    "..kkk......kkk..",
    ".kgggk....kgggk.",
    ".kglggk..kgglgk.",
    "..kgggkkkkgggk..",
    "...kggkgkkggk...",
    "....kkkglgkk....",
    "..kkkkkggkkkkk..",
    ".kgglgkgggkglggk",
    ".kggggkGGkggggk.",
    "..kGGGkkkkGGGk..",
    "...kkk.kk.kkk...",
    "...krrrrrrrrk...",
    "...kppppppppk...",
    "....kpwppppk....",
    "....kppppPpk....",
    "....kppppPpk....",
    ".....kPPPPk.....",
    "......kkkk......",
    "................",
  ],
  // a tall snake plant with yellow edges
  [
    "......k..k......",
    ".....kgkkgk.....",
    ".....kgkkgk.....",
    "..k..kykkyk..k..",
    ".kgk.kgkkgk.kgk.",
    ".kgkkkgkkgkkkgk.",
    ".kykgkgkkgkgkyk.",
    ".kgkgkykkykgkgk.",
    ".kgkgkgkkgkgkgk.",
    "..kgkgkkkkgkgk..",
    "..kGkGGkkGGkGk..",
    "...kkkkkkkkkk...",
    "...krrrrrrrrk...",
    "...kppppppppk...",
    "....kpwppppk....",
    "....kppppPpk....",
    "....kppppPpk....",
    ".....kPPPPk.....",
    "......kkkk......",
    "................",
  ],
];
export const plantSprite = (variant: number) => sprite(PLANTS[variant % PLANTS.length], PLANT_PALETTE);

// A round wall clock face, 15x15: rim, white dial, tick marks. Hands are drawn live.
const CLOCK_FACE: Rows = [
  ".....kkkkk.....",
  "...kkrrrrrkk...",
  "..krrrwkwrrrk..",
  ".krrwwwwwwwrrk.",
  ".krwwwwwwwwwrk.",
  "krwwwwwwwwwwwrk",
  "krkwwwwwwwwwkrk",
  "krwwwwwwkwwwwrk",
  "krkwwwwwwwwwkrk",
  "krwwwwwwwwwwwrk",
  ".krwwwwwwwwwrk.",
  ".krrwwwwwwwrrk.",
  "..krrrwkwrrrk..",
  "...kkrrrrrkk...",
  ".....kkkkk.....",
];
export const clockFace = () => sprite(CLOCK_FACE, { ".": "", k: "#2b2520", r: "#b8603a", w: "#fffdf5" });

// The station lamp: a brass lantern on a slender post. The glass is left
// transparent and filled with the station's colour when drawn.
const LAMP: Rows = [
  "....k....",
  "...kBk...",
  "..kbbbk..",
  ".kbBbbbk.",
  "kkkkkkkkk",
  "kb.....bk",
  "kb.....bk",
  "kb.....bk",
  "kb.....bk",
  "kb.....bk",
  "kkkkkkkkk",
  "..kbBbk..",
  "...kbk...",
  "...kbk...",
  "...kbk...",
  "...kbk...",
  "..kbBbk..",
  ".kbbbbbk.",
  "kkkkkkkkk",
];
const BRASS: Palette = { ".": "", k: "#2b2520", b: "#b8893a", B: "#e9c46a" };
export const lampSprite = () => sprite(LAMP, BRASS);
/** Where the lamp's glass sits inside the sprite. */
export const LAMP_GLASS = { x: 2, y: 5, w: 5, h: 5 };

// The call bell on the pass, 10x8.
const DINGER: Rows = [
  "....kk....",
  "...kBBk...",
  "..kbbbbk..",
  ".kbBBBBbk.",
  "kbbbbbbbbk",
  "kbbbbbbbbk",
  "kkkkkkkkkk",
  ".kddddddk.",
];
export const dingerSprite = () => sprite(DINGER, { ...BRASS, d: "#4b525b" });

// Dishes on a plate, 12x9 each. A station always serves the same dish.
const DISH_PALETTE: Palette = {
  ".": "", k: "#2b2520", w: "#fffdf5", W: "#d8d2c6", b: "#c98a4b", B: "#a66a32", r: "#e76f51", R: "#b84b33", g: "#5aa866", G: "#2f6f3a",
  y: "#e9c46a", Y: "#c7a24a", o: "#f4a261", p: "#f28482", c: "#f6f3ec", n: "#4a3222", s: "#e9dcc6", t: "#b03a2e", m: "#8d5a3b",
};
const DISHES: Rows[] = [
  // burger
  ["....bbbb....", "...bbbbbbb..", "...kyykyyk..", "..ggggggggg.", "..rrrrrrrrr.", "...bbbbbbb..", ".kwwwwwwwwk.", "kWWWWWWWWWWk", ".kkkkkkkkkk."],
  // ramen bowl
  ["....ssss....", "..rrkyyrpp..", ".kwwwwwwwwk.", ".kwyyyyyywk.", ".kwwwwwwwwk.", "..krrrrrrk..", "...kkkkkk...", ".kWWWWWWWWk.", ".kkkkkkkkkk."],
  // salad
  ["............", "...ggrgg....", "..gGgggGgg..", ".ggrggGgggr.", ".kwwwwwwwwk.", "kWWWWWWWWWWk", ".kkkkkkkkkk.", "............", "............"],
  // pizza slice
  ["............", ".....yk.....", "....yryk....", "...yyyryk...", "..yryyyyyk..", ".yyyyryyyyk.", "bbbbbbbbbbb.", ".kwwwwwwwwk.", ".kkkkkkkkkk."],
  // steak and greens
  ["............", "..mmmm..gg..", ".mRRRmm.ggg.", ".mRRRRm.ggg.", "..mmmm..gg..", ".kwwwwwwwwk.", "kWWWWWWWWWWk", ".kkkkkkkkkk.", "............"],
  // cake slice
  ["............", ".....pp.....", "....kppk....", "...kcccck...", "...krrrrk...", "..kcccccck..", "..krrrrrrk..", ".kwwwwwwwwk.", ".kkkkkkkkkk."],
  // sushi
  ["............", "............", ".kk..kk..kk.", "krrkkooktkk.", "kccckcccktck", "kkkkkkkkkkkk", ".kWWWWWWWWk.", ".kkkkkkkkkk.", "............"],
  // pasta
  ["............", "...yyyyyy...", "..yyrryyyy..", ".yyyyyyrryy.", ".yryyyyyyyy.", ".kwwwwwwwwk.", "kWWWWWWWWWWk", ".kkkkkkkkkk.", "............"],
];
export const DISH_W = 12;
export const DISH_H = 9;
export const dishSprite = (n: number) => sprite(DISHES[((n % DISHES.length) + DISHES.length) % DISHES.length], DISH_PALETTE);
/** Which dish a station serves: stable per id. */
export function dishFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h % DISHES.length;
}
