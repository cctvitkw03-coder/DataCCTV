export function GET() {
  return Response.json(
    { ok: true, mode: process.env.APP_MODE === "live" ? "live" : "demo" },
    { headers: { "cache-control": "no-store" } },
  );
}
