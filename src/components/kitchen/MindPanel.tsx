"use client";

// What is going on in someone's head: their thoughts, what they looked up,
// who they talked to and what was said, newest first. Opened from a thought
// bubble, or shown at the bottom of a chef's card.

import type { KitchenEvent, StationState } from "@/lib/brigade/schemas";

export function MindPanel({ who, events, stations, limit = 30 }: { who: string; events: KitchenEvent[]; stations: StationState[]; limit?: number }) {
  const name = (id: string) => (id === "head" ? "Head chef" : id === "expo" ? "Expediter" : (stations.find((s) => s.id === id)?.title ?? id));
  const mine = events.filter((e) => e.from === who || e.to === who).slice(-limit).reverse();
  if (mine.length === 0) return <p className="text-xs text-muted">Nothing on their mind yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {mine.map((e) => {
        const tag =
          e.kind === "think"
            ? "thinks"
            : e.kind === "say"
              ? e.from === who
                ? e.to
                  ? `to ${name(e.to)}`
                  : "says"
                : `${name(e.from)} says`
              : e.tool === "web_search"
                ? e.done
                  ? "read"
                  : "reading"
                : e.done
                  ? `${name(e.to ?? "")} answered`
                  : `asks ${name(e.to ?? "")}`;
        const color = e.kind === "think" ? "#8e7dbe" : e.kind === "tool" ? "#2a9d8f" : e.from === who ? "#c0783a" : "#4d6fb3";
        return (
          <li key={e.id} className="flex gap-2 border-b border-dashed border-line pb-1.5 text-[12px] last:border-0">
            <span className="w-14 shrink-0 font-mono text-[10px] text-muted">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="min-w-0 flex-1">
              <span className="pix-tag mr-1.5 align-middle" style={{ background: color }}>
                {tag}
              </span>
              <span className="align-middle">{e.kind === "tool" && e.tool === "web_search" ? `“${e.text}”` : e.text}</span>
              {e.detail && e.detail !== e.text && (
                <details className="mt-0.5">
                  <summary className="cursor-pointer text-[11px] text-muted">more</summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap border border-line bg-paper p-2 font-sans text-[11px] leading-relaxed">{e.detail}</pre>
                </details>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
