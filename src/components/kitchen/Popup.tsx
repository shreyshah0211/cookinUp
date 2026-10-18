"use client";

// An in-game window: paper panel, thick ink border, pixel-font title bar you
// can drag, Escape or the X to close. Opens next to what you clicked (toward
// the roomier side of the screen) or in the middle when nothing was clicked.

import { useEffect, useRef, useState } from "react";

export type Anchor = { x: number; y: number };

export function Popup({ title, tag, anchor, width = 380, onClose, children }: { title: string; tag?: string; anchor?: Anchor | null; width?: number; onClose: () => void; children: React.ReactNode }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const style: React.CSSProperties = { width: Math.min(width, vw - 24) };
  if (anchor) {
    if (anchor.x < vw / 2) style.left = anchor.x + 14;
    else style.right = vw - anchor.x + 14;
    if (anchor.y < vh / 2) {
      style.top = Math.max(12, anchor.y - 20);
      style.maxHeight = vh - (style.top as number) - 12;
    } else {
      style.bottom = Math.max(12, vh - anchor.y - 20);
      style.maxHeight = vh - (style.bottom as number) - 12;
    }
    style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  } else {
    style.left = "50%";
    style.top = "50%";
    style.transform = `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
  }

  return (
    <div className="pix-win" style={style} onClick={(e) => e.stopPropagation()}>
      <div
        className="pix-title"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <span>{title}</span>
        {tag && <span className="pix-tag">{tag}</span>}
        <button className="x" onClick={onClose} title="Close (Esc)">
          X
        </button>
      </div>
      <div className="pix-body">{children}</div>
    </div>
  );
}
