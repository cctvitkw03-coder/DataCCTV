# Architecture and implementation decisions

## Durable boundary

Webhook ตรวจ secret/body/shape → INSERT `(bot_id, update_id)` → commit → 200 การตอบ callback query เป็น best effort หลัง persist แล้ว ไม่ใช่ trigger ที่รับประกันการทำงาน คิวต้องถูกเรียกโดย scheduler/queue ภายนอก

Worker แต่ละ invocation ประมวลผล inbox สูงสุด 3 rows, job หนึ่งรายการ (provision hierarchy และอัปโหลดสูงสุด 1 รูป), outbox หนึ่ง row ทุกอย่างมี checkpoint ใน Postgres ไม่มี state ธุรกิจค้างเฉพาะใน memory

`DATABASE_URL` ใช้ Supabase transaction pooler; แต่ละ transaction ยืม connection เดียวและ BEGIN/COMMIT ไม่ใช้ session advisory lock หรือ prepared statement แบบมีชื่อ ใช้ `pg_advisory_xact_lock` ต่อ chat/actor และ row locks ต่อ session เพื่อ serialize การเพิ่มรูปกับ confirm

Inbox และ outbox ใช้ transaction + `FOR UPDATE SKIP LOCKED` โดยไม่ต้องมี lease row แยก: ถ้า process หาย PostgreSQL rollback แล้ว row กลับมา claim ได้ Jobs ซึ่งมี Drive I/O ใช้ lease 90 วินาที ต่ออายุก่อน side effect พร้อม owner/generation check ก่อน DB writes การ timeout หลัง Drive เขียนแล้วกู้ด้วย persisted resource ID

Worker ยอมคืนงานเข้าคิวเมื่อใช้งบประมาณประมาณ 200 วินาที; route กำหนด maxDuration 300 วินาที ต้องตรวจ plan/runtime จริงก่อนเปิดใช้ ต้องเผื่อเวลาของ Google auth และ network requests; นี่ไม่ใช่ข้อพิสูจน์ว่า runtime limit ของทุก plan รองรับ

## Identity and authorization

- Telegram numeric IDs อยู่ใน bigint และอ่านจาก pg เป็น string, ไม่ใช้ username เป็น identity
- User folder ไม่มี owner/ACL ของ Telegram; preference ใช้ล่าสุดเท่านั้น
- Draft แยกด้วย bot/chat/thread/actor; private chat เป็นค่าเริ่มต้น Group มี source reply และ ForceReply prompt binding ตาม actor/chat/topic/revision แต่ต้องเปิดด้วย env flag และ allowlist รายกลุ่มหลัง group UAT
- Browser ยืนยันตัวตนผ่าน Supabase `getUser()` และอ่าน role จาก DB; mutation ตรวจ Origin และ Idempotency-Key
- `pg` ใช้ server DB credential ที่มีสิทธิ์สูง ทุก service route จึงตรวจ membership/workspace เอง; RLS ป้องกัน Data API เพิ่มอีกชั้น
- RLS helper fix search_path และจำกัด execute; queues/callbacks/inbox/outbox ไม่มี browser grants
- API ไม่คืน raw provider error หรือ token; modules สำหรับ integrations ใช้ `server-only`

## Confirmation

Draft JSON ทำหน้าที่ input model; confirmed snapshot เก็บชื่อ path วันที่ IDs ของรูป ชื่อปลายทาง และลำดับที่ตรึงแล้ว ตรึงใน transaction เดียวกับ job/outbox และเปลี่ยน revision ไม่แก้ draft หลัง snapshot มีค่า (DB trigger)

กดวันที่ใช้ ISO ที่ถูกบันทึกใน opaque callback token ตั้งแต่สร้างปุ่ม ไม่คำนวณ “วันนี้” ใหม่ขณะกด ปีสองหลักเป็น 25xx พ.ศ. และแสดงปีเต็มใน preview

