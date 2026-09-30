# Runbook ภาษาไทย

## สถานะปัจจุบัน

รันในเครื่องที่ `D:\Drive\telegram-drive-photo-manager` โหมด demo ค่าจากไฟล์ที่ผู้ใช้ให้เก็บใน `.env.local` เมื่อได้รับอนุญาตแล้ว ไฟล์นี้ถูก ignore จาก Git ไม่ถูกคัดลอกไปเอกสารหรือ ZIP source ไม่ได้ migrate ฐานข้อมูลจริง, push GitHub, deploy หรือ setWebhook

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` รองรับ legacy anon JWT ที่ผู้ใช้ให้ และ `SUPABASE_SECRET_KEY` ใช้ชื่อ generic เพื่อเก็บ legacy service_role JWT ฝั่ง server เท่านั้น โค้ดปัจจุบันทำธุรกรรมผ่าน DATABASE_URL จึงยังไม่ต้องใช้ service_role key ใน API service ไม่สร้าง public key ใหม่หรือเปลี่ยนสิทธิ์อัตโนมัติ

## เตรียม sandbox integration

1. ยืนยันว่า Supabase project ที่จะ migrate เป็นพื้นที่ทดสอบและไม่มีตารางชื่อชน ตรวจด้วย `node scripts/manage.mjs db-check` (read-only แต่จะเชื่อมบริการจริง)
2. สำรอง DB และ review migrations `001_initial.sql` และ `002_groups_oauth.sql` ก่อนรัน `node scripts/manage.mjs migrate --apply` กับ sandbox ใหม่ สคริปต์ไม่มี --apply จะเป็น dry-run และไม่เปิด connection หากเคย apply 001 แล้ว ต้อง review/apply เฉพาะ 002 ผ่านขั้นตอน migration ที่ควบคุม ไม่รัน 001 ซ้ำ
3. สร้าง workspace ระบุ sandbox root ID สร้าง bot_installations ที่ตรง numeric Bot ID และ allowed_chats ของ private chat ที่จะทดสอบ ห้ามเปิด allowlist ทุกคน
4. เชิญผู้ดูแลผ่าน Supabase Auth แล้วเพิ่ม workspace_members ของ auth user ID ที่ถูกต้อง เลือก role admin/operator/viewer ปิด public signup ตามนโยบายองค์กร เซ็ต Site URL/redirect URL ให้ตรง environment
5. ใช้ `supabase/seed.sql` หลังตรวจ placeholders เป็นแม่แบบ seed ประเภทงาน CCTV/QUARK มีใน migration อยู่แล้ว เพิ่ม branches ที่ต้องการ ไม่มีการ import ชื่อบุคคลเก่าอัตโนมัติ
6. เติม APP_WORKSPACE_ID, TELEGRAM_BOT_ID/TOKEN, WEBHOOK_SECRET, WORKER_AUTH_SECRET, CRON_SECRET (สุ่มอย่างน้อย 24 ตัวอักษร) และ GOOGLE_DRIVE_ROOT_FOLDER_ID
7. Google My Drive: ใช้ OAuth client/secret + offline refresh token ของบัญชีเจ้าของพื้นที่ Shared Drive: service account email/private key + shared drive ID และสิทธิ์ที่เหมาะสม เลือก mode เดียว อย่าแชร์ My Drive ให้ service account แล้วถือว่า ownership/quota พร้อม
8. Scope เริ่ม drive.file ทดสอบ root เดิมว่าเข้าถึงได้จริง หากต้อง broaden scope ให้บันทึกเหตุผลและทำ consent ใหม่อย่างชัดเจน หน้า Settings มีปุ่มเชื่อม OAuth สำหรับ admin แล้ว: ตั้ง Client ID/Secret และ OAUTH_ENCRYPTION_KEY (random 32 bytes แบบ base64) ลงทะเบียน redirect URI `https://โดเมนที่อนุญาต/api/auth/google/callback` ให้ตรงจริง ต้องมี migration 002 ก่อนเชื่อม Token เก็บเข้ารหัสใน private schema ห้ามเปิด schema นี้ผ่าน Data API และห้ามเปลี่ยน encryption key โดยไม่มีแผนถอด/เข้ารหัสใหม่หรือ reconnect
9. Read-only root probe: `node --conditions=react-server --import tsx scripts/verify-drive-root.ts` ไม่สร้างไฟล์ probe ยังไม่แทน create/upload staging test
10. ตั้ง APP_MODE=live เฉพาะ sandbox deployment ที่ตรวจ config แล้ว ใช้ HTTPS URL; ไม่มี auto-deploy ใน repo

