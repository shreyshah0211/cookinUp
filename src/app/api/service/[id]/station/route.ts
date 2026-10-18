import { z } from "zod";

import { houseOpen, isHouseOrder } from "@/lib/brigade/house";
import { keysFromRequest } from "@/lib/brigade/providers";
import { getService } from "@/lib/brigade/registry";

const Body = z.object({
  action: z.enum(["rerun", "budget", "stop", "replate", "menu"]),
  /** For "menu": the edited stations to cook. */
  stations: z
    .array(z.object({ id: z.string(), title: z.string(), goal: z.string(), depends_on: z.array(z.string()), model: z.string(), token_budget: z.number(), tools: z.array(z.enum(["web"])).optional() }))
    .max(12)
    .optional(),
  stationId: z.string().optional(),
  instruction: z.string().trim().optional(),
  model: z.string().optional(),
  token_budget: z.number().int().optional(),
});

// Step up to a station: redirect the chef (rerun), move ingredients (budget),
// pull them off (stop); or send the expediter back to the pass (replate).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) return Response.json({ error: "No such service" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { stationId, action, instruction, model, token_budget, stations } = parsed.data;
  // Re-cooking a house-key order spends the shared budget too.
  if (isHouseOrder(id) && !houseOpen() && action !== "stop") {
    return Response.json({ error: "The demo's shared budget for today is used up. Add your own API key under Keys to keep cooking." }, { status: 402 });
  }
  // Keys added since the order was placed ride along, so a new provider's chefs can be hired now.
  service.updateKeys(keysFromRequest(request));
  try {
    if (action === "replate") service.replate();
    else if (action === "menu") service.serveMenu(stations ?? []);
    else if (!stationId) return Response.json({ error: "Which station?" }, { status: 400 });
    else if (action === "rerun") service.rerun(stationId, { instruction: instruction || undefined, model, token_budget });
    else if (action === "budget" && token_budget !== undefined) service.setBudget(stationId, token_budget);
    else if (action === "stop") service.stop(stationId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
