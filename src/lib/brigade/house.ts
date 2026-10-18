// House keys: the demo's own API keys (from the server's env), so visitors
// can cook without bringing theirs. Guarded by a daily spending cap and a
// smaller pantry per order. A visitor who brings any key of their own cooks
// only on their keys, and their orders don't touch the house budget.

import type { Provider } from "./models";
import { getService } from "./registry";

const ENV: Record<Provider, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GOOGLE_GENERATIVE_AI_API_KEY" };

/** Providers the house has a key for. */
export const houseProviders = (): Provider[] => (Object.keys(ENV) as Provider[]).filter((p) => !!process.env[ENV[p]]);
/** What visitors may spend on house keys per day (USD). */
export const houseBudgetUsd = () => Number(process.env.HOUSE_BUDGET_USD ?? 5);
/** The biggest pantry an order on house keys may ask for. */
export const houseMaxTokens = () => Number(process.env.HOUSE_MAX_TOKENS ?? 8000);

// Orders cooked on house keys, by day; hung off globalThis so dev reloads keep them.
const g = globalThis as unknown as { __houseOrders?: Map<string, string[]> };
const orders = (g.__houseOrders ??= new Map());
const today = () => new Date().toISOString().slice(0, 10);

export function trackHouseOrder(id: string) {
  const day = today();
  orders.set(day, [...(orders.get(day) ?? []), id]);
}

/** What house-key orders have cost today, including ones still cooking. */
export function houseSpentUsd(): number {
  return (orders.get(today()) ?? []).reduce((n: number, id: string) => n + (getService(id)?.state.bill.costUsd ?? 0), 0);
}

export const houseOpen = () => houseProviders().length > 0 && houseSpentUsd() < houseBudgetUsd();
export const isHouseOrder = (id: string) => (orders.get(today()) ?? []).includes(id);
