import { z } from "zod";

import { DEFAULT_HEAD_CHEF, MODEL_IDS } from "@/lib/brigade/models";
import { putService } from "@/lib/brigade/registry";
import { KitchenService } from "@/lib/brigade/service";

const Body = z.object({
  task: z.string().trim().min(3),
  totalBudget: z.number().int().min(1000).max(60000).default(8000),
  headChef: z.string().default(DEFAULT_HEAD_CHEF),
});

// Order in. Keys ride in headers, land in the service's memory and nowhere else.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad order ticket" }, { status: 400 });
  const { task, totalBudget, headChef } = parsed.data;
  const service = new KitchenService({
    id: crypto.randomUUID(),
    task,
    totalBudget,
    headChef: MODEL_IDS.includes(headChef) ? headChef : DEFAULT_HEAD_CHEF,
    keys: {
      anthropic: request.headers.get("x-anthropic-key") ?? undefined,
      openai: request.headers.get("x-openai-key") ?? undefined,
    },
  });
  putService(service);
  void service.start();
  return Response.json({ id: service.state.id });
}
