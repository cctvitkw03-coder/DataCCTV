# Roadmap — DataCCTV: Telegram → Google Drive Photo Manager

ปรับปรุง: 29 กันยายน 2026 · ยึดเอกสารออกแบบระบบฉบับละเอียด v2 เป็นหลัก

## 1. ลำดับเอกสาร

**Source of truth:** `D:\Drive\telegram_drive_photo_manager_detailed_v2.md`

สำเนาสำหรับพัฒนา: `D:\Drive\telegram-drive-photo-manager\docs\requirements-th.md`

Roadmap เป็นแผนงานและบันทึกสถานะ ไม่ใช่ข้อกำหนดอีกชุดหนึ่ง หากข้อความใดขัดกัน ให้ยึด v2 ก่อน ห้ามเปลี่ยน v2 ตาม Roadmap การเปลี่ยนข้อกำหนดหลักต้องมาจากคำสั่งผู้ใช้ที่ชัดเจน

โปรเจกต์ที่ทำงานจริง: `D:\Drive\telegram-drive-photo-manager`

สถานะ: development/demo พร้อมโค้ด integrations บางส่วน ยังไม่ใช่ production และยังไม่ได้ทดสอบ end-to-end กับบริการจริง

## 2. เป้าหมายและกฎ R01–R12 ตาม v2

| รหัส | กฎที่ต้องรักษา |
|---|---|
| R01 | รับรูปก่อนถามปลายทาง |
| R02 | ผู้ใช้ใหม่เลือกชื่อเดิมหรือสร้างชื่อใหม่ได้ |
| R03 | จำ Telegram user ID, username และ user folder ล่าสุด |
| R04 | ความจำนี้เป็น preference ไม่ใช่ ACL หรือ ownership |
| R05 | ทุก session เลือกชื่ออื่นหรือสร้างชื่อใหม่ได้ ไม่เลือกค่าล่าสุดให้อัตโนมัติ |
| R06 | ทั้ง MOUSE_KEYBOARD และ UPS มี CCTV/QUARK |
| R07 | หนึ่ง confirmed session มี work folder ใหม่หนึ่ง canonical ID; retry ใช้ ID เดิม |
| R08 | session ใหม่ไม่เติม work folder เก่า แม้ชื่อ สาขา วันที่เหมือนกัน |
| R09 | work_date มาจากการเลือก/กรอกของผู้ใช้ ไม่ใช่เวลาส่งรูป |
| R10 | ใช้ Inline Keyboard เป็นหลัก พิมพ์เฉพาะข้อมูลที่ไม่มีตัวเลือก |
| R11 | มีวันนี้/เมื่อวาน/ระบุเอง ย้อนกลับ แก้ไข ยกเลิก ยืนยัน |
| R12 | แสดง path, ชื่อจริง, work date และจำนวนรูปก่อน Drive side effects |

Private chat เป็นจุดเริ่มต้น Group/topic เปิดเฉพาะกลุ่มที่ลงทะเบียนและผ่านการทดสอบรับข้อความ/แยกผู้ส่งแล้ว Google Drive เก็บรูปจริง Supabase เก็บ metadata, preference, state, jobs และ audit Dashboard ใช้ Supabase Auth กับ workspace membership

## 3. โครงสร้างและ naming ตาม v2 §3 และ §6

```text
งาน IT/
└── ชื่อบุคคล/
    ├── รายการสาขาซื้อ เมาส์ + คีย์บอร์ด/
    │   ├── CCTV/
    │   └── QUARK/
    └── เครื่องสำรองไฟ/
        ├── CCTV/
        └── QUARK/
            └── เครื่องสำรองไฟ สาขา RAM 24.9.69 [S-001236]/
                └── 20260924_RAM_UPS_QUARK_S001236_001.jpg
```

