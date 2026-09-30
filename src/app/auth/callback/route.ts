import { authClient } from "@/server/auth";
import { route, live } from "@/server/http";
export async function GET(request: Request) {
  return route(async () => {
    live();
    const code = new URL(request.url).searchParams.get("code");
    if (code) {
      const { error } = await (
        await authClient()
      ).auth.exchangeCodeForSession(code);
      if (!error)
        return Response.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL));
    }
    return Response.redirect(
      new URL("/login?error=auth", process.env.NEXT_PUBLIC_APP_URL),
    );
  });
}