รูปใหม่ก่อนยืนยัน invalidate preview และเปิดให้ปิดชุดอีกครั้ง รูปอัลบั้มเดิมที่มาช้าหลัง confirm เปิด draft ใหม่พร้อมข้อความเตือน ถ้ามี draft อื่นเปิดอยู่จะไม่ผสมรูปให้เองและขอให้ผู้ใช้ส่งรูปนั้นใหม่หลังจัดการ draft ปัจจุบัน

Edited media: MVP ยกเลิก draft ที่มีข้อความนั้นและขอส่งใหม่ แทนเปลี่ยน file row เงียบ ๆ หลัง confirm snapshot เดิมไม่เปลี่ยน

## Drive consistency

1. Reserve ID จาก `files.generateIds`
2. Commit ID ลง DB ก่อน create
3. Validate parent เป็น folder ที่เขียนได้และ ancestry อยู่ใต้ configured root
4. Get/create ด้วย ID เดิมและ appProperties ที่กำหนด
5. Verify MIME/parent/properties และ size + MD5 สำหรับ binary ก่อน mark uploaded

Shared nodes ใช้ unique `(workspace_id,node_key)`: concurrent workers อาจจอง ID ที่ไม่ได้ใช้ แต่ทั้งหมดอ่าน canonical ID เดียวหลัง upsert ไม่ค้นชื่อแล้วเลือกตัวแรก Work folder ID unique ต่อ session และเปลี่ยนไม่ได้ file ID ก็เปลี่ยนไม่ได้

MVP ดาวน์โหลดทีละไฟล์โดยอ่าน stream พร้อมนับ bytes แล้วเก็บ buffer ไม่เกิน MAX_FILE_BYTES (default 19 MB) ใช้ multipart upload จึงมี memory overhead ของ buffer เพิ่มอีกหนึ่งชุด ไม่รองรับ resumable upload; ต้องทดสอบ memory/time จริงก่อนเพิ่มขนาดไฟล์

Retry 429/5xx/network ใช้ run_after + exponential backoff/jitter และ provider hint ไม่ sleep ค้าง Function Non-retryable permissions/missing/mismatch หยุดให้ตรวจสอบ ไม่สร้าง ID ใหม่เพื่อกลบข้อผิดพลาด

Outbox แยกจาก upload; sendMessage อาจซ้ำได้เมื่อ provider รับข้อความแล้ว connection หาย ไม่มีการอ้าง exactly-once ข้าม Postgres/Drive/Telegram

## Demo isolation

Demo page ใช้ fixtures และ domain functions เดียวกัน แต่ไม่มี DB/Drive calls API integrations ปฏิเสธเมื่อ APP_MODE ไม่ใช่ live ทุกหน้าแสดง DEMO ปุ่ม Drive ไม่สร้างลิงก์ปลอม

## OAuth และ Group additions

Migration 002 เพิ่ม input_prompts และ private OAuth tables OAuth start เป็น POST ที่ตรวจ admin/Origin, callback ตรวจ cookie state + DB state ที่ผูก user/workspace/expiry และใช้ PKCE Token exchange อยู่ server และเก็บ refresh token ด้วย AES-256-GCM พร้อม workspace AAD ไม่เก็บ plaintext ใน public schema

Outbox บันทึก message ID ของ ForceReply ที่ส่งแล้วเพื่อผูก text input กับ session ของผู้ส่ง ถ้า timeout หลังส่งก่อน DB commit อาจเกิดข้อความซ้ำ แต่ prompt ที่ไม่มี mapping จะไม่ถูกนำไปแก้ session อื่น เมนูเก่าที่ยังไม่ส่งถูก supersede ก่อนสร้าง revision ใหม่

v2 ยังเป็น source of truth ชื่อ routes/ตารางเสริมเป็นรายละเอียด implementation ไม่เปลี่ยน R01–R12, TTL default 24h หรือ filename policy

## เอกสารผู้ให้บริการที่ตรวจประกอบ

- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://developers.google.com/workspace/drive/api/guides/manage-uploads

API และข้อจำกัด deployment ต้องตรวจอีกครั้งก่อน staging/production
