import { cookies } from "next/headers";
import { membership, HttpError } from "@/server/auth";
import { route, live, secret } from "@/server/http";
import { finishOAuth, OAUTH_COOKIE } from "@/server/oauth";
export async function GET(request: Request) {
  return route(async () => {
    live();
    const a = await membership("admin");
    const q = new URL(request.url).searchParams;
    const state = q.get("state"),
      code = q.get("code");
    const jar = await cookies();
    const saved = jar.get(OAUTH_COOKIE)?.value;
    jar.delete(OAUTH_COOKIE);
    if (!state || !code || q.has("error") || !secret(state, saved))
      throw new HttpError(400, "INVALID_OAUTH_CALLBACK");
    await finishOAuth(state, code, a.workspace, a.userId);
    return Response.redirect(
      new URL("/settings?google=connected", process.env.NEXT_PUBLIC_APP_URL),
    );
  });
}
