import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { HttpError } from "./auth";
import { demo } from "./env";
export function secret(actual: string | null, expected: string | undefined) {
  if (!expected || !actual) return false;
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function jsonBody(request: Request, max = 262144) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_BODY");
  let size = 0;
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "BODY_TOO_LARGE");
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON");
  }
}
export function live() {
  if (demo()) throw new HttpError(503, "DEMO_NO_EXTERNAL_WRITES");
}
export function csrf(request: Request) {
  if (request.headers.get("origin") !== process.env.NEXT_PUBLIC_APP_URL)
    throw new HttpError(403, "INVALID_ORIGIN");
}
export async function route(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    const requestId = randomUUID();
    const error =
      e instanceof ZodError ? new HttpError(400, "INVALID_INPUT") : e;
    const known = error instanceof HttpError;
    return Response.json(
      {
        error: {
          code: known ? error.code : "SERVICE_UNAVAILABLE",
          message: known
            ? "ไม่สามารถดำเนินการได้ กรุณาตรวจสิทธิ์หรือข้อมูล"
            : "บริการยังไม่พร้อม กรุณาแจ้งผู้ดูแล",
          requestId,
        },
      },
      {
        status: known ? error.status : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
