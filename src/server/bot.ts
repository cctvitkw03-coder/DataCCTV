import { mutateFlow, quickDraft } from "@/lib/quick-flow";
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import {
  clean,
  editable,
  fullDate,
  jobs,
  snapshot,
  today,
  type Session,
  type Media,
} from "@/lib/domain";
import { media, type Update } from "./telegram";
import { limit } from "./env";
export const tokenHash = (v: string) =>
  createHash("sha256").update(v).digest("hex");
type Button = { text: string; callback_data: string };
export async function outbox(
  c: PoolClient,
  workspace: string,
  chat: string,
  key: string,
  payload: unknown,
  session?: string,
) {
  if (session && typeof payload === "object" && payload !== null) {
    const context = (
      await c.query(
        "select thread_id,root_message_id from upload_sessions where id=$1 and workspace_id=$2",
        [session, workspace],
      )
    ).rows[0];
    if (context)
      payload = {
        ...payload,
        message_thread_id:
          String(context.thread_id) === "0"
            ? undefined
            : Number(context.thread_id),
        reply_parameters: context.root_message_id
          ? {
              message_id: Number(context.root_message_id),
              allow_sending_without_reply: true,
            }
          : undefined,
      };
  }
  await c.query(
    "insert into notification_outbox(workspace_id,chat_id,event_key,payload,session_id) values($1,$2,$3,$4,$5) on conflict(event_key) do nothing",
    [workspace, chat, key, payload, session || null],
  );
}
export async function render(c: PoolClient, s: Session, page = 0, search = "") {
  // Newer menus supersede unsent older revisions while preserving sent-message audit.
  await c.query(
    "update notification_outbox set status='superseded' where session_id=$1 and status='queued' and (event_key like 'menu:%' or event_key like 'prompt:%')",
    [s.id],
  );
  const rows: Button[][] = [];
  async function button(text: string, action: string, value?: string) {
    const raw = "v1:" + randomBytes(18).toString("base64url");
    await c.query(
      "insert into callback_tokens(token_hash,workspace_id,session_id,actor_id,chat_id,thread_id,action,argument,expected_revision,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,least($10::timestamptz,now()+interval '30 minutes'))",
      [
        tokenHash(raw),
        s.workspace_id,
        s.id,
        s.actor_id,
        s.chat_id,
        s.thread_id,
        action,
        value || null,
        s.revision,
        s.expires_at,
      ],
    );
    return { text, callback_data: raw };
  }
  const fileRows = await c.query(
    "select * from session_files where session_id=$1 order by message_id",
    [s.id],
  );
  const sender = (
    await c.query(
      "select username,telegram_user_id from telegram_users where id=$1",
      [s.actor_id],
    )
  ).rows[0];
  let text = `ผู้ส่ง: ${sender?.username ? "@" + sender.username : sender?.telegram_user_id}\n📷 ชุด S-${s.session_no.padStart(6, "0")} · รับแล้ว ${fileRows.rowCount} รูป\n`;
  if (s.draft.flow === "quick" && s.step === "review") {
    const d = s.draft;
    text += `📋 ตรวจรายละเอียดงาน\nโฟลเดอร์: ${d.folderName || d.pendingName || "ยังไม่ได้เลือก"}\nประเภท: ${d.job ? jobs[d.job] : "ยังไม่ได้เลือก"}\nระบบ: ${d.system || "ยังไม่ได้เลือก"}\nสาขา: ${d.branch || "กรอกใหม่สำหรับงานนี้"}\nอุปกรณ์: ${d.item || "—"}\nรายละเอียด: ${d.detail || "—"}\nวันที่: ${d.workDate ? fullDate(d.workDate) : "ยังไม่ได้เลือก"}\n`;
    if (s.state === "preview") {
      const snap = snapshot(s, fileRows.rows);
      text += `\nโฟลเดอร์งาน: ${snap.folderName}\nยืนยันบันทึก ${snap.files.length} รูป`;
      if (d.workDate! > today()) text += "\n⚠️ วันที่งานอยู่ในอนาคต";
      rows.push([await button("✅ ยืนยันบันทึก", "confirm")]);
    }
    rows.push(
      [
        await button("แก้โฟลเดอร์", "edit_field", "folder"),
        await button("แก้ประเภท", "edit_field", "job"),
      ],
      [
        await button("แก้ระบบ", "edit_field", "system"),
        await button(
          d.branch ? "แก้สาขา" : "✏️ กรอกสาขา",
          "edit_field",
          "branch",
        ),
      ],
      [
        await button("แก้วันที่", "edit_field", "date"),
        await button("แก้รายละเอียด", "edit_field", "detail"),
      ],
    );
    if (d.job === "MOUSE_KEYBOARD")
      rows.push([await button("เลือกอุปกรณ์", "edit_field", "item")]);
  } else if (s.state === "preview") {
    const snap = snapshot(s, fileRows.rows);
    text += `📋 ตรวจสอบก่อนสร้าง\n${snap.path}\nวันที่งาน: ${fullDate(s.draft.workDate!)}\nรูปทั้งหมด: ${snap.files.length}\n${s.draft.pendingName ? "ชื่อใหม่: จะสร้างโครงสร้างทั้ง 3 ประเภท × 2 ระบบหลังยืนยัน" : ""}\n${s.draft.workDate! > today() ? "⚠️ วันที่งานอยู่ในอนาคต กรุณาตรวจสอบ" : ""}`;
    rows.push(
      [await button("✅ สร้างโฟลเดอร์และอัปโหลด", "confirm")],
      [await button("✏️ แก้ไข", "edit")],
    );
  } else if (s.step === "folder" || s.step === "search_folder") {
    text += "เลือกชื่อโฟลเดอร์ (ทุกชื่อเลือกได้)";
    const list = await c.query(
      "select f.*, (p.last_user_folder_id=f.id) as recent from user_folders f left join user_preferences p on p.workspace_id=f.workspace_id and p.telegram_user_pk=$2 where f.workspace_id=$1 and f.normalized_name ilike $3 order by recent desc nulls last,f.display_name limit 7 offset $4",
      [s.workspace_id, s.actor_id, `%${search}%`, page * 6],
    );
    for (const f of list.rows.slice(0, 6))
      rows.push([
        await button(
          `${f.recent ? "ล่าสุด · " : ""}${f.display_name}`,
          "folder",
          `${f.id}|${f.display_name}`,
        ),
      ]);
    if (list.rows.length > 6)
      rows.push([await button("หน้าถัดไป", "page", String(page + 1))]);
    if (page > 0) rows.push([await button("หน้าแรก", "page", "0")]);
    rows.push([
      await button("➕ สร้างชื่อใหม่", "new"),
      await button("🔎 ค้นหาชื่อ", "search"),
    ]);
    if (s.step === "search_folder") text += "\nพิมพ์ชื่อที่ต้องการค้นหา";
  } else if (s.step === "job") {
    text += "เลือกประเภทงาน";
    for (const [code, label] of Object.entries(jobs))
      rows.push([await button(label, "job", code)]);
  } else if (s.step === "system") {
    text += "เลือกประเภทระบบ";
    rows.push([
      await button("📹 CCTV", "system", "CCTV"),
      await button("🖥️ QUARK", "system", "QUARK"),
    ]);
  } else if (s.step === "branch") {
    text += "เลือกสาขา";
    const b = await c.query(
      "select code from branches where workspace_id=$1 and enabled order by code limit 8",
      [s.workspace_id],
    );
    for (const r of b.rows) rows.push([await button(r.code, "branch", r.code)]);
    rows.push([await button("✏️ สาขาอื่น", "branch", "custom")]);
  } else if (s.step === "item") {
    text += "เลือกอุปกรณ์";
    for (const x of ["เมาส์", "คีย์บอร์ด", "เมาส์ + คีย์บอร์ด", "อื่น"])
      rows.push([await button(x, "item", x)]);
  } else if (s.step === "date") {
    text += "เลือกวันที่งาน";
    const t = today(),
      y = new Date(t + "T00:00:00Z");
    y.setUTCDate(y.getUTCDate() - 1);
    const prev = y.toISOString().slice(0, 10);
    rows.push(
      [
        await button(`วันนี้ ${t}`, "date", t + "|today"),
        await button(`เมื่อวาน ${prev}`, "date", prev + "|yesterday"),
      ],
      [await button("ระบุเอง", "date", "custom")],
    );
  } else if (s.step === "detail") {
    text +=
      s.draft.job === "OTHER"
        ? "พิมพ์รายละเอียดงานอื่น เช่น เปลี่ยนจอ / เดินสาย"
        : "พิมพ์เครื่อง / จุดใช้งาน";
    if (s.draft.job === "UPS")
      rows.push([await button("ข้ามรายละเอียด", "detail")]);
  } else if (s.step === "new_folder")
    text += "พิมพ์ชื่อโฟลเดอร์ใหม่ (สร้างหลังยืนยันเท่านั้น)";
  else if (s.step === "enter_date")
    text += "พิมพ์วันที่ เช่น 24.9.69 หรือ 2026-09-24";
  else if (s.step === "enter_branch") text += "พิมพ์รหัสหรือชื่อสาขา";
  else text += "กดส่งครบแล้วเพื่อตรวจสอบก่อนสร้าง";
  if (editable.includes(s.state)) {
    if (
      !s.draft.closed ||
      (s.draft.flow === "quick" && s.step === "review" && s.state !== "preview")
    )
      rows.push([
        await button(
          s.draft.flow === "quick"
            ? "✅ ส่งครบแล้ว / ตรวจสอบ"
            : "✅ ส่งครบแล้ว",
          "finish",
        ),
      ]);
    rows.push([
      await button("◀️ ย้อนกลับ", "back"),
      await button("❌ ยกเลิก", "cancel"),
    ]);
  }
  if (s.draft.flow === "quick")
    rows.push([await button("ใช้แบบเดิม", "classic")]);
  await outbox(
    c,
    s.workspace_id,
    s.chat_id,
    `menu:${s.id}:${s.revision}:${page}:${search}`,
    {
      method: "sendMessage",
      chat_id: s.chat_id,
      message_thread_id: s.thread_id === "0" ? undefined : Number(s.thread_id),
      text,
      reply_markup: { inline_keyboard: rows },
    },
    s.id,
  );
  if (
    s.is_group &&
    [
      "new_folder",
      "search_folder",
      "enter_branch",
      "detail",
      "enter_date",
    ].includes(s.step)
  ) {
    await outbox(
      c,
      s.workspace_id,
      s.chat_id,
      `prompt:${s.id}:${s.revision}:${page}:${search}`,
      {
        method: "sendMessage",
        chat_id: s.chat_id,
        text: `ตอบกลับข้อความนี้สำหรับชุด S-${s.session_no.padStart(6, "0")} เท่านั้น\n${text}`,
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: "พิมพ์ข้อมูลของชุดรูปนี้",
        },
        _input: {
          bot_id: s.bot_id,
          session_id: s.id,
          workspace_id: s.workspace_id,
          actor_id: s.actor_id,
          revision: s.revision,
          thread_id: s.thread_id,
          expires_at: s.expires_at,
        },
      },
      s.id,
    );
  }
}
async function save(c: PoolClient, s: Session) {
  await c.query(
    "update upload_sessions set draft=$2,step=$3,state=$4,revision=$5,last_activity_at=now() where id=$1",
    [s.id, s.draft, s.step, s.state, s.revision],
  );
}
export async function handleUpdate(
  c: PoolClient,
  bot: { id: string; workspace_id: string },
  u: Update,
) {
  const cb = u.callback_query,
    m = cb?.message || u.message || u.edited_message,
    actor = cb?.from || m?.from;
  if (!m) return;
  // Reply threads in ordinary groups are not forum topics.
  if (!m.is_topic_message) m.message_thread_id = undefined;
  const allowed = await c.query(
    "select groups_enabled from allowed_chats where bot_id=$1 and telegram_chat_id=$2 and enabled",
    [bot.id, String(m.chat.id)],
  );
  if (!allowed.rowCount) return;
  if (!actor || m.sender_chat) {
    await outbox(
      c,
      bot.workspace_id,
      String(m.chat.id),
      `anonymous:${u.update_id}`,
      {
        method: "sendMessage",
        chat_id: String(m.chat.id),
        message_thread_id: m.message_thread_id,
        text: "ไม่สามารถระบุผู้ส่งนิรนามได้ กรุณาส่งด้วยบัญชีผู้ใช้หรือใช้แชตส่วนตัว",
      },
    );
    return;
  }
  if (
    m.chat.type !== "private" &&
    (process.env.TELEGRAM_GROUPS_ENABLED !== "true" ||
      !allowed.rows[0].groups_enabled ||
      !["group", "supergroup"].includes(m.chat.type))
  ) {
    await outbox(
      c,
      bot.workspace_id,
      String(m.chat.id),
      `group:${u.update_id}`,
      {
        method: "sendMessage",
        chat_id: String(m.chat.id),
        text: "กลุ่มนี้ยังไม่เปิดใช้งาน กรุณาใช้แชตส่วนตัวหรือให้ผู้ดูแลเปิดกลุ่มทดสอบก่อน",
      },
    );
    return;
  }
  await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${bot.id}:${m.chat.id}:${m.message_thread_id || 0}:${actor.id}`,
  ]);
  const rate = await c.query(
    "select count(*) from telegram_updates where bot_id=$1 and received_at>now()-interval '1 minute' and coalesce(payload->'message'->'from'->>'id',payload->'callback_query'->'from'->>'id')=$2",
    [bot.id, String(actor.id)],
  );
  if (Number(rate.rows[0].count) > 120) throw new Error("INVALID_RATE_LIMIT");
  const ar = await c.query(
    "insert into telegram_users(workspace_id,bot_id,telegram_user_id,username,display_name) values($1,$2,$3,$4,$5) on conflict(bot_id,telegram_user_id) do update set username=excluded.username,display_name=excluded.display_name,last_seen_at=now() returning id",
    [
      bot.workspace_id,
      bot.id,
      String(actor.id),
      actor.username || null,
      actor.first_name || "",
    ],
  );
  const actorId = ar.rows[0].id;
  if (cb) {
    const t = (
      await c.query(
        "select * from callback_tokens where token_hash=$1 for update",
        [tokenHash(cb.data || "")],
      )
    ).rows[0];
    if (
      !t ||
      t.consumed_at ||
      new Date(t.expires_at).getTime() < Date.now() ||
      t.actor_id !== actorId ||
      String(t.chat_id) !== String(m.chat.id) ||
      String(t.thread_id) !== String(m.message_thread_id || 0)
    )
      throw new Error("STALE_CALLBACK");
    const s = (
      await c.query(
        "select * from upload_sessions where id=$1 and bot_id=$2 for update",
        [t.session_id, bot.id],
      )
    ).rows[0] as Session;
    if (
      !s ||
      s.revision !== t.expected_revision ||
      (!editable.includes(s.state) && !["retry", "stop"].includes(t.action))
    )
      throw new Error("STALE_CALLBACK");
    if (["retry", "stop"].includes(t.action)) {
      const retry = t.action === "retry";
      if (retry && !["partial", "failed"].includes(s.state))
        throw new Error("INVALID_TRANSITION");
      if (
        !retry &&
        ![
          "queued",
          "provisioning",
          "uploading",
          "retry_wait",
          "partial",
          "failed",
        ].includes(s.state)
      )
        throw new Error("INVALID_TRANSITION");
      if (retry) {
        await c.query(
          "update upload_sessions set state='queued',stop_requested=false,revision=revision+1 where id=$1",
          [s.id],
        );
        await c.query(
          "update jobs set status='queued',attempts=0,run_after=now(),lease_generation=lease_generation+1 where session_id=$1",
          [s.id],
        );
      } else {
        await c.query(
          "update upload_sessions set stop_requested=true,revision=revision+1 where id=$1",
          [s.id],
        );
        await c.query(
          "update jobs set status=case when status='running' then status else 'queued' end,run_after=now() where session_id=$1",
          [s.id],
        );
      }
      await c.query(
        "update callback_tokens set consumed_at=now() where token_hash=$1",
        [t.token_hash],
      );
      await c.query(
        "insert into audit_logs(workspace_id,actor_type,actor_id,action,entity_id) values($1,'telegram',$2,$3,$4)",
        [s.workspace_id, actorId, t.action, s.id],
      );
      await outbox(
        c,
        s.workspace_id,
        s.chat_id,
        "operation:" + s.id + ":" + (s.revision + 1),
        {
          method: "sendMessage",
          chat_id: s.chat_id,
          text: retry
            ? "นำรูปที่เหลือเข้าคิวเดิมแล้ว"
            : "ขอหยุดงานก่อนขั้นตอนถัดไปแล้ว ไม่ลบรูปเดิม",
        },
        s.id,
      );
      return;
    }
    if (t.action === "page") {
      await c.query(
        "update callback_tokens set consumed_at=now() where token_hash=$1",
        [t.token_hash],
      );
      await render(c, s, Number(t.argument));
      return;
    }
    if (t.action === "confirm") {
      if (s.state !== "preview") throw new Error("INVALID_TRANSITION");
      const f = await c.query(
        "select * from session_files where session_id=$1 order by message_id",
        [s.id],
      );
      const snap = snapshot(s, f.rows);
      for (const file of snap.files)
        await c.query(
          "update session_files set sequence=$2,target_name=$3 where id=$1",
          [file.id, file.sequence, file.target_name],
        );
      await c.query(
        "update upload_sessions set state='queued',snapshot=$2,work_date=$3,expected_file_count=$4,confirmed_at=now(),revision=revision+1 where id=$1",
        [s.id, snap, s.draft.workDate, snap.files.length],
      );
      await c.query(
        "insert into jobs(workspace_id,session_id,dedupe_key) values($1,$2,$3) on conflict do nothing",
        [s.workspace_id, s.id, `upload:${s.id}`],
      );
      if (s.draft.folderId) await preference(c, s, s.draft.folderId);
      await outbox(
        c,
        s.workspace_id,
        s.chat_id,
        `queued:${s.id}`,
        {
          method: "sendMessage",
          chat_id: s.chat_id,
          text: `⏳ รับงาน S-${s.session_no.padStart(6, "0")} แล้ว กำลังบันทึก ${snap.files.length} รูป`,
          reply_markup: await operationKeyboard(
            c,
            { ...s, revision: s.revision + 1 },
            ["stop"],
          ),
        },
        s.id,
      );
      await c.query(
        "insert into audit_logs(workspace_id,actor_type,actor_id,action,entity_id) values($1,'telegram',$2,'confirm',$3)",
        [s.workspace_id, actorId, s.id],
      );
    } else {
      if (t.action === "folder") {
        const folder = (
          await c.query(
            "select * from user_folders where workspace_id=$1 and id=$2",
            [s.workspace_id, t.argument.split("|")[0]],
          )
        ).rows[0];
        if (!folder) throw new Error("INVALID_FOLDER");
        t.argument = `${folder.id}|${folder.display_name}`;
      }
      const n = mutateFlow(s, t.action, t.argument || undefined);
      if (n.state === "preview")
        snapshot(
          n,
          (
            await c.query("select * from session_files where session_id=$1", [
              n.id,
            ])
          ).rows as Media[],
        );
      await save(c, n);
      if (n.state !== "cancelled") await render(c, n);
      else
        await outbox(
          c,
          s.workspace_id,
          s.chat_id,
          `cancel:${s.id}`,
          {
            method: "sendMessage",
            chat_id: s.chat_id,
            text: "ยกเลิกชุดนี้แล้ว ยังไม่มีการสร้างโฟลเดอร์ใน Drive",
          },
          s.id,
        );
    }
    await c.query(
      "update callback_tokens set consumed_at=now() where token_hash=$1",
      [t.token_hash],
    );
    return;
  }
  if (u.edited_message) {
    await outbox(
      c,
      bot.workspace_id,
      String(m.chat.id),
      `edited:${u.update_id}`,
      {
        method: "sendMessage",
        chat_id: String(m.chat.id),
        text: "ยังไม่รองรับการแก้สื่อเดิม กรุณายกเลิก draft แล้วส่งชุดใหม่ งานที่ยืนยันแล้วคง snapshot เดิม",
      },
    );
    const old = await c.query(
      "select s.* from upload_sessions s join session_files f on f.session_id=s.id where f.bot_id=$1 and f.chat_id=$2 and f.message_id=$3 and s.state in ('collecting','configuring','preview') for update of s",
      [bot.id, String(m.chat.id), String(m.message_id)],
    );
    if (old.rowCount)
      await c.query(
        "update upload_sessions set state='cancelled',revision=revision+1 where id=$1",
        [old.rows[0].id],
      );
    return;
  }
  await c.query(
    "update upload_sessions set state='expired',revision=revision+1 where bot_id=$1 and actor_id=$2 and state in ('collecting','configuring','preview') and expires_at<now()",
    [bot.id, actorId],
  );
  let s = (
    await c.query(
      "select * from upload_sessions where bot_id=$1 and actor_id=$2 and chat_id=$3 and thread_id=$4 and state in ('collecting','configuring','preview') for update",
      [bot.id, actorId, String(m.chat.id), String(m.message_thread_id || 0)],
    )
  ).rows[0] as Session | undefined;
  const p = media(m);
  if (p) {
    if (m.reply_to_message) {
      await outbox(
        c,
        bot.workspace_id,
        String(m.chat.id),
        `replymedia:${u.update_id}`,
        {
          method: "sendMessage",
          chat_id: String(m.chat.id),
          text: "กรุณาส่งรูปเป็นข้อความใหม่โดยไม่ reply เพื่อป้องกันผูกกับชุดเก่าผิดชุด",
        },
      );
      return;
    }
    if (
      await c
        .query(
          "select 1 from session_files where bot_id=$1 and chat_id=$2 and message_id=$3",
          [bot.id, String(m.chat.id), String(m.message_id)],
        )
        .then((r) => r.rowCount)
    )
      return;
    const late = m.media_group_id
      ? await c.query(
          "select 1 from session_files f join upload_sessions s on s.id=f.session_id where f.bot_id=$1 and f.chat_id=$2 and f.media_group_id=$3 and s.snapshot is not null limit 1",
          [bot.id, String(m.chat.id), m.media_group_id],
        )
      : null;
    if (!s)
      s = (
        await c.query(
          "insert into upload_sessions(workspace_id,bot_id,actor_id,chat_id,thread_id,expires_at,root_message_id,is_group) values($1,$2,$3,$4,$5,now()+$6::int*interval '1 minute',$7,$8) returning *",
          [
            bot.workspace_id,
            bot.id,
            actorId,
            String(m.chat.id),
            String(m.message_thread_id || 0),
            process.env.SESSION_TTL_MINUTES
              ? limit("SESSION_TTL_MINUTES", 60)
              : limit("SESSION_TTL_HOURS", 24) * 60,
            String(m.message_id),
            m.chat.type !== "private",
          ],
        )
      ).rows[0];
    const active = s!;
    if (process.env.BOT_FLOW_MODE === "quick" && active.revision === 0) {
      const last = (
        await c.query(
          "select snapshot->'draft' as draft from upload_sessions where workspace_id=$1 and actor_id=$2 and snapshot is not null order by confirmed_at desc limit 1",
          [active.workspace_id, active.actor_id],
        )
      ).rows[0]?.draft;
      const folder = (
        await c.query(
          "select f.id,f.display_name from user_preferences p join user_folders f on f.id=p.last_user_folder_id and f.workspace_id=p.workspace_id where p.workspace_id=$1 and p.telegram_user_pk=$2 and f.status not in ('missing','blocked')",
          [active.workspace_id, active.actor_id],
        )
      ).rows[0];
      active.draft = quickDraft(last, folder);
      active.step = "review";
    }
    if (
      late?.rowCount &&
      (
        await c.query(
          "select 1 from session_files where session_id=$1 limit 1",
          [active.id],
        )
      ).rowCount
    ) {
      await outbox(
        c,
        bot.workspace_id,
        active.chat_id,
        "late-conflict:" + u.update_id,
        {
          method: "sendMessage",
          chat_id: active.chat_id,
          text: "มีรูปมาช้าจากอัลบั้มเดิม ขณะนี้มี draft อื่นเปิดอยู่ จึงยังไม่เพิ่มรูปนี้ กรุณาจบหรือยกเลิก draft ปัจจุบัน แล้วส่งรูปนี้เป็นชุดใหม่",
        },
        active.id,
      );
      return;
    }
    const count = +(
      await c.query("select count(*) from session_files where session_id=$1", [
        active.id,
      ])
    ).rows[0].count;
    if (count >= limit("MAX_FILES_PER_SESSION", 50))
      throw new Error("TOO_MANY_FILES");
    await c.query(
      "insert into session_files(workspace_id,session_id,bot_id,chat_id,message_id,media_group_id,telegram_file_id,unique_id,mime,size,original_filename) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        bot.workspace_id,
        active.id,
        bot.id,
        String(m.chat.id),
        String(m.message_id),
        m.media_group_id || null,
        p.file_id,
        p.unique_id,
        p.mime,
        p.size,
        m.document?.file_name || null,
      ],
    );
    active.revision++;
    active.state = "configuring";
    active.draft.closed = false;
    await save(c, active);
    if (late?.rowCount)
      await outbox(
        c,
        bot.workspace_id,
        active.chat_id,
        `late:${u.update_id}`,
        {
          method: "sendMessage",
          chat_id: active.chat_id,
          text: "พบรูปมาช้าจากอัลบั้มที่ยืนยันแล้ว จัดไว้ใน draft ใหม่ กรุณาเลือกข้อมูลและยืนยันอีกครั้ง",
        },
        active.id,
      );
    await render(c, active);
    return;
  }
  if (s && m.text) {
    const text = m.text.trim();
    if (s.is_group) {
      const prompt = m.reply_to_message
        ? (
            await c.query(
              "select * from input_prompts where bot_id=$1 and chat_id=$2 and message_id=$3 and expires_at>now()",
              [
                bot.id,
                String(m.chat.id),
                String(m.reply_to_message.message_id),
              ],
            )
          ).rows[0]
        : null;
      if (
        !prompt ||
        prompt.session_id !== s.id ||
        prompt.actor_id !== actorId ||
        prompt.revision !== s.revision ||
        String(prompt.thread_id) !== String(m.message_thread_id || 0)
      ) {
        await outbox(
          c,
          s.workspace_id,
          s.chat_id,
          `input-reply:${u.update_id}`,
          {
            method: "sendMessage",
            chat_id: s.chat_id,
            text: "กรุณาใช้ปุ่มของชุดรูปตนเอง หรือ Reply ข้อความขอข้อมูลล่าสุดของชุดนี้ เพื่อไม่ให้ข้อมูลปะปนกับผู้ใช้อื่น",
          },
          s.id,
        );
        return;
      }
    }
    if (text === "/cancel") {
      await save(c, mutateFlow(s, "cancel"));
      return;
    }
    if (s.step === "search_folder") {
      s.revision++;
      await save(c, s);
      await render(c, s, 0, clean(text, 80));
      return;
    }
    const action = (
      {
        new_folder: "name",
        enter_branch: "branch",
        detail: "detail",
        enter_date: "date",
      } as Record<string, string>
    )[s.step];
    if (action) {
      let n = mutateFlow(s, action, text);
      if (action === "name") {
        const match = (
          await c.query(
            "select * from user_folders where workspace_id=$1 and normalized_name=$2",
            [s.workspace_id, clean(text, 80).toLocaleLowerCase("th")],
          )
        ).rows[0];
        if (match)
          n = mutateFlow(s, "folder", `${match.id}|${match.display_name}`);
      }
      await save(c, n);
      await render(c, n);
      return;
    }
  }
  await outbox(c, bot.workspace_id, String(m.chat.id), `help:${u.update_id}`, {
    method: "sendMessage",
    chat_id: String(m.chat.id),
    text: "ส่งรูปหรือเอกสาร JPEG / PNG / WebP เพื่อเริ่มชุดงาน แล้วเลือกข้อมูลด้วยปุ่ม ก่อนยืนยันจะยังไม่สร้างสิ่งใดใน Drive",
  });
}
export async function preference(c: PoolClient, s: Session, folder: string) {
  await c.query(
    "insert into user_preferences(workspace_id,telegram_user_pk,last_user_folder_id) values($1,$2,$3) on conflict(workspace_id,telegram_user_pk) do update set last_user_folder_id=excluded.last_user_folder_id,selected_at=now()",
    [s.workspace_id, s.actor_id, folder],
  );
}

export async function operationKeyboard(
  c: PoolClient,
  s: Session,
  actions: ("retry" | "stop")[],
) {
  const buttons = [];
  for (const action of actions) {
    const raw = "v1:" + randomBytes(18).toString("base64url");
    await c.query(
      "insert into callback_tokens(token_hash,workspace_id,session_id,actor_id,chat_id,thread_id,action,expected_revision,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '24 hours')",
      [
        tokenHash(raw),
        s.workspace_id,
        s.id,
        s.actor_id,
        s.chat_id,
        s.thread_id,
        action,
        s.revision,
      ],
    );
    buttons.push({
      text: action === "retry" ? "ลองใหม่เฉพาะรูปที่เหลือ" : "หยุดงานที่เหลือ",
      callback_data: raw,
    });
  }
  return { inline_keyboard: [buttons] };
}
