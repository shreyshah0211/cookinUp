// Furniture and floor, drawn as pixel rectangles at native resolution.

import { DECOR } from "./decor";
import { TILE, clockFace, drawText, plantSprite } from "./sprites";

type Ctx = CanvasRenderingContext2D;

const R = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

export const C = {
  outside: "#151a26",
  wallTop: "#46506e",
  wall: "#2f3650",
  tile: "#3a4262",
  tileLight: "#434c6e",
  grout: "#283049",
  baseboard: "#1f2538",
  floorA: "#e4cfa6",
  floorB: "#d9c196",
  floorC: "#cfb58a",
  floorHi: "#efdfbd",
  floorGrout: "#b89c73",
  checkA: "#efece4",
  checkB: "#2d2f38",
  steelTop: "#b4bcc5",
  steelHi: "#d9dee3",
  steel: "#7f8993",
  steelDark: "#4b525b",
  steelLine: "#636c76",
  stove: "#3a3f47",
  stoveDark: "#23262c",
  burner: "#15171b",
  flame: "#ff6a2a",
  flameHot: "#ffd166",
  knob: "#c9ced4",
  wood: "#b07a46",
  woodHi: "#c89359",
  woodDark: "#7d5230",
  woodLine: "#4a3018",
  outline: "#2b2520",
  white: "#fffdf5",
  leaf: "#3d8b4a",
  leafHi: "#5aa866",
  leafDark: "#2f6f3a",
  pot: "#a35a3a",
  glass: "#9fd3e8",
  sky: "#7fb8e6",
  skyHi: "#bfe0f7",
  chalk: "#223027",
  smoke: "#5b5b63",
  steam: "#ffffff",
  shadow: "rgba(20,16,12,0.28)",
};

export function floorTile(ctx: Ctx, tx: number, ty: number, checker: boolean) {
  const x = tx * TILE;
  const y = ty * TILE;
  if (checker) {
    R(ctx, x, y, TILE, TILE, (tx + ty) % 2 ? C.checkB : C.checkA);
    if ((tx + ty) % 2 === 0) R(ctx, x, y, TILE, 1, "#ffffff");
    return;
  }
  const v = (tx * 7 + ty * 13) % 11;
  R(ctx, x, y, TILE, TILE, v === 0 ? C.floorC : v % 2 ? C.floorB : C.floorA);
  R(ctx, x, y, TILE, 1, C.floorHi);
  R(ctx, x, y, 1, TILE, C.floorHi);
  R(ctx, x + TILE - 1, y, 1, TILE, C.floorGrout);
  R(ctx, x, y + TILE - 1, TILE, 1, C.floorGrout);
  if (v === 5) R(ctx, x + 6, y + 9, 3, 1, C.floorC);
}

/** The back wall: a lit top band, a tiled backsplash, and a baseboard where it meets the floor. */
export function wall(ctx: Ctx, cols: number, rows: number) {
  const w = cols * TILE;
  const h = rows * TILE;
  R(ctx, 0, 0, w, h, C.wall);
  R(ctx, 0, 0, w, 5, C.wallTop);
  R(ctx, 0, 5, w, 1, C.grout);
  // subway tiles, 8x4, offset every other row
  for (let y = 8; y < h - 4; y += 5) {
    const offset = ((y - 8) / 5) % 2 ? 4 : 0;
    for (let x = -4 + offset; x < w; x += 9) {
      R(ctx, x, y, 8, 4, ((x + y) / 7) % 3 === 0 ? C.tileLight : C.tile);
    }
  }
  R(ctx, 0, h - 4, w, 4, C.baseboard);
  R(ctx, 0, h - 4, w, 1, C.wallTop);
}

export function window_(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.window(), x, y);
}

export function menuBoard(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.menuBoard(), x, y);
  drawText(ctx, "MENU", x + 9, y + 4, "#e9e3d0");
  R(ctx, x + 5, y + 11, 14, 1, "#b8c9b4");
  R(ctx, x + 5, y + 14, 18, 1, "#b8c9b4");
  R(ctx, x + 5, y + 17, 11, 1, "#e9c46a");
  R(ctx, x + 22, y + 11, 5, 1, "#e76f51");
  R(ctx, x + 24, y + 14, 3, 1, "#e76f51");
}

export function shadowUnder(ctx: Ctx, x: number, y: number, w: number) {
  R(ctx, x + 1, y, w - 2, 2, C.shadow);
}

export function chefShadow(ctx: Ctx, x: number, y: number) {
  R(ctx, x + 3, y, 10, 2, C.shadow);
  R(ctx, x + 5, y - 1, 6, 1, C.shadow);
}

