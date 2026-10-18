// The kitchen's long-term memory, kept in Backboard (backboard.io).
//
// Read-only during an order, written between orders: before the head chef
// plans, the kitchen searches what it remembers about this customer; after
// an order is served, the corrections the customer sent and the expediter's
// notes are written back, so the next order starts from them. Nothing is
// written while cooking, so one lucky (or unlucky) memory can't change an
// order halfway through.
//
// One Backboard assistant holds the memories ("cookinUp kitchen"). Its id
// comes from BACKBOARD_ASSISTANT_ID, or is created on first use and cached in
// .backboard.json (git-ignored). Server-only; the key never reaches the
// browser. Without BACKBOARD_API_KEY, or if Backboard is slow or down, every
// call here quietly does nothing and the kitchen cooks as before.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://app.backboard.io/api";
const CACHE = path.join(process.cwd(), ".backboard.json");
const READ_TIMEOUT = 3000;
const WRITE_TIMEOUT = 8000;

export type Memory = { content: string; metadata?: Record<string, unknown> };

const key = () => process.env.BACKBOARD_API_KEY;
export const memoryEnabled = () => !!key();

async function call<T>(method: "GET" | "POST", url: string, body: unknown, timeout: number): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { "X-API-Key": key()!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`Backboard ${method} ${url}: ${res.status}`);
  return (await res.json()) as T;
}

// One lookup per server process; concurrent orders share it.
const g = globalThis as unknown as { __cookinupAssistant?: Promise<string> };

function assistantId(): Promise<string> {
  if (process.env.BACKBOARD_ASSISTANT_ID) return Promise.resolve(process.env.BACKBOARD_ASSISTANT_ID);
  g.__cookinupAssistant ??= (async () => {
    try {
      const cached = JSON.parse(await readFile(CACHE, "utf8")) as { assistant_id?: string };
      if (cached.assistant_id) return cached.assistant_id;
    } catch {
      // No cache yet: create the assistant below.
    }
    const made = await call<{ assistant_id: string }>(
      "POST",
      "/assistants",
      { name: "cookinUp kitchen", system_prompt: "Long-term memory for the cookinUp kitchen: what this customer likes, corrections they made, and lessons from past orders." },
      WRITE_TIMEOUT,
    );
    await writeFile(CACHE, JSON.stringify({ assistant_id: made.assistant_id }, null, 2)).catch(() => {});
    return made.assistant_id;
  })().catch((error) => {
    // Let the next order try again.
    g.__cookinupAssistant = undefined;
    throw error;
  });
  return g.__cookinupAssistant;
}

/** What the kitchen remembers that is relevant to this order (read-only). Empty when memory is off or slow. */
export async function recall(task: string, limit = 5): Promise<string[]> {
  if (!memoryEnabled()) return [];
  try {
    const id = await assistantId();
    const r = await call<{ memories?: { content: string; score?: number | null }[] }>("POST", `/assistants/${id}/memories/search`, { query: task.slice(0, 2000), limit }, READ_TIMEOUT);
    const found = (r.memories ?? []).map((m) => m.content.trim()).filter(Boolean);
    if (found.length) console.info(`[memory] recalled ${found.length} for this order`);
    return found;
  } catch (error) {
    console.warn("[memory] recall skipped:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Write lessons from a finished order. Fire-and-forget; failures are logged and dropped. */
export async function remember(memories: Memory[]): Promise<void> {
  if (!memoryEnabled() || memories.length === 0) return;
  try {
    const id = await assistantId();
    console.info(`[memory] writing ${memories.length} lesson${memories.length === 1 ? "" : "s"} from the order`);
    await Promise.all(memories.map((m) => call("POST", `/assistants/${id}/memories`, { content: m.content, metadata: { app: "cookinUp", ...m.metadata } }, WRITE_TIMEOUT)));
  } catch (error) {
    console.warn("[memory] remember skipped:", error instanceof Error ? error.message : error);
  }
}
