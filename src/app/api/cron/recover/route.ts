import { db } from "@/server/db";
import { runWorker } from "@/server/worker";
import { env } from "@/server/env";
import { route, secret, live } from "@/server/http";
import { HttpError } from "@/server/auth";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  return route(async () => {
    live();
    if (
      !secret(
        request.headers.get("authorization"),
        `Bearer ${env().CRON_SECRET}`,
      )
    )
      throw new HttpError(401, "INVALID_SECRET");
    await db().query(
      "update upload_sessions set state='expired',revision=revision+1 where state in ('collecting','configuring','preview') and expires_at<now()",
    );
    await db().query(
      "delete from callback_tokens where expires_at<now()-interval '7 days'",
    );
    await db().query(
      "delete from telegram_updates where status='done' and received_at<now()-interval '7 days'",
    );
    return Response.json(await runWorker());
  });
}
