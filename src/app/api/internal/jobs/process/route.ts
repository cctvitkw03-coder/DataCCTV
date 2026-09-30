import { runWorker } from "@/server/worker";
import { env } from "@/server/env";
import { route, secret, live } from "@/server/http";
import { HttpError } from "@/server/auth";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return route(async () => {
    live();
    if (
      !secret(
        request.headers.get("authorization"),
        `Bearer ${env().WORKER_AUTH_SECRET}`,
      )
    )
      throw new HttpError(401, "INVALID_SECRET");
    return Response.json(await runWorker());
  });
}
