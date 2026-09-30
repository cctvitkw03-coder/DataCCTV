import { after } from "next/server";
import { runWorker } from "@/server/worker";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { route, live, secret, jsonBody } from "@/server/http";
import { HttpError } from "@/server/auth";
import { telegram, updateSchema } from "@/server/telegram";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  return route(async () => {
    live();
    const e = env();
    if (
      !secret(
        request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
        e.TELEGRAM_WEBHOOK_SECRET,
      )
    )
      throw new HttpError(401, "INVALID_SECRET");
    const parsed = updateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new HttpError(400, "INVALID_UPDATE");
    const u = parsed.data;
    const bot = (
      await db().query(
        "select id from bot_installations where telegram_bot_id=$1 and workspace_id=$2 and enabled",
        [e.TELEGRAM_BOT_ID, e.APP_WORKSPACE_ID],
      )
    ).rows[0];
    if (!bot) throw new HttpError(503, "BOT_NOT_CONFIGURED");
    await db().query(
      "insert into telegram_updates(bot_id,update_id,payload) values($1,$2,$3) on conflict do nothing",
      [bot.id, String(u.update_id), u],
    );
    if (u.callback_query)
      await telegram("answerCallbackQuery", {
        callback_query_id: u.callback_query.id,
        text: "รับคำสั่งแล้ว กำลังตรวจสอบข้อมูล",
      }).catch(() => undefined);
    after(async () => {
      try {
        await runWorker();
      } catch {
        console.error("Webhook worker deferred; recovery scheduler will retry");
      }
    });
    return Response.json({ ok: true });
  });
}
