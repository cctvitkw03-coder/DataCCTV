import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { handleUpdate, tokenHash, render } from "@/server/bot";
import { telegram } from "@/server/telegram";
import { beginOAuth, finishOAuth } from "@/server/oauth";
import { encrypt, decrypt } from "@/server/crypto";
import { OAuth2Client } from "google-auth-library";
import {
  verifyResource,
  FOLDER,
  type Drive,
  type Resource,
} from "@/server/drive";
const shared = vi.hoisted(() => ({
  db: null as unknown as {
    query: (
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  },
}));
vi.mock("@/server/db", () => ({
  db: () => shared.db,
  transaction: async (fn: (c: unknown) => Promise<unknown>) => {
    await shared.db.query("begin");
    try {
      const result = await fn(shared.db);
      await shared.db.query("commit");
      return result;
    } catch (e) {
      await shared.db.query("rollback");
      throw e;
    }
  },
}));
vi.mock("@/server/telegram", async (original) => {
  const real = await original<typeof import("@/server/telegram")>();
  return {
    ...real,
    download: vi.fn(async () => Buffer.from([255, 216, 255, 0])),
    telegram: vi.fn(async () => ({ message_id: 999 })),
  };
});
import { claim, processJob, processOutbox, runWorker } from "@/server/worker";
const pg = new PGlite();
const w = randomUUID(),
  b = randomUUID();
const c = {
  query: async (text: string, values?: unknown[]) => {
    const r = await pg.query(text, values);
    const rows = r.rows.map((row) => {
      const out = { ...(row as Record<string, unknown>) };
      for (const f of r.fields)
        if (f.dataTypeID === 20 && out[f.name] != null)
          out[f.name] = String(out[f.name]);
      return out;
    });
    return { ...r, rows, rowCount: r.rows.length || r.affectedRows || 0 };
  },
} as unknown as PoolClient;
let counter = 0;
beforeAll(async () => {
  shared.db = c as unknown as typeof shared.db;
  await pg.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;",
  );
  await pg.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await pg.exec(
    readFileSync("supabase/migrations/002_groups_oauth.sql", "utf8"),
  );
  await pg.exec(readFileSync("supabase/migrations/003_other_job.sql", "utf8"));
  await pg.query(
    "insert into workspaces(id,name,drive_root_folder_id) values($1,'sandbox','root')",
    [w],
  );
  await pg.query(
    "insert into bot_installations(id,workspace_id,telegram_bot_id) values($1,$2,1)",
    [b, w],
  );
  await pg.query("insert into allowed_chats values($1,42,true)", [b]);
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "root";
});
afterAll(() => pg.close());
async function update(u: Record<string, unknown>) {
  await pg.exec("begin");
  try {
    await handleUpdate(c, { id: b, workspace_id: w }, {
      update_id: ++counter,
      ...u,
    } as Parameters<typeof handleUpdate>[2]);
    await pg.exec("commit");
  } catch (e) {
    await pg.exec("rollback");
    throw e;
  }
}
const msg = (id: number, extra: Record<string, unknown> = {}) => ({
  message_id: id,
  chat: { id: 42, type: "private" },
  from: { id: 7, username: "first", first_name: "Sender" },
  ...extra,
});
async function button(action: string, argument?: string, actor = 7) {
  const tokens = await pg.query<{ token_hash: string; session_id: string }>(
    "select t.token_hash,t.session_id from callback_tokens t join upload_sessions s on s.id=t.session_id where t.action=$1 and t.consumed_at is null and t.expected_revision=s.revision and s.state in ('collecting','configuring','preview') " +
      (argument ? "and argument=$2 " : "") +
      "order by t.expires_at desc",
    argument ? [action, argument] : [action],
  );
  let data: string | undefined;
  const messages = await pg.query<{
    payload: {
      reply_markup?: { inline_keyboard: { callback_data: string }[][] };
    };
  }>("select payload from notification_outbox order by created_at desc");
  for (const r of messages.rows) {
    for (const row of r.payload.reply_markup?.inline_keyboard || []) {
      for (const btn of row)
        if (
          btn.callback_data &&
          tokens.rows.some((t) => t.token_hash === tokenHash(btn.callback_data))
        )
          data ||= btn.callback_data;
    }
  }
  if (!data) throw Error("TEST_BUTTON_MISSING " + action);
  return {
    callback_query: {
      id: String(++counter),
      from: { id: actor, username: "new_name" },
      data,
      message: msg(999),
    },
  };
}
async function createConfirmed() {
  await update({
    message: msg(++counter, {
      photo: [
        {
          file_id: "photo",
          file_unique_id: "same",
          file_size: 4,
          width: 100,
          height: 100,
        },
      ],
    }),
  });
  await update(await button("new"));
  await update({ message: msg(++counter, { text: "นุ๊ก" }) });
  await update(await button("job", "UPS"));
  await update(await button("system", "CCTV"));
  await update(await button("branch", "custom"));
  await update({ message: msg(++counter, { text: "RAM" }) });
  await update(await button("detail"));
  await update(await button("date", "custom"));
  await update({ message: msg(++counter, { text: "24.9.69" }) });
  await update(await button("finish"));
  const cb = await button("confirm");
  await update(cb);
  return cb;
}
it("photo first, preview creates no Drive mappings; unauthorized / stale confirmation is rejected; one job", async () => {
  await update({
    message: msg(++counter, {
      photo: [
        {
          file_id: "photo",
          file_unique_id: "same",
          file_size: 4,
          width: 100,
          height: 100,
        },
      ],
    }),
  });
  expect(
    (await pg.query<{ draft: unknown }>("select draft from upload_sessions"))
      .rows[0].draft,
  ).toEqual({ closed: false });
  await expect(update(await button("new", undefined, 8))).rejects.toThrow(
    "STALE_CALLBACK",
  );
  await update(await button("new"));
  await update({ message: msg(++counter, { text: "นุ๊ก" }) });
  await update(await button("job", "UPS"));
  await update(await button("system", "CCTV"));
  await update(await button("branch", "custom"));
  await update({ message: msg(++counter, { text: "RAM" }) });
  await update(await button("detail"));
  await update(await button("date", "custom"));
  await update({ message: msg(++counter, { text: "24.9.69" }) });
  await update(await button("finish"));
  expect((await pg.query("select * from drive_nodes")).rows).toHaveLength(0);
  expect((await pg.query("select * from user_folders")).rows).toHaveLength(0);
  const cb = await button("confirm");
  await update(cb);
  await expect(update(cb)).rejects.toThrow("STALE_CALLBACK");
  expect((await pg.query("select * from jobs")).rows).toHaveLength(1);
  expect(
    (
      await pg.query<{ snapshot: { draft: { workDate: string } } }>(
        "select snapshot from upload_sessions",
      )
    ).rows[0].snapshot.draft.workDate,
  ).toBe("2026-09-24");
});
class FakeDrive implements Drive {
  resources = new Map<string, Resource>([
    ["root", { id: "root", name: "root", mimeType: FOLDER }],
  ]);
  writes = 0;
  crashOn: "folder" | "file" | undefined;
  async generateId() {
    return randomUUID();
  }
  async get(id: string) {
    return this.resources.get(id) || null;
  }
  async validateParent(id: string) {
    let r = this.resources.get(id);
    if (!r || r.trashed) throw Error("DRIVE_PARENT_UNAVAILABLE");
    for (let depth = 0; depth < 20; depth++) {
      if (r?.id === "root") return;
      r = this.resources.get(r?.parents?.[0] || "");
    }
    throw Error("OUTSIDE_DRIVE_ROOT");
  }
  async ensure(resource: Resource, bytes?: Buffer) {
    await this.validateParent(resource.parents![0]);
    const old = this.resources.get(resource.id);
    if (old) {
      verifyResource(old, resource, bytes);
      return;
    }
    this.writes++;
    this.resources.set(resource.id, {
      ...resource,
      ...(bytes
        ? {
            size: String(bytes.length),
            md5Checksum: createHash("md5").update(bytes).digest("hex"),
          }
        : {}),
    });
    if (
      (this.crashOn === "folder" &&
        resource.appProperties?.session_id &&
        !bytes) ||
      (this.crashOn === "file" && bytes)
    ) {
      this.crashOn = undefined;
      throw new TypeError(
        "simulated connection loss after successful Drive write",
      );
    }
  }
}
const drive = new FakeDrive();
it("crash after Drive folder creation reconciles persisted work ID; provisions all six combinations", async () => {
  drive.crashOn = "folder";
  const j = await claim();
  expect(j).toBeDefined();
  await processJob(j!, drive);
  const s = (
    await pg.query<{ id: string; state: string; work_folder_drive_id: string }>(
      "select * from upload_sessions",
    )
  ).rows[0];
  expect(s.state).toBe("retry_wait");
  expect(s.work_folder_drive_id).toBeTruthy();
  expect(drive.resources.has(s.work_folder_drive_id)).toBe(true);
  expect((await pg.query("select * from drive_nodes")).rows).toHaveLength(10);
  await pg.exec("update jobs set run_after=now()");
  await processJob((await claim())!, drive);
  const after = (
    await pg.query<{ state: string; work_folder_drive_id: string }>(
      "select * from upload_sessions",
    )
  ).rows[0];
  expect(after.state).toBe("completed");
  expect(after.work_folder_drive_id).toBe(s.work_folder_drive_id);
});
it("same branch / date in a new session gets a new folder; upload crash reuses same file ID", async () => {
  const prior = (
    await pg.query<{ work_folder_drive_id: string }>(
      "select work_folder_drive_id from upload_sessions",
    )
  ).rows[0].work_folder_drive_id;
  await createConfirmed();
  drive.crashOn = "file";
  await processJob((await claim())!, drive);
  const s = (
    await pg.query<{ id: string; state: string; work_folder_drive_id: string }>(
      "select * from upload_sessions order by session_no desc",
    )
  ).rows[0];
  expect(s.state).toBe("retry_wait");
  expect(s.work_folder_drive_id).not.toBe(prior);
  const f = (
    await pg.query<{ drive_file_id: string }>(
      "select drive_file_id from session_files where session_id=$1",
      [s.id],
    )
  ).rows[0];
  const writes = drive.writes;
  await pg.exec("update jobs set run_after=now()");
  await processJob((await claim())!, drive);
  expect(drive.writes).toBe(writes);
  expect(
    (
      await pg.query<{ drive_file_id: string; status: string }>(
        "select * from session_files where session_id=$1",
        [s.id],
      )
    ).rows[0],
  ).toMatchObject({ drive_file_id: f.drive_file_id, status: "uploaded" });
});
it("expired worker generation cannot perform Drive side effects", async () => {
  await createConfirmed();
  const old = (await claim())!;
  await pg.query(
    "update jobs set lease_until=now()-interval '1 second' where id=$1",
    [old.id],
  );
  const newer = (await claim())!;
  expect(newer.lease_generation).toBeGreaterThan(old.lease_generation);
  const writes = drive.writes;
  await processJob(old, drive);
  expect(drive.writes).toBe(writes);
  await processJob(newer, drive);
});
it("stop before provisioning creates nothing and reports stopped", async () => {
  await createConfirmed();
  const j = (await claim())!;
  await pg.query("update upload_sessions set stop_requested=true where id=$1", [
    j.session_id,
  ]);
  const writes = drive.writes;
  await processJob(j, drive);
  expect(drive.writes).toBe(writes);
  expect(
    (
      await pg.query<{ state: string }>(
        "select state from upload_sessions where id=$1",
        [j.session_id],
      )
    ).rows[0].state,
  ).toBe("stopped");
});

