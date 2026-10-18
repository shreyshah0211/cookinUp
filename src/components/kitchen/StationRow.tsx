"use client";

// One station's line on a ticket: the chef, the title, their level, the
// timer and a progress bar. `run` shows an earlier attempt from its history.

import { fmtElapsed } from "@/lib/brigade/client";
import { modelInfo, tierOf } from "@/lib/brigade/models";
import type { StationState } from "@/lib/brigade/schemas";
import { lookFor } from "@/pixel/sprites";

import { PixelChef } from "./PixelChef";

export const stars = (n: number) => "★".repeat(n);

export function StationRow({ station: st, run, now, onPick }: { station: StationState; run?: number; now: number; onPick: (id: string) => void }) {
  const latest = run === undefined || run === st.history.length - 1;
  const h = run !== undefined ? st.history[run] : undefined;
  const status: StationState["status"] = latest ? st.status : h?.error ? "burnt" : "done";
  const startedAt = latest ? st.startedAt : h?.at;
  const finishedAt = latest ? st.finishedAt : st.history[(run ?? 0) + 1]?.at;
  const view: StationState = latest ? st : { ...st, status, startedAt, finishedAt };
  const model = modelInfo(st.model);
  return (
    <button className="group flex w-full items-start gap-2.5 text-left" onClick={() => onPick(st.id)} title="Open this station">
      <span className="shrink-0" title={model.label}>
        <PixelChef hat={model.hat} look={lookFor(st.id)} scale={1.25} />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex items-baseline gap-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate group-hover:underline">{st.title}</span>
          <span className="shrink-0 text-[11px] text-muted">
            {model.label} <span className="text-amber">{stars(tierOf(st.model))}</span>
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted">
            {view.status === "cooking" ? fmtElapsed(view.startedAt, now) : view.status === "done" || view.status === "burnt" ? fmtElapsed(view.startedAt, view.finishedAt) : ""}
          </span>
        </span>
        <Bar station={view} now={now} />
      </span>
    </button>
  );
}

/** Progress for one station: a guess from elapsed time while cooking, full when done, red when burnt. */
export function Bar({ station: st, now }: { station: StationState; now: number }) {
  const elapsed = st.startedAt ? (now - st.startedAt) / 1000 : 0;
  const expected = 25 + st.token_budget / 80;
  const pct = st.status === "done" || st.status === "burnt" ? 100 : st.status === "cooking" ? Math.min(92, 8 + (elapsed / expected) * 84) : 0;
  const color = st.status === "done" ? "#2a9d8f" : st.status === "burnt" ? "#e76f51" : st.status === "cooking" ? "#f4a261" : "#9a9281";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden border border-line bg-paper">
        <div className={`h-full transition-[width] duration-700 ${st.status === "cooking" ? "shimmer" : ""}`} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-16 shrink-0 text-[11px]" style={{ color }}>
        {st.status === "done" ? "Done" : st.status === "burnt" ? "Failed" : st.status === "cooking" ? "Working" : "Queued"}
      </span>
    </div>
  );
}

export function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot inline-block h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  );
}