export function stove(ctx: Ctx, x: number, y: number, on: boolean, t: number) {
  R(ctx, x, y, 16, 16, C.stove);
  R(ctx, x, y, 16, 1, C.steelHi);
  R(ctx, x, y + 9, 16, 1, C.steelLine);
  R(ctx, x + 2, y + 11, 12, 4, C.stoveDark);
  R(ctx, x + 3, y + 12, 10, 2, on ? "#ff9a4a" : "#30343b");
  for (const [bx, by] of [
    [2, 2],
    [9, 2],
    [2, 6],
    [9, 6],
  ]) {
    R(ctx, x + bx, y + by, 5, 3, C.burner);
    R(ctx, x + bx + 1, y + by - 1, 3, 1, C.burner);
    R(ctx, x + bx + 1, y + by + 3, 3, 1, C.burner);
  }
  if (on) {
    const hot = Math.floor(t * 6) % 2 === 0;
    R(ctx, x + 3, y + 2, 3, 2, hot ? C.flameHot : C.flame);
    R(ctx, x + 10, y + 6, 3, 2, hot ? C.flame : C.flameHot);
  }
  R(ctx, x + 1, y + 10, 2, 1, C.knob);
  R(ctx, x + 13, y + 10, 2, 1, C.knob);
  shadowUnder(ctx, x, y + 16, 16);
}

export function counter(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y, 16, 16, C.steel);
  R(ctx, x, y, 16, 7, C.steelTop);
  R(ctx, x, y, 16, 1, C.steelHi);
  R(ctx, x, y + 7, 16, 1, C.steelDark);
  R(ctx, x, y + 11, 16, 1, C.steelLine);
  R(ctx, x + 6, y + 9, 4, 1, C.steelDark);
  R(ctx, x + 6, y + 13, 4, 1, C.steelDark);
  R(ctx, x + 15, y + 8, 1, 8, C.steelDark);
  shadowUnder(ctx, x, y + 16, 16);
}

/** A counter with a cutting board; the pantry bar shows the station's share of ingredients. */
export function board(ctx: Ctx, x: number, y: number, share: number) {
  counter(ctx, x, y);
  R(ctx, x + 2, y + 1, 12, 5, C.wood);
  R(ctx, x + 2, y + 1, 12, 1, C.woodHi);
  R(ctx, x + 2, y + 5, 12, 1, C.woodDark);
  R(ctx, x + 11, y, 1, 3, C.steelDark);
  const w = Math.max(1, Math.round(share * 9));
  R(ctx, x + 3, y + 2, 9, 2, C.woodDark);
  R(ctx, x + 3, y + 2, w, 2, "#e76f51");
  if (w > 3) R(ctx, x + 3 + Math.floor(w / 2), y + 2, 1, 2, "#2a9d8f");
  if (w > 6) R(ctx, x + 3 + w - 2, y + 2, 1, 2, "#e9c46a");
}

export function chopBits(ctx: Ctx, x: number, y: number, t: number) {
  const colors = ["#e76f51", "#2a9d8f", "#e9c46a"];
  for (let i = 0; i < 3; i++) {
    const phase = (t * 2 + i / 3) % 1;
    R(ctx, x + 4 + i * 3 + Math.round(Math.sin(phase * 6 + i) * 2), y - Math.floor(phase * 5), 1, 1, colors[i]);
  }
}

export function pot(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y, 8, 5, C.steelDark);
  R(ctx, x + 1, y, 6, 1, C.steelTop);
  R(ctx, x + 2, y + 1, 1, 2, C.steelLine);
  R(ctx, x - 1, y + 1, 1, 2, C.steelDark);
  R(ctx, x + 8, y + 1, 1, 2, C.steelDark);
}

export function steam(ctx: Ctx, x: number, y: number, t: number) {
  for (let i = 0; i < 4; i++) {
    const phase = (t * 0.7 + i / 4) % 1;
    const py = y - Math.floor(phase * 14);
    const px = x + i * 2 + Math.round(Math.sin((phase + i) * 6) * 1.5);
    ctx.globalAlpha = 0.85 - phase * 0.85;
    R(ctx, px, py, 2, 2, C.steam);
    ctx.globalAlpha = 1;
  }
}

export function smoke(ctx: Ctx, x: number, y: number, t: number) {
  for (let i = 0; i < 3; i++) {
    const phase = (t * 0.5 + i / 3) % 1;
    const py = y - Math.floor(phase * 18);
    const size = 2 + Math.floor(phase * 3);
    ctx.globalAlpha = 0.8 - phase * 0.8;
    R(ctx, x + i * 3 - Math.floor(size / 2), py, size, size, C.smoke);
    ctx.globalAlpha = 1;
  }
}

