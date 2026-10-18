"use client";

// The order book: every chat as a page, grouped by day, with search, rename
// and delete; your name and the kitchen's settings at the bottom.

import { useEffect, useMemo, useState } from "react";

import type { Chat } from "@/lib/brigade/client";
import type { ServiceState } from "@/lib/brigade/schemas";

type Props = {
  chats: Chat[];
  activeId: string | null;
  states: Record<string, ServiceState>;
  onNew: () => void;
  onPick: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  userName: string;
  onUserName: (name: string) => void;
  onOpenKeys: () => void;
  onOpenSettings: () => void;
};

export function OrderBook(p: Props) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState(p.userName);
  const [confirmClear, setConfirmClear] = useState(false);

  // "Today" is read on the client after mount, so the prerender has no clock to disagree with.
  const [today, setToday] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const d = new Date();
      setToday(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const groups = useMemo(() => groupByDay(p.chats.filter((c) => !query.trim() || (c.title || "New order").toLowerCase().includes(query.trim().toLowerCase())), today), [p.chats, query, today]);

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders" className="tinput min-w-0 flex-1" />
        <button className="pix-btn" onClick={p.onNew}>
          + New
        </button>
      </div>

      <div className="max-h-[45vh] overflow-y-auto">
        {p.chats.length === 0 && <p className="text-xs text-muted">No orders yet.</p>}
        {groups.map(([label, list]) => (
          <div key={label} className="mb-2">
            <div className="pix-tag mb-1">{label}</div>
            {list.map((chat) => {
              const last = chat.orderIds.at(-1);
              const s = last ? p.states[last] : undefined;
              const busy = s && (s.status === "planning" || s.status === "cooking" || s.status === "plating");
              const dot = busy ? "#f4a261" : s?.status === "served" ? "#2a9d8f" : s?.status === "failed" ? "#e76f51" : "#b5ab96";
              const active = chat.id === p.activeId;
              return (
                <div key={chat.id} className={`group flex items-center gap-2 border-b border-dashed border-line px-1 py-1.5 ${active ? "bg-paper" : "hover:bg-paper/60"}`}>
                  <span className={`inline-block h-2 w-2 shrink-0 ${busy ? "animate-pulse" : ""}`} style={{ background: dot }} />
                  {renaming === chat.id ? (
                    <form
                      className="flex min-w-0 flex-1 gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        p.onRename(chat.id, draft.trim());
                        setRenaming(null);
                      }}
                    >
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setRenaming(null)} className="tinput min-w-0 flex-1 !py-0.5" />
                    </form>
                  ) : (
                    <button className="min-w-0 flex-1 text-left" onClick={() => p.onPick(chat.id)} title={chat.title}>
                      <span className="block truncate">{chat.title || "New order"}</span>
                      <span className="block text-[11px] text-muted">
                        {chat.orderIds.length === 0 ? "empty" : `${chat.orderIds.length} course${chat.orderIds.length > 1 ? "s" : ""}`}
                        {busy ? " · cooking" : s?.status === "served" ? " · served" : ""}
                      </span>
                    </button>
                  )}
                  <span className="invisible flex shrink-0 gap-1 group-hover:visible">
                    <button
                      className="tbtn tbtn-plain"
                      onClick={() => {
                        setDraft(chat.title || "");
                        setRenaming(chat.id);
                      }}
                    >
                      Rename
                    </button>
                    <button className="tbtn tbtn-plain !text-ember" onClick={() => p.onDelete(chat.id)}>
                      Delete
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t-2 border-dashed border-line pt-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            p.onUserName(nameDraft.trim() || "Chef");
          }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-amber text-xs font-bold text-[#2b2520]">{(nameDraft.trim()[0] ?? "C").toUpperCase()}</span>
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="tinput min-w-0 flex-1" title="Your name on the pass" />
          <button className="tbtn" type="submit">
            Save
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="pix-btn pix-btn-plain" onClick={p.onOpenKeys}>
            API keys
          </button>
          <button className="pix-btn pix-btn-plain" onClick={p.onOpenSettings}>
            Kitchen settings
          </button>
          <span className="flex-1" />
          {confirmClear ? (
            <>
              <button
                className="pix-btn pix-btn-danger"
                onClick={() => {
                  p.onClearAll();
                  setConfirmClear(false);
                }}
              >
                Yes, clear
              </button>
              <button className="pix-btn pix-btn-plain" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="pix-btn pix-btn-plain" onClick={() => setConfirmClear(true)}>
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByDay(chats: Chat[], today: number): [string, Chat[]][] {
  if (!today) return chats.length ? [["Orders", [...chats].sort((a, b) => b.createdAt - a.createdAt)]] : [];
  const day = 86_400_000;
  const buckets: Record<string, Chat[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of [...chats].sort((a, b) => b.createdAt - a.createdAt)) {
    const t = c.createdAt;
    const label = t >= today ? "Today" : t >= today - day ? "Yesterday" : t >= today - 7 * day ? "Previous 7 days" : "Older";
    buckets[label].push(c);
  }
  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}