## Worker / scheduler

ไม่มี cron อัตโนมัติใน vercel.json เพื่อไม่ผูกค่าแผนบริการที่ยังไม่ได้ยืนยัน ต้องเลือกอย่างใดอย่างหนึ่ง:

- Scheduler ที่เรียก POST `/api/internal/jobs/process` พร้อม `Authorization: Bearer WORKER_AUTH_SECRET` ถี่พอสำหรับ latency ที่ยอมรับได้
- Vercel Cron หรือ scheduler ที่เรียก GET `/api/cron/recover` พร้อม `Authorization: Bearer CRON_SECRET` ตาม plan ที่มีจริง; GET นี้เรียก worker ด้วยและ expire drafts/ล้าง inbox ที่ processed เกิน 7 วัน

เริ่มจากทุก 1 นาทีใน staging **เฉพาะเมื่อ plan รองรับ** ปริมาณพื้นฐานต่อ invocation: inbox 3 updates + job 1 รูป + outbox 1 ข้อความ ถ้ารูป/เมนูค้างต้องเพิ่มความถี่หรือ worker throughput อย่างวัดผล ไม่ควรเปิดใช้งานจริงก่อนวัด latency ทั้ง flow มีหลายเมนู

Worker route ตั้ง maxDuration=300 พร้อม checkpoint ประมาณ 200 วินาที ต้องตรวจ hosting limit จริง ไม่ใช้ `waitUntil` เป็น durable queue อย่าส่ง WORKER_AUTH_SECRET ไป browser

## Telegram webhook

ทดสอบ HTTPS/staging ที่พร้อมรับ inbox แล้วเท่านั้น `node scripts/manage.mjs webhook` เป็น dry-run ไม่เรียก Telegram การใช้ `--apply` จะเปลี่ยน webhook ของ Bot จริง ต้องได้รับอนุญาตต่อ Bot/environment นั้นก่อน

ไม่ drop_pending_updates และรับเฉพาะ message/edited_message/callback_query ไม่ลงทะเบียนจาก preview deployment ทับ production ต้องตรวจ getWebhookInfo และ queue lag หลังลงทะเบียน

## GitHub / Vercel

ปลายทางที่ผู้ใช้ให้คือ `https://github.com/cctvitkw03-coder/DataCCTV.git` ยังไม่ได้ push หรือแก้ remote repo ห้าม commit `.env.local` หรือไฟล์ `github.supabase.txt` ทำ `node scripts/scan-secrets.mjs` และตรวจ git status/diff ก่อน push

ตั้ง Vercel project root ที่ root ของโปรเจกต์ ใช้ Node 22 / npm ci / npm run build แยก credentials, Bot, root และ workspace สำหรับ staging/production CI รันโดยไม่ใช้ secrets และไม่ deploy

## Incident handling

| อาการ | ตรวจและดำเนินการ |
|---|---|
| Inbox ค้าง | ตรวจ scheduler/auth → queued/dead inbox → handler error code; retry เฉพาะหลังแก้สาเหตุ |
| Job running ค้าง | รอ lease หมดอายุแล้ว claim ใหม่ ห้ามเปลี่ยน Drive IDs; ใช้ generation ป้องกัน worker เก่า |
| OAuth revoked / permissions | หยุด scheduler ของ workspace ชั่วคราว เชื่อมบัญชีเดิมใหม่ ตรวจ root แล้ว retry งานเดิม |
| รูปสำเร็จบางส่วน | ตรวจ canonical folder และข้อผิดพลาดรายไฟล์ จากนั้น operator/admin หรือเจ้าของ session กด retry ไม่สร้าง session ทดแทนเพื่อแก้ duplicate |
| Drive ID หาไม่พบ/ย้าย | ตรวจ trash/permissions/ancestry ด้วย admin; ไม่เลือกโฟลเดอร์จากชื่อ ไม่ลบหรือสร้างใบใหม่โดยเดา |
| Outbox dead | งานรูปไม่ต้อง retry ตรวจ Telegram error แล้ว reset เฉพาะ outbox row ที่ตรวจแล้ว มีความเสี่ยงข้อความซ้ำหลัง timeout |
| Stop | worker หยุดก่อน side effect ถัดไป รูปที่กำลัง in-flight อาจเสร็จก่อนหยุด จำนวนสุดท้ายมาจาก DB; ไม่ลบไฟล์เดิม |
| DB restore | หยุด workers → restore backup → reconcile persisted IDs/properties/checksum กับ Drive → เปิด worker เดิม ห้าม reset IDs |

