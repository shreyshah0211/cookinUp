import { generateText, Output } from "ai";
import { z } from "zod";

import { costUsd } from "@/lib/brigade/models";
import { availableProviders, keysFromRequest, languageModel, providerOptions } from "@/lib/brigade/providers";
import { getService } from "@/lib/brigade/registry";

const Body = z.object({ rubric: z.string().max(2000) });
const Grade = z.object({ score: z.number().int().min(1).max(5).describe("1 = poor, 5 = excellent"), reason: z.string().describe("one short sentence") });

// A judge for a challenge: scores the plated answer against a rubric, on the
// cheapest chef there is a key for. Keys come in headers, as for orders.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) return Response.json({ error: "No such service" }, { status: 404 });
  const final = service.state.plating?.final;
  if (!final) return Response.json({ error: "Nothing plated yet" }, { status: 400 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const keys = keysFromRequest(request);
  // The cheapest judge there is a key for.
  const have = availableProviders(keys);
  const judge = have.includes("anthropic") ? "claude-haiku-4-5" : have.includes("openai") ? "gpt-5.4-mini" : "gemini-3.5-flash-lite";
  try {
    const r = await generateText({
      model: languageModel(judge, keys),
      output: Output.object({ schema: Grade }),
      prompt: [
        "You grade the result of a task. Be strict but fair.",
        `Task: ${service.state.task}`,
        `Rubric: ${parsed.data.rubric}`,
        "",
        "Result:",
        final.slice(0, 24000),
      ].join("\n"),
      maxOutputTokens: 300,
      providerOptions: providerOptions(judge, "low"),
    });
    const u = r.usage;
    return Response.json({ ...(r.output as z.infer<typeof Grade>), costUsd: costUsd(judge, u.inputTokens ?? 0, u.outputTokens ?? 0) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
