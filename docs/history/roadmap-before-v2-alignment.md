# Roadmap — DataCCTV: Telegram → Google Drive Photo Manager

## 1. เป้าหมาย
สร้างระบบรับรูปจาก Telegram Group โดย Bot ใช้ Inline Keyboard ให้ผู้ใช้เลือกปลายทางและข้อมูลของงาน จากนั้นสร้าง Work Folder ใหม่ 1 โฟลเดอร์ต่อ 1 Upload Session อัปโหลดรูปทั้งหมดเข้า Google Drive และเก็บ Metadata/Session/Logs ใน Supabase

## 2. สถานะปัจจุบัน
- GitHub Repository `DataCCTV` — พร้อม
- Vercel — มีบัญชีและเชื่อม GitHub แล้ว รอ Source Code/Deploy
- Supabase — มี Project แล้ว รอ Schema/Migration
- Telegram Bot — สร้างแล้ว รอ Webhook
- Google Cloud Project `Telegram Drive Photo Manager` — พร้อม
- Google Drive API — Enabled
- Google Auth Platform — External / Testing
- Test User — เพิ่มแล้ว
- Google Drive Scope — `https://www.googleapis.com/auth/drive.file`
- OAuth Client — รอ Production URL จาก Vercel
- Google Drive — บัญชีใหม่ ยังไม่มีไฟล์งาน

## 3. Technology Stack
- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Telegram Bot API
- Google Drive API + OAuth 2.0
- Supabase Auth + PostgreSQL
- Vercel
- GitHub

Google Drive เป็นที่เก็บไฟล์รูปจริง ส่วน Supabase เก็บ Metadata, Session, Mapping, User Preference และ Logs

## 4. กฎหลัก
**1 Upload Session / 1 ชุดรูป = 1 Work Folder ใหม่เสมอ**

ตัวอย่าง:
```text
เครื่องสำรองไฟ สาขา ABC 28.9.69
├── รูป01.jpg
├── รูป02.jpg
└── รูป03.jpg
```

วันที่ในชื่อโฟลเดอร์คือ `work_date` ที่ผู้ใช้เลือก ไม่ใช่วันที่ส่ง Telegram โดยอัตโนมัติ

## 5. โครงสร้าง Google Drive
```text
งาน IT
├── นุ๊ก
│   ├── เครื่องสำรองไฟ
│   │   ├── CCTV
│   │   │   └── เครื่องสำรองไฟ สาขา ABC 28.9.69
│   │   └── QUARK
│   │       └── เครื่องสำรองไฟ สาขา XYZ 28.9.69
│   └── รายการสาขาซื้อ เมาส์ + คีย์บอร์ด
│       ├── CCTV
│       │   └── สาขา BCP - เมาส์ ค.กลางคืน ซื้อเมื่อ29.8.69
│       └── QUARK
│           └── สาขา SEE - คีย์บอร์ด คอม Q1 ซื้อเมื่อ29.8.69
└── ผู้ใช้อื่น
    └── โครงสร้างแบบเดียวกัน
```

Pattern:
```text
งาน IT → ชื่อผู้ใช้ → ประเภทงาน → CCTV/QUARK → Work Folder ใหม่+วันที่ → รูป
```

## 6. User Folder และการจดจำ
ไม่ล็อกสิทธิ์ว่า Telegram User ต้องใช้ Folder ของตัวเองเท่านั้น

ครั้งแรก:
```text
เลือกโฟลเดอร์ผู้ใช้
[ นุ๊ก ]
[ สมชาย ]
[ + สร้างใหม่ ]
```

Supabase จำ `Telegram User ID → Last User Folder ID`

ครั้งต่อไป:
```text
โฟลเดอร์ที่ใช้ล่าสุด: นุ๊ก
[ ใช้ "นุ๊ก" ]
[ เลือกชื่ออื่น ]
[ + สร้างใหม่ ]
```

ผู้ใช้เปลี่ยน Folder ได้ทุกครั้ง โดย Google Drive Folder ID เป็น Canonical Reference ไม่ใช้ชื่อ Folder เป็น ID หลัก

## 7. Telegram UX
ใช้ Inline Keyboard ประมาณ 80–90% และพิมพ์เฉพาะชื่อใหม่/สาขา/รายละเอียด/วันที่กำหนดเอง

```text
ส่งรูป
 ↓
Bot รับรูป/สร้าง Session
 ↓
เลือก User Folder
 ↓
เลือกประเภทงาน
 ↓
เลือก CCTV / QUARK
 ↓
กรอกสาขา/รายละเอียด
 ↓
เลือก Work Date: วันนี้ / เมื่อวาน / ระบุเอง
 ↓
Preview
 ↓
Confirm
 ↓
สร้าง Work Folder ใหม่
 ↓
Upload รูป
 ↓
บันทึก Supabase
 ↓
แจ้งสำเร็จ
```

ต้องมีปุ่ม `ย้อนกลับ`, `แก้ไข`, `ยกเลิก`, `ยืนยัน`

