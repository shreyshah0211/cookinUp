"use client";

// The chat on the right, shaped like any assistant chat: your order, one
// reply card with a progress bar per subtask while the kitchen works, then
// the final answer as a normal message. Enter sends: a new order, or a note
// to the station you have selected.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { fmtElapsed, useClock } from "@/lib/brigade/client";
import { modelInfo } from "@/lib/brigade/models";
import type { ServiceState, StationState } from "@/lib/brigade/schemas";
import { lookFor } from "@/pixel/sprites";

import { PixelChef } from "./PixelChef";

type Props = {
  width: number;
  state: ServiceState | null;
  context?: React.ReactNode;
  /** Who the input talks to: the kitchen, or a station by name. */
  target: { id: string; name: string } | null;
  onClearTarget: () => void;
  onSend: (text: string) => void;
  onPick: (stationId: string) => void;
  onReplate: () => void;
  busy: boolean;
  hint?: string;
};

export function ChatPanel({ width, state, context, target, onClearTarget, onSend, onPick, onReplate, busy, hint }: Props) {
  const [text, setText] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stations = useMemo(() => state?.stations ?? [], [state]);
  const now = useClock(stations.some((s) => s.status === "cooking") || state?.status === "planning" || state?.status === "plating");

  // Notes you sent to chefs, as later messages in the thread.
  const notes = useMemo(
    () =>
      stations
        .flatMap((s) => s.history.filter((h) => s.notes.includes(h.instruction)).map((h) => ({ at: h.at, station: s, text: h.instruction })))
        .sort((a, b) => a.at - b.at),
    [stations],
  );
  const served = state?.status === "served" && state.plating;
  const failed = state?.status === "failed";
  const scrollKey = `${state?.status}-${stations.map((s) => s.status).join("")}-${notes.length}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [scrollKey]);
  useEffect(() => {
    if (target) inputRef.current?.focus();
  }, [target]);

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  };

  return (
    <aside className="flex h-full shrink-0 flex-col bg-background text-[14px]" style={{ width }}>
      {context && <div className="max-h-[55%] shrink-0 overflow-y-auto border-b border-line p-3">{context}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4">
          {!state && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">What are we cookin up today?</h2>
              {hint && <p className="max-w-md text-[13px] text-muted">{hint}</p>}
            </div>
          )}
          {state && (
            <>
              <UserMessage text={state.task} />
              <AssistantMessage>
                <WorkCard state={state} now={now} onPick={onPick} />
              </AssistantMessage>
              {notes.map((n, i) => (
                <UserMessage key={`${n.station.id}-${n.at}-${i}`} text={n.text} to={n.station.title} />
              ))}
              {served && (
                <AssistantMessage>
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.plating!.final}</ReactMarkdown>
                  </div>
                  {state.plating!.conflicts.length > 0 && (
                    <div className="mt-3 border-t border-line pt-2 text-[12px]">
                      <button className="tbtn tbtn-plain !px-0" onClick={() => setShowNotes((v) => !v)}>
                        {showNotes ? "Hide" : "Show"} {state.plating!.conflicts.length} note{state.plating!.conflicts.length > 1 ? "s" : ""} from the expediter {showNotes ? "▴" : "▾"}
                      </button>
                      {showNotes && (
                        <ul className="mt-1 space-y-2">
                          {state.plating!.conflicts.map((c, i) => (
                            <li key={i} className="rounded border border-line bg-paper p-2">
                              <p>{c.problem}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {c.station_ids.map((id) => {
                                  const s = stations.find((x) => x.id === id);
                                  return (
                                    <button key={id} className="tbtn" onClick={() => onPick(id)}>
                                      Talk to {s?.title ?? id}
                                    </button>
                                  );
                                })}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </AssistantMessage>
              )}
              {failed && (
                <AssistantMessage tone="error">
                  <p>Something went wrong in the kitchen: {state.error}</p>
                  {stations.length > 0 && (
                    <button className="tbtn mt-2" onClick={onReplate}>
                      Try plating again
                    </button>
                  )}
                </AssistantMessage>
              )}
            </>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-line p-3">
        <div className="mx-auto max-w-[720px]">
          {target && (
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <span>
                Note for <strong className="text-foreground">{target.name}</strong>
              </span>
              <button className="tbtn tbtn-plain" onClick={onClearTarget} title="Talk to the kitchen instead (Esc)">
                ✕
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape" && target) onClearTarget();
            }}
            rows={2}
            placeholder={target ? `Tell ${target.name} what to change…` : state ? "Ask for something else…" : "What are we cookin up today?"}
            className="tinput w-full resize-none rounded-xl px-3 py-2 text-[14px]"
          />
        </div>
      </div>
    </aside>
  );
}

function UserMessage({ text, to }: { text: string; to?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#2a3346] px-4 py-2.5">
        {to && <div className="mb-0.5 text-[11px] text-muted">to {to}</div>}
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}

function AssistantMessage({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return <div className={`rounded-2xl rounded-tl-md px-4 py-3 ${tone === "error" ? "border border-ember/60 bg-ember/10" : "bg-paper"}`}>{children}</div>;
}

/** One reply card: the menu as a list of subtasks, each with a progress bar. */
function WorkCard({ state, now, onPick }: { state: ServiceState; now: number; onPick: (id: string) => void }) {
  const s = state.stations;
  const done = s.filter((x) => x.status === "done").length;
  const title =
    state.status === "planning"
      ? "Working out the steps"
      : state.status === "plating"
        ? "Putting it all together"
        : state.status === "served"
          ? "Done"
          : state.status === "failed"
            ? "Stopped"
            : `Working on it · ${done}/${s.length}`;
  const live = state.status === "planning" || state.status === "cooking" || state.status === "plating";
  return (
    <div>
      <div className="flex items-center gap-2 font-medium">
        <span>{title}</span>
        {live && <Dots />}
      </div>
      {s.length === 0 && state.status === "planning" && <p className="mt-1 text-[13px] text-muted">The head chef is breaking your request into stations.</p>}
      {s.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {s.map((st) => (
            <li key={st.id}>
              <button className="group flex w-full items-start gap-2.5 text-left" onClick={() => onPick(st.id)} title="Open this station">
                {/* the chef working this subtask, as they look in the kitchen */}
                <span className="shrink-0" title={modelInfo(st.model).label}>
                  <PixelChef hat={modelInfo(st.model).hat} look={lookFor(st.id)} scale={1.25} />
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className="flex items-baseline gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate group-hover:underline">{st.title}</span>
                    <span className="shrink-0 text-[11px] text-muted">{modelInfo(st.model).label}</span>
                    <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted">{st.status === "cooking" ? fmtElapsed(st.startedAt, now) : st.status === "done" || st.status === "burnt" ? fmtElapsed(st.startedAt, st.finishedAt) : ""}</span>
                  </span>
                  <Bar station={st} now={now} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.status === "plating" && <p className="mt-3 text-[13px] text-muted">All parts are in; combining them into one answer.</p>}
    </div>
  );
}

/** Progress for one subtask: a guess from elapsed time while cooking, full when done, red when burnt. */
function Bar({ station: st, now }: { station: StationState; now: number }) {
  const elapsed = st.startedAt ? (now - st.startedAt) / 1000 : 0;
  const expected = 25 + st.token_budget / 80;
  const pct = st.status === "done" ? 100 : st.status === "burnt" ? 100 : st.status === "cooking" ? Math.min(92, 8 + (elapsed / expected) * 84) : 0;
  const color = st.status === "done" ? "#2a9d8f" : st.status === "burnt" ? "#e76f51" : st.status === "cooking" ? "#f4a261" : "#4a5168";
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2a3346]">
        <div className={`h-full rounded-full transition-[width] duration-700 ${st.status === "cooking" ? "shimmer" : ""}`} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-16 shrink-0 text-[11px]" style={{ color }}>
        {st.status === "done" ? "Done" : st.status === "burnt" ? "Failed" : st.status === "cooking" ? "Working" : "Queued"}
      </span>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot inline-block h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </span>
  );
}
