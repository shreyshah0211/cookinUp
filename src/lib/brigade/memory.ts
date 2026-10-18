// The kitchen's long-term memory, kept in Backboard (backboard.io).
//
// Read-only during an order, written between orders: before the head chef
// plans, the kitchen searches what it remembers about this customer; after
// an order is served, the corrections the customer sent and the expediter's
// notes are written back, so the next order starts from them. Nothing is
// written while cooking, so one lucky (or unlucky) memory can't change an
// order halfway through.
//
// Each visitor (an anonymous id their browser makes up and keeps) gets their
// own Backboard assistant, so nobody's corrections reach anyone else's
// orders. Without a visitor id (the CLI), one shared "cookinUp kitchen"
// assistant is used, or BACKBOARD_ASSISTANT_ID if set. Assistant ids are
// cached in .backboard.json (git-ignored). Server-only; the key never reaches
// the browser. Without BACKBOARD_API_KEY, or if Backboard is slow or down,
// every call here quietly does nothing and the kitchen cooks as before.

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

type Cache = { assistant_id?: string; visitors?: Record<string, string> };

// One lookup per memory owner per server process; concurrent orders share it.
const g = globalThis as unknown as { __cookinupAssistants?: Map<string, Promise<string>>; __cookinupCacheWrite?: Promise<void> };
const lookups = (g.__cookinupAssistants ??= new Map());

const readCache = async (): Promise<Cache> => {
  try {
    return JSON.parse(await readFile(CACHE, "utf8")) as Cache;
  } catch {
    return {};
  }
};

/** Cache writes go one at a time, so two new visitors can't overwrite each other's entry. */
function saveToCache(update: (c: Cache) => Cache) {
  g.__cookinupCacheWrite = (g.__cookinupCacheWrite ?? Promise.resolve()).then(async () => {
    await writeFile(CACHE, JSON.stringify(update(await readCache()), null, 2)).catch(() => {});
  });
}

/** A visitor id is whatever the browser sent, if it looks like one. */
export const cleanVisitor = (v: string | null | undefined) => (v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : undefined);

function assistantId(visitor?: string): Promise<string> {
  if (!visitor && process.env.BACKBOARD_ASSISTANT_ID) return Promise.resolve(process.env.BACKBOARD_ASSISTANT_ID);
  const owner = visitor ?? "";
  let found = lookups.get(owner);
  if (!found) {
    found = (async () => {
      const cache = await readCache();
      const known = visitor ? cache.visitors?.[visitor] : cache.assistant_id;
      if (known) return known;
      const made = await call<{ assistant_id: string }>(
        "POST",
        "/assistants",
        {
          name: visitor ? `cookinUp visitor ${visitor.slice(0, 8)}` : "cookinUp kitchen",
          system_prompt: "Long-term memory for a cookinUp customer: what they like, corrections they made, and lessons from past orders.",
        },
        WRITE_TIMEOUT,
      );
      saveToCache((c) => (visitor ? { ...c, visitors: { ...c.visitors, [visitor]: made.assistant_id } } : { ...c, assistant_id: made.assistant_id }));
      return made.assistant_id;
    })().catch((error) => {
      // Let the next order try again.
      lookups.delete(owner);
      throw error;
    });
    lookups.set(owner, found);
  }
  return found;
}

/** What the kitchen remembers that is relevant to this order (read-only). Empty when memory is off or slow. */
export async function recall(task: string, visitor?: string, limit = 5): Promise<string[]> {
  if (!memoryEnabled()) return [];
  try {
    const id = await assistantId(visitor);
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
export async function remember(memories: Memory[], visitor?: string): Promise<void> {
  if (!memoryEnabled() || memories.length === 0) return;
  try {
    const id = await assistantId(visitor);
    console.info(`[memory] writing ${memories.length} lesson${memories.length === 1 ? "" : "s"} from the order`);
    await Promise.all(memories.map((m) => call("POST", `/assistants/${id}/memories`, { content: m.content, metadata: { app: "cookinUp", ...m.metadata } }, WRITE_TIMEOUT)));
  } catch (error) {
    console.warn("[memory] remember skipped:", error instanceof Error ? error.message : error);
  }
}
