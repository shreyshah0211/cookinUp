"use client";

// The challenge card at the top of the kitchen while you play one: the rule,
// a live line on how it is going, and the verdict once the order is served.

import { useState } from "react";

import type { Challenge, Verdict } from "@/lib/brigade/challenges";
import type { ServiceState } from "@/lib/brigade/schemas";

export function ChallengeTracker({ challenge: c, order, verdict, earned, onRetry, onBook }: { challenge: Challenge; order: ServiceState | null; verdict: Verdict | null; earned: boolean; onRetry: () => void; onBook: () => void }) {
  const [hint, setHint] = useState(false);
  const status = !order ? "Open the ticket and fire the order." : verdict ? verdict.line : order.status === "failed" ? "The kitchen caught fire. Try again." : c.progress(order);
  const tone = verdict ? (verdict.pass ? "pass" : "fail") : "live";
  return (
    <div className={`tracker tracker-${tone}`}>
      <div className="flex items-center gap-2">
        <span className="pix-tag">Challenge {c.n}</span>
        <span className="truncate text-[13px] font-semibold">{c.name}</span>
        <span className="flex-1" />
        {earned && <span className="pix-tag !bg-[#e2b53e] !text-[#2b2520]">★ Badge</span>}
        <button className="tbtn tbtn-plain !px-1 text-[11px]" onClick={onBook}>
          All
        </button>
      </div>
      <div className="mt-0.5 text-[12px]">
        <span className="text-muted">Rule:</span> {c.rule}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className={`tracker-dot tracker-dot-${tone}`} />
        <span className="min-w-0 flex-1 text-[12px] font-medium">{status}</span>
        {verdict && !verdict.pass && (
          <button className="pix-btn !py-1" onClick={onRetry}>
            Try again
          </button>
        )}
        <button className="tbtn tbtn-plain !px-1 text-[11px]" onClick={() => setHint((h) => !h)}>
          {hint ? "Hide hint" : "Hint"}
        </button>
      </div>
      {hint && <p className="mt-1 text-[12px] text-muted">{c.hint}</p>}
    </div>
  );
}
