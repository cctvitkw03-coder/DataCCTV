import "server-only";
import { z } from "zod";
export const demo = () => process.env.APP_MODE !== "live";
export function env() {
  return z
    .object({
      DATABASE_URL: z.string().min(1),
      APP_WORKSPACE_ID: z.string().uuid(),
      TELEGRAM_BOT_ID: z.string().regex(/^\d+$/),
      TELEGRAM_BOT_TOKEN: z.string().min(10),
      TELEGRAM_WEBHOOK_SECRET: z.string().min(24),
      WORKER_AUTH_SECRET: z.string().min(24),
      CRON_SECRET: z.string().min(24),
      GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(1),
      GOOGLE_DRIVE_AUTH_MODE: z.enum(["oauth", "service_account"]),
    })
    .parse(process.env);
}
export function limit(name: string, fallback: number) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("INVALID_CONFIG");
  return n;
}
