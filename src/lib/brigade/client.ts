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

export async function placeOrder(args: { task: string; totalBudget: number; headChef: string; models: string[]; keys: StoredKeys }): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (args.keys.anthropic) headers["x-anthropic-key"] = args.keys.anthropic;
  if (args.keys.openai) headers["x-openai-key"] = args.keys.openai;
  const res = await fetch("/api/service", {
    method: "POST",
    headers,
    body: JSON.stringify({ task: args.task, totalBudget: args.totalBudget, headChef: args.headChef, models: args.models }),
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Station refused");
}

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
