"use client";

// The game: the pixel kitchen fills the window, and everything else is a
// window that opens over it. The ticket (write an order, follow the courses,
// read the plate), the order book (every chat), the receipt, the keys, the
// head chef's settings, a chef's card, and whatever is on someone's mind.

import { useEffect, useMemo, useState } from "react";

import { conversationFor, loadChats, loadSnapshots, placeOrder, saveChats, saveSnapshots, stationAction, useKeys, useServices, type Chat } from "@/lib/brigade/client";
import { DEFAULT_BUDGET, DEFAULT_HEAD_CHEF, MODELS } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";

import { ChefCard } from "./ChefCard";
import { HeadChefCard } from "./HeadChefCard";
import { Hud, type HudOpen } from "./Hud";
import { KeysDialog } from "./KeysDialog";
import { MindPanel } from "./MindPanel";
import { OrderBook } from "./OrderBook";
import { OrderTicket } from "./OrderTicket";
import { PixelKitchen } from "./PixelKitchen";
import { Popup, type Anchor } from "./Popup";
import { add, ReceiptList } from "./Receipt";

const newChat = (): Chat => ({ id: crypto.randomUUID(), title: "", orderIds: [], createdAt: Date.now() });

type Open =
  | { kind: "ticket" }
  | { kind: "orders" }
  | { kind: "receipt" }
  | { kind: "keys" }
  | { kind: "head" }
  | { kind: "station"; id: string; mind?: boolean }
  | { kind: "mind"; who: "head" | "expo" };

const STATUS_WORD: Record<ServiceState["status"], string> = { planning: "planning", cooking: "cooking", plating: "plating", served: "served", failed: "fire" };