/** One tile of the pass, a long steel counter across the room: top face, front face, end caps. */
export function passTop(ctx: Ctx, x: number, y: number, first: boolean, last: boolean) {
  R(ctx, x, y, 16, 16, C.steel);
  R(ctx, x, y, 16, 8, C.steelTop);
  R(ctx, x, y, 16, 1, C.steelHi);
  R(ctx, x, y + 8, 16, 1, C.steelDark);
  R(ctx, x, y + 15, 16, 1, C.steelDark);
  R(ctx, x, y + 12, 16, 1, C.steelLine);
  if (first) R(ctx, x, y, 1, 16, C.steelDark);
  if (last) R(ctx, x + 15, y, 1, 16, C.steelDark);
  shadowUnder(ctx, x, y + 16, 16);
}

export function heatLamp(ctx: Ctx, x: number, y: number, on: boolean, t: number) {
  R(ctx, x + 7, y, 2, 6, C.steelDark);
  R(ctx, x + 2, y + 6, 12, 3, C.stove);
  R(ctx, x + 2, y + 6, 12, 1, C.steelLine);
  R(ctx, x + 3, y + 9, 10, 1, on ? C.flameHot : C.steelDark);
  if (on) {
    ctx.globalAlpha = 0.16 + 0.05 * Math.sin(t * 3);
    R(ctx, x - 1, y + 10, 18, 12, C.flameHot);
    ctx.globalAlpha = 1;
  }
}

export function plate(ctx: Ctx, x: number, y: number, color: string) {
  R(ctx, x, y + 1, 10, 3, C.outline);
  R(ctx, x + 1, y, 8, 3, C.white);
  R(ctx, x + 3, y + 1, 4, 1, color);
  R(ctx, x + 4, y, 2, 1, color);
}

export function cloche(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y + 8, 14, 3, C.outline);
  R(ctx, x + 1, y + 8, 12, 2, C.white);
  R(ctx, x + 2, y + 3, 10, 5, C.steelTop);
  R(ctx, x + 4, y + 1, 6, 2, C.steelTop);
  R(ctx, x + 6, y, 2, 1, C.steelDark);
  R(ctx, x + 3, y + 4, 2, 1, "#ffffff");
}

export function fridge(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y, 16, 32, C.steelDark);
  R(ctx, x + 1, y + 1, 14, 30, C.steelTop);
  R(ctx, x + 1, y + 12, 14, 1, C.steelDark);
  R(ctx, x + 11, y + 4, 1, 6, C.stove);
  R(ctx, x + 11, y + 15, 1, 12, C.stove);
  R(ctx, x + 2, y + 2, 2, 8, "#ffffff");
  R(ctx, x + 2, y + 14, 2, 10, "#ffffff");
  shadowUnder(ctx, x, y + 32, 16);
}

export function shelf(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.jarShelf(), x, y + 2);
}

export function panRack(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.panRack(), x, y);
}

export function clock(ctx: Ctx, x: number, y: number, t: number) {
  ctx.drawImage(clockFace(), x, y);
  const cx = x + 7;
  const cy = y + 7;
  const d = new Date();
  const hand = (angle: number, len: number, color: string) => {
    for (let i = 1; i <= len; i++) {
      R(ctx, cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), 1, 1, color);
    }
  };
  hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 3, C.outline);
  hand(d.getMinutes() * (Math.PI / 30), 5, C.outline);
  hand((t % 60) * (Math.PI / 30), 5, "#e76f51");
  R(ctx, cx, cy, 1, 1, C.outline);
}

export function ticketRail(ctx: Ctx, x: number, y: number, tickets: number) {
  R(ctx, x, y, 56, 2, C.steelDark);
  R(ctx, x, y, 56, 1, C.steelHi);
  for (let i = 0; i < tickets; i++) {
    R(ctx, x + 6 + i * 12, y + 1, 1, 2, C.steelDark);
    ctx.drawImage(DECOR.ticket(), x + 2 + i * 12, y + 3);
  }
}

export function plant(ctx: Ctx, x: number, y: number, variant = 0) {
  shadowUnder(ctx, x + 2, y + 15, 12);
  ctx.drawImage(plantSprite(variant), x, y - 4);
}

export function door(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y, 12, 32, C.steelDark);
  R(ctx, x + 1, y + 1, 10, 30, C.steel);
  R(ctx, x + 1, y + 1, 10, 1, C.steelHi);
  R(ctx, x + 3, y + 4, 6, 7, C.glass);
  R(ctx, x + 4, y + 5, 2, 2, "#ffffff");
  R(ctx, x + 2, y + 17, 8, 2, C.stove);
  R(ctx, x + 1, y + 14, 10, 1, C.steelDark);
}