Bot ควร Reply กับข้อความ/Album ต้นทาง เพื่อไม่สับสนเมื่อมีผู้ใช้ 3–4 คนใน Group พร้อมกัน

## 8. Upload Session States
```text
RECEIVED
→ WAITING_FOR_USER_FOLDER
→ WAITING_FOR_JOB_TYPE
→ WAITING_FOR_SYSTEM_TYPE
→ WAITING_FOR_DETAILS
→ WAITING_FOR_WORK_DATE
→ WAITING_FOR_CONFIRMATION
→ CREATING_FOLDER
→ UPLOADING
→ COMPLETED
```

Error states: `FAILED`, `CANCELLED`, `EXPIRED`

Session timeout แนะนำ 30–60 นาที

## 9. Supabase Schema
### telegram_users
`id, telegram_user_id, telegram_username, display_name, last_user_folder_id, created_at, updated_at`

### drive_folders
`id, google_drive_folder_id, name, parent_folder_id, folder_type, path, created_at, updated_at`

### upload_sessions
`id, telegram_chat_id, telegram_user_id, telegram_message_id, media_group_id, status, selected_user_folder_id, job_type, system_type, branch, description, work_date, work_folder_name, google_drive_work_folder_id, photo_count, expires_at, created_at, completed_at`

### pending_photos
`id, session_id, telegram_file_id, telegram_message_id, file_name, mime_type, file_size, status, created_at`

### photos
`id, session_id, telegram_file_id, google_drive_file_id, google_drive_folder_id, file_name, mime_type, file_size, caption, upload_status, error_message, retry_count, uploaded_at, created_at`

### activity_logs
`id, telegram_user_id, action, entity_type, entity_id, details JSONB, created_at`

เพิ่ม Foreign Keys, Indexes และ RLS ตามความเหมาะสม

## 10. Project Structure
```text
DataCCTV/
├── app/
│   ├── dashboard/
│   ├── photos/
│   ├── folders/
│   ├── pending/
│   ├── users/
│   ├── logs/
│   ├── settings/
│   └── api/
│       ├── telegram/webhook/route.ts
│       ├── telegram/callback/route.ts
│       ├── auth/google/route.ts
│       ├── auth/google/callback/route.ts
│       ├── drive/folders/route.ts
│       ├── drive/upload/route.ts
│       └── health/route.ts
├── components/
├── lib/
│   ├── telegram/
│   ├── google-drive/
│   ├── supabase/
│   ├── upload/
│   ├── auth/
│   └── utils/
├── supabase/migrations/
├── types/
├── public/
├── .env.example
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

## 11. Callback Data
ตัวอย่าง:
```text
user:last:SESSION_ID
user:select:SESSION_ID:FOLDER_ID
user:new:SESSION_ID
job:ups:SESSION_ID
job:mouse_keyboard:SESSION_ID
system:cctv:SESSION_ID
system:quark:SESSION_ID
date:today:SESSION_ID
date:yesterday:SESSION_ID
date:custom:SESSION_ID
confirm:SESSION_ID
edit:SESSION_ID
back:SESSION_ID
cancel:SESSION_ID
```

ตรวจ Session ownership เพื่อป้องกันผู้ใช้อื่นกดปุ่มของ Session นั้น แต่ไม่ใช้เป็น Permission Lock ของ User Folder

## 12. Roadmap การพัฒนา

### Phase 1 — Foundation
- สร้าง Next.js + TypeScript
- Tailwind + shadcn/ui
- `.env.example`
- Health API
- ESLint/TypeScript
- Build ให้ผ่าน
- Push GitHub `DataCCTV`

### Phase 2 — Supabase
- สร้าง Migration/Tables
- Foreign Keys/Indexes
- RLS
- Queries/Types
- Session/User Folder Mapping

### Phase 3 — Deploy Skeleton
- Import `DataCCTV` เข้า Vercel
- Vercel ตรวจพบ Next.js
- Deploy
- รับ Production URL จริง

### Phase 4 — Google OAuth Client
เมื่อได้ Production URL:
- Google Auth Platform → Clients → Create Client
- Application type: Web application
- Authorized origin = Production Domain
- Redirect URI = route ที่ Source Code ใช้จริง เช่น `/api/auth/google/callback`
- เก็บ Client ID/Secret เป็น Environment Variables
- ห้าม Commit Secret

### Phase 5 — Google Drive Integration
- OAuth offline access / Refresh Token
- Drive API Client
- ตรวจ/สร้าง `งาน IT`
- สร้าง User Folder
- สร้าง Job Folder
- สร้าง CCTV/QUARK
- สร้าง Work Folder
- Upload รูป
- เก็บ File ID/Folder ID

### Phase 6 — Telegram Webhook
- `POST /api/telegram/webhook`
- รับ photo/media group/callback
- ตรวจ `TELEGRAM_WEBHOOK_SECRET`
- Idempotency ด้วย Telegram Update ID
- Reply ต่อ Message/Album ต้นทาง

### Phase 7 — Upload Sessions
- รวมรูป Album เป็น Session เดียว
- เก็บ Telegram file_id
- รองรับหลาย User พร้อมกัน
- Session timeout
- Cancel/Expire

### Phase 8 — Inline Keyboard Workflow
- Last Folder
- เลือก/สร้าง User Folder
- เลือกประเภทงาน
- CCTV/QUARK
- Work Date
- Back/Edit/Cancel
- Preview/Confirm

### Phase 9 — Upload Processor
หลัง Confirm:
1. Validate
2. Resolve Folder IDs
3. Generate Work Folder Name
4. สร้าง Work Folder ใหม่
5. Download รูปจาก Telegram
6. Upload Google Drive
7. Save Metadata
8. `COMPLETED`
9. Bot แจ้งผล

ต้องรองรับ Retry และ Idempotency เพื่อไม่สร้าง Folder/Upload ซ้ำเมื่อมี Error

### Phase 10 — Dashboard
หน้า:
- Dashboard
- Pending
- Completed/Photos
- Failed/Retry
- Folders
- Users
- Logs
- Settings

### Phase 11 — Security & Reliability
- Secrets server-side
- Supabase Service Role ห้ามอยู่ browser
- RLS
- Telegram Webhook Secret
- Callback Session ownership
- Input validation
- MIME validation
- Folder name sanitization
- Retry count/error log
- Duplicate Telegram update handling
- Audit logs

### Phase 12 — End-to-End Testing & Production
ทดสอบ:
- รูปเดียว
- Album หลายรูป
- 2–4 Users พร้อมกัน
- User Folder เดิม/ใหม่
- CCTV/QUARK
- Work Date
- Back/Cancel/Edit
- Confirm ซ้ำ
- Session expired
- Drive API error
- Retry
- Production Webhook

## 13. Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_ROOT_FOLDER_ID=

APP_URL=
```

