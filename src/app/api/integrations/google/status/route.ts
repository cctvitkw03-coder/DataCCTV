import { membership } from "@/server/auth";
import { db } from "@/server/db";
import { route, live } from "@/server/http";
export async function GET() {
  return route(async () => {
    live();
    const a = await membership("admin");
    const row = (
      await db().query(
        "select scopes,updated_at from private.google_credentials where workspace_id=$1",
        [a.workspace],
      )
    ).rows[0];
    return Response.json(
      {
        configured: !!(
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET &&
          process.env.OAUTH_ENCRYPTION_KEY
        ),
        connected: !!row || !!process.env.GOOGLE_REFRESH_TOKEN,
        updatedAt: row?.updated_at || null,
        redirectUri: new URL(
          "/api/auth/google/callback",
          process.env.NEXT_PUBLIC_APP_URL!,
        ).toString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
