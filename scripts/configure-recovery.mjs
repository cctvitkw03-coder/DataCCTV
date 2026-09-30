import pg from "pg";
process.loadEnvFile(".env.local");
const app = new URL(process.argv[2]);
if (app.protocol !== "https:" || app.pathname !== "/")
  throw Error("HTTPS app origin required");
if (!process.argv.includes("--apply")) {
  console.log("Dry run: configure Supabase recovery timer; no changes.");
  process.exit();
}
const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n"),
  },
  max: 1,
});
const c = await pool.connect();
try {
  await c.query("begin");
  await c.query("create extension if not exists pg_cron");
  await c.query("create extension if not exists pg_net");
  for (const [name, value] of [
    ["datacctv_recovery_url", new URL("/api/cron/recover", app).toString()],
    ["datacctv_recovery_secret", process.env.CRON_SECRET],
  ]) {
    if (!value) throw Error("Missing recovery configuration");
    const old = await c.query("select id from vault.secrets where name=$1", [
      name,
    ]);
    if (old.rowCount)
      await c.query("select vault.update_secret($1,$2)", [
        old.rows[0].id,
        value,
      ]);
    else await c.query("select vault.create_secret($1,$2)", [value, name]);
  }
  await c.query(`
    create or replace function private.datacctv_recover(force_run boolean default false)
    returns bigint language plpgsql security definer set search_path='' as $body$
    declare request_id bigint;
    begin
      if force_run or
        exists(select 1 from public.telegram_updates where status='queued' and run_after<=now()) or
        exists(select 1 from public.notification_outbox where status='queued' and run_after<=now()) or
        exists(select 1 from public.jobs where
          (status in ('queued','retry') and run_after<=now()) or
          (status='running' and lease_until<now())) or
        exists(select 1 from public.upload_sessions where state in ('collecting','configuring','preview') and expires_at<now())
      then
        select net.http_get(
          url := (select decrypted_secret from vault.decrypted_secrets where name='datacctv_recovery_url'),
          headers := jsonb_build_object('Authorization','Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets where name='datacctv_recovery_secret')),
          timeout_milliseconds := 300000
        ) into request_id;
      end if;
      return request_id;
    end $body$;
    revoke all on function private.datacctv_recover(boolean) from public,anon,authenticated;
  `);
  await c.query(
    "select cron.schedule('datacctv-recovery','* * * * *','select private.datacctv_recover(false)')",
  );
  await c.query(
    "select cron.schedule('datacctv-retention','17 2 * * *','select private.datacctv_recover(true)')",
  );
  await c.query("commit");
  console.log(
    "Recovery enabled: checks every minute, HTTP only when work is due; daily retention.",
  );
} catch {
  await c.query("rollback");
  console.error("Recovery setup failed; provider details suppressed.");
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