- Canonical Drive ID เป็น identity ทุกระดับ ชื่อใช้เพื่อแสดงผล
- ชื่อใหม่เป็น draft ก่อน confirm แล้วจึงสร้าง hierarchy ทั้งสองประเภท × สองระบบ
- Work folder มี suffix `[S-{session_no}]` ที่ DB จัดสรร ไม่ตัดเมื่อเกินหกหลัก
- Filename: `{YYYYMMDD_workdate}_{branch_slug}_{job_code}_{system_code}_S{session_no}_{sequence}.{ext}`
- ลำดับตรึงตอน confirm ตาม message ID; extension จาก MIME/signature ที่ตรวจแล้ว
- **ยกเลิกคำแนะนำเดิม** `YYYYMMDD_HHmmss_TelegramUserID_MessageID.ext` ไม่ใช้เวลาส่งแทนวันที่งาน
- รูปเนื้อหาเดียวกันคนละ message/session ยังคงเก็บ ไม่ dedupe จนรูปหาย

## 4. Telegram flow และ lifecycle ตาม v2 §4–§5

```text
ส่งรูป → เปิด draft ต่อ bot/chat/topic/actor → เลือก/สร้างชื่อ
→ ประเภทงาน → CCTV/QUARK → สาขา/รายละเอียด → work date
→ ส่งครบแล้ว → preview revision ล่าสุด → confirm transaction
→ durable job → provision/reconcile → upload → แจ้งจำนวนสำเร็จจริง
```

เลือกข้อมูลระหว่างส่งรูปได้ แต่ต้องกด “ส่งครบแล้ว” ก่อน preview/confirm รูปใหม่ก่อน confirm invalidate preview รูปหลัง confirm ไม่เพิ่มเข้า snapshot เดิม อัลบั้มมาช้าต้องแจ้งและเสนอชุดใหม่ ไม่อัปโหลดเอง

Group แยก session ตาม actor/topic Callback ตรวจเจ้าของ session ส่วนข้อความกรอกข้อมูลตอบ prompt ที่ผูก actor/chat/topic/revision และ Bot reply กลับรูปต้นทาง เพื่อไม่ให้ข้อมูลหลายคนปะปนกัน ไม่ใช่การจำกัดสิทธิ์ user folder

## 5. State machine, TTL และ callback ตาม v2 §9

Job states: `collecting`, `configuring`, `preview`, `queued`, `provisioning`, `uploading`, `retry_wait`, `partial`, `completed`, `failed`, `cancelled`, `expired`, `stopped`

แยก input_step เช่น choose_user_folder, choose_job, choose_system, choose_branch, choose_date, review ออกจากสถานะงาน ใช้ transition table ใน v2 เป็นกติกาจริง ไม่ใช้ชุด RECEIVED/WAITING_FOR_*/CREATING_FOLDER อีกชุด ชื่อย่อในโค้ด map ตามความหมายนี้

ค่าเริ่มต้นเสนอ: Draft TTL **24 ชั่วโมง**, preview/confirm token **30 นาที**, 50 รูป/session, app size limit 19 MB/file, retry สูงสุด 5 ครั้ง ค่านี้ปรับได้ภายหลังและไม่ใช่ platform limits คำแนะนำ 30–60 นาทีสำหรับ session ทั้งชุดจาก Roadmap เดิมถูกยกเลิก

Callback ใช้ opaque ASCII token เช่น `v1:<random>` ภายใน 64 bytes เก็บ hash/action/argument/session/actor/chat/topic/revision/expiry ที่ server ใช้ mutation token ครั้งเดียว ปุ่มวันที่เก็บ ISO ตามที่แสดง ไม่คำนวณ today ใหม่เมื่อกด

**ไม่ใช้** `user:select:SESSION_ID:FOLDER_ID` หรือ callback ที่ฝัง argument ยาวตามตัวอย่างเดิม

## 6. Schema และ security ตาม v2 §8, §13

ตารางหลัก:

