import { changeSession } from "@/server/sessions";
import { route, live, csrf } from "@/server/http";
import { z } from "zod";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  return route(async () => {
    live();
    csrf(request);
    const p = await context.params;
    return Response.json(
      await changeSession(
        z.string().uuid().parse(p.id),
        z.enum(["retry", "stop"]).parse(p.action),
        z.string().uuid().parse(request.headers.get("idempotency-key")),
      ),
    );
  });
}
