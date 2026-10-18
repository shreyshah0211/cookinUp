"use client";

// The order ticket window: write an order and fire it; then every course of
// this chat in order — what you asked, the stations on it with their bars,
// re-fires, and the plated answer — with a line at the bottom for the next
// course.

import { useEffect, useRef, useState } from "react";

import { useClock } from "@/lib/brigade/client";
import type { ServiceState } from "@/lib/brigade/schemas";

import { Markdown } from "./Markdown";
import { MenuEditor } from "./MenuEditor";
import { PromptMeter, PromptScore } from "./PromptMeter";
import { Dots, StationRow } from "./StationRow";

export function OrderTicket({
  orders,
  busy,
  hasKeys,
  hireable,
  draft = "",
  onSend,
  onPick,
  onReplate,
  onOpenKeys,
}: {
  orders: ServiceState[];
  busy: boolean;
  hasKeys: boolean;
  hireable: string[];
  /** Text to start the order box with (a challenge's task). */
  draft?: string;
  onSend: (text: string) => void;
  onPick: (id: string) => void;
  onReplate: () => void;
  onOpenKeys: () => void;
}) {
  const [text, setText] = useState(draft);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const live = orders.at(-1) ?? null;
  const now = useClock(!!live && (live.status === "planning" || live.status === "cooking" || live.status === "plating"));
  const scrollKey = orders.map((o) => `${o.id}:${o.status}:${o.stations.map((s) => `${s.status}${s.history.length}`).join("")}`).join("|");
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [scrollKey]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fire = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="flex flex-col gap-3">
      {orders.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <h2 className="text-xl font-semibold tracking-tight">What are we cookin up today?</h2>
          <p className="max-w-sm text-[12px] text-muted">
            Write the order below and fire it. The head chef splits it into stations, the brigade cooks them in parallel, and the expediter plates the answer. Click any chef to step in.
          </p>
          {!hasKeys && (
            <button className="pix-btn mt-1" onClick={onOpenKeys}>
              Add API keys first
            </button>
          )}
        </div>
      )}
      {orders.map((o, i) => (
        <Course key={o.id} n={i + 1} state={o} now={now} live={i === orders.length - 1} hireable={hireable} onPick={onPick} onReplate={onReplate} />
      ))}
      <div ref={endRef} />
      <form
        className="sticky bottom-0 -mx-3.5 -mb-3 flex flex-wrap gap-2 border-t-2 border-dashed border-line bg-background px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          fire();
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              fire();
            }
          }}
          rows={2}
          placeholder={orders.length ? "Next course… (follows on from the ones above)" : "What are we cookin up today?"}
          className="tinput min-w-0 flex-1 resize-none"
        />
        <button className="pix-btn self-end" type="submit" disabled={busy || !text.trim()}>
          {busy ? "Firing…" : "Fire!"}
        </button>
        <div className="w-full">
          <PromptMeter text={text} />
        </div>
      </form>
    </div>
  );
}

/** One course: the order on a ticket, the stations and their bars, re-fires, the plate. */
function Course({ n, state, now, live, hireable, onPick, onReplate }: { n: number; state: ServiceState; now: number; live: boolean; hireable: string[]; onPick: (id: string) => void; onReplate: () => void }) {
  const [showNotes, setShowNotes] = useState(false);
  const s = state.stations;
  const notes = s
    .flatMap((st) =>
      st.history
        .map((h, run) => ({ h, run }))
        .filter(({ h }) => st.notes.includes(h.instruction))
        .map(({ h, run }) => ({ at: h.at, station: st, text: h.instruction, run })),
    )
    .sort((a, b) => a.at - b.at);
  const done = s.filter((x) => x.status === "done").length;
  const working = state.status === "planning" || state.status === "cooking" || state.status === "plating";
  const headline =
    state.status === "planning" ? "Head chef is writing the menu" : state.status === "review" ? "Your call: check the menu" : state.status === "plating" ? "Expediter is plating" : state.status === "served" ? "Order up" : state.status === "failed" ? "Stopped" : `Cooking · ${done}/${s.length}`;
  const pick = live ? onPick : () => {};
  return (
    <section className="flex flex-col gap-2">
      <div className="ticket">
        <div className="flex items-center gap-2">
          <span className="pix-tag">Course {n}</span>
          <PromptScore text={state.task} />
          <span className="text-[10px] text-muted">{new Date(state.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px]" title={state.task}>
          {state.task}
        </p>
      </div>

      <div className="border-2 border-line bg-paper px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide">
          <span>{headline}</span>
          {working && <Dots />}
        </div>
        {s.length === 0 && state.status === "planning" && <p className="mt-1 text-[12px] text-muted">Breaking the order into stations…</p>}
        {state.status === "review" && live && (
          <div className="mt-2">
            <MenuEditor state={state} hireable={hireable} />
          </div>
        )}
        {s.length > 0 && state.status !== "review" && (
          <ul className="mt-2 space-y-2">
            {s.map((st) => (
              <li key={st.id}>
                <StationRow station={st} now={now} onPick={pick} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {notes.map((note, i) => (
        <div key={`${note.station.id}-${note.at}-${i}`} className="flex flex-col gap-1.5">
          <div className="ticket ticket-note">
            <span className="pix-tag">To {note.station.title}</span>
            <p className="mt-1 whitespace-pre-wrap text-[13px]">{note.text}</p>
          </div>
          <div className="border-2 border-line bg-paper px-3 py-2">
            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide">Re-firing {note.station.title}</div>
            <StationRow station={note.station} run={note.run} now={now} onPick={pick} />
          </div>
        </div>
      ))}

      {state.status === "served" && state.plating && (
        <div className="plate">
          <Markdown text={state.plating.final} />
          {state.plating.conflicts.length > 0 && (
            <div className="mt-3 border-t border-dashed border-line pt-2 text-[12px]">
              <button className="tbtn tbtn-plain !px-0" onClick={() => setShowNotes((v) => !v)}>
                {showNotes ? "Hide" : "Show"} {state.plating.conflicts.length} note{state.plating.conflicts.length > 1 ? "s" : ""} from the expediter {showNotes ? "▴" : "▾"}
              </button>
              {showNotes && (
                <ul className="mt-1 space-y-2">
                  {state.plating.conflicts.map((c, i) => (
                    <li key={i} className="border border-line bg-paper p-2">
                      <p>{c.problem}</p>
                      {live && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.station_ids.map((id) => (
                            <button key={id} className="tbtn" onClick={() => onPick(id)}>
                              Talk to {s.find((x) => x.id === id)?.title ?? id}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {state.status === "failed" && (
        <div className="border-2 border-ember bg-ember/10 px-3 py-2 text-[13px]">
          <p>Kitchen fire: {state.error}</p>
          {live && s.length > 0 && (
            <button className="pix-btn mt-2" onClick={onReplate}>
              Plate again
            </button>
          )}
        </div>
      )}
    </section>
  );
}
