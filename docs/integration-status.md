# ผลตรวจการเชื่อมต่อและฐานข้อมูล — 29 กันยายน 2026

ผู้ใช้อนุญาตให้นำไฟล์ใน D:\Drive มาใช้ตั้งค่าแล้ว ข้อมูลเชื่อมต่อถูกเก็บเฉพาะ .env.local ซึ่ง Git ignore และยังคง APP_MODE=demo

| บริการ | ผลตรวจ |
|---|---|
| Telegram getMe | สำเร็จ — @MyDriveCCTV_bot |
| Telegram getWebhookInfo | ยังไม่มี webhook; pending updates 0 |
| การรับข้อความกลุ่ม | can_join_groups=true; can_read_all_group_messages=false ต้องตรวจ privacy mode/สิทธิ์ก่อน group UAT |
| Supabase Auth settings | HTTP 200 |
| PostgreSQL session pooler | เชื่อมต่อผ่าน TLS verification สำเร็จหลังตั้ง CA จาก prod-supabase.crt |

ตรวจแบบ read-only แล้ว: public/private ไม่มีตาราง และ auth.users มี 0 รายการ เพิ่ม DATABASE_SSL_CA ใน .env.local และรองรับใน pg adapter/management script โดยคง rejectUnauthorized=true



## สร้างฐานข้อมูลจริง — 29 กันยายน 2026

ผู้ใช้อนุญาตแล้ว และ apply migrations 001/002 สำเร็จ ตรวจผ่าน TLS verification: public 20 ตาราง + private 2 ตาราง เปิด RLS ทั้ง 22 ตาราง, SELECT policies 12 รายการ, ไม่มี INSERT/UPDATE/DELETE/TRUNCATE grants สำหรับ anon/authenticated, protect_snapshot/protect_file triggers ครบ และ system_types CCTV/QUARK ครบ

workspaces และ auth.users ยังมี 0 รายการ ขั้นต่อไปคือรับ Drive root และบัญชีผู้ดูแล เพื่อตั้ง workspace/membership, Google OAuth และ sandbox chat ยังคง APP_MODE=demo ไม่ได้เปลี่ยน webhook หรือ deploy และยังไม่ผ่าน UAT โดย V2 เป็นข้อกำหนดหลัก


## Google Drive พร้อมทดสอบ — 30 กันยายน 2026

บัญชีผู้ดูแลเชื่อม OAuth สำเร็จ โฟลเดอร์เดิมที่สร้างเองตอบ 404 ภายใต้ drive.file ผู้ใช้จึงอนุญาตให้แอปสร้าง DataCCTV-App-Test แทน สร้างและอ่าน metadata กลับสำเร็จ ตรวจ canAddChildren=true และ workspace appProperties ตรงกัน ตั้งค่า root ในฐานข้อมูลและ .env.local แล้ว โฟลเดอร์เดิมคงอยู่ ยังไม่ได้ทดสอบอัปโหลดรูปหรือเปิด Telegram webhook


## ตรวจความพร้อมก่อนเผยแพร่ — 30 กันยายน 2026

ผู้ใช้อนุญาต deploy และเปิด Telegram ออนไลน์แล้ว ตรวจ typecheck/lint/tests 44 รายการ/build ผ่าน, secret scan ผ่าน, production dependency audit พบ 0 vulnerabilities สร้าง secrets สำหรับ webhook/worker/cron เฉพาะ .env.local แล้ว ยังไม่เผยแพร่หรือเปลี่ยน webhook

ข้อจำกัดที่พบ: GitHub CLI ใช้ npmoney2569-cmd มี READ เท่านั้นที่ cctvitkw03-coder/DataCCTV; Vercel credential ใช้ไม่ได้ต้อง login ใหม่; ผู้ใช้แจ้งแผน Hobby ซึ่ง cron ได้วันละครั้งและจำกัด personal non-commercial จึงต้องตัดสินใจ hosting/scheduler ก่อนเปิดใช้ต่อเนื่อง


## ออนไลน์แล้ว — 30 กันยายน 2026

เผยแพร่ผ่าน GitHub cctvitkw03-coder/DataCCTV ไป Vercel cctv-it/datacctv; URL หลัก https://datacctv.vercel.app ใช้ APP_MODE=live และค่าลับอยู่ใน Vercel environment ฝั่ง server ผู้ใช้อนุญาตการส่งค่าลับโดยชัดเจน

ตรวจ health 200/live, recovery endpoint พร้อม bearer 200, worker ไม่มี secret 401, sessions ไม่ login 401; Telegram webhook ตรง URL หลัก pending=0 ไม่มี last_error; inbox 17 รายการ done Supabase pg_cron ตรวจงานค้างทุกนาทีและเรียกเฉพาะเมื่อมีงาน พร้อม retention รายวัน เก็บ URL/secret ใน Vault และ revoke private function จาก browser roles ทดลอง pg_net เรียก recovery ได้ HTTP 200

ยังต้องให้ผู้ใช้ทดสอบส่งรูปใหม่ผ่านระบบออนไลน์ครบขั้นตอน และเพิ่ม Google authorized redirect URI https://datacctv.vercel.app/api/auth/google/callback เพื่อรองรับการเชื่อม Google ใหม่ (credential เดิมในฐานข้อมูลยังใช้ได้) ยังไม่ถือว่าผ่าน UAT ทั้งหมดหรือรองรับโหลดจำนวนมาก


## เปิดทดสอบกลุ่ม — 30 กันยายน 2026
รับคำสั่งจากผู้ดูแลเดิมใน Data Group (-1004416334604) ตรวจ getMe can_read_all_group_messages=true ลงทะเบียน allowed_chats enabled/groups_enabled=true และตั้ง TELEGRAM_GROUPS_ENABLED=true บน Vercel Production ต้องทดสอบรูปและ ForceReply ในกลุ่มจริงต่อ