const groupMessage = (actor: number, extra: Record<string, unknown> = {}) => ({
  message_id: ++counter,
  chat: { id: -42, type: "supergroup" },
  message_thread_id: 10,
  is_topic_message: true,
  from: { id: actor, username: `person${actor}` },
  ...extra,
});
async function groupCallback(actor: number, session: string, action: string) {
  const token = (
    await pg.query<{ token_hash: string }>(
      "select t.token_hash from callback_tokens t join upload_sessions s on s.id=t.session_id where t.session_id=$1 and t.action=$2 and t.expected_revision=s.revision and t.consumed_at is null",
      [session, action],
    )
  ).rows[0];
  const messages = await pg.query<{
    payload: {
      reply_markup?: { inline_keyboard?: { callback_data: string }[][] };
    };
  }>(
    "select payload from notification_outbox where session_id=$1 order by created_at desc",
    [session],
  );
  let raw: string | undefined;
  for (const row of messages.rows)
    for (const buttons of row.payload.reply_markup?.inline_keyboard || [])
      for (const btn of buttons)
        if (
          btn.callback_data &&
          tokenHash(btn.callback_data) === token.token_hash
        )
          raw = btn.callback_data;
  if (!raw) throw Error("TEST_CALLBACK_MISSING");
  return {
    callback_query: {
      id: String(++counter),
      from: { id: actor },
      data: raw,
      message: groupMessage(actor),
    },
  };
}
it("groups require explicit rollout flag and per-chat allowlist", async () => {
  await pg.query(
    "insert into allowed_chats(bot_id,telegram_chat_id,enabled,groups_enabled) values($1,-42,true,true)",
    [b],
  );
  process.env.TELEGRAM_GROUPS_ENABLED = "false";
  await update({
    message: groupMessage(100, {
      photo: [
        { file_id: "group", file_unique_id: "group", width: 10, height: 10 },
      ],
    }),
  });
  expect(
    (await pg.query("select * from upload_sessions where chat_id=-42")).rows,
  ).toHaveLength(0);
  process.env.TELEGRAM_GROUPS_ENABLED = "true";
});
it("four interleaved group senders have separate sessions and source replies", async () => {
  await pg.exec("update notification_outbox set status='done'");
  for (const actor of [100, 101, 102, 103])
    await update({
      message: groupMessage(actor, {
        media_group_id: `album-${actor}`,
        photo: [
          { file_id: "group", file_unique_id: "same", width: 10, height: 10 },
        ],
      }),
    });
  const sessions = (
    await pg.query<{ id: string; root_message_id: number; actor_id: string }>(
      "select * from upload_sessions where chat_id=-42 order by session_no",
    )
  ).rows;
  expect(sessions).toHaveLength(4);
  expect(new Set(sessions.map((s) => s.actor_id)).size).toBe(4);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const payload = (
      await pg.query<{
        payload: {
          reply_parameters: { message_id: number };
          message_thread_id: number;
        };
      }>(
        "select payload from notification_outbox where session_id=$1 order by created_at desc limit 1",
        [s.id],
      )
    ).rows[0].payload;
    expect(payload.reply_parameters.message_id).toBe(Number(s.root_message_id));
    expect(payload.message_thread_id).toBe(10);
    await update(await groupCallback(100 + i, s.id, "new"));
  }
  let sentId = 50000;
  vi.mocked(telegram).mockImplementation(async () => ({
    message_id: ++sentId,
  }));
  const queued = (
    await pg.query("select id from notification_outbox where status='queued'")
  ).rows.length;
  for (let i = 0; i < queued; i++) await processOutbox();
  expect(
    (await pg.query("select * from input_prompts where chat_id=-42")).rows,
  ).toHaveLength(4);
});
it("group text must reply to the same actor, session, topic and current prompt revision", async () => {
  const sessions = (
    await pg.query<{
      id: string;
      draft: { pendingName?: string };
      actor_id: string;
      revision: number;
    }>("select * from upload_sessions where chat_id=-42 order by session_no")
  ).rows;
  const prompt = (
    await pg.query<{ message_id: number }>(
      "select message_id from input_prompts where session_id=$1",
      [sessions[0].id],
    )
  ).rows[0];
  await update({
    message: groupMessage(101, {
      text: "wrong actor",
      reply_to_message: { message_id: Number(prompt.message_id) },
    }),
  });
  expect(
    (
      await pg.query<{ draft: { pendingName?: string } }>(
        "select draft from upload_sessions where id=$1",
        [sessions[1].id],
      )
    ).rows[0].draft.pendingName,
  ).toBeUndefined();
  await update({ message: groupMessage(100, { text: "no reply" }) });
  expect(
    (
      await pg.query<{ draft: { pendingName?: string } }>(
        "select draft from upload_sessions where id=$1",
        [sessions[0].id],
      )
    ).rows[0].draft.pendingName,
  ).toBeUndefined();
  await update({
    message: groupMessage(100, {
      text: "เจ้าของชุด",
      reply_to_message: { message_id: Number(prompt.message_id) },
    }),
  });
  expect(
    (
      await pg.query<{ draft: { pendingName: string } }>(
        "select draft from upload_sessions where id=$1",
        [sessions[0].id],
      )
    ).rows[0].draft.pendingName,
  ).toBe("เจ้าของชุด");
  await update({
    message: groupMessage(100, {
      text: "stale reply",
      reply_to_message: { message_id: Number(prompt.message_id) },
    }),
  });
  expect(
    (
      await pg.query<{ draft: { pendingName: string } }>(
        "select draft from upload_sessions where id=$1",
        [sessions[0].id],
      )
    ).rows[0].draft.pendingName,
  ).toBe("เจ้าของชุด");
});
it("same group actor in another topic gets an independent draft", async () => {
  await update({
    message: groupMessage(100, {
      message_thread_id: 20,
      photo: [
        { file_id: "topic20", file_unique_id: "unique", width: 10, height: 10 },
      ],
    }),
  });
  expect(
    (
      await pg.query(
        "select * from upload_sessions where chat_id=-42 and thread_id=20",
      )
    ).rows,
  ).toHaveLength(1);
});
it("OAuth state is PKCE-bound, encrypted and consumed once; tokens never stored in plaintext", async () => {
  process.env.OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const user = randomUUID();
  await pg.query("insert into auth.users values($1)", [user]);
  const started = await beginOAuth(w, user);
  const url = new URL(started.url);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/auth/google/callback",
  );
  expect(url.searchParams.get("access_type")).toBe("offline");
  const state = (
    await pg.query<{ verifier_encrypted: string }>(
      "select verifier_encrypted from private.oauth_states",
    )
  ).rows[0];
  expect(state.verifier_encrypted).toMatch(/^v1\./);
  const spy = vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
    tokens: {
      refresh_token: "test-refresh-value",
      scope: "https://www.googleapis.com/auth/drive.file",
    },
    res: null,
  } as never);
  await expect(
    finishOAuth(started.state, "test-code", w, randomUUID()),
  ).rejects.toThrow("INVALID_OAUTH_STATE");
  expect(spy).not.toHaveBeenCalled();
  await finishOAuth(started.state, "test-code", w, user);
  const stored = (
    await pg.query<{ refresh_token_encrypted: string }>(
      "select refresh_token_encrypted from private.google_credentials",
    )
  ).rows[0].refresh_token_encrypted;
  expect(stored).not.toContain("test-refresh-value");
  expect(decrypt(stored, `google:${w}`)).toBe("test-refresh-value");
  await expect(
    finishOAuth(started.state, "test-code", w, user),
  ).rejects.toThrow("INVALID_OAUTH_STATE");
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
});
it("encryption rejects altered ciphertext and wrong workspace context", () => {
  const value = encrypt("sensitive-token", `google:${w}`);
  expect(() => decrypt(value, "google:other")).toThrow();
  const parts = value.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  expect(() => decrypt(parts.join("."), `google:${w}`)).toThrow();
});
it("authenticated browser cannot read private OAuth tables or prompts", async () => {
  await pg.exec("set role authenticated");
  try {
    await expect(
      pg.query("select * from private.google_credentials"),
    ).rejects.toThrow();
    await expect(
      pg.query("select * from private.oauth_states"),
    ).rejects.toThrow();
    await expect(pg.query("select * from input_prompts")).rejects.toThrow();
  } finally {
    await pg.exec("reset role");
  }
});

