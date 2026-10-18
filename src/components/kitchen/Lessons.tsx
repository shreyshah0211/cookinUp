"use client";

// Lessons: the ideas the kitchen teaches, unlocked the first time each one
// happens in front of you, with the line from your own run. Also the "why"
// window for one spot in the kitchen, and the toast for unlocks and badges.

import { LESSONS, TOPICS, type Topic } from "@/lib/brigade/lessons";
import type { KitchenEvent } from "@/lib/brigade/schemas";

export type Learned = Partial<Record<Topic, { text: string; at: number }>>;

/** A rank by lessons learned, from the dish pit to the pass. */
export function rankFor(n: number): string {
  return n >= TOPICS.length ? "Head chef" : n >= 6 ? "Sous chef" : n >= 3 ? "Line cook" : "Dishwasher";
}

export function LessonBook({ learned, focus }: { learned: Learned; focus?: Topic }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {TOPICS.map((t) => {
        const l = LESSONS[t];
        const got = learned[t];
        return (
          <div key={t} className={`lesson ${got ? "" : "lesson-locked"} ${focus === t ? "lesson-focus" : ""}`} style={{ borderLeftColor: got ? l.color : undefined }}>
            <div className="text-[12px] font-semibold">{got ? l.title : "???"}</div>
            <p className="mt-0.5 text-[12px] leading-snug">{got ? l.idea : <span className="text-muted">{l.hint}</span>}</p>
            {got && (
              <p className="mt-1 truncate text-[11px] text-muted" title={got.text}>
                Yours: {got.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Every explanation about one spot, newest first; the idea behind it once, underneath. */
export function WhyList({ notes }: { notes: KitchenEvent[] }) {
  if (notes.length === 0) return <p className="text-[12px] text-muted">Nothing to explain here yet.</p>;
  const latest = notes.at(-1)!;
  const idea = latest.topic ? LESSONS[latest.topic] : undefined;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {[...notes].reverse().map((e) => {
          const l = e.topic ? LESSONS[e.topic] : undefined;
          return (
            <li key={e.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="inline-block h-2 w-2 shrink-0" style={{ background: l?.color ?? "#e9a23b" }} title={l?.title} />
              <span>{e.text}</span>
            </li>
          );
        })}
      </ul>
      {idea && (
        <p className="border-t border-dashed border-line pt-2 text-[12px] text-muted">
          <span className="font-semibold text-foreground">{idea.title}:</span> {idea.idea}
        </p>
      )}
    </div>
  );
}

export function Toast({ kicker, title, gold, onOpen }: { kicker: string; title: string; gold?: boolean; onOpen: () => void }) {
  return (
    <button className={`toast ${gold ? "toast-gold" : ""}`} onClick={onOpen}>
      <span className="toast-star">★</span>
      <span className="flex flex-col items-start text-left">
        <span className="font-[family-name:var(--font-pixel)] text-[8px] uppercase tracking-wide text-[#2b2520]">{kicker}</span>
        <span className="text-[13px] font-semibold">{title}</span>
      </span>
    </button>
  );
}
