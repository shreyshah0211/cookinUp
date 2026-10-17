// Live services, in memory. Hung off globalThis so Next's dev reloads keep them.

import type { KitchenService } from "./service";

const g = globalThis as unknown as { __kitchen?: Map<string, KitchenService> };
const services = (g.__kitchen ??= new Map<string, KitchenService>());

export function putService(s: KitchenService) {
  services.set(s.state.id, s);
}

export function getService(id: string): KitchenService | undefined {
  return services.get(id);
}
