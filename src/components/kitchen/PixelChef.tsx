"use client";

// A chef portrait: one pixel frame, scaled crisp, for cards and lists.

import { useEffect, useRef } from "react";

import { CHEF_FRAMES, CHEF_H, CHEF_W, chefPalette, type Look, sprite } from "@/pixel/sprites";

export function PixelChef({ hat, look, scale = 2, pose = "down" }: { hat: string; look?: Look; scale?: number; pose?: "down" | "up" | "cook" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CHEF_W, CHEF_H);
    const rows = pose === "cook" ? CHEF_FRAMES.stir[0] : pose === "up" ? CHEF_FRAMES.up[0] : CHEF_FRAMES.down[0];
    ctx.drawImage(sprite(rows, chefPalette(hat, look)), 0, 0);
  }, [hat, look, pose]);
  return <canvas ref={ref} width={CHEF_W} height={CHEF_H} style={{ width: CHEF_W * scale, height: CHEF_H * scale, imageRendering: "pixelated", display: "block" }} />;
}
