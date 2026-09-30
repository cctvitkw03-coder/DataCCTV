import fs from "node:fs";
import { Pool } from "pg";
try {
  process.loadEnvFile(".env.local");
} catch {}
const mode = process.argv[2];
if (!["db-check", "migrate", "webhook"].includes(mode)) {
  console.error(
    "Usage: node scripts/manage.mjs db-check | migrate --apply | webhook --apply",
  );
  process.exit(1);
}
try {
  if (mode === "webhook") {
    if (!process.argv.includes("--apply")) {
      console.log(
        "Dry run: would register HTTPS /api/telegram/webhook with secret_token, only message/edited_message/callback_query; never drop pending updates. No request sent.",
      );
      process.exit(0);
    }
    if (
      process.env.APP_MODE !== "live" ||
      !process.env.TELEGRAM_BOT_TOKEN ||
      !process.env.TELEGRAM_WEBHOOK_SECRET
    )
      throw Error("Live Bot credentials required");
    const url = new URL(
      "/api/telegram/webhook",
      process.env.NEXT_PUBLIC_APP_URL,
    );
    if (url.protocol !== "https:") throw Error("HTTPS required");
    const r = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.toString(),
          secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "edited_message", "callback_query"],
          drop_pending_updates: false,
        }),
      },
    );
    const data = await r.json();
    if (!r.ok || !data.ok) throw Error("Webhook registration failed");
    console.log(
      "Webhook registered. Check getWebhookInfo and a sandbox session.",
    );
  } else {
    if (mode === "migrate" && !process.argv.includes("--apply")) {
      console.log(
        "Dry run: apply migrations 001_initial.sql and 002_groups_oauth.sql to a new sandbox. Back up and review conflicts first. No DB connection opened.",
      );
      process.exit(0);
    }
    const pool = new Pool({
      connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true, ...(process.env.DATABASE_SSL_CA ? {ca:process.env.DATABASE_SSL_CA.replace(/\\n/g,"\n")} : {}) },
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    try {
      if (mode === "db-check") {
        const c = await pool.connect();
        try {
          await c.query("begin read only");
          const r = await c.query(
            "select tablename from pg_tables where schemaname='public' order by tablename",
          );
          console.log(
            "Read-only connection OK. Public tables:",
            r.rows.map((r) => r.tablename).join(", ") || "(none)",
          );
          await c.query("rollback");
        } finally {
          c.release();
        }
      } else {
        const exists = await pool.query(
          "select to_regclass('public.upload_sessions') as table_name",
        );
        if (exists.rows[0].table_name)
          throw Error(
            "Target tables already exist; refusing automatic migration",
          );
        await pool.query(
          fs.readFileSync("supabase/migrations/001_initial.sql", "utf8"),
        );
        await pool.query(
          fs.readFileSync("supabase/migrations/002_groups_oauth.sql", "utf8"),
        );
        console.log(
          "Initial migration applied. Configure sandbox workspace and membership separately.",
        );
      }
    } finally {
      await pool.end();
    }
  }
} catch {
  console.error(
    "Operation failed. Check configuration / connectivity privately; credentials and raw provider errors are not printed.",
  );
  process.exitCode = 1;
}
