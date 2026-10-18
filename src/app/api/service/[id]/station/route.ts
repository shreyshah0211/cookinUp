import { z } from "zod";

import { getService } from "@/lib/brigade/registry";

const Body = z.object({
  action: z.enum(["rerun", "budget", "stop", "replate"]),
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
  const { stationId, action, instruction, model, token_budget } = parsed.data;
  // Keys added since the order was placed ride along, so a new provider's chefs can be hired now.
  service.updateKeys({
    anthropic: request.headers.get("x-anthropic-key") ?? undefined,
    openai: request.headers.get("x-openai-key") ?? undefined,
  });
  try {
    if (action === "replate") service.replate();
    else if (!stationId) return Response.json({ error: "Which station?" }, { status: 400 });
    else if (action === "rerun") service.rerun(stationId, { instruction: instruction || undefined, model, token_budget });
    else if (action === "budget" && token_budget !== undefined) service.setBudget(stationId, token_budget);
    else if (action === "stop") service.stop(stationId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