`workspaces`, `workspace_members`, `bot_installations`, `allowed_chats`, `telegram_users`, `user_folders`, `user_preferences`, `job_types`, `system_types`, `branches`, `drive_nodes`, `upload_sessions`, `session_files`, `telegram_updates`, `callback_tokens`, `jobs`, `notification_outbox`, `audit_logs`

- Preference อยู่ user_preferences ไม่มี user-folder ACL
- ไม่แยก pending_photos/photos จน identity/snapshot ของไฟล์เปลี่ยนระหว่าง retry
- คง composite workspace FK, unique draft context, dedupe constraints, immutable snapshot/Drive ID และ RLS
- Browser อ่านตาม workspace/role; queues/inbox/callback/outbox ไม่มีสิทธิ์ตรง
- Credentials ไม่อยู่ใน public schema และไม่อยู่ client bundle/log/source
- ตารางเสริม mutation_keys/input_prompts/private OAuth storage รองรับ implementation แต่ไม่แทนโมเดลหลัก
- Schema แบบย่อเดิมใน Roadmap เป็นแนวคิดเก่า ห้ามใช้สร้าง migrations คู่ขนานอีกชุด

## 7. สถาปัตยกรรมและ routes

Next.js App Router + TypeScript + Tailwind/shadcn, Telegram Bot API, Google Drive API, Supabase Auth/Postgres, GitHub/Vercel ตาม v2

Webhook persist durable inbox ก่อนตอบ 2xx ไม่ดาวน์โหลด/อัปโหลดรูปใน webhook Worker ใช้ lease/fencing/checkpoint/retry run_after และ pre-generated Drive IDs ที่ commit ก่อน side effect ตรวจ parent/MIME/appProperties/checksum ก่อน mark uploaded Outbox แยกจากงานรูป ไม่อ้าง exactly-once ข้ามบริการ

API หลักตาม v2 §11: `/api/telegram/webhook`, `/api/internal/jobs/process`, `/api/cron/recover`, `/api/sessions`, `/api/sessions/[id]`, `/retry`, `/stop`, `/api/user-folders`, `/api/health`, `/api/admin/health`, `/auth/callback`

OAuth implementation ใช้ `/api/auth/google` และ `/api/auth/google/callback` ซึ่งเป็นการเลือก route สำหรับตัวอย่าง optional OAuth ใน v2 โดยคง admin authorization, state validation, PKCE และ secret protection ลงทะเบียน Redirect URI ให้ตรงโค้ดจริง

ไม่เพิ่ม browser upload route ที่ข้าม preview/confirm/jobs ไม่แยก Telegram callback endpoint ออกจาก webhook โดยไม่จำเป็น

## 8. สถานะจริง

### บริการที่ผู้ใช้แจ้งว่าจัดเตรียมแล้ว

GitHub DataCCTV, บัญชี Vercel ที่เชื่อม GitHub, Supabase project, Telegram Bot, Google Cloud project, Drive API enabled, OAuth External/Testing และ test user

ข้อมูลนี้เป็นสถานะที่ผู้ใช้แจ้ง ไม่ใช่ผล integration test OAuth Client/redirect URL ยังต้องยืนยันกับ deployment ที่ได้รับอนุญาต

### หลักฐานจากโค้ดและ local tests

| ส่วน | สถานะ |
|---|---|
| Next.js/TypeScript/Tailwind/UI | มี source; ต้องตรวจ typecheck/lint/build หลังแก้แต่ละรอบ |
| Dashboard และ Bot simulator ภาษาไทย | ใช้ demo ได้ ป้าย DEMO ชัดเจน ไม่อ้างผลจากบริการจริง |
| Migration 001 | schema/RLS/constraints/snapshot guards ผ่าน PGlite tests |
| Migration 002 | group prompts และ private OAuth state/credentials; ยังไม่ apply cloud |
| Bot private/group logic | มีเมนู/reply binding/topic isolation กลุ่มปิดค่าเริ่มต้นจนผ่าน UAT |
| Jobs/Drive | adapter/lease/retry/reconciliation และ fake Drive crash tests |
| OAuth | admin start/callback, PKCE, one-time state, encrypted refresh token; ยังไม่ consent จริง |
| Tests ล่าสุด | 44 tests ผ่าน รวม DB/RLS/workflow/crash/group isolation/OAuth security แบบจำลอง |
| GitHub push / Supabase migration จริง / Vercel deploy / webhook จริง | ยังไม่ได้ดำเนินการ |