it("ordinary group reply thread IDs do not invalidate current menu callbacks", async () => {
  await update({
    message: groupMessage(104, {
      is_topic_message: false,
      message_thread_id: undefined,
      photo: [
        {
          file_id: "ordinary",
          file_unique_id: "ordinary",
          width: 10,
          height: 10,
        },
      ],
    }),
  });
  const session = (
    await pg.query<{ id: string }>(
      "select id from upload_sessions where chat_id=-42 and thread_id=0 and actor_id=(select id from telegram_users where telegram_user_id=104)",
    )
  ).rows[0];
  const cb = await groupCallback(104, session.id, "new");
  cb.callback_query.message.is_topic_message = false;
  cb.callback_query.message.message_thread_id = 777;
  await update(cb);
  expect(
    (
      await pg.query<{ step: string }>(
        "select step from upload_sessions where id=$1",
        [session.id],
      )
    ).rows[0].step,
  ).toBe("new_folder");
});

it("one worker invocation sends the menu and ForceReply prompt together", async () => {
  await pg.exec(
    "update notification_outbox set status='done'; update jobs set status='done'",
  );
  const session = (
    await pg.query<{ id: string }>(
      "select id from upload_sessions where chat_id=-42 and thread_id=0 and actor_id=(select id from telegram_users where telegram_user_id=104)",
    )
  ).rows[0];
  const fresh = (
    await c.query<Parameters<typeof render>[1]>(
      "update upload_sessions set revision=revision+1 where id=$1 returning *",
      [session.id],
    )
  ).rows[0];
  await render(c, fresh);
  vi.mocked(telegram).mockClear();
  await runWorker();
  const sent = vi.mocked(telegram).mock.calls.map((call) => call[1]) as {
    reply_markup?: { force_reply?: boolean };
  }[];
  expect(sent.some((body) => body.reply_markup?.force_reply)).toBe(true);
  expect(
    (
      await pg.query(
        "select id from notification_outbox where status='queued' and session_id=$1",
        [session.id],
      )
    ).rows,
  ).toHaveLength(0);
});

