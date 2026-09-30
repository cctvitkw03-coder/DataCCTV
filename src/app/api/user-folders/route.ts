import { db } from "@/server/db";
import { membership } from "@/server/auth";
import { route, live } from "@/server/http";
export async function GET() {
  return route(async () => {
    live();
    const a = await membership();
    return Response.json(
      (
        await db().query(
          "select id,display_name,drive_folder_id,status from user_folders where workspace_id=$1 order by display_name",
          [a.workspace],
        )
      ).rows,
    );
  });
}