Health public บอกเพียง ok/mode Admin health แสดงจำนวน jobs; ยังไม่ใช่ monitoring/alerting ครบระบบ ควรเพิ่ม metrics queue age, dead inbox/outbox, expired leases และ integration errors ก่อน production ไม่มี external alerting ที่ตั้งค่าแล้ว

## ข้อจำกัดที่ต้องปิดก่อน production

- ยังไม่มี E2E กับ Bot/Drive/Supabase Cloud, real concurrent multi-process tests, OAuth revoke/quota/restore UAT
- Group/topic/ForceReply มีโค้ดและ simulated tests แล้ว แต่ยังปิดค่าเริ่มต้น เปิดเฉพาะ sandbox ที่ลงทะเบียนด้วย TELEGRAM_GROUPS_ENABLED=true และ allowed_chats.groups_enabled=true ต้องทดสอบ privacy mode, Bot permissions, reply routing และผู้ใช้ 2–4 คนจริงก่อน production
- Dashboard โหลดล่าสุด 200 ชุดและกรองฝั่ง client ยังไม่มี server pagination / export
- Gallery แสดง metadata และลิงก์ folder จริงเมื่อพร้อม ไม่ proxy thumbnail ของรูป private
- Admin จัดการสมาชิก/master/mapping/settings ผ่านขั้นตอน DB ที่ตรวจแล้ว; ยังไม่มี UI CRUD หรือ reconcile endpoint
- Upload แบบ bounded in-memory multipart ไม่ใช่ resumable; ใช้ default 19 MB และ 50 รูป ยังไม่ได้ performance test กับ hosting plan
- เมนูส่งเป็นข้อความใหม่ มีการ supersede เมนูเก่าที่ยังไม่ส่ง แต่ยังไม่มี edit-message optimization; ควรวัด outbox latency และ message volume
- แก้ข้อมูลจาก preview ใช้ back/edit ตามลำดับ ยังไม่มีเมนูเลือก field แบบครบทุกช่อง
- Audit ครอบ confirm และ retry/stop; ยังไม่มี audit ทุก admin operation/retention dashboard
- Draft TTL และ raw inbox cleanup มีแล้ว แต่ audit retention 180 วัน/expired draft cleanup ต้องกำหนดและ implement ต่อโดยไม่ลบรูป Drive
- ไม่มี auto-provision GitHub, Supabase, OAuth consent หรือ deployment จริง

## ลำดับเอกสาร

เอกสาร v2 เป็น source of truth; Roadmap ใช้ติดตามงานและสถานะเท่านั้น ค่าเริ่มต้น draft TTL ยังคง 24 ชั่วโมง (preview token 30 นาที) กลุ่มเป็น rollout หลัง UAT ไม่เปลี่ยนเป็น Group-first ตาม Roadmap เก่า ตรวจ `docs/roadmap-th.md` ฉบับปรับให้ตรง v2


## Online recovery on Hobby
Production origin: https://datacctv.vercel.app. Telegram webhook invokes runWorker through Next after; Supabase cron checks due work each minute and invokes authenticated recovery only when necessary. Daily retention runs at 02:17 UTC. Configure with node scripts/configure-recovery.mjs https://datacctv.vercel.app --apply. Secrets live in Vault, not cron SQL. Inspect cron.job / cron.job_run_details and net._http_response without exposing request headers. Disable only this app's timers with cron.unschedule('datacctv-recovery') and cron.unschedule('datacctv-retention'). No Vercel cron is required. Google callback allowlist must include the production origin before reconnecting OAuth.
