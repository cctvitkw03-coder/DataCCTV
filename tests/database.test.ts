import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const pg = new PGlite();
const w = "00000000-0000-4000-8000-000000000001",
  w2 = "00000000-0000-4000-8000-000000000002",
  user = "00000000-0000-4000-8000-000000000003",
  bot = "00000000-0000-4000-8000-000000000004",
  actor = "00000000-0000-4000-8000-000000000005",
  sid = "00000000-0000-4000-8000-000000000006";
beforeAll(async () => {
  await pg.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  );
  await pg.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await pg.exec(
    readFileSync("supabase/migrations/002_groups_oauth.sql", "utf8"),
  );
  await pg.exec(readFileSync("supabase/migrations/003_other_job.sql", "utf8"));
  await pg.query("insert into auth.users values($1)", [user]);
  await pg.query(
    "insert into workspaces(id,name,drive_root_folder_id) values($1,'one','root1'),($2,'two','root2')",
    [w, w2],
  );
  await pg.query("insert into workspace_members values($1,$2,'viewer')", [
    w,
    user,
  ]);
  await pg.query(
    "insert into bot_installations(id,workspace_id,telegram_bot_id) values($1,$2,123)",
    [bot, w],
  );
  await pg.query(
    "insert into telegram_users(id,workspace_id,bot_id,telegram_user_id) values($1,$2,$3,999)",
    [actor, w, bot],
  );
  await pg.query(
    "insert into upload_sessions(id,workspace_id,bot_id,actor_id,chat_id) values($1,$2,$3,$4,999)",
    [sid, w, bot, actor],
  );
});
afterAll(() => pg.close());
it("unique active context prevents duplicate draft", async () => {
  await expect(
    pg.query(
      "insert into upload_sessions(workspace_id,bot_id,actor_id,chat_id) values($1,$2,$3,999)",
      [w, bot, actor],
    ),
  ).rejects.toThrow();
});
it("cross-workspace actor is rejected", async () => {
  await expect(
    pg.query(
      "insert into upload_sessions(workspace_id,bot_id,actor_id,chat_id) values($1,$2,$3,1000)",
      [w2, bot, actor],
    ),
  ).rejects.toThrow();
});
it("duplicate inbox update has one durable row", async () => {
  await pg.query(
    "insert into telegram_updates(bot_id,update_id,payload) values($1,1,'{}'),($1,1,'{}') on conflict do nothing",
    [bot],
  );
  expect((await pg.query("select * from telegram_updates")).rows.length).toBe(
    1,
  );
});
it("same file contents in different messages remain distinct", async () => {
  await pg.query(
    "insert into session_files(workspace_id,session_id,bot_id,chat_id,message_id,telegram_file_id,unique_id,mime,size) values($1,$2,$3,999,1,'file','same','image/jpeg',4),($1,$2,$3,999,2,'file','same','image/jpeg',4)",
    [w, sid, bot],
  );
  expect((await pg.query("select * from session_files")).rows.length).toBe(2);
});
it("snapshots and canonical work ID are immutable", async () => {
  await pg.query(
    "update upload_sessions set snapshot='{}',work_folder_drive_id='drive-one',state='queued' where id=$1",
    [sid],
  );
  await expect(
    pg.query("update upload_sessions set snapshot='{\"x\":1}' where id=$1", [
      sid,
    ]),
  ).rejects.toThrow("IMMUTABLE_SNAPSHOT");
  await expect(
    pg.query(
      "update upload_sessions set work_folder_drive_id='drive-two' where id=$1",
      [sid],
    ),
  ).rejects.toThrow("IMMUTABLE_DRIVE_ID");
});
it("viewer sees own workspace only and cannot mutate / read queues", async () => {
  await pg.exec(`set role authenticated;set request.jwt.claim.sub='${user}'`);
  try {
    expect((await pg.query("select * from workspaces")).rows.length).toBe(1);
    expect((await pg.query("select * from upload_sessions")).rows.length).toBe(
      1,
    );
    await expect(pg.query("select * from jobs")).rejects.toThrow();
    await expect(
      pg.query("update upload_sessions set state='completed'"),
    ).rejects.toThrow();
    expect((await pg.query("select * from telegram_users")).rows.length).toBe(
      0,
    );
  } finally {
    await pg.exec("reset role");
  }
});
it("nonmember and anonymous cannot see internal data", async () => {
  await pg.exec(
    "set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000099'",
  );
  try {
    expect((await pg.query("select * from upload_sessions")).rows.length).toBe(
      0,
    );
  } finally {
    await pg.exec("reset role");
  }
  await pg.exec("set role anon");
  try {
    await expect(pg.query("select * from upload_sessions")).rejects.toThrow();
  } finally {
    await pg.exec("reset role");
  }
});
