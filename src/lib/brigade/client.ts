"use client";

// Browser side: keys in localStorage, the order call, the live feed, station actions.

import { useEffect, useState, useSyncExternalStore } from "react";

import type { ServiceState } from "./schemas";

export type StoredKeys = { anthropic: string; openai: string };
const KEYS = "cookinup.keys";
const NO_KEYS: StoredKeys = { anthropic: "", openai: "" };

// A tiny store over localStorage, so components read the keys with
// useSyncExternalStore (empty on the server, real on the client, no effect needed).
let cached: StoredKeys | null = null;
const keyListeners = new Set<() => void>();

function readKeys(): StoredKeys {
  if (cached) return cached;
  try {
    cached = { ...NO_KEYS, ...JSON.parse(localStorage.getItem(KEYS) ?? "{}") };
  } catch {
    cached = NO_KEYS;
  }
  return cached!;
}

export function saveKeys(keys: StoredKeys) {
  cached = keys;
  try {
    localStorage.setItem(KEYS, JSON.stringify(keys));
  } catch {
    // Private window: keys live for this page load only.
  }
  for (const l of keyListeners) l();
}

export function useKeys(): StoredKeys {
  return useSyncExternalStore(
    (l) => {
      keyListeners.add(l);
      return () => keyListeners.delete(l);
    },
    readKeys,
    () => NO_KEYS,
  );
}

/** Headers carrying the keys: sent with every call that may hire a chef, never stored server-side. */
function keyHeaders(keys: StoredKeys = readKeys()): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.anthropic) headers["x-anthropic-key"] = keys.anthropic;
  if (keys.openai) headers["x-openai-key"] = keys.openai;
  return headers;
}

export async function placeOrder(args: { task: string; totalBudget: number; headChef: string; keys: StoredKeys }): Promise<string> {
  const res = await fetch("/api/service", {
    method: "POST",
    headers: keyHeaders(args.keys),
    body: JSON.stringify({ task: args.task, totalBudget: args.totalBudget, headChef: args.headChef }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Could not place the order");
  return body.id as string;
}

export async function stationAction(
  serviceId: string,
  body: { action: "rerun" | "budget" | "stop" | "replate"; stationId?: string; instruction?: string; model?: string; token_budget?: number },
): Promise<void> {
  const res = await fetch(`/api/service/${serviceId}/station`, {
    method: "POST",
    headers: keyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Station refused");
  // A finished order is cooking again: anyone listening should reopen its feed.
  woken.add(serviceId);
  wakeListeners.forEach((fn) => fn());
}

// Orders poked back to life after they were served, so useServices re-subscribes to them.
const woken = new Set<string>();
const wakeListeners = new Set<() => void>();
const subscribeWake = (fn: () => void) => {
  wakeListeners.add(fn);
  return () => {
    wakeListeners.delete(fn);
  };
};
let wakeCount = 0;
const bump = () => ++wakeCount;
wakeListeners.add(bump);

/** Follows one service's live feed. */
export function useService(id: string | null): ServiceState | null {
  // Kept with the id it came from, so a new order never shows the old kitchen.
  const [feed, setFeed] = useState<{ id: string; state: ServiceState } | null>(null);
  useEffect(() => {
    if (!id) return;
    const source = new EventSource(`/api/service/${id}/events`);
    source.onmessage = (e) => setFeed({ id, state: JSON.parse(e.data) as ServiceState });
    return () => source.close();
  }, [id]);
  return feed && feed.id === id ? feed.state : null;
}

/**
 * Follows several services at once (a whole conversation), each on its own
 * feed. Feeds close once an order is served or failed; `initial` seeds states
 * remembered from earlier (so old chats still read after a server restart).
 */
export function useServices(ids: string[], initial: Record<string, ServiceState> = {}): Record<string, ServiceState> {
  const [states, setStates] = useState<Record<string, ServiceState>>(initial);
  const key = ids.join(",");
  const done = ids.filter((id) => isOver(states[id])).join(",");
  const wake = useSyncExternalStore(subscribeWake, () => wakeCount, () => 0);
  useEffect(() => {
    const live = ids.filter((id) => !isOver(states[id]) || woken.has(id));
    const sources = live.map((id) => {
      const source = new EventSource(`/api/service/${id}/events`);
      source.onmessage = (e) => {
        const next = JSON.parse(e.data) as ServiceState;
        // Once the re-run has started, the normal "still cooking" rule keeps the feed open.
        if (!isOver(next)) woken.delete(id);
        setStates((prev) => ({ ...prev, [id]: next }));
      };
      // A feed that cannot open (the server forgot the service) just keeps whatever we remembered.
      source.onerror = () => source.close();
      return source;
    });
    return () => sources.forEach((s) => s.close());
    // Re-subscribe when the set of ids or the set of finished ids changes, or an order is woken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, done, wake]);
  return states;
}

const isOver = (s?: ServiceState) => !!s && (s.status === "served" || s.status === "failed");

// --- the conversation list, remembered in this browser ---

export type Chat = { id: string; title: string; orderIds: string[]; createdAt: number };
const CHATS = "cookinup.chats";
const SNAPSHOTS = "cookinup.snapshots";

export function loadChats(): Chat[] {
  try {
    return JSON.parse(localStorage.getItem(CHATS) ?? "[]") as Chat[];
  } catch {
    return [];
  }
}
export function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(CHATS, JSON.stringify(chats));
  } catch {
    // Private window: the list lives for this page load only.
  }
}
export function loadSnapshots(): Record<string, ServiceState> {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOTS) ?? "{}") as Record<string, ServiceState>;
  } catch {
    return {};
  }
}
export function saveSnapshots(states: Record<string, ServiceState>, keep: string[]) {
  try {
    const kept: Record<string, ServiceState> = {};
    for (const id of keep) if (states[id]) kept[id] = states[id];
    localStorage.setItem(SNAPSHOTS, JSON.stringify(kept));
  } catch {
    // Too big or unavailable: the live feeds still work.
  }
}

/** A once-a-second clock for the station timers, ticking only while something cooks. */
export function useClock(running: boolean): number {
  // Starts at 0 (not the real time) so the server render has nothing time-dependent to prerender.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [running]);
  return now;
}

export function fmtElapsed(from?: number, to?: number): string {
  if (!from) return "--:--";
  const s = Math.max(0, Math.floor(((to ?? Date.now()) - from) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtUsd(n: number): string {
  return n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}
