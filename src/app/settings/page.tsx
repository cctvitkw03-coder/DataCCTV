import { redirect } from "next/navigation";
import Link from "next/link";
import { GoogleConnect } from "@/components/google-connect";
import { demo } from "@/server/env";
import { membership } from "@/server/auth";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const isDemo = demo();
  let role = "admin";
  if (!isDemo) {
    try {
      role = (await membership()).role;
    } catch {
      redirect("/login");
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link className="text-teal-700" href="/">
        ← กลับ Dashboard
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">การเชื่อมต่อ Google Drive</h1>
      {isDemo && (
        <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
          DEMO — ไม่มีการเชื่อมต่อบริการจริง
        </p>
      )}
      <GoogleConnect isDemo={isDemo} admin={role === "admin"} />
    </main>
  );
}