it("quick rollout applies only to new sessions and can return to classic without losing photos", async () => {
  process.env.BOT_FLOW_MODE = "quick";
  try {
    await update({
      message: groupMessage(105, {
        photo: [
          { file_id: "quick", file_unique_id: "quick", width: 10, height: 10 },
        ],
      }),
    });
    const read = async () =>
      (
        await c.query(
          "select * from upload_sessions where actor_id=(select id from telegram_users where telegram_user_id=105)",
        )
      ).rows[0];
    let s = await read();
    expect(s.draft.flow).toBe("quick");
    expect(s.step).toBe("review");
    expect(s.draft.branch).toBeUndefined();
    expect(s.draft.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    process.env.BOT_FLOW_MODE = "classic";
    await update({
      message: groupMessage(105, {
        photo: [
          {
            file_id: "quick2",
            file_unique_id: "quick2",
            width: 10,
            height: 10,
          },
        ],
      }),
    });
    s = await read();
    expect(s.draft.flow).toBe("quick");
    await update(await groupCallback(105, s.id, "classic"));
    s = await read();
    expect(s.draft.flow).toBeUndefined();
    expect(s.step).toBe("folder");
    expect(
      (
        await pg.query("select * from session_files where session_id=$1", [
          s.id,
        ])
      ).rows,
    ).toHaveLength(2);
  } finally {
    delete process.env.BOT_FLOW_MODE;
  }
});
