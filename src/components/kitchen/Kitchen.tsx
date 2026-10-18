"use client";

// The game: the pixel kitchen fills the window, and everything else is a
// window that opens over it. The ticket (write an order, follow the courses,
// read the plate), the order book (every chat), the receipt, the keys, the
// head chef's settings, a chef's card, and whatever is on someone's mind.

import { useEffect, useMemo, useState } from "react";

import { CHALLENGES, challengeById, type Challenge } from "@/lib/brigade/challenges";
import { conversationFor, gradeOrder, useHouse, loadChats, loadSnapshots, placeOrder, saveChats, saveSnapshots, stationAction, useKeys, useServices, type Chat } from "@/lib/brigade/client";
import { coach } from "@/lib/brigade/coach";
import { LESSONS, lessonOf, TOPICS, type Topic } from "@/lib/brigade/lessons";
import { DEFAULT_BUDGET, DEFAULT_HEAD_CHEF, MODELS } from "@/lib/brigade/models";
import type { ServiceState } from "@/lib/brigade/schemas";

import { ChallengeTracker } from "./ChallengeTracker";
import { ChefCard } from "./ChefCard";
import { HeadChefCard } from "./HeadChefCard";
import { Hud, type HudOpen } from "./Hud";
import { KeysDialog } from "./KeysDialog";
import { Toast, WhyList, type Learned } from "./Lessons";
import { MindPanel } from "./MindPanel";
import { OrderBook } from "./OrderBook";
import { OrderTicket } from "./OrderTicket";
import { PixelKitchen } from "./PixelKitchen";
import { Popup, type Anchor } from "./Popup";
import { add, ReceiptList } from "./Receipt";
import { RecipeBook, type Badges } from "./RecipeBook";
import { Ticker } from "./Ticker";

const newChat = (): Chat => ({ id: crypto.randomUUID(), title: "", orderIds: [], createdAt: Date.now() });

type Open =
  | { kind: "ticket" }
  | { kind: "orders" }
  | { kind: "receipt" }
  | { kind: "keys" }
  | { kind: "head" }
  | { kind: "station"; id: string; mind?: boolean }
  | { kind: "mind"; who: "head" | "expo" }
  | { kind: "why"; who: string }
  | { kind: "book"; tab: "challenges" | "lessons"; focus?: Topic };

const STATUS_WORD: Record<ServiceState["status"], string> = { planning: "planning", review: "your menu", cooking: "cooking", plating: "plating", served: "served", failed: "fire" };