export function desk(ctx: Ctx, x: number, y: number) {
  R(ctx, x, y, 32, 16, C.woodDark);
  R(ctx, x, y, 32, 8, C.wood);
  R(ctx, x, y, 32, 1, C.woodHi);
  R(ctx, x, y + 8, 32, 1, C.woodLine);
  R(ctx, x + 1, y + 14, 3, 2, C.woodLine);
  R(ctx, x + 28, y + 14, 3, 2, C.woodLine);
  // the clipboard and a mug
  R(ctx, x + 12, y + 1, 9, 6, "#8a5a2b");
  R(ctx, x + 13, y + 2, 7, 5, C.white);
  R(ctx, x + 14, y + 3, 5, 1, C.steelLine);
  R(ctx, x + 14, y + 5, 4, 1, C.steelLine);
  R(ctx, x + 25, y + 2, 4, 4, "#e76f51");
  R(ctx, x + 29, y + 3, 1, 2, "#e76f51");
  shadowUnder(ctx, x, y + 16, 32);
}

export function bin(ctx: Ctx, x: number, y: number) {
  shadowUnder(ctx, x + 2, y + 16, 12);
  ctx.drawImage(DECOR.bin(), x, y);
}

export function sink(ctx: Ctx, x: number, y: number) {
  counter(ctx, x, y);
  R(ctx, x + 2, y + 1, 12, 5, C.steelDark);
  R(ctx, x + 3, y + 2, 10, 3, C.steel);
  R(ctx, x + 4, y + 3, 8, 1, C.glass);
  R(ctx, x + 7, y - 3, 2, 4, C.steelDark);
  R(ctx, x + 7, y - 3, 4, 1, C.steelDark);
}

// --- more set dressing ---

/** Double swing door in the back wall; `open` swings the leaves apart. */
export function wallDoor(ctx: Ctx, x: number, y: number, open: number) {
  R(ctx, x - 2, y - 2, 36, 30, C.woodLine);
  R(ctx, x, y, 32, 28, C.outside);
  const swing = Math.round(open * 5);
  for (const side of [0, 1]) {
    const lx = side === 0 ? x - swing : x + 16 + swing;
    R(ctx, lx, y, 16, 28, C.steel);
    R(ctx, lx + 1, y + 1, 14, 26, C.steelTop);
    R(ctx, lx + 4, y + 4, 8, 8, C.outline);
    R(ctx, lx + 5, y + 5, 6, 6, C.glass);
    R(ctx, lx + 6, y + 6, 2, 2, "#ffffff");
    R(ctx, lx + 2, y + 16, 12, 2, C.stove);
    R(ctx, lx + 1, y + 26, 14, 1, C.steelDark);
  }
  R(ctx, x - 2, y + 28, 36, 2, C.steelDark);
}

export function picture(ctx: Ctx, x: number, y: number, variant: number) {
  ctx.drawImage(variant === 0 ? DECOR.pictureMountains() : variant === 1 ? DECOR.pictureChef() : DECOR.pictureFruit(), x, y);
}

export function calendar(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.calendar(), x, y);
}

export function spiceRack(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.spiceRack(), x, y);
}

export function extinguisher(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.extinguisher(), x, y);
}

export function herbPots(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.herbPots(), x, y);
}

export function mat(ctx: Ctx, x: number, y: number) {
  R(ctx, x + 2, y + 3, 44, 10, "#4a4a52");
  R(ctx, x + 3, y + 4, 42, 8, "#565661");
  for (let i = 0; i < 10; i++) R(ctx, x + 5 + i * 4, y + 6, 2, 4, "#4a4a52");
}

export function crate(ctx: Ctx, x: number, y: number, produce: string) {
  shadowUnder(ctx, x + 1, y + 15, 14);
  ctx.drawImage(DECOR.crate(produce !== "#e76f51"), x, y);
}

export function sack(ctx: Ctx, x: number, y: number) {
  shadowUnder(ctx, x + 2, y + 15, 12);
  ctx.drawImage(DECOR.sack(), x, y);
}

export function plateStack(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.plateStack(), x, y);
}

export function trolley(ctx: Ctx, x: number, y: number) {
  shadowUnder(ctx, x + 1, y + 16, 14);
  ctx.drawImage(DECOR.trolley(), x, y);
}

export function mopBucket(ctx: Ctx, x: number, y: number) {
  shadowUnder(ctx, x + 3, y + 15, 11);
  ctx.drawImage(DECOR.mopBucket(), x, y);
}

export function hangingLamp(ctx: Ctx, x: number, y: number) {
  ctx.drawImage(DECOR.hangingLamp(), x, y);
  ctx.globalAlpha = 0.12;
  R(ctx, x - 3, y + 10, 17, 8, C.flameHot);
  ctx.globalAlpha = 1;
}

