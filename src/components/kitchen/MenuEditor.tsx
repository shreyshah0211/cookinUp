"use client";

// The head chef's menu, before anything cooks: delete a station, merge one
// into another, change its chef or its budget, then fire.

import { useState } from "react";

import { stationAction } from "@/lib/brigade/client";
import { MODELS, modelInfo, tierOf } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";
import { lookFor } from "@/pixel/sprites";

import { PixelChef } from "./PixelChef";
import { stars } from "./StationRow";

type Draft = { id: string; title: string; goal: string; depends_on: string[]; model: string; token_budget: number; tools: "web"[] };

export function MenuEditor({ state, hireable }: { state: ServiceState; hireable: string[] }) {
  const [menu, setMenu] = useState<Draft[]>(() => state.stations.map((s) => ({ id: s.id, title: s.title, goal: s.goal, depends_on: s.depends_on, model: s.model, token_budget: s.token_budget, tools: s.tools ?? [] })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleOf = (id: string) => menu.find((s) => s.id === id)?.title ?? id;
  const set = (id: string, patch: Partial<Draft>) => setMenu((m) => m.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remove = (id: string) => setMenu((m) => m.filter((s) => s.id !== id).map((s) => ({ ...s, depends_on: s.depends_on.filter((d) => d !== id) })));
  // Fold `from` into `into`: one chef does both jobs, with both budgets; whoever waited on `from` now waits on `into`.
  const merge = (from: string, into: string) =>
    setMenu((m) => {
      const a = m.find((s) => s.id === from)!;
      return m
        .filter((s) => s.id !== from)
        .map((s) => {
          const deps = s.depends_on.map((d) => (d === from ? into : d));
          if (s.id !== into) return { ...s, depends_on: [...new Set(deps)] };
          return {
            ...s,
            title: `${s.title} + ${a.title}`,
            goal: `${s.goal} Also: ${a.goal}`,
            depends_on: [...new Set([...deps, ...a.depends_on])].filter((d) => d !== into && d !== from),
            token_budget: s.token_budget + a.token_budget,
            tools: [...new Set([...s.tools, ...a.tools])],
          };
        });
    });

  const fire = async () => {
    setBusy(true);
    setError(null);
    try {
      await stationAction(state.id, { action: "menu", stations: menu });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const total = menu.reduce((n, s) => n + s.token_budget, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] text-muted">Nothing is cooking yet. Change the menu, then fire.</p>
      <ul className="flex flex-col gap-2">
        {menu.map((s) => (
          <li key={s.id} className="border-2 border-line bg-background px-2.5 py-2">
            <div className="flex items-start gap-2">
              <PixelChef hat={modelInfo(s.model).hat} look={lookFor(s.id)} scale={1.25} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{s.title}</div>
                <div className="line-clamp-2 text-[11px] text-muted" title={s.goal}>
                  {s.goal}
                </div>
                {s.depends_on.length > 0 && <div className="mt-0.5 text-[11px] text-muted">Waits for {s.depends_on.map(titleOf).join(", ")}</div>}
              </div>
              <button className="tbtn tbtn-plain !text-ember" title="Delete this station" disabled={menu.length === 1} onClick={() => remove(s.id)}>
                Delete
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <select className="tinput !py-0.5" value={s.model} onChange={(e) => set(s.id, { model: e.target.value })} title="Chef for this station">
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id} disabled={!hireable.includes(m.id)}>
                    {stars(tierOf(m.id))} {m.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="number" min={100} step={100} value={s.token_budget} onChange={(e) => set(s.id, { token_budget: Number(e.target.value) })} className="tinput w-20 !py-0.5" />
                tokens
              </label>
              {menu.length > 1 && (
                <select className="tinput !py-0.5" value="" onChange={(e) => e.target.value && merge(s.id, e.target.value)} title="Fold this station into another">
                  <option value="">Merge into…</option>
                  {menu
                    .filter((o) => o.id !== s.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button className="pix-btn" onClick={() => void fire()} disabled={busy}>
          {busy ? "Firing…" : `Fire ${menu.length} station${menu.length === 1 ? "" : "s"}!`}
        </button>
        <span className="font-mono text-[11px] text-muted">{total.toLocaleString()} tokens budgeted</span>
      </div>
      {error && <p className="text-[12px] text-ember">{error}</p>}
    </div>
  );
}
