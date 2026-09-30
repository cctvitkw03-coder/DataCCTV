import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { jobs, type Session, type Media } from "@/lib/domain";
import { db, transaction } from "./db";
import { GoogleDrive, FOLDER, type Drive } from "./drive";
import { handleUpdate, outbox, preference, operationKeyboard } from "./bot";
import { download, telegram, updateSchema } from "./telegram";
import { retryPolicy } from "./retry";
import { limit } from "./env";
interface Job {
  deadline?: number;
  id: string;
  session_id: string;
  workspace_id: string;
  lease_generation: number;
  lease_owner: string;
  attempts: number;
}
export async function claim(): Promise<Job | undefined> {
  return transaction(async (c) => {
    const r = await c.query(
      "select * from jobs where ((status in ('queued','retry') and run_after<=now()) or (status='running' and lease_until<now())) order by run_after for update skip locked limit 1",
    );
    if (!r.rowCount) return;
    return (
      await c.query(
        "update jobs set status='running',lease_owner=$2,lease_until=now()+interval '90 seconds',lease_generation=lease_generation+1 where id=$1 returning *",
        [r.rows[0].id, randomUUID()],
      )
    ).rows[0];
  });
}
async function fenced<T>(
  j: Job,
  fn: (c: PoolClient, s: Session) => Promise<T>,
): Promise<T> {
  return transaction(async (c) => {
    const valid = await c.query(
      "select id from jobs where id=$1 and lease_owner=$2 and lease_generation=$3 and lease_until>now() and status='running' for update",
      [j.id, j.lease_owner, j.lease_generation],
    );
    if (!valid.rowCount) throw new Error("STALE_LEASE");
    const s = (
      await c.query("select * from upload_sessions where id=$1 for update", [
        j.session_id,
      ])
    ).rows[0] as Session;
    return fn(c, s);
  });
}
async function check(j: Job) {
  if (j.deadline && Date.now() > j.deadline) throw new Error("WORKER_YIELD");
  await fenced(j, async (c, s) => {
    if (s.stop_requested) throw new Error("STOP_REQUESTED");
    await c.query(
      "update jobs set lease_until=now()+interval '90 seconds' where id=$1",
      [j.id],
    );
  });
}
async function node(
  j: Job,
  drive: Drive,
  key: string,
  name: string,
  parent: string,
) {
  await check(j);
  let row = (
    await db().query(
      "select * from drive_nodes where workspace_id=$1 and node_key=$2",
      [j.workspace_id, key],
    )
  ).rows[0];
  if (!row) {
    const id = await drive.generateId();
    row = await fenced(
      j,
      async (c) =>
        (
          await c.query(
            "insert into drive_nodes(workspace_id,node_key,parent_drive_id,drive_folder_id,name) values($1,$2,$3,$4,$5) on conflict(workspace_id,node_key) do update set node_key=excluded.node_key returning *",
            [j.workspace_id, key, parent, id, name],
          )
        ).rows[0],
    );
  }
  if (row.parent_drive_id !== parent) throw new Error("DRIVE_MAPPING_MISMATCH");
  await check(j);
  await drive.ensure({
    id: row.drive_folder_id,
    name: row.name,
    mimeType: FOLDER,
    parents: [parent],
    appProperties: { workspace_id: j.workspace_id, node_key: key },
  });
  await fenced(j, async (c) => {
    await c.query("update drive_nodes set status='ready' where id=$1", [
      row.id,
    ]);
  });
  return row.drive_folder_id as string;
}
export async function processJob(j: Job, drive: Drive = new GoogleDrive()) {
  j.deadline = Date.now() + 200000;
  try {
    let s = await fenced(j, async (c, s) => {
      if (s.stop_requested) throw new Error("STOP_REQUESTED");
      if (!s.snapshot) throw new Error("MISSING_SNAPSHOT");
      if (!s.work_folder_drive_id)
        await c.query(
          "update upload_sessions set state='provisioning' where id=$1",
          [s.id],
        );
      return s;
    });
    const d = s.snapshot!.draft;
    if (!s.work_folder_drive_id) {
      const folder = await fenced(j, async (c) => {
        if (d.folderId)
          return (
            await c.query(
              "select * from user_folders where id=$1 and workspace_id=$2",
              [d.folderId, s.workspace_id],
            )
          ).rows[0];
        return (
          await c.query(
            "insert into user_folders(workspace_id,display_name,normalized_name) values($1,$2,$3) on conflict(workspace_id,normalized_name) do update set normalized_name=excluded.normalized_name returning *",
            [
              s.workspace_id,
              d.pendingName,
              d.pendingName!.toLocaleLowerCase("th"),
            ],
          )
        ).rows[0];
      });
      if (!folder || folder.status === "blocked" || folder.status === "missing")
        throw new Error("FOLDER_UNAVAILABLE");
      const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
      const uid =
        folder.drive_folder_id ||
        (await node(j, drive, `user:${folder.id}`, folder.display_name, root));
      await drive.validateParent(uid);
      await fenced(j, async (c) => {
        await c.query(
          "update user_folders set drive_folder_id=$2,status='ready' where id=$1 and (drive_folder_id is null or drive_folder_id=$2)",
          [folder.id, uid],
        );
        await preference(c, s, folder.id);
      });
      let parent = "";
      for (const [code, label] of Object.entries(jobs)) {
        const category = await node(
          j,
          drive,
          `${folder.id}:${code}`,
          label,
          uid,
        );
        for (const system of ["CCTV", "QUARK"]) {
          const id = await node(
            j,
            drive,
            `${folder.id}:${code}:${system}`,
            system,
            category,
          );
          if (code === d.job && system === d.system) parent = id;
        }
      }
      const id = await drive.generateId();
      s = await fenced(j, async (c, s) => {
        if (!s.work_folder_drive_id) {
          await c.query(
            "update upload_sessions set work_folder_drive_id=$2 where id=$1",
            [s.id, id],
          );
          s.work_folder_drive_id = id;
        }
        return s;
      });
      await check(j);
      await drive.ensure({
        id: s.work_folder_drive_id!,
        name: s.snapshot!.folderName,
        mimeType: FOLDER,
        parents: [parent],
        appProperties: { workspace_id: s.workspace_id, session_id: s.id },
      });
    } else {
      const existing = await drive.get(s.work_folder_drive_id);
      if (!existing) {
        if (s.state === "uploading" || s.state === "partial")
          throw new Error("DRIVE_RESOURCE_MISSING"); // A reserved ID may have survived a crash before create; resolve persisted canonical parent only.
        const f = (
          await db().query(
            "select * from user_folders where workspace_id=$1 and " +
              (d.folderId ? "id=$2" : "normalized_name=$2"),
            [
              s.workspace_id,
              d.folderId || d.pendingName!.toLocaleLowerCase("th"),
            ],
          )
        ).rows[0];
        const p = (
          await db().query(
            "select drive_folder_id from drive_nodes where workspace_id=$1 and node_key=$2",
            [s.workspace_id, `${f?.id}:${d.job}:${d.system}`],
          )
        ).rows[0];
        if (!p) throw new Error("DRIVE_MAPPING_MISSING");
        await check(j);
        await drive.ensure({
          id: s.work_folder_drive_id,
          name: s.snapshot!.folderName,
          mimeType: FOLDER,
          parents: [p.drive_folder_id],
          appProperties: { workspace_id: s.workspace_id, session_id: s.id },
        });
      } else {
        const f = (
          await db().query(
            "select * from user_folders where workspace_id=$1 and " +
              (d.folderId ? "id=$2" : "normalized_name=$2"),
            [
              s.workspace_id,
              d.folderId || d.pendingName!.toLocaleLowerCase("th"),
            ],
          )
        ).rows[0];
        const p = (
          await db().query(
            "select drive_folder_id from drive_nodes where workspace_id=$1 and node_key=$2",
            [s.workspace_id, `${f?.id}:${d.job}:${d.system}`],
          )
        ).rows[0];
        if (
          !p ||
          existing.parents?.[0] !== p.drive_folder_id ||
          existing.mimeType !== FOLDER ||
          existing.trashed ||
          existing.appProperties?.session_id !== s.id ||
          existing.appProperties?.workspace_id !== s.workspace_id
        )
          throw new Error("DRIVE_RESOURCE_MISMATCH");
        await drive.validateParent(s.work_folder_drive_id);
      }
    }
    await fenced(j, async (c) => {
      await c.query(
        "update upload_sessions set state='uploading' where id=$1",
        [s.id],
      );
    });
    const file = (
      await db().query(
        "select * from session_files where session_id=$1 and status<>'uploaded' order by sequence limit 1",
        [s.id],
      )
    ).rows[0] as Media | undefined;
    if (file) {
      await check(j);
      if (!file.drive_file_id) {
        const id = await drive.generateId();
        file.drive_file_id = await fenced(
          j,
          async (c) =>
            (
              await c.query(
                "update session_files set drive_file_id=coalesce(drive_file_id,$2) where id=$1 returning drive_file_id",
                [file.id, id],
              )
            ).rows[0].drive_file_id,
        );
      }
      const bytes = await download(file.telegram_file_id, file.mime);
      await check(j);
      await drive.ensure(
        {
          id: file.drive_file_id!,
          name: file.target_name!,
          mimeType: file.mime,
          parents: [s.work_folder_drive_id!],
          appProperties: {
            workspace_id: s.workspace_id,
            session_id: s.id,
            session_file_id: file.id,
          },
        },
        bytes,
      );
      await fenced(j, async (c) => {
        await c.query(
          "update session_files set status='uploaded',uploaded_at=now(),sha256=$2,size=$3,attempts=attempts+1,last_error_code=null where id=$1",
          [
            file.id,
            createHash("sha256").update(bytes).digest("hex"),
            bytes.length,
          ],
        );
      });
    }
    await fenced(j, async (c, current) => {
      const count = +(
        await c.query(
          "select count(*) from session_files where session_id=$1 and status='uploaded'",
          [s.id],
        )
      ).rows[0].count;
      const complete = count === current.snapshot!.files.length;
      await c.query(
        "update jobs set status=$2,lease_until=null,attempts=0,run_after=now() where id=$1",
        [j.id, complete ? "done" : "queued"],
      );
      if (complete) {
        await c.query(
          "update upload_sessions set state='completed',completed_at=now(),last_error_code=null where id=$1",
          [s.id],
        );
        await outbox(
          c,
          s.workspace_id,
          s.chat_id,
          `complete:${s.id}`,
          {
            method: "sendMessage",
            chat_id: s.chat_id,
            text: `✅ บันทึกสำเร็จ ${count}/${count} รูป\n${s.snapshot!.folderName}`,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "เปิดโฟลเดอร์ Google Drive",
                    url: `https://drive.google.com/drive/folders/${s.work_folder_drive_id}`,
                  },
                ],
              ],
            },
          },
          s.id,
        );
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE_LEASE") return;
    if (e instanceof Error && e.message === "WORKER_YIELD") {
      await fenced(j, async (c) => {
        await c.query(
          "update jobs set status='queued',lease_until=null,run_after=now() where id=$1",
          [j.id],
        );
      });
      return;
    }
    await fenced(j, async (c, s) => {
      const stopped = e instanceof Error && e.message === "STOP_REQUESTED";
      const policy = retryPolicy(
        e,
        j.attempts + 1,
        limit("MAX_RETRY_ATTEMPTS", 5),
      );
      const count = +(
        await c.query(
          "select count(*) from session_files where session_id=$1 and status='uploaded'",
          [s.id],
        )
      ).rows[0].count;
      const state = stopped
        ? "stopped"
        : policy.retry
          ? "retry_wait"
          : count
            ? "partial"
            : "failed";
      await c.query(
        "update upload_sessions set state=$2,last_error_code=$3 where id=$1",
        [s.id, state, stopped ? null : policy.code],
      );
      await c.query(
        "update jobs set status=$2,attempts=attempts+1,last_error_code=$3,run_after=now()+$4*interval '1 second',lease_until=null where id=$1",
        [
          j.id,
          stopped ? "done" : policy.retry ? "retry" : "dead",
          policy.code,
          policy.delaySeconds,
        ],
      );
      if (!stopped)
        await c.query(
          "update session_files set attempts=attempts+1,last_error_code=$2,status=$3 where id=(select id from session_files where session_id=$1 and status<>'uploaded' order by sequence limit 1)",
          [s.id, policy.code, policy.retry ? "retry" : "failed"],
        );
      if (!policy.retry || stopped)
        await outbox(
          c,
          s.workspace_id,
          s.chat_id,
          `result:${j.id}:${j.lease_generation}`,
          {
            method: "sendMessage",
            chat_id: s.chat_id,
            text: `${stopped ? "หยุดงานแล้ว" : "งานต้องตรวจสอบ"} · สำเร็จ ${count}/${s.snapshot!.files.length} รูป\nแจ้งผู้ดูแลพร้อมรหัส S-${s.session_no.padStart(6, "0")} เพื่อ retry เฉพาะรูปที่เหลือ`,
            ...(stopped
              ? {}
              : {
                  reply_markup: await operationKeyboard(c, s, [
                    "retry",
                    "stop",
                  ]),
                }),
          },
          s.id,
        );
    }).catch((error) => {
      if (!(error instanceof Error && error.message === "STALE_LEASE"))
        throw error;
    });
  }
}
export async function processInbox() {
  return transaction(async (c) => {
    const r = await c.query(
      "select u.*,b.workspace_id from telegram_updates u join bot_installations b on b.id=u.bot_id where u.status='queued' and u.run_after<=now() and b.enabled order by u.received_at for update of u skip locked limit 1",
    );
    if (!r.rowCount) return false;
    const u = r.rows[0];
    await c.query("savepoint handler");
    try {
      await handleUpdate(
        c,
        { id: u.bot_id, workspace_id: u.workspace_id },
        updateSchema.parse(u.payload),
      );
      await c.query(
        "update telegram_updates set status='done',processed_at=now() where bot_id=$1 and update_id=$2",
        [u.bot_id, u.update_id],
      );
    } catch (e) {
      await c.query("rollback to savepoint handler");
      const code = e instanceof Error ? e.message : "";
      const validation =
        /^(STALE_CALLBACK|INVALID_|INCOMPLETE|TOO_MANY|FILE_TOO|UNSUPPORTED_|IMMUTABLE)/.test(
          code,
        );
      if (validation) {
        const chat =
          u.payload.callback_query?.message?.chat?.id ||
          u.payload.message?.chat?.id;
        if (chat)
          await outbox(
            c,
            u.workspace_id,
            String(chat),
            `invalid:${u.bot_id}:${u.update_id}`,
            {
              method: "sendMessage",
              chat_id: String(chat),
              text:
                code === "STALE_CALLBACK"
                  ? "รายการนี้อัปเดตแล้ว กรุณาใช้ปุ่มจากข้อความล่าสุด"
                  : "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง กรุณาตรวจข้อมูลและลองอีกครั้ง",
            },
          );
        await c.query(
          "update telegram_updates set status='done',last_error_code=$3 where bot_id=$1 and update_id=$2",
          [u.bot_id, u.update_id, code],
        );
      } else
        await c.query(
          "update telegram_updates set status=case when attempts>=4 then 'dead' else 'queued' end,attempts=attempts+1,run_after=now()+interval '30 seconds',last_error_code='HANDLER_ERROR' where bot_id=$1 and update_id=$2",
          [u.bot_id, u.update_id],
        );
    }
    return true;
  });
}
export async function processOutbox() {
  return transaction(async (c) => {
    const r = await c.query(
      "select * from notification_outbox where status='queued' and run_after<=now() order by created_at for update skip locked limit 1",
    );
    if (!r.rowCount) return;
    const row = r.rows[0];
    try {
      const { method, _input, ...body } = row.payload;
      const sent = await telegram(method, body);
      if (_input && Number.isSafeInteger(sent.message_id)) {
        await c.query(
          "insert into input_prompts(bot_id,chat_id,message_id,thread_id,workspace_id,session_id,actor_id,revision,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing",
          [
            _input.bot_id,
            row.chat_id,
            String(sent.message_id),
            _input.thread_id,
            _input.workspace_id,
            _input.session_id,
            _input.actor_id,
            _input.revision,
            _input.expires_at,
          ],
        );
      }
      await c.query(
        "update notification_outbox set status='done' where id=$1",
        [row.id],
      );
    } catch (e) {
      const p = retryPolicy(e, row.attempts + 1);
      await c.query(
        "update notification_outbox set status=$2,attempts=attempts+1,run_after=now()+$3*interval '1 second' where id=$1",
        [row.id, p.retry ? "queued" : "dead", p.delaySeconds],
      );
    }
  });
}
export async function runWorker() {
  for (let i = 0; i < 3; i++) if (!(await processInbox())) break;
  const j = await claim();
  if (j) await processJob(j);
  await processOutbox();
  return { processedJob: !!j };
}
