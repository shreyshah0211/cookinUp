"use client";

// The heads-up display over the kitchen: the order book and the current
// order's name top-left; the ticket, the receipt and the keys top-right; a
// line of hints at the bottom.

import { fmtUsd } from "@/lib/brigade/client";

export type HudOpen = "orders" | "ticket" | "receipt" | "keys" | null;

export function Hud({
  title,
  status,
  cost,
  open,
  onOpen,
  learn,
  onLearn,
  book,
  bookOpen,
  onBook,
}: {
  title: string;
  status: string | null;
  cost: number;
  open: HudOpen;
  onOpen: (which: Exclude<HudOpen, null>) => void;
  learn: boolean;
  onLearn: () => void;
  /** Progress shown on the recipe book button. */
  book: string;
  bookOpen: boolean;
  onBook: () => void;
}) {
  const btn = (which: Exclude<HudOpen, null>, label: string) => (
    <button className={`pix-btn ${open === which ? "" : "pix-btn-plain"}`} onClick={() => onOpen(which)}>
      {label}
    </button>
  );
  return (
    <>
      <div className="hud left-3 top-3">
        {btn("orders", "Orders")}
        <span className="hud-chip" title={title}>
          <span className="truncate">{title}</span>
          {status && <span className="pix-tag ml-2">{status}</span>}
        </span>
      </div>
      <div className="hud right-3 top-3">
        <button className={`pix-btn ${bookOpen ? "" : "pix-btn-plain"}`} onClick={onBook} title="Challenges and lessons">
          Recipe book <span className="opacity-60">{book}</span>
        </button>
        {btn("ticket", "Ticket")}
        {btn("receipt", `Receipt ${fmtUsd(cost)}`)}
        {btn("keys", "Keys")}
        <button className={`pix-btn ${learn ? "" : "pix-btn-plain"}`} onClick={onLearn} title={learn ? "Learn mode is on: the kitchen explains itself. Click for the plain visualizer." : "Learn mode is off. Click to have the kitchen explain what it does."}>
          Learn {learn ? "on" : "off"}
        </button>
      </div>
      {!learn && (
        <div className="hud bottom-3 left-1/2 -translate-x-1/2">
          <span className="hud-hint">Click a chef to step in · click a thought cloud to read their mind · the pass shows the plate</span>
        </div>
      )}
    </>
  );
}
