"use client";

// A station at a glance: what the chef is doing, what it cost, who is doing
// it, and a box to add instructions and send them back to it.

import { useState } from "react";

import { fmtElapsed, fmtUsd, stationAction, useClock } from "@/lib/brigade/client";
import { MODELS, modelInfo } from "@/lib/brigade/models";
import type { StationState } from "@/lib/brigade/schemas";
import { lookFor } from "@/pixel/sprites";

import { PixelChef } from "./PixelChef";
import { STATUS_COLOR, STATUS_LABEL } from "./status";

export function ChefCard({ serviceId, station: s, hireable, onClose }: { serviceId: string; station: StationState; hireable: string[]; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useClock(s.status === "cooking");
  const model = modelInfo(s.model);
  const used = s.usage?.outputTokens ?? 0;

  const act = async (body: Parameters<typeof stationAction>[1]) => {
    setBusy(true);
    setError(null);
    try {
      await stationAction(serviceId, body);
      setNote("");
      // Back to the chat, where this station's re-run shows up with its own progress bar.
      if (body.action === "rerun") onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-start gap-3">
        <PixelChef hat={model.hat} look={lookFor(s.id)} scale={2} pose={s.status === "cooking" ? "cook" : "down"} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight">{s.title}</div>
          <div className="mt-0.5 text-xs" style={{ color: STATUS_COLOR[s.status] }}>
            {STATUS_LABEL[s.status]}
            {s.startedAt && <span className="ml-2 font-mono text-muted">{fmtElapsed(s.startedAt, s.finishedAt ?? now)}</span>}
          </div>
        </div>
        <button className="tbtn tbtn-plain" onClick={onClose}>
          ✕
        </button>
      </div>

      <p className="text-muted">{s.goal}</p>

      {s.error && <div className="rounded border border-ember/60 bg-ember/10 px-2 py-1 text-xs text-ember">{s.error}</div>}
      {s.output && (
        <div className="text-xs">
          <p>{s.output.summary}</p>
          <button className="tbtn tbtn-plain mt-0.5 !px-0" onClick={() => setShowResult((v) => !v)}>
            {showResult ? "Hide result ▴" : "Show result ▾"}
          </button>
          {showResult && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-sans leading-relaxed">{s.output.result}</pre>}
        </div>
      )}

      {/* tokens */}
      <div className="rounded-lg border border-line bg-paper px-3 py-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Tokens</span>
          <span className="font-mono">
            {used.toLocaleString()} <span className="text-muted">/ {s.token_budget.toLocaleString()} budget</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#2a3346]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (used / Math.max(1, s.token_budget)) * 100)}%`, background: used / s.token_budget > 0.9 ? "#e76f51" : "#e9c46a" }} />
        </div>
        {s.usage && (
          <div className="mt-1.5 flex justify-between text-muted">
            <span>{s.usage.inputTokens.toLocaleString()} in · {s.usage.outputTokens.toLocaleString()} out</span>
            <span>{fmtUsd(s.usage.costUsd)}</span>
          </div>
        )}
      </div>

      {/* model */}
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">Model</span>
        <select
          className="tinput"
          value={s.model}
          disabled={busy}
          onChange={(e) => void act({ stationId: s.id, action: "rerun", model: e.target.value })}
          title="Changing the model re-runs this station"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={!hireable.includes(m.id)}>
              {m.label}
              {hireable.includes(m.id) ? "" : " · no key"}
            </option>
          ))}
        </select>
      </label>

      {/* additional info */}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) void act({ stationId: s.id, action: "rerun", instruction: note.trim() });
        }}
      >
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add instructions or corrections for this chef…" className="tinput resize-none" />
        <div className="flex items-center gap-2">
          <button className="tbtn tbtn-primary" type="submit" disabled={busy || !note.trim()}>
            Send & re-run
          </button>
          {s.status === "cooking" && (
            <button className="tbtn tbtn-plain" type="button" disabled={busy} onClick={() => void act({ stationId: s.id, action: "stop" })}>
              Stop
            </button>
          )}
          <span className="text-[11px] text-muted">Stations that depend on this one re-run too.</span>
        </div>
      </form>
      {error && <div className="text-xs text-ember">{error}</div>}
    </div>
  );
}
