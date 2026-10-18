"use client";

// Kitchen notes: a slim strip under the kitchen, one short line per thing
// worth understanding, newest on top. Click a line for the "why"; the recipe
// book holds the lessons and challenges.

import { LESSONS } from "@/lib/brigade/lessons";
import type { KitchenEvent } from "@/lib/brigade/schemas";

export function Ticker({ notes, nameOf, onWhy }: { notes: KitchenEvent[]; nameOf: (id: string) => string; onWhy: (who: string) => void }) {
  const lines = [...notes].reverse();
  return (
    <div className="ticker">
      <span className="ticker-label">Notes</span>
      <ul className="ticker-list">
        {lines.length === 0 && <li className="text-[12px] text-[#a79f8f]">Fire an order: the kitchen explains itself here.</li>}
        {lines.map((e, i) => {
          const lesson = e.topic ? LESSONS[e.topic] : undefined;
          return (
            <li key={e.id} className={i === 0 ? "ticker-new" : ""}>
              <button className="flex w-full items-center gap-2 text-left" onClick={() => onWhy(e.from)} title={lesson ? `${lesson.title}: ${lesson.idea}` : undefined}>
                <span className="inline-block h-2 w-2 shrink-0" style={{ background: lesson?.color ?? "#e9a23b" }} />
                <span className="shrink-0 text-[11px] font-semibold text-amber">{nameOf(e.from)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[#f3ecdc]">{e.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
