import { db } from "@/server/db";
import { membership } from "@/server/auth";
import { route, live } from "@/server/http";
export async function GET() {
  return route(async () => {
    live();
    const a = await membership("admin");
    const jobs = await db().query(
      "select status,count(*),min(created_at) as oldest from jobs where workspace_id=$1 group by status",
      [a.workspace],
    );
    return Response.json({
      database: "reachable",
      jobs: jobs.rows,
      drive: "not_probed",
      telegram: "not_probed",
    });
  });
}
