"use client";

// A station at a glance: who the chef is and their level, what they are
// doing, what it cost, which model, a box to send them corrections, and
// what is going on in their head.

import { useState } from "react";

import { fmtElapsed, fmtUsd, stationAction, useClock } from "@/lib/brigade/client";
import { MODELS, modelInfo, TIER_NAMES, tierOf } from "@/lib/brigade/models";
import type { KitchenEvent, StationState } from "@/lib/brigade/schemas";
import { lookFor } from "@/pixel/sprites";

import { MindPanel } from "./MindPanel";
import { PixelChef } from "./PixelChef";
import { stars } from "./StationRow";
import { STATUS_COLOR, STATUS_LABEL } from "./status";

export function ChefCard({
  serviceId,
  station: s,
  stations,
  events,
  hireable,
  mindFirst,
  onDone,
}: {
  serviceId: string;
  station: StationState;
  stations: StationState[];
  events: KitchenEvent[];
  hireable: string[];
  /** Opened from the thought bubble: lead with what is on their mind. */
  mindFirst?: boolean;
  /** A correction went in: close this and watch the re-fire on the ticket. */
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClock(s.status === "cooking");
  const model = modelInfo(s.model);
  const tier = tierOf(s.model);
  const used = s.usage?.outputTokens ?? 0;

  const act = async (body: Parameters<typeof stationAction>[1]) => {
    setBusy(true);
    setError(null);
    try {
      await stationAction(serviceId, body);
      setNote("");
      if (body.action === "rerun") onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const mind = (
    <section className="border-2 border-line bg-paper px-3 py-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">In their head</div>
      <MindPanel who={s.id} events={events} stations={stations} limit={mindFirst ? 30 : 8} />
    </section>
  );

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-start gap-3">
        <PixelChef hat={model.hat} look={lookFor(s.id)} scale={2} pose={s.status === "cooking" ? "cook" : "down"} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{s.title}</div>
          <div className="mt-0.5 text-xs">
            <span className="text-amber">{stars(tier)}</span> {TIER_NAMES[tier]} · {model.label}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: STATUS_COLOR[s.status] }}>
            {STATUS_LABEL[s.status]}
            {s.startedAt && <span className="ml-2 font-mono text-muted">{fmtElapsed(s.startedAt, s.finishedAt ?? now)}</span>}
          </div>
        </div>
      </div>

      {mindFirst && mind}

      <p className="text-muted">{s.goal}</p>

      {s.error && <div className="border-2 border-ember bg-ember/10 px-2 py-1 text-xs text-ember">{s.error}</div>}
      {s.output && (
        <div className="text-xs">
          <p>{s.output.summary}</p>
          <button className="tbtn tbtn-plain mt-0.5 !px-0" onClick={() => setShowResult((v) => !v)}>
            {showResult ? "Hide result ▴" : "Show result ▾"}
          </button>
          {showResult && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap border border-line bg-paper p-2 font-sans leading-relaxed">{s.output.result}</pre>}
        </div>
      )}

      {/* tokens */}
      <div className="border-2 border-line bg-paper px-3 py-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Tokens</span>
          <span className="font-mono">
            {used.toLocaleString()} <span className="text-muted">/ {s.token_budget.toLocaleString()} budget</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden border border-line bg-background">
          <div className="h-full" style={{ width: `${Math.min(100, (used / Math.max(1, s.token_budget)) * 100)}%`, background: used / s.token_budget > 0.9 ? "#e76f51" : "#e9c46a" }} />
        </div>
        {s.usage && (
          <div className="mt-1.5 flex justify-between text-muted">
            <span>
              {s.usage.inputTokens.toLocaleString()} in · {s.usage.outputTokens.toLocaleString()} out
            </span>
            <span>{fmtUsd(s.usage.costUsd)}</span>
          </div>
        )}
      </div>

      {/* model: the chef's level */}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Chef</span>
        <select className="tinput" value={s.model} disabled={busy} onChange={(e) => void act({ stationId: s.id, action: "rerun", model: e.target.value })} title="Changing the chef re-runs this station">
          {MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={!hireable.includes(m.id)}>
              {stars(tierOf(m.id))} {m.label} · {TIER_NAMES[tierOf(m.id)]}
              {hireable.includes(m.id) ? "" : " · no key"}
            </option>
          ))}
        </select>
      </label>

      {/* corrections */}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) void act({ stationId: s.id, action: "rerun", instruction: note.trim() });
        }}
      >
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Tell this chef what to change…" className="tinput resize-none" />
        <div className="flex items-center gap-2">
          <button className="pix-btn" type="submit" disabled={busy || !note.trim()}>
            Send & re-fire
          </button>
          {s.status === "cooking" && (
            <button className="pix-btn pix-btn-plain" type="button" disabled={busy} onClick={() => void act({ stationId: s.id, action: "stop" })}>
              Stop
            </button>
          )}
          <span className="text-[11px] text-muted">Stations that depend on this one re-run too.</span>
        </div>
      </form>
      {error && <div className="text-xs text-ember">{error}</div>}

      {!mindFirst && mind}
    </div>
  );
}