PGlite เป็น PostgreSQL engine สำหรับทดสอบ แต่ไม่แทน Supabase Cloud/pooler/network/multi-process concurrency tests ห้ามประกาศ production-ready จาก mock

## 9. ลำดับพัฒนาตาม v2 §16

### Phase 0 — ยืนยัน integrations ใน sandbox

เลือก My Drive OAuth หรือ Shared Drive ให้ตรงบัญชี เตรียม sandbox root/Bot/workspace/admin เลือก scheduler/latency ที่ plan รองรับ ตรวจ scope/ownership/quota และทดสอบ create/upload/recovery ในพื้นที่ที่อนุญาต

Public URL ไม่จำเป็นต้องเริ่มจาก production URL ใช้ staging URL ที่คงที่และได้รับอนุญาตได้

### Phase 1 — Foundation/DB

ตรวจ typecheck/lint/tests/build/secret scan → review migrations/schema conflicts/backup → ตั้ง workspace/membership/allowed chats/master branches → review source ก่อน push ไม่ commit secrets

### Phase 2 — Bot/session

ทดสอบ photo-first/preference/ชื่ออื่น/ชื่อใหม่/4 คู่ประเภท×ระบบ/work date/back/edit/cancel/finish/preview/revision รวมอัลบั้มมาช้า รูปชน confirm และหลายผู้ส่ง/topic จริง เปิดกลุ่มหลัง privacy mode/permissions/ForceReply UAT เท่านั้น

### Phase 3 — Drive/queue

ทดสอบ hierarchy/stable IDs ใน auth mode จริง, crash หลัง create/upload ก่อน DB commit, stale lease, partial retry/stop, scheduler recovery/outbox failure พร้อมวัด latency/memory/runtime limits

### Phase 4 — Dashboard/security

วันที่งานแยกเวลารับ ผู้ส่งจริงแยกชื่อ folder รายไฟล์/audit/retry/stop ตาม role และ canonical link เติม pagination/admin management/thumbnail ตาม scope v2 ตรวจ Auth/RLS/API negative tests จริง

### Phase 5 — Staging/UAT

บันทึก T01–T30 ตาม v2 §17 รวม photo/document/private/group/2–4 คน/token revoked/moved or trashed folders/restore ตรวจ monitoring/backup/recovery/retention และข้อจำกัดที่ค้าง

### Phase 6 — Production gate

หลัง integrations/UAT ผ่านและได้รับอนุญาตต่อ environment จริง: backup → migration review → deploy → register webhook → worker → smoke test ที่ระบุ → pilot

**Roadmap ไม่ใช่การอนุญาตให้ deploy production, เปลี่ยน webhook จริง, ขยาย OAuth access หรือแก้ฐานข้อมูลจริงโดยอัตโนมัติ** ข้อจำกัดเดิมจากผู้ใช้ยังใช้

## 10. Environment

ยึด `.env.example` ในโปรเจกต์ให้ตรง v2 §15:

- Public: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- Server: DATABASE_URL, DIRECT_URL ตามจำเป็น, SUPABASE_SECRET_KEY
- Bot/workspace: APP_WORKSPACE_ID, TELEGRAM_BOT_ID/TOKEN, TELEGRAM_WEBHOOK_SECRET
- Worker: WORKER_AUTH_SECRET, CRON_SECRET
- Google: mode/root ID และ credentials เฉพาะ mode; OAuth UI ใช้ OAUTH_ENCRYPTION_KEY ฝั่ง server
- Limits: 24h draft TTL, 50 รูป, 19 MB, 5 retry ตามค่าเริ่มต้นเสนอ
- Group rollout: TELEGRAM_GROUPS_ENABLED=false และ allowlist รายกลุ่ม

