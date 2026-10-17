"use client";

import { useState } from "react";

import { fmtUsd } from "@/lib/brigade/client";
import { modelInfo } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";

// The running tab, one line, with the per-station lines on request.
export function Bill({ state }: { state: ServiceState }) {
  const [open, setOpen] = useState(false);
  const tokens = state.bill.inputTokens + state.bill.outputTokens;
  const lines = [
    ...(state.plannerUsage ? [{ name: "Head chef (menu)", model: state.headChef, u: state.plannerUsage }] : []),
    ...state.stations.filter((s) => s.usage).map((s) => ({ name: s.title, model: s.model, u: s.usage! })),
    ...(state.platingUsage ? [{ name: "Expediter (plating)", model: state.headChef, u: state.platingUsage }] : []),
  ];
  return (
    <span className="relative text-xs">
      <button className="tbtn tbtn-plain" onClick={() => setOpen((o) => !o)}>
        🧾 {tokens.toLocaleString()} tok · <strong className="text-foreground">{fmtUsd(state.bill.costUsd)}</strong> {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-10 mt-1 w-80 rounded border border-line bg-paper p-2 shadow-xl">
          {lines.length === 0 && <li className="text-muted">Nothing on the tab yet.</li>}
          {lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-0.5">
              <span className="min-w-0 flex-1 truncate" title={l.name}>
                {l.name} <span className="text-muted">· {modelInfo(l.model).label}</span>
              </span>
              <span className="text-muted">{(l.u.inputTokens + l.u.outputTokens).toLocaleString()}</span>
              <span className="w-14 text-right">{fmtUsd(l.u.costUsd)}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
