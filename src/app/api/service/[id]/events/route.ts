import { getService } from "@/lib/brigade/registry";

// The kitchen's live feed: every change sends the whole state as one SSE message.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) return Response.json({ error: "No such service" }, { status: 404 });

  const encoder = new TextEncoder();
  let off = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          off();
          clearInterval(ping);
        }
      };
      off = service.subscribe((state) => send(`data: ${JSON.stringify(state)}\n\n`));
      ping = setInterval(() => send(": ping\n\n"), 15000);
    },
    cancel() {
      off();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
