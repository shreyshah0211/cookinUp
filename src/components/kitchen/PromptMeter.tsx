"use client";

// The prompt meter under the order box: four checks that light up as you
// type, a power bar, and one tip for what to add next.

import { coach } from "@/lib/brigade/coach";

export function PromptMeter({ text }: { text: string }) {
  const c = coach(text);
  if (!text.trim()) return null;
  return (
    <div className="meter">
      <div className="flex items-center gap-1.5">
        <span className="meter-label">Prompt power</span>
        <span className="meter-bar">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < c.score ? "on" : ""} />
          ))}
        </span>
        {c.checks.map((k) => (
          <span key={k.key} className={`meter-chip ${k.ok ? "meter-chip-ok" : ""}`}>
            {k.ok ? "✓" : "·"} {k.label}
          </span>
        ))}
      </div>
      {c.tip && <p className="mt-1 text-[12px]">{c.tip}</p>}
    </div>
  );
}

/** The small score tag on an order already sent. */
export function PromptScore({ text }: { text: string }) {
  const s = coach(text).score;
  return (
    <span className="pix-tag" style={{ background: s === 4 ? "#3d8b5a" : s >= 2 ? "#c0783a" : "#9a9281" }} title="How clear this order was">
      Prompt {s}/4
    </span>
  );
}
