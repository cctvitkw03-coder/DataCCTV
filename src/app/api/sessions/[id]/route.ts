import { detailSession } from "@/server/sessions";
import { route, live } from "@/server/http";
import { z } from "zod";
export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    live();
    return Response.json(
      await detailSession(
        z
          .string()
          .uuid()
          .parse((await context.params).id),
      ),
      { headers: { "cache-control": "no-store" } },
    );
  });
}
