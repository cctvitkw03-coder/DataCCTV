import { cookies } from "next/headers";
import { membership } from "@/server/auth";
import { route, live, csrf } from "@/server/http";
import { beginOAuth, OAUTH_COOKIE } from "@/server/oauth";
export async function POST(request: Request) {
  return route(async () => {
    live();
    csrf(request);
    const a = await membership("admin");
    const { state, url } = await beginOAuth(a.workspace, a.userId);
    (await cookies()).set(OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: new URL(process.env.NEXT_PUBLIC_APP_URL!).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return Response.json({ url }, { headers: { "cache-control": "no-store" } });
  });
}
