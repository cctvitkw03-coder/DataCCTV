# งาน IT — Telegram → Google Drive Photo Manager

ต้นแบบสำหรับพัฒนาต่อและทดสอบ staging ตาม `docs/requirements-th.md` (สำเนาข้อกำหนด v2 ตรงกับต้นฉบับ)

**ยังไม่ใช่ระบบ production และยังไม่เคยทดสอบ Telegram / Google Drive / Supabase Cloud แบบ end-to-end จริง**

## เริ่มใช้งาน demo

ต้องมี Node.js 22 และ npm เปิด terminal ใน `D:\Drive\telegram-drive-photo-manager`:

```powershell
npm ci
# หากยังไม่มี .env.local ให้คัดลอก .env.example และคง APP_MODE=demo
npm run dev
```

เปิด http://localhost:3000 เลือก “ทดลอง Bot” เพื่อจำลองส่งรูป → เลือกชื่อ → ประเภท → CCTV/QUARK → สาขา → รายละเอียด → วันที่ → ส่งครบแล้ว → preview → ยืนยัน

Demo ใช้ fixture ใน browser เท่านั้น ข้อมูลแสดงป้าย DEMO ชัดเจน ปุ่ม retry/stop เปลี่ยนเฉพาะ state ของหน้า และ API เขียนข้อมูลภายนอกตอบ 503 ในโหมดนี้ การตั้ง `APP_MODE=live` เป็นการเปิดการเชื่อมต่อจริง ต้องทำตาม runbook ก่อน

## สิ่งที่มี

- Next.js 16 App Router, TypeScript, Tailwind 4, shadcn-style Button (Radix Slot/CVA) และ `components.json`
- Dashboard ภาษาไทย, filters, รายละเอียดรายไฟล์, retry/stop ตาม role, mobile navigation และ Bot simulator
- Supabase Auth SSR/PKCE, membership viewer/operator/admin, RLS และ composite workspace FK
- Telegram webhook แบบ durable inbox; worker ประมวลผล private chat, photo/document JPEG PNG WebP
- Opaque callback tokens/hash, actor/chat/revision/expiry validation, preview snapshot, date parsing พ.ศ.
- Postgres jobs, lease generation/fencing, bounded worker, retry/backoff, recovery endpoint และ notification outbox
- Google Drive OAuth / Shared Drive service account adapter, persisted pre-generated IDs, checksum/parent/appProperties reconciliation
- Migrations, tests ด้วย PostgreSQL engine ใน PGlite, crash tests ด้วย fake Drive, GitHub CI, env template และ runbook
- Group/topic/ForceReply มีโค้ดและ simulated tests แต่ปิดค่าเริ่มต้นจนผ่าน group UAT
- Google OAuth admin start/callback พร้อม PKCE, one-time state และ encrypted token storage; ยังไม่เชื่อมบัญชีจริง

เอกสาร v2 เป็นข้อกำหนดหลัก Roadmap ใน `docs/roadmap-th.md` ถูกปรับให้ตรง v2 แล้ว ไม่แทนที่ v2

## โครงสร้าง

| ตำแหน่ง | หน้าที่ |
|---|---|
| `src/app`, `src/components` | Dashboard, login, API routes และ UI |
| `src/lib/domain.ts` | State machine, snapshot, work date, naming |
| `src/server/bot.ts`, `telegram.ts` | เมนู, callbacks, รับรูป, client, signature checks |
| `src/server/worker.ts`, `retry.ts` | Inbox/job/outbox processing, lease และ retry |
| `src/server/drive.ts` | Drive adapter, ancestry validation, reconciliation |
| `src/server/auth.ts`, `sessions.ts` | Auth/role/workspace checks และ API service |
| `supabase/migrations` | ตาราง, indexes, RLS, immutable guards |
| `tests` | Unit, DB/RLS และ workflow/crash tests |
| `scripts` | Dry-run migration/webhook, read-only probes, secret scan |
| `docs` | ข้อกำหนด, architecture, runbook, acceptance evidence |

## ตรวจสอบ

```powershell
npm run typecheck
npm run lint
npm test
npm run build
node scripts/scan-secrets.mjs
```

Tests ไม่โหลด `.env.local` และไม่แตะบริการจริง ค่าที่จำเป็นใน tests เป็น fixture เท่านั้น CI ไม่ต้องมี secrets

## ขั้นถัดไป

อ่าน `docs/runbook.md` เพื่อเตรียม sandbox Bot/Drive/workspace และ scheduler ก่อนทดสอบจริง ดู `docs/acceptance-tests.md` เพื่อแยกสิ่งที่ทดสอบแล้วจากส่วนที่ยังไม่ได้ทำ ไม่ push, deploy, migrate หรือ setWebhook โดยอัตโนมัติ

ไม่มี Prisma ในโปรเจกต์นี้: ใช้ SQL migrations + `pg` transactions เพื่อควบคุม row locks/CAS/fencing โดยตรง ตัวอย่าง Prisma ในไฟล์ตั้งค่าของผู้ใช้เป็นข้อมูลอ้างอิง ไม่ใช่คำสั่งเปลี่ยนสถาปัตยกรรม
