"use client";

// The app: chats on the left, the pixel kitchen in the middle, the chat on the
// right. Type an order and press Enter; click a chef to talk to them; click the
// head chef for settings. A chat is a run of orders; switching chats changes
// the brigade in the kitchen.

import { useEffect, useMemo, useState } from "react";

import { conversationFor, loadChats, loadSnapshots, placeOrder, saveChats, saveSnapshots, stationAction, useKeys, useServices, type Chat } from "@/lib/brigade/client";
import { DEFAULT_BUDGET, DEFAULT_HEAD_CHEF, MODELS } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";

import { ChatPanel } from "./ChatPanel";
import { ChefCard } from "./ChefCard";
import { HeadChefCard } from "./HeadChefCard";
import { KeysDialog } from "./KeysDialog";
import { NeedsYou } from "./NeedsYou";
import { PixelKitchen } from "./PixelKitchen";
import { Receipt } from "./Receipt";
import { Sidebar } from "./Sidebar";

const newChat = (): Chat => ({ id: crypto.randomUUID(), title: "", orderIds: [], createdAt: Date.now() });

export function Kitchen() {
  const keys = useKeys();
  const hasKeys = !!(keys.anthropic || keys.openai);
  const [showKeys, setShowKeys] = useState(false);
  const [headChef, setHeadChef] = useState(DEFAULT_HEAD_CHEF);
  const [totalBudget, setTotalBudget] = useState(DEFAULT_BUDGET);
  // Any chef whose provider has a key can be hired, now or on a re-run.
  const hireable = useMemo(() => MODELS.filter((m) => keys[m.provider]).map((m) => m.id), [keys]);

  // The chat's width; drag the divider to change it, and the kitchen refills the rest.
  const [chatWidth, setChatWidth] = useState(560);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setChatWidth(Math.min(window.innerWidth * 0.6, Math.max(320, window.innerWidth - e.clientX)));
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  // Sidebar state and who you are, remembered in this browser.
  const [collapsed, setCollapsed] = useState(false);
  const [userName, setUserName] = useState("Chef");
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem("cookinup.sidebar") === "collapsed");
        setUserName(localStorage.getItem("cookinup.name") || "Chef");
      } catch {
        // No storage: defaults are fine.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("cookinup.sidebar", c ? "open" : "collapsed");
      } catch {
        // ignore
      }
      return !c;
    });
  };
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
  const history = orderIds.slice(0, -1).map((id) => states[id]).filter((s): s is ServiceState => !!s);
  const stations = useMemo(() => state?.stations ?? [], [state]);

  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  // "head", "expo", a station id, or nothing.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = stations.find((s) => s.id === pickedId) ?? null;

  const order = async (task: string) => {
    if (!active) return;
    setOrdering(true);
    setOrderError(null);
    setPickedId(null);
    try {
      // Everything served so far in this chat goes with the order, so follow-ups make sense.
      const context = conversationFor([...history, ...(state ? [state] : [])]);
      const id = await placeOrder({ task, totalBudget, headChef, keys, context });
      setChats((cs) => cs.map((c) => (c.id === active.id ? { ...c, title: c.title || task.slice(0, 60), orderIds: [...c.orderIds, id] } : c)));
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdering(false);
    }
  };

  const send = (text: string) => {
    if (picked && serviceId) {
      void stationAction(serviceId, { stationId: picked.id, action: "rerun", instruction: text }).catch((e) => setOrderError(e instanceof Error ? e.message : String(e)));
      setPickedId(null);
      return;
    }
    if (!hasKeys) {
      setPickedId("head");
      setOrderError("Add your API keys first: click the head chef.");
      return;
    }
    void order(text);
  };

  const startChat = () => {
    // An empty chat is already a fresh start; otherwise open a new one.
    if (active && active.orderIds.length === 0) return;
    const c = newChat();
    setChats((cs) => [...cs, c]);
    setActiveId(c.id);
    setPickedId(null);
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
    setPickedId(null);
  };

  const context = (() => {
    if (pickedId === "head") {
      return (
        <HeadChefCard
          headChef={headChef}
          onHeadChef={setHeadChef}
          totalBudget={totalBudget}
          onTotalBudget={setTotalBudget}
          keys={keys}
          onKeys={() => setShowKeys(true)}
          onClose={() => setPickedId(null)}
        />
      );
    }
    if (pickedId === "expo" && state) {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">The pass</span>
            <button className="tbtn tbtn-plain" onClick={() => setPickedId(null)}>
              ✕
            </button>
          </div>
          <NeedsYou state={state} onSendBack={(id) => setPickedId(id)} onReplate={() => void stationAction(state.id, { action: "replate" }).catch(() => {})} />
          {!state.plating && state.status !== "plating" && state.status !== "failed" && <p className="text-xs text-muted">Dishes land here as the expediter plates them.</p>}
        </div>
      );
    }
    if (picked && state && serviceId) {
      return <ChefCard key={picked.id} serviceId={serviceId} station={picked} hireable={hireable} onClose={() => setPickedId(null)} />;
    }
    return undefined;
  })();

  return (
    <div className="flex h-dvh">
      <Sidebar
        chats={chats}
        activeId={activeId}
        states={states}
        collapsed={collapsed}
        onToggle={toggleSidebar}
        onNew={startChat}
        onPick={(id) => {
          setActiveId(id);
          setPickedId(null);
        }}
        onRename={renameChat}
        onDelete={removeChat}
        onClearAll={clearChats}
        userName={userName}
        onUserName={renameUser}
        onOpenKeys={() => setShowKeys(true)}
        onOpenKitchenSettings={() => setPickedId("head")}
      />
      <main className={`flex min-w-0 flex-1 ${dragging ? "select-none" : ""}`}>
        <section className="min-w-0 flex-1">
          <PixelKitchen state={state} pickedId={pickedId} onPick={setPickedId} />
        </section>
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onPointerDown={() => setDragging(true)}
          className={`relative z-10 w-2.5 shrink-0 cursor-col-resize border-l border-line hover:bg-amber/40 ${dragging ? "bg-amber/60" : ""}`}
        />
        <ChatPanel
          width={chatWidth}
          state={state}
          history={history}
          corner={
            orderIds.length > 0 ? (
              <Receipt services={[...history, ...(state ? [state] : [])]} />
            ) : !hasKeys ? (
              <button className="tbtn tbtn-primary" onClick={() => setShowKeys(true)}>
                Add API keys
              </button>
            ) : undefined
          }
          context={context}
          target={picked ? { id: picked.id, name: picked.title } : null}
          onClearTarget={() => setPickedId(null)}
          onSend={send}
          onPick={(id) => setPickedId(id)}
          onReplate={() => state && void stationAction(state.id, { action: "replate" }).catch(() => {})}
          busy={ordering}
          hint={hasKeys ? "Type an order and press Enter. Click the head chef to change who runs the pass, the pantry, or who is on shift." : "Click the head chef (or the Add API keys button) to add your API keys first."}
        />
      </main>
      {orderError && (
        <div className="fixed bottom-3 left-60 z-20 rounded-lg border border-ember bg-background px-3 py-2 text-xs text-ember shadow-xl" onClick={() => setOrderError(null)}>
          {orderError}
        </div>
      )}
      {showKeys && <KeysDialog keys={keys} onClose={() => setShowKeys(false)} />}
    </div>
  );
}