export function Kitchen() {
  const keys = useKeys();
  const hasKeys = !!(keys.anthropic || keys.openai);
  const [headChef, setHeadChef] = useState(DEFAULT_HEAD_CHEF);
  const [totalBudget, setTotalBudget] = useState(DEFAULT_BUDGET);
  // Any chef whose provider has a key can be hired, now or on a re-run.
  const hireable = useMemo(() => MODELS.filter((m) => keys[m.provider]).map((m) => m.id), [keys]);

  // Which window is open, and where it was opened from.
  const [open, setOpen] = useState<Open | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const show = (o: Open | null, at: Anchor | null = null) => {
    setOpen(o);
    setAnchor(at);
  };

  // Who you are, remembered in this browser.
  const [userName, setUserName] = useState("Chef");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setUserName(localStorage.getItem("cookinup.name") || "Chef");
      } catch {
        // No storage: defaults are fine.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const renameUser = (name: string) => {
    setUserName(name);
    try {
      localStorage.setItem("cookinup.name", name);
    } catch {
      // ignore
    }
  };

  // Chats and their orders, remembered in this browser.
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, ServiceState>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // Restored state belongs in an effect: localStorage is not there on the server.
    const t = setTimeout(() => {
      const stored = loadChats();
      const first = stored.length ? stored : [newChat()];
      setChats(first);
      setActiveId(first[first.length - 1].id);
      setSnapshots(loadSnapshots());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (loaded) saveChats(chats);
  }, [chats, loaded]);

  const active = chats.find((c) => c.id === activeId) ?? null;
  const orderIds = useMemo(() => active?.orderIds ?? [], [active]);
  const allOrderIds = useMemo(() => chats.flatMap((c) => c.orderIds), [chats]);
  const live = useServices(allOrderIds, snapshots);
  const states = useMemo(() => ({ ...snapshots, ...live }), [snapshots, live]);
  useEffect(() => {
    if (loaded) saveSnapshots(states, allOrderIds);
  }, [states, allOrderIds, loaded]);

  const serviceId = orderIds.at(-1) ?? null;
  const state = serviceId ? (states[serviceId] ?? null) : null;
  const orders = useMemo(() => orderIds.map((id) => states[id]).filter((s): s is ServiceState => !!s), [orderIds, states]);
  const stations = useMemo(() => state?.stations ?? [], [state]);
  const events = useMemo(() => state?.events ?? [], [state]);
  const cost = orders.reduce((acc, s) => add(acc, s.bill), { inputTokens: 0, outputTokens: 0, costUsd: 0 }).costUsd;

  // Order up: the plate opens on its own, unless you are busy in another window.
  const servedKey = state?.status === "served" ? state.id : null;
  useEffect(() => {
    if (!servedKey) return;
    const t = setTimeout(() => setOpen((o) => (o === null || o.kind === "ticket" ? { kind: "ticket" } : o)), 600);
    return () => clearTimeout(t);
  }, [servedKey]);

  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const order = async (task: string) => {
    if (!active) return;
    if (!hasKeys) {
      show({ kind: "keys" });
      setOrderError("Add your API keys first.");
      return;
    }
    setOrdering(true);
    setOrderError(null);
    try {
      // Everything served so far in this chat goes with the order, so follow-ups make sense.
      const context = conversationFor(orders);
      const id = await placeOrder({ task, totalBudget, headChef, keys, context });
      setChats((cs) => cs.map((c) => (c.id === active.id ? { ...c, title: c.title || task.slice(0, 60), orderIds: [...c.orderIds, id] } : c)));
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdering(false);
    }
  };

  const startChat = () => {
    // An empty chat is already a fresh start; otherwise open a new one.
    if (!(active && active.orderIds.length === 0)) {
      const c = newChat();
      setChats((cs) => [...cs, c]);
      setActiveId(c.id);
    }
    show({ kind: "ticket" });
  };
  const removeChat = (id: string) => {
    const rest = chats.filter((c) => c.id !== id);
    const next = rest.length ? rest : [newChat()];
    setChats(next);
    if (id === activeId) setActiveId(next[next.length - 1].id);
  };
  const renameChat = (id: string, title: string) => setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  const clearChats = () => {
    const c = newChat();
    setChats([c]);
    setActiveId(c.id);
    show(null);
  };

  // What the canvas highlights.
  const pickedId = open?.kind === "station" ? open.id : open?.kind === "head" ? "head" : open?.kind === "ticket" ? "expo" : open?.kind === "mind" ? open.who : null;
  const onPick = (id: string | null, at: Anchor) => {
    if (!id) return show(null);
    if (id.startsWith("thought:")) {
      const who = id.slice(8);
      return who === "head" || who === "expo" ? show({ kind: "mind", who }, at) : show({ kind: "station", id: who, mind: true }, at);
    }
    if (id === "head") return show({ kind: "head" }, at);
    if (id === "expo") return show({ kind: "ticket" });
    show({ kind: "station", id }, at);
  };
  const hudOpen: HudOpen = open && (open.kind === "orders" || open.kind === "ticket" || open.kind === "receipt" || open.kind === "keys") ? open.kind : null;
  const toggleHud = (which: Exclude<HudOpen, null>) => show(open?.kind === which ? null : { kind: which });

  const picked = open?.kind === "station" ? stations.find((s) => s.id === open.id) : undefined;
  const replate = () => state && void stationAction(state.id, { action: "replate" }).catch(() => {});

  return (
    <div className="relative h-dvh w-screen overflow-hidden">
      <PixelKitchen state={state} pickedId={pickedId} onPick={onPick} />
      <Hud title={active?.title || "New order"} status={state ? STATUS_WORD[state.status] : null} cost={cost} open={hudOpen} onOpen={toggleHud} />

      {open?.kind === "ticket" && (
        <Popup title="Order ticket" tag={active?.title ? `${orders.length} course${orders.length === 1 ? "" : "s"}` : undefined} width={620} onClose={() => show(null)}>
          <OrderTicket orders={orders} busy={ordering} hasKeys={hasKeys} onSend={(t) => void order(t)} onPick={(id) => show({ kind: "station", id })} onReplate={replate} onOpenKeys={() => show({ kind: "keys" })} />
        </Popup>
      )}
      {open?.kind === "orders" && (
        <Popup title="Order book" width={420} anchor={{ x: 16, y: 56 }} onClose={() => show(null)}>
          <OrderBook
            chats={chats}
            activeId={activeId}
            states={states}
            onNew={startChat}
            onPick={(id) => {
              setActiveId(id);
              show({ kind: "ticket" });
            }}
            onRename={renameChat}
            onDelete={removeChat}
            onClearAll={clearChats}
            userName={userName}
            onUserName={renameUser}
            onOpenKeys={() => show({ kind: "keys" })}
            onOpenSettings={() => show({ kind: "head" })}
          />
        </Popup>
      )}
      {open?.kind === "receipt" && (
        <Popup title="Token receipt" width={360} anchor={{ x: window.innerWidth - 16, y: 56 }} onClose={() => show(null)}>
          <ReceiptList services={orders} />
        </Popup>
      )}
      {open?.kind === "keys" && (
        <Popup title="API keys" width={460} onClose={() => show(null)}>
          <KeysDialog keys={keys} onClose={() => show(null)} />
        </Popup>
      )}
      {open?.kind === "head" && (
        <Popup title="Head chef" tag="settings" width={400} anchor={anchor} onClose={() => show(null)}>
          <HeadChefCard headChef={headChef} onHeadChef={setHeadChef} totalBudget={totalBudget} onTotalBudget={setTotalBudget} keys={keys} onKeys={() => show({ kind: "keys" })} />
        </Popup>
      )}
      {open?.kind === "mind" && (
        <Popup title={open.who === "head" ? "Head chef" : "Expediter"} tag="thinking" width={420} anchor={anchor} onClose={() => show(null)}>
          <MindPanel who={open.who} events={events} stations={stations} />
        </Popup>
      )}
      {open?.kind === "station" && picked && state && serviceId && (
        <Popup title={picked.title} tag={open.mind ? "thinking" : "station"} width={420} anchor={anchor} onClose={() => show(null)}>
          <ChefCard key={picked.id} serviceId={serviceId} station={picked} stations={stations} events={events} hireable={hireable} mindFirst={open.mind} onDone={() => show({ kind: "ticket" })} />
        </Popup>
      )}

      {orderError && (
        <div className="pix-win bottom-16 left-1/2 !max-w-md -translate-x-1/2 cursor-pointer" onClick={() => setOrderError(null)}>
          <div className="pix-body text-xs text-ember">{orderError}</div>
        </div>
      )}
    </div>
  );
}