export function Kitchen() {
  const keys = useKeys();
  const ownKeys = !!(keys.anthropic || keys.openai || keys.google);
  // No keys of your own: the demo may lend its own, within a daily budget (checked again after each order).
  const [houseTick, setHouseTick] = useState(0);
  const house = useHouse(houseTick);
  const onHouse = !ownKeys && !!house && house.providers.length > 0 && house.remainingUsd > 0;
  const hasKeys = ownKeys || onHouse;
  // Which providers this visitor can cook with: their own keys, or the house's.
  const providers = useMemo(() => (ownKeys ? MODELS.map((m) => m.provider).filter((p) => keys[p]) : onHouse ? house!.providers : []), [ownKeys, keys, onHouse, house]);
  const [headChef, setHeadChef] = useState(DEFAULT_HEAD_CHEF);
  const [totalBudget, setTotalBudget] = useState(DEFAULT_BUDGET);
  // Any chef whose provider has a key can be hired, now or on a re-run.
  const hireable = useMemo(() => MODELS.filter((m) => providers.includes(m.provider)).map((m) => m.id), [providers]);

  // Which window is open, and where it was opened from.
  const [open, setOpen] = useState<Open | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const show = (o: Open | null, at: Anchor | null = null) => {
    setOpen(o);
    setAnchor(at);
  };

  // Who you are, whether the kitchen explains itself, and what you have learned, remembered in this browser.
  const [userName, setUserName] = useState("Chef");
  const [learn, setLearn] = useState(true);
  const [storedLessons, setStoredLessons] = useState<Learned>({});
  const [badges, setBadges] = useState<Badges>({});
  const [reviewMenu, setReviewMenu] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setUserName(localStorage.getItem("cookinup.name") || "Chef");
        setLearn(localStorage.getItem("cookinup.learn") !== "off");
        setStoredLessons(JSON.parse(localStorage.getItem("cookinup.lessons") ?? "{}"));
        setBadges(JSON.parse(localStorage.getItem("cookinup.badges") ?? "{}"));
        setReviewMenu(localStorage.getItem("cookinup.review") === "on");
      } catch {
        // No storage: defaults are fine.
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggleLearn = () => {
    setLearn((on) => {
      try {
        localStorage.setItem("cookinup.learn", on ? "off" : "on");
      } catch {
        // ignore
      }
      return !on;
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
  const orders = useMemo(() => orderIds.map((id) => states[id]).filter((s): s is ServiceState => !!s), [orderIds, states]);
  const stations = useMemo(() => state?.stations ?? [], [state]);
  const events = useMemo(() => state?.events ?? [], [state]);
  // Lessons: the stored ones plus every explanation in any order this browser remembers, newest example wins.
  const learned = useMemo(() => {
    const out: Learned = Object.fromEntries(Object.entries(storedLessons).filter(([t]) => lessonOf(t)));
    for (const s of Object.values(states)) {
      // Asking well: each check your own order passed teaches that lesson, with your words as the example.
      for (const c of coach(s.task).checks) {
        if (!c.ok) continue;
        const had = out[c.key];
        if (!had || had.at < s.createdAt) out[c.key] = { text: `“${s.task.length > 80 ? s.task.slice(0, 79) + "…" : s.task}”`, at: s.createdAt };
      }
      for (const e of s.events ?? []) {
        if (e.kind !== "explain" || !lessonOf(e.topic)) continue;
        const had = out[e.topic!];
        if (!had || had.at < e.at) out[e.topic!] = { text: e.text, at: e.at };
      }
    }
    return out;
  }, [states, storedLessons]);
  const learnedCount = TOPICS.filter((t) => learned[t]).length;
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("cookinup.lessons", JSON.stringify(learned));
    } catch {
      // ignore
    }
  }, [learned, loaded]);
  // What you already knew when the page opened: only lessons learned after that get a toast.
  const [known, setKnown] = useState<Set<Topic> | null>(null);
  useEffect(() => {
    if (!loaded || known) return;
    const t = setTimeout(() => setKnown(new Set(TOPICS.filter((x) => learned[x]))), 0);
    return () => clearTimeout(t);
  }, [loaded, known, learned]);
  // One toast at a time: a batch of new lessons becomes one ("+2 more"); badges get a gold one.
  type ToastMsg = { key: string; kicker: string; title: string; gold?: boolean; open: Open };
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const [toasted, setToasted] = useState<Topic[]>([]);
  const fresh = learn && known ? TOPICS.filter((t) => learned[t] && !known.has(t) && !toasted.includes(t)) : [];
  const freshKey = fresh.join(",");
  useEffect(() => {
    if (!freshKey) return;
    const topics = freshKey.split(",") as Topic[];
    const t = setTimeout(() => {
      setToasted((xs) => [...xs, ...topics]);
      setToast({ key: freshKey, kicker: topics.length > 1 ? `${topics.length} lessons unlocked` : "Lesson unlocked", title: LESSONS[topics[0]].title + (topics.length > 1 ? ` +${topics.length - 1} more` : ""), open: { kind: "book", tab: "lessons", focus: topics[0] } });
    }, 400);
    return () => clearTimeout(t);
  }, [freshKey]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const notes = useMemo(() => orders.flatMap((o) => (o.events ?? []).filter((e) => e.kind === "explain")), [orders]);
  const nameOf = (id: string) => (id === "head" ? "Head chef" : id === "expo" ? "Expediter" : (orders.flatMap((o) => o.stations).find((s) => s.id === id)?.title ?? id));

  // The challenge this chat is playing, the judge's scores, and the verdict on its latest order.
  const challenge = challengeById(active?.challenge);
  const [grades, setGrades] = useState<Record<string, { score: number; reason: string }>>({});
  const [grading, setGrading] = useState<string | null>(null);
  const needsGrade = challenge?.rubric && state?.status === "served" && !grades[state.id] && grading !== state.id ? state.id : null;
  useEffect(() => {
    if (!needsGrade || !challenge?.rubric) return;
    const t = setTimeout(() => {
      setGrading(needsGrade);
      gradeOrder(needsGrade, challenge.rubric!)
        .then((g) => setGrades((m) => ({ ...m, [needsGrade]: g })))
        .catch((e) => setGrades((m) => ({ ...m, [needsGrade]: { score: 0, reason: `The judge could not score it: ${e instanceof Error ? e.message : e}` } })));
    }, 0);
    return () => clearTimeout(t);
  }, [needsGrade, challenge]);
  const verdict = challenge && state?.status === "served" && (!challenge.rubric || grades[state.id]) ? challenge.verdict(state, grades[state.id]) : challenge && state?.status === "served" ? challenge.verdict(state) : null;
  const wonNow = challenge && verdict?.pass && !badges[challenge.id] ? challenge : null;
  useEffect(() => {
    if (!wonNow || !verdict) return;
    const t = setTimeout(() => {
      setBadges((b) => {
        const next = { ...b, [wonNow.id]: { at: Date.now(), line: verdict.line } };
        try {
          localStorage.setItem("cookinup.badges", JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setToast({ key: `badge-${wonNow.id}`, kicker: "Badge earned", title: wonNow.name, gold: true, open: { kind: "book", tab: "challenges" } });
    }, 300);
    return () => clearTimeout(t);
  }, [wonNow, verdict]);
  // A challenge's task waits in the ticket for you to fire it.
  const [draft, setDraft] = useState("");

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
      // A challenge starts clean each time, so its numbers are only this order's.
      const context = challenge ? [] : conversationFor(orders);
      const id = await placeOrder({ task, totalBudget, headChef, keys, context, review: challenge ? challenge.review : reviewMenu, twist: challenge?.twist });
      setDraft("");
      setHouseTick((n) => n + 1);
      setChats((cs) => cs.map((c) => (c.id === active.id ? { ...c, title: c.title || task.slice(0, 60), orderIds: [...c.orderIds, id] } : c)));
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrdering(false);
    }
  };

  const startChallenge = (c: Challenge) => {
    // Resume the chat already playing it, or open a new one with the task ready to fire.
    const existing = [...chats].reverse().find((x) => x.challenge === c.id && !badges[c.id]);
    if (existing) {
      setActiveId(existing.id);
    } else {
      const chat = { ...newChat(), title: `Challenge ${c.n}: ${c.name}`, challenge: c.id };
      setChats((cs) => [...cs, chat]);
      setActiveId(chat.id);
      setDraft(c.task);
    }
    show({ kind: "ticket" });
  };
  const retryChallenge = () => {
    if (!challenge) return;
    void order(challenge.task);
    show({ kind: "ticket" });
  };
  const toggleReview = (on: boolean) => {
    setReviewMenu(on);
    try {
      localStorage.setItem("cookinup.review", on ? "on" : "off");
    } catch {
      // ignore
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
    if (id.startsWith("why:")) return show({ kind: "why", who: id.slice(4) }, at);
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
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <PixelKitchen state={state} pickedId={pickedId} learn={learn} onPick={onPick} />
      </div>
      {learn && <Ticker notes={notes} nameOf={nameOf} onWhy={(who) => show({ kind: "why", who })} />}
      <Hud
        title={active?.title || "New order"}
        status={state ? STATUS_WORD[state.status] : null}
        cost={cost}
        open={hudOpen}
        onOpen={toggleHud}
        learn={learn}
        onLearn={toggleLearn}
        book={`${CHALLENGES.filter((c) => badges[c.id]).length}/${CHALLENGES.length} · ${learnedCount}/${TOPICS.length}`}
        bookOpen={open?.kind === "book"}
        onBook={() => show(open?.kind === "book" ? null : { kind: "book", tab: "challenges" })}
      />
      {challenge && <ChallengeTracker challenge={challenge} order={state} verdict={verdict} earned={!!badges[challenge.id]} onRetry={retryChallenge} onBook={() => show({ kind: "book", tab: "challenges" })} />}
      {toast && <Toast key={toast.key} kicker={toast.kicker} title={toast.title} gold={toast.gold} onOpen={() => show(toast.open)} />}

      {open?.kind === "book" && (
        <Popup title="Recipe book" width={600} onClose={() => show(null)}>
          <RecipeBook key={open.tab + (open.focus ?? "")} tab={open.tab} badges={badges} learned={learned} focus={open.focus} activeChallenge={challenge?.id} onStart={startChallenge} />
        </Popup>
      )}
      {open?.kind === "why" && (
        <Popup title={`Why? · ${nameOf(open.who)}`} tag="learn" width={420} anchor={anchor} onClose={() => show(null)}>
          <WhyList notes={notes.filter((e) => e.from === open.who)} />
          <button className="pix-btn pix-btn-plain mt-3" onClick={() => show({ kind: "book", tab: "lessons" })}>
            All lessons
          </button>
        </Popup>
      )}

      {open?.kind === "ticket" && (
        <Popup title="Order ticket" tag={active?.title ? `${orders.length} course${orders.length === 1 ? "" : "s"}` : undefined} width={620} onClose={() => show(null)}>
          <OrderTicket key={activeId ?? ""} orders={orders} busy={ordering} hasKeys={hasKeys} hireable={hireable} draft={draft} onSend={(t) => void order(t)} onPick={(id) => show({ kind: "station", id })} onReplate={replate} onOpenKeys={() => show({ kind: "keys" })} />
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
          <KeysDialog keys={keys} house={house} onClose={() => show(null)} />
        </Popup>
      )}
      {open?.kind === "head" && (
        <Popup title="Head chef" tag="settings" width={400} anchor={anchor} onClose={() => show(null)}>
          <HeadChefCard headChef={headChef} onHeadChef={setHeadChef} totalBudget={totalBudget} onTotalBudget={setTotalBudget} review={reviewMenu} onReview={toggleReview} keys={keys} providers={providers} onHouse={onHouse} onKeys={() => show({ kind: "keys" })} />
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
