"use client";

// The kitchen canvas: sized to fill the window (the room grows to fit),
// scaled crisp, with a game loop, hit testing, and a one-word label on hover.
// A click reports what was hit and where on the screen, so a window can open
// right there.

import { useEffect, useMemo, useRef, useState } from "react";

import { LESSONS } from "@/lib/brigade/lessons";
import { modelInfo } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";
import { KitchenWorld } from "@/pixel/engine";
import { TILE } from "@/pixel/sprites";
import { colsNeeded, rowsNeeded } from "@/pixel/world";

type Fit = { scale: number; cols: number; rows: number };

/** How big a room fits the pane: at least the nine stations' worth, at as large a scale as that allows. */
function fitRoom(w: number, h: number): Fit {
  const minCols = colsNeeded();
  const minRows = rowsNeeded();
  const raw = Math.min(4, (w - 4) / (minCols * TILE), (h - 4) / (minRows * TILE));
  const scale = Math.max(1, Math.floor(raw * 4) / 4);
  return { scale, cols: Math.max(minCols, Math.floor((w - 4) / (TILE * scale))), rows: Math.max(minRows, Math.floor((h - 4) / (TILE * scale))) };
}

type Hover = { id: string; x: number; y: number } | null;

export function PixelKitchen({ state, pickedId, learn, onPick }: { state: ServiceState | null; pickedId: string | null; learn: boolean; onPick: (id: string | null, at: { x: number; y: number }) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const fit = useMemo(() => fitRoom(box.w, box.h), [box]);
  // One world for the whole session: brigades come and go through the door.
  const [world] = useState(() => new KitchenWorld(modelInfo(state?.headChef ?? "claude-opus-5").hat, fit.cols, fit.rows));
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    world.resize(fit.cols, fit.rows);
    world.sync(state);
  }, [state, world, fit.cols, fit.rows]);
  useEffect(() => {
    world.focus(pickedId, hover?.id ?? null);
    // Hovering a "?" counts as reading it: the badge stops pulsing once you move on.
    if (hover?.id.startsWith("why:")) world.ack(hover.id.slice(4));
  }, [world, pickedId, hover]);
  useEffect(() => {
    world.setLearn(learn);
  }, [world, learn]);
  const whyFor = hover?.id.startsWith("why:") ? state?.events.findLast((e) => e.kind === "explain" && e.from === hover.id.slice(4)) : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const tick = (ts: number) => {
      // Real elapsed time, so a hidden tab (where frames pause) catches up on return.
      const dt = Math.min(0.5, (ts - last) / 1000);
      last = ts;
      try {
        if (canvas.width !== world.width || canvas.height !== world.height) {
          canvas.width = world.width;
          canvas.height = world.height;
        }
        world.update(dt);
        world.render(ctx);
      } catch (error) {
        console.error("[kitchen] frame failed", error);
      }
    };
    const loop = (ts: number) => {
      tick(ts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const fallback = setInterval(() => {
      if (document.visibilityState === "hidden") tick(performance.now());
    }, 250);
    (window as unknown as { __kitchen?: KitchenWorld }).__kitchen = world;
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(fallback);
    };
  }, [world]);

  const toNative = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / fit.scale, y: (e.clientY - r.top) / fit.scale };
  };

  const W = fit.cols * TILE * fit.scale;
  const H = fit.rows * TILE * fit.scale;

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-background">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: W, height: H }}>
        <canvas
          ref={canvasRef}
          width={fit.cols * TILE}
          height={fit.rows * TILE}
          style={{ width: W, height: H, imageRendering: "pixelated", cursor: hover ? "pointer" : "default" }}
          onMouseMove={(e) => {
            const p = toNative(e);
            const id = world.hitTest(p.x, p.y);
            setHover(id ? { id, x: p.x, y: p.y } : null);
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const p = toNative(e);
            onPick(world.hitTest(p.x, p.y), { x: e.clientX, y: e.clientY });
          }}
        />
        {whyFor && hover && (
          <div className="why-tip" style={{ left: hover.x * fit.scale, top: hover.y * fit.scale, transform: hover.x * fit.scale > W / 2 ? "translate(calc(-100% - 14px), 12px)" : "translate(14px, 12px)" }}>
            {whyFor.topic && (
              <span className="pix-tag mb-1" style={{ background: LESSONS[whyFor.topic].color }}>
                {LESSONS[whyFor.topic].title}
              </span>
            )}
            <div>{whyFor.text}</div>
            <div className="mt-1 text-[10px] text-[#7a6f63]">Click for more</div>
          </div>
        )}
      </div>
    </div>
  );
}
