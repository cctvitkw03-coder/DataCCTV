import { listSessions } from "@/server/sessions";
import { route, live } from "@/server/http";
export async function GET() {
  return route(async () => {
    live();
    return Response.json(await listSessions(), {
      headers: { "cache-control": "no-store" },
    });
  });
}