Legacy anon/service_role keys ต้องระบุ mapping ชัดเจน ห้ามเผย service_role ใน browser ไม่มีค่าจริงอยู่ใน Roadmap

## 11. Definition of Done

ใช้ **รายการทั้งหมดใน v2 §18** ไม่ลดเหลือเพียง deploy ได้ หรือ Bot รับรูปได้: R01–R12 ครบ, snapshot/retry/ID invariants, durable inbox/jobs/outbox/recovery, Auth/RLS negative tests, runtime/auth mode จริง, staging/UAT, CI/env/migrations/runbook/monitoring/backup และหลักฐาน T01–T30

ยังไม่ติ๊ก production Done ดูหลักฐานและข้อจำกัดที่ `docs/acceptance-tests.md` และ `docs/runbook.md`

## 12. สรุปจุดที่แก้ให้ตรง v2

| Roadmap เดิม | ฉบับนี้ |
|---|---|
| Group เป็นจุดเริ่มบังคับ | Private-first; Group ลงทะเบียนและผ่าน UAT |
| TTL 30–60 นาที | 24 ชั่วโมง; preview token 30 นาที |
| Callback ฝัง IDs | Opaque token + hash/actor/context/revision/expiry |
| Schema pending_photos/photos | ตารางหลักและ preference ตาม v2 |
| WAITING_FOR_* เป็นสถานะงาน | แยก state กับ input_step |
| Filename timestamp/user/message | work_date/branch/job/system/session/sequence |
| ชื่องานไม่มี suffix | [S-session_no] ตาม v2 |
| Deploy production เพื่อขอ URL ก่อน | Sandbox/staging ก่อน; production มี tests/UAT/approval gate |
| Accounts พร้อมเท่ากับระบบพร้อม | แยกข้อมูลที่ผู้ใช้แจ้งจากผลเชื่อมต่อจริง |

เก็บ Roadmap ก่อนแก้ที่ `telegram-drive-photo-manager/docs/history/roadmap-before-v2-alignment.md` เพื่อประวัติเท่านั้น ห้ามใช้แทน v2


## สร้างฐานข้อมูลจริง — 29 กันยายน 2026

ผู้ใช้อนุญาตแล้ว และ apply migrations 001/002 สำเร็จ ตรวจผ่าน TLS verification: public 20 ตาราง + private 2 ตาราง เปิด RLS ทั้ง 22 ตาราง, SELECT policies 12 รายการ, ไม่มี INSERT/UPDATE/DELETE/TRUNCATE grants สำหรับ anon/authenticated, protect_snapshot/protect_file triggers ครบ และ system_types CCTV/QUARK ครบ

workspaces และ auth.users ยังมี 0 รายการ ขั้นต่อไปคือรับ Drive root และบัญชีผู้ดูแล เพื่อตั้ง workspace/membership, Google OAuth และ sandbox chat ยังคง APP_MODE=demo ไม่ได้เปลี่ยน webhook หรือ deploy และยังไม่ผ่าน UAT โดย V2 เป็นข้อกำหนดหลัก


## Google Drive พร้อมทดสอบ — 30 กันยายน 2026

บัญชีผู้ดูแลเชื่อม OAuth สำเร็จ โฟลเดอร์เดิมที่สร้างเองตอบ 404 ภายใต้ drive.file ผู้ใช้จึงอนุญาตให้แอปสร้าง DataCCTV-App-Test แทน สร้างและอ่าน metadata กลับสำเร็จ ตรวจ canAddChildren=true และ workspace appProperties ตรงกัน ตั้งค่า root ในฐานข้อมูลและ .env.local แล้ว โฟลเดอร์เดิมคงอยู่ ยังไม่ได้ทดสอบอัปโหลดรูปหรือเปิด Telegram webhook
