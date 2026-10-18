"use client";

// The sidebar, in the shape of a desktop chat app: wordmark and collapse
// toggle, new chat, search, chats grouped by day with rename/delete, and the
// user block with settings at the bottom. Collapses to a rail of icons.

import { useEffect, useMemo, useRef, useState } from "react";

import type { Chat } from "@/lib/brigade/client";
import type { ServiceState } from "@/lib/brigade/schemas";

type Props = {
  chats: Chat[];
  activeId: string | null;
  states: Record<string, ServiceState>;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onPick: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  userName: string;
  onUserName: (name: string) => void;
  onOpenKeys: () => void;
  onOpenKitchenSettings: () => void;
};

export function Sidebar(p: Props) {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [userMenu, setUserMenu] = useState(false);
  const [nameDraft, setNameDraft] = useState(p.userName);
  const rootRef = useRef<HTMLElement>(null);

  // Any click outside closes the little menus.
  useEffect(() => {
    if (!menuFor && !userMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) {
        setMenuFor(null);
        setUserMenu(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuFor, userMenu]);

  // "Today" is read on the client after mount, so the prerender has no clock to disagree with.
  const [today, setToday] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const d = new Date();
      setToday(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const groups = useMemo(
    () => groupByDay(p.chats.filter((c) => !query.trim() || (c.title || "New chat").toLowerCase().includes(query.trim().toLowerCase())), today),
    [p.chats, query, today],
  );
  const initial = (p.userName.trim()[0] ?? "C").toUpperCase();

  if (p.collapsed) {
    return (
      <nav className="flex h-full w-12 shrink-0 flex-col items-center border-r border-line bg-background py-2">
        <button className="tbtn tbtn-plain !px-1.5" title="Open sidebar" onClick={p.onToggle}>
          ▸
        </button>
        <button className="tbtn tbtn-plain mt-2 !px-1.5 text-base" title="New chat" onClick={p.onNew}>
          ＋
        </button>
        <div className="mt-3 flex flex-col items-center gap-1 overflow-hidden">
          {[...p.chats].reverse().slice(0, 12).map((c) => (
            <button key={c.id} title={c.title || "New chat"} onClick={() => p.onPick(c.id)} className={`h-2 w-2 rounded-full ${c.id === p.activeId ? "bg-amber" : "bg-line hover:bg-muted"}`} />
          ))}
        </div>
        <span className="flex-1" />
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber text-sm font-bold text-[#151a26]"
          title={p.userName}
          onClick={() => {
            p.onToggle();
            setTimeout(() => setUserMenu(true), 0);
          }}
        >
          {initial}
        </button>
      </nav>
    );
  }

  return (
    <nav ref={rootRef} className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-background text-[13px]">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="font-semibold tracking-tight">cookinUp</span>
        <button className="tbtn tbtn-plain !px-1.5" title="Collapse sidebar" onClick={p.onToggle}>
          ◂
        </button>
      </div>
      <div className="px-2 pt-3">
        <button className="tbtn w-full !py-1.5 text-left" onClick={p.onNew}>
          ＋ New chat
        </button>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" className="tinput mt-2 w-full" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        {p.chats.length === 0 && <p className="px-2 pt-2 text-xs text-muted">Your chats will show up here.</p>}
        {groups.map(([label, list]) => (
          <div key={label} className="mt-3">
            <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
            {list.map((chat) => {
              const last = chat.orderIds.at(-1);
              const s = last ? p.states[last] : undefined;
              const busy = s && (s.status === "planning" || s.status === "cooking" || s.status === "plating");
              const dot = busy ? "#f4a261" : s?.status === "served" ? "#2a9d8f" : s?.status === "failed" ? "#e76f51" : "#4a5168";
              const active = chat.id === p.activeId;
              return (
                <div key={chat.id} className={`group relative mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 ${active ? "bg-paper" : "hover:bg-paper/60"}`} data-menu={menuFor === chat.id ? "" : undefined}>
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
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => p.onPick(chat.id)} title={chat.title}>
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${busy ? "animate-pulse" : ""}`} style={{ background: dot }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{chat.title || "New chat"}</span>
                        <span className="block text-[11px] text-muted">
                          {chat.orderIds.length === 0 ? "empty" : `${chat.orderIds.length} order${chat.orderIds.length > 1 ? "s" : ""}`}
                          {busy ? " · cooking" : s?.status === "served" ? " · served" : ""}
                        </span>
                      </span>
                    </button>
                  )}
                  <button
                    className={`tbtn tbtn-plain !px-1 ${menuFor === chat.id ? "" : "invisible group-hover:visible"}`}
                    title="More"
                    onClick={() => setMenuFor((m) => (m === chat.id ? null : chat.id))}
                  >
                    ⋯
                  </button>
                  {menuFor === chat.id && (
                    <div className="absolute right-1 top-full z-20 mt-1 w-36 rounded-md border border-line bg-paper p-1 shadow-xl">
                      <button
                        className="block w-full rounded px-2 py-1 text-left hover:bg-background"
                        onClick={() => {
                          setDraft(chat.title || "");
                          setRenaming(chat.id);
                          setMenuFor(null);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="block w-full rounded px-2 py-1 text-left text-ember hover:bg-background"
                        onClick={() => {
                          p.onDelete(chat.id);
                          setMenuFor(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* the user block */}
      <div className="relative border-t border-line p-2" data-menu={userMenu ? "" : undefined}>
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper" onClick={() => setUserMenu((v) => !v)}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-xs font-bold text-[#151a26]">{initial}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{p.userName}</span>
            <span className="block text-[11px] text-muted">Local kitchen · your own keys</span>
          </span>
          <span className="text-muted">⚙</span>
        </button>
        {userMenu && (
          <div className="absolute bottom-full left-2 right-2 z-20 mb-1 rounded-md border border-line bg-paper p-2 shadow-xl">
            <label className="block text-[11px] text-muted">
              Display name
              <form
                className="mt-1 flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  p.onUserName(nameDraft.trim() || "Chef");
                }}
              >
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="tinput min-w-0 flex-1 !py-0.5" />
                <button className="tbtn !py-0.5" type="submit">
                  Save
                </button>
              </form>
            </label>
            <div className="my-2 border-t border-line" />
            <button
              className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-background"
              onClick={() => {
                p.onOpenKeys();
                setUserMenu(false);
              }}
            >
              API keys
            </button>
            <button
              className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-background"
              onClick={() => {
                p.onOpenKitchenSettings();
                setUserMenu(false);
              }}
            >
              Kitchen settings
            </button>
            <div className="my-2 border-t border-line" />
            <button
              className="block w-full rounded px-2 py-1 text-left text-[13px] text-ember hover:bg-background"
              onClick={() => {
                p.onClearAll();
                setUserMenu(false);
              }}
            >
              Clear all chats
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

function groupByDay(chats: Chat[], today: number): [string, Chat[]][] {
  if (!today) return chats.length ? [["Chats", [...chats].sort((a, b) => b.createdAt - a.createdAt)]] : [];
  const day = 86_400_000;
  const buckets: Record<string, Chat[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of [...chats].sort((a, b) => b.createdAt - a.createdAt)) {
    const t = c.createdAt;
    const label = t >= today ? "Today" : t >= today - day ? "Yesterday" : t >= today - 7 * day ? "Previous 7 days" : "Older";
    buckets[label].push(c);
  }
  return Object.entries(buckets).filter(([, list]) => list.length > 0);
}