ห้าม Commit `.env` หรือ Secrets ลง GitHub

## 14. File Naming
แนะนำ:
```text
YYYYMMDD_HHmmss_TelegramUserID_MessageID.ext
```

ตัวอย่าง:
```text
20260929_143501_123456789_98765.jpg
```

## 15. Definition of Done — MVP
- [ ] Bot รับรูปจาก Telegram Group
- [ ] รองรับ Album
- [ ] Inline Keyboard ทำงาน
- [ ] เลือก/สร้าง User Folder
- [ ] จำ Last User Folder
- [ ] เปลี่ยน User Folder ได้
- [ ] เลือกประเภทงาน
- [ ] CCTV/QUARK
- [ ] ระบุสาขา/รายละเอียด
- [ ] เลือก Work Date
- [ ] Preview/Confirm
- [ ] 1 Session = 1 Work Folder ใหม่
- [ ] Upload รูปทั้งหมดถูก Folder
- [ ] Supabase Metadata/Logs
- [ ] Error/Retry
- [ ] Dashboard
- [ ] Vercel Production
- [ ] Telegram Production Webhook

## 16. ลำดับที่ต้องทำต่อจากวันนี้
```text
สถานะปัจจุบัน
 ↓
1. AI สร้าง Next.js ใน GitHub DataCCTV
 ↓
2. AI สร้าง Supabase Migration
 ↓
3. Build/Test
 ↓
4. Deploy Skeleton ไป Vercel
 ↓
5. ได้ Production URL
 ↓
6. กลับ Google Cloud สร้าง OAuth Client
 ↓
7. ตั้ง Redirect URI
 ↓
8. เชื่อม Google OAuth + Drive API
 ↓
9. สร้าง Drive Folder Engine
 ↓
10. Telegram Webhook
 ↓
11. Upload Session + Inline Buttons
 ↓
12. Upload Processor
 ↓
13. Dashboard
 ↓
14. Security + Retry + Logs
 ↓
15. End-to-End Test
 ↓
16. Production
```

## 17. สิ่งที่ผู้ใช้ทำ vs AI ทำ
### ผู้ใช้
- จัดเตรียม Accounts/Projects
- อนุมัติ Google OAuth
- ใส่ Secrets ลง Vercel
- ทดสอบ Telegram/Google Drive จริง

### AI
- Source Code
- Next.js
- Supabase SQL/Migrations
- Telegram Bot Logic
- Inline Keyboard
- Google Drive Integration
- Dashboard
- API Routes
- Validation
- Retry/Error Handling
- Logging
- Tests
- README/Deployment Instructions

## 18. Future Enhancements
- OCR
- AI จัดหมวดรูป
- AI แนะนำชื่อ Work Folder
- Search ตามสาขา/วันที่
- Tags
- Dashboard Statistics
- Export CSV/Excel
- Duplicate Image Detection
- Thumbnail/Preview
- Backup/Retention
- แจ้งเตือนงานค้าง

---
**หัวใจของระบบ:** `Telegram Photo Session → User Folder → ประเภทงาน → CCTV/QUARK → รายละเอียด + Work Date → Preview → Work Folder ใหม่ → Upload → Google Drive + Supabase`

**กฎสำคัญ:** `1 Upload Session = 1 Work Folder ใหม่` และ Bot จำ Folder ล่าสุดเพื่อความสะดวก แต่ไม่ล็อกสิทธิ์การเลือก Folder
