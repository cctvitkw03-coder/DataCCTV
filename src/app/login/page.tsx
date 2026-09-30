"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto mt-24 max-w-md px-5">
      <section className="card p-8">
        <p className="text-xs tracking-widest text-teal-700">
          งาน IT / PHOTO MANAGER
        </p>
        <h1 className="text-2xl font-semibold">เข้าสู่พื้นที่ทำงาน</h1>
        <p className="text-sm text-slate-500">
          สำหรับสมาชิกที่ได้รับคำเชิญเท่านั้น
        </p>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const client = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
              );
              const { error } = await client.auth.signInWithPassword({
                email,
                password,
              });
              if (error) throw error;
              router.push("/");
              router.refresh();
            } catch {
              setMessage("เข้าสู่ระบบไม่ได้ กรุณาตรวจบัญชีหรือการตั้งค่า");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            อีเมล
            <input
              className="mt-1 w-full"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            รหัสผ่าน
            <input
              className="mt-1 w-full"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button className="w-full" disabled={busy}>
            เข้าสู่ระบบ
          </Button>
          <p role="status" className="text-sm text-red-600">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
