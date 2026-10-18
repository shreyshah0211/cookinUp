"use client";

// The recipe book: the five challenges (start one, see your badges) and the
// lessons, on two tabs. Challenges unlock one after another.

import { useState } from "react";

import { CHALLENGES, type Challenge } from "@/lib/brigade/challenges";
import { TOPICS, type Topic } from "@/lib/brigade/lessons";

import { LessonBook, rankFor, type Learned } from "./Lessons";

export type Badges = Record<string, { at: number; line: string }>;

export function RecipeBook({ tab: initial, badges, learned, focus, activeChallenge, onStart }: { tab: "challenges" | "lessons"; badges: Badges; learned: Learned; focus?: Topic; activeChallenge?: string; onStart: (c: Challenge) => void }) {
  const [tab, setTab] = useState(initial);
  const lessons = TOPICS.filter((t) => learned[t]).length;
  const earned = CHALLENGES.filter((c) => badges[c.id]).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button className={`pix-btn ${tab === "challenges" ? "" : "pix-btn-plain"}`} onClick={() => setTab("challenges")}>
          Challenges {earned}/{CHALLENGES.length}
        </button>
        <button className={`pix-btn ${tab === "lessons" ? "" : "pix-btn-plain"}`} onClick={() => setTab("lessons")}>
          Lessons {lessons}/{TOPICS.length}
        </button>
        <span className="flex-1" />
        <span className="pix-tag self-center">{rankFor(lessons)}</span>
      </div>
      {tab === "challenges" ? <Challenges badges={badges} activeChallenge={activeChallenge} onStart={onStart} /> : <LessonBook learned={learned} focus={focus} />}
    </div>
  );
}

function Challenges({ badges, activeChallenge, onStart }: { badges: Badges; activeChallenge?: string; onStart: (c: Challenge) => void }) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <ol className="flex flex-col gap-2">
      {CHALLENGES.map((c, i) => {
        const done = badges[c.id];
        const open = i === 0 || !!badges[CHALLENGES[i - 1].id] || !!done;
        const active = activeChallenge === c.id;
        return (
          <li key={c.id} className={`challenge ${open ? "" : "challenge-locked"} ${active ? "challenge-active" : ""}`}>
            <span className={`medal ${done ? "medal-won" : ""}`} title={done ? `Badge earned: ${c.name}` : "Badge not earned yet"}>
              {done ? "★" : c.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold">{c.name}</span>
                <span className="text-[11px] text-muted">{c.teaches}</span>
              </div>
              <p className="text-[12px]">
                <span className="font-semibold">Rule:</span> {c.rule}
              </p>
              {hint === c.id && <p className="mt-1 text-[12px] text-muted">{c.hint}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {open ? (
                <button className={`pix-btn ${done ? "pix-btn-plain" : ""}`} onClick={() => onStart(c)}>
                  {active ? "Resume" : done ? "Replay" : "Start"}
                </button>
              ) : (
                <span className="pix-tag">Locked</span>
              )}
              {open && (
                <button className="tbtn tbtn-plain !px-0 text-[11px]" onClick={() => setHint((h) => (h === c.id ? null : c.id))}>
                  {hint === c.id ? "Hide hint" : "Hint"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
