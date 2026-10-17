"use client";

// Two boxes above the cards: "Needs you" (red tickets, dishes sent back, a
// kitchen fire) and "Order up" (the final plate), both answered in place.

import { useState } from "react";

import type { ServiceState } from "@/lib/brigade/schemas";

export function NeedsYou({ state, onSendBack, onReplate }: { state: ServiceState; onSendBack: (stationId: string, note: string) => void; onReplate: () => void }) {
  const [showFinal, setShowFinal] = useState(false);
  const burnt = state.stations.filter((s) => s.status === "burnt");
  const conflicts = state.plating?.conflicts ?? [];
  const failed = state.status === "failed";
  const needs = burnt.length > 0 || conflicts.length > 0 || failed;
  const nameOf = (id: string) => state.stations.find((s) => s.id === id)?.title ?? id;

  return (
    <>
      {needs && (
        <section className="flex flex-col gap-2 rounded-lg border border-ember px-3 py-2">
          <div className="font-bold text-ember">Needs you</div>
          {failed && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ember">🔥 Kitchen fire: {state.error}</span>
              {state.stations.length > 0 && (
                <button className="tbtn" onClick={onReplate}>
                  🍽️ Re-plate
                </button>
              )}
            </div>
          )}
          {burnt.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">{s.title}</span>
              <span className="text-ember">burnt · {s.error}</span>
              <button className="tbtn" onClick={() => onSendBack(s.id, "")}>
                Open station
              </button>
            </div>
          ))}
          {conflicts.map((c, i) => (
            <div key={i} className="flex flex-col gap-1 text-xs">
              <span>↩ Sent back: {c.problem}</span>
              <div className="flex flex-wrap gap-1">
                {c.station_ids.map((id) => (
                  <button key={id} className="tbtn" onClick={() => onSendBack(id, `The expediter sent this back: ${c.problem}`)}>
                    Note for {nameOf(id)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {(state.status === "plating" || state.plating) && (
        <section className="flex flex-col gap-2 rounded-lg border border-sage px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sage">{state.status === "plating" ? "🍽️ The expediter is plating…" : "🔔 Order up"}</span>
            {state.plating && (
              <>
                <span className="text-xs text-muted">{conflicts.length ? `${conflicts.length} dish${conflicts.length > 1 ? "es" : ""} sent back` : "no conflicts"}</span>
                <span className="flex-1" />
                <button className="tbtn" onClick={() => setShowFinal((v) => !v)}>
                  {showFinal ? "Hide the plate ▴" : "Show the plate ▾"}
                </button>
                <button className="tbtn tbtn-plain" onClick={onReplate} title="Plate the same dishes again">
                  Re-plate
                </button>
              </>
            )}
          </div>
          {showFinal && state.plating && <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-line bg-paper p-3 font-sans text-xs leading-relaxed">{state.plating.final}</pre>}
        </section>
      )}
    </>
  );
}
