"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function GoogleConnect({
  isDemo,
  admin,
}: {
  isDemo: boolean;
  admin: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card mt-5 p-6">
      <h2 className="text-lg font-semibold">เชื่อมบัญชี Google Drive</h2>
      <p className="text-sm text-slate-500">
        ผู้ดูแลเชื่อมบัญชีเจ้าของพื้นที่ผ่าน Google OAuth สิทธิ์ drive.file
        และเก็บ refresh token แบบเข้ารหัสฝั่ง server
      </p>
      <p className="mb-4 rounded-lg bg-slate-50 p-3 text-xs break-all">
        Redirect URI: โดเมนของแอป + /api/auth/google/callback
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!admin || busy}
          onClick={async () => {
            if (isDemo) {
              setMessage("โหมดสาธิต: ไม่เปิด OAuth และไม่เชื่อมบัญชีจริง");
              return;
            }
            setBusy(true);
            try {
              const r = await fetch("/api/auth/google", { method: "POST" });
              const data = await r.json();
              if (!r.ok) throw Error();
              window.location.assign(data.url);
            } catch {
              setMessage(
                "ยังเชื่อมไม่ได้ กรุณาตรวจ Client ID/Secret, encryption key และสิทธิ์ admin",
              );
              setBusy(false);
            }
          }}
        >
          เชื่อมต่อกับ Google
        </Button>
        <Button
          variant="outline"
          disabled={!admin || busy}
          onClick={async () => {
            if (isDemo) {
              setMessage("โหมดสาธิต: ยังไม่ตรวจบริการจริง");
              return;
            }
            try {
              const r = await fetch("/api/integrations/google/status");
              const data = await r.json();
              if (!r.ok) throw Error();
              setMessage(
                data.connected
                  ? "บันทึกข้อมูลเชื่อมต่อแล้ว — ยังต้องทดสอบ root และ upload จริง"
                  : "ยังไม่ได้เชื่อมบัญชี Google",
              );
            } catch {
              setMessage("ตรวจสถานะไม่ได้ กรุณาตรวจการตั้งค่า");
            }
          }}
        >
          ตรวจสถานะ
        </Button>
      </div>
      {!admin && (
        <p className="text-sm text-slate-500">
          เฉพาะ admin เท่านั้นที่เชื่อมบัญชีได้
        </p>
      )}
      <p role="status" className="mb-0 mt-4 text-sm text-teal-700">
        {message}
      </p>
    </section>
  );
}
