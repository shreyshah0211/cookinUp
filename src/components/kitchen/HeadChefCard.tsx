"use client";

// Click the head chef: who runs the pass, how big the pantry is, and the
// keys. Applies to the next order.

import type { StoredKeys } from "@/lib/brigade/client";
import { MODELS, modelInfo, TIER_NAMES, tierOf } from "@/lib/brigade/models";

import { PixelChef } from "./PixelChef";
import { stars } from "./StationRow";

export function HeadChefCard(p: { headChef: string; onHeadChef: (m: string) => void; totalBudget: number; onTotalBudget: (n: number) => void; keys: StoredKeys; onKeys: () => void }) {
  const hasKeys = !!(p.keys.anthropic || p.keys.openai);
  const noKey = (provider: "anthropic" | "openai") => hasKeys && !p.keys[provider];
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-2">
        <PixelChef hat={modelInfo(p.headChef).hat} scale={2} />
        <div className="flex-1">
          <div className="font-bold">Head chef</div>
          <div className="text-xs text-muted">Writes the menu and plates the dish.</div>
        </div>
      </div>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Who runs the pass</span>
        <select value={p.headChef} onChange={(e) => p.onHeadChef(e.target.value)} className="tinput">
          {MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={noKey(m.provider)}>
              {stars(tierOf(m.id))} {m.label} · {TIER_NAMES[tierOf(m.id)]}
              {noKey(m.provider) ? " · no key" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Pantry for an order</span>
        <span className="flex items-center gap-1">
          <input type="number" min={1000} max={60000} step={500} value={p.totalBudget} onChange={(e) => p.onTotalBudget(Number(e.target.value))} className="tinput w-24" /> tokens
        </span>
      </label>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{hasKeys ? "API keys are set in this browser." : "No API keys yet."}</span>
        <button className={`pix-btn ${hasKeys ? "pix-btn-plain" : ""}`} onClick={p.onKeys}>
          {hasKeys ? "Change keys" : "Add API keys"}
        </button>
      </div>
      <p className="text-xs text-muted">Changes apply to the next order. The head chef picks a chef for each station by how hard it is; click any chef to swap them.</p>
    </div>
  );
}
