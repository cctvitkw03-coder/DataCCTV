import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { db } from "./db";
export async function authClient() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server component refresh is performed by proxy. */
          }
        },
      },
    },
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export async function membership(
  min: "viewer" | "operator" | "admin" = "viewer",
) {
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED");
  const row = (
    await db().query(
      "select role from workspace_members where workspace_id=$1 and auth_user_id=$2",
      [process.env.APP_WORKSPACE_ID, data.user.id],
    )
  ).rows[0];
  if (
    !row ||
    { viewer: 0, operator: 1, admin: 2 }[row.role as "viewer"] <
      { viewer: 0, operator: 1, admin: 2 }[min]
  )
    throw new HttpError(403, "FORBIDDEN");
  return {
    userId: data.user.id,
    workspace: process.env.APP_WORKSPACE_ID!,
    role: row.role as "viewer" | "operator" | "admin",
  };
}
