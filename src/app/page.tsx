import { redirect } from "next/navigation";
import { demo } from "@/server/env";
import { listSessions } from "@/server/sessions";
import { demoRows, type Row } from "@/lib/demo";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (demo()) return <Dashboard initial={demoRows} isDemo role="admin" />;
  let result;
  try {
    result = await listSessions();
  } catch {
    redirect("/login");
  }
  const rows = result.rows.map((r) => ({
    ...r,
    work_date:
      r.work_date instanceof Date
        ? r.work_date.toISOString().slice(0, 10)
        : String(r.work_date || ""),
    created_at: new Date(r.created_at).toISOString(),
    uploaded: Number(r.uploaded),
    total: Number(r.total),
  })) as Row[];
  return <Dashboard initial={rows} isDemo={false} role={result.role} />;
}
