import { getService } from "@/lib/brigade/registry";

// One order's current state as plain JSON: the fallback for the live feed when
// a proxy in between holds server-sent events back.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = getService(id);
  if (!service) return Response.json({ error: "No such service" }, { status: 404 });
  return Response.json(service.state, { headers: { "Cache-Control": "no-store" } });
}
