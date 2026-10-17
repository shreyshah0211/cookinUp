"use client";

// One chef's card: sprite, name, status line, what they're doing, their
// notes and ingredients, and every way to step in, all inline.

import { useState } from "react";

import { fmtElapsed, fmtUsd, stationAction } from "@/lib/brigade/client";
import { MODELS, modelInfo } from "@/lib/brigade/models";
import type { StationState } from "@/lib/brigade/schemas";

import { PixelChef } from "./PixelChef";
import { STATUS_COLOR, STATUS_LABEL } from "./status";

const PICK = "__pick__";

export function ChefCard({
  serviceId,
  station: s,
  color,
  nickname,
  now,
  hireable,
  maxBudget,
  picked,
  expanded,
  confirmingStop,
  onRename,
  onToggleExpand,
  onConfirmStop,
  onHide,
  onPick,
}: {
  serviceId: string;
  station: StationState;
  color: string;
  nickname?: string;
  now: number;
  hireable: string[];
  maxBudget: number;
  picked: boolean;
  expanded: boolean;
  confirmingStop: boolean;
  onRename: (name: string) => void;
  onToggleExpand: () => void;
  onConfirmStop: (on: boolean) => void;
  onHide: () => void;
  onPick: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(nickname ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = modelInfo(s.model);
  const name = nickname || s.title;
  const used = s.usage ? s.usage.inputTokens + s.usage.outputTokens : 0;
  const pantry = Math.round((s.token_budget / maxBudget) * 10);
  const live = s.status === "cooking";

  const act = async (body: Parameters<typeof stationAction>[1]) => {
    setBusy(true);
    setError(null);
    try {
      await stationAction(serviceId, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const refire = () => act({ stationId: s.id, action: "rerun" });

  return (
    <div
      id={`card-${s.id}`}
      className="flex flex-col gap-1.5 rounded-lg border px-3 py-2"
      style={{ borderColor: color, boxShadow: picked ? `0 0 0 2px ${color}55` : undefined }}
      onClick={onPick}
    >
      {/* name row */}
      <div className="flex items-center gap-2">
        <PixelChef hat={model.hat} pose={s.status === "cooking" ? "cook" : "down"} scale={2} />
        <span className="min-w-0 flex-1 truncate font-bold" title={name}>
          {name}
        </span>
        {!renaming && (
          <button className="tbtn tbtn-plain" onClick={() => setRenaming(true)}>
            ✎ Rename
          </button>
        )}
      </div>
      {renaming && (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(draftName.trim().slice(0, 40));
            setRenaming(false);
          }}
        >
          <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="New name (empty: back to the station name)" className="tinput min-w-0 flex-1" />
          <button className="tbtn" type="submit">
            Rename
          </button>
          <button className="tbtn tbtn-plain" type="button" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
      )}
      {nickname && <div className="truncate text-xs text-muted">Station: {s.title}</div>}
      <div className="line-clamp-2 text-xs text-muted" title={s.goal}>
        Goal: {s.goal}
      </div>

      {/* status line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span style={{ color: STATUS_COLOR[s.status] }}>{STATUS_LABEL[s.status]}</span>
        <span className="text-muted">⏱ {s.startedAt ? fmtElapsed(s.startedAt, s.finishedAt ?? now) : "--:--"}</span>
        <span className="text-muted">
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: model.hat }} />
          {model.label}
        </span>
        {s.depends_on.length > 0 && <span className="text-muted">after {s.depends_on.join(", ")}</span>}
        {live && <span className="text-sky">using stove 🔥</span>}
      </div>

      {s.error && <div className="rounded border border-ember/60 bg-ember/10 px-2 py-1 text-xs text-ember">🎫 {s.error}</div>}
      {s.output && (
        <div className="text-xs">
          <span className="text-muted">Dish: </span>
          {s.output.summary}
        </div>
      )}
      <div className={`truncate text-xs ${s.notes.length ? "" : "text-muted"}`} title={s.notes.join(" · ")}>
        Notes: {s.notes.length ? s.notes.join(" · ") : "none"}
      </div>

      {/* ingredients */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted">🧺</span>
        <span className="tracking-tight text-amber">{"▮".repeat(Math.max(1, pantry))}<span className="text-line">{"▯".repeat(10 - Math.max(1, pantry))}</span></span>
        <span className="text-muted">{s.token_budget.toLocaleString()} tok</span>
        <button className="tbtn tbtn-plain" disabled={busy} title="Fewer ingredients (others get them)" onClick={() => act({ stationId: s.id, action: "budget", token_budget: Math.round(s.token_budget * 0.8) })}>
          −
        </button>
        <button className="tbtn tbtn-plain" disabled={busy} title="More ingredients (taken from the others)" onClick={() => act({ stationId: s.id, action: "budget", token_budget: Math.round(s.token_budget * 1.25) })}>
          +
        </button>
        {s.usage && (
          <span className="ml-auto text-muted">
            {used.toLocaleString()} used · {fmtUsd(s.usage.costUsd)}
          </span>
        )}
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {live && !confirmingStop && (
          <button className="tbtn" disabled={busy} onClick={() => onConfirmStop(true)}>
            ■ Pull the chef
          </button>
        )}
        {live && confirmingStop && (
          <>
            <span className="text-xs text-ember">Pull {name} off the station?</span>
            <button
              className="tbtn tbtn-primary"
              disabled={busy}
              onClick={async () => {
                onConfirmStop(false);
                await act({ stationId: s.id, action: "stop" });
              }}
            >
              Yes, pull
            </button>
            <button className="tbtn tbtn-plain" onClick={() => onConfirmStop(false)}>
              Cancel
            </button>
          </>
        )}
        {(s.status === "done" || s.status === "burnt") && (
          <button className="tbtn" disabled={busy} onClick={() => void refire()}>
            🔥 Re-fire
          </button>
        )}
        {s.status === "waiting" && <span className="text-xs text-muted">Waiting for {s.depends_on.join(", ")}.</span>}
        {s.output && (
          <button className="tbtn tbtn-plain" onClick={onToggleExpand}>
            {expanded ? "Hide dish ▴" : "Show dish ▾"}
          </button>
        )}
        {(s.status === "done" || s.status === "burnt") && (
          <button className="tbtn tbtn-plain" onClick={onHide}>
            🗑 Hide
          </button>
        )}
      </div>

      {/* hire a chef */}
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">＋Hire:</span>
        <select
          className="tinput min-w-0 flex-1"
          value={PICK}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value !== PICK) void act({ stationId: s.id, action: "rerun", model: e.target.value });
          }}
        >
          <option value={PICK}>— Hand the station to a chef —</option>
          {MODELS.filter((m) => m.id !== s.model).map((m) => (
            <option key={m.id} value={m.id} disabled={!hireable.includes(m.id)}>
              {m.label} · ${m.inputPerM}/${m.outputPerM} per M{hireable.includes(m.id) ? "" : " · no key"}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-muted">Type in the chat to give this chef a note; it re-fires the station.</p>
      {error && <div className="text-xs text-ember">{error}</div>}

      {expanded && s.output && (
        <div className="mt-1 rounded border border-line bg-paper p-2 text-xs">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans leading-relaxed">{s.output.result}</pre>
          {s.output.assumptions.length > 0 && <div className="mt-2 text-muted">Assumptions: {s.output.assumptions.join("; ")}</div>}
        </div>
      )}
    </div>
  );
}
