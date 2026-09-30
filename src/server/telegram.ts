import "server-only";
import { z } from "zod";
import { limit } from "./env";
const id = z.number().int().safe();
const user = z.object({
  id,
  username: z.string().optional(),
  first_name: z.string().optional(),
});
const image = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_size: z.number().optional(),
  width: z.number(),
  height: z.number(),
});
const message = z.object({
  message_id: id,
  message_thread_id: id.optional(),
  chat: z.object({ id, type: z.string() }),
  from: user.optional(),
  sender_chat: z.unknown().optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  media_group_id: z.string().optional(),
  photo: z.array(image).optional(),
  document: z
    .object({
      file_id: z.string(),
      file_unique_id: z.string(),
      file_name: z.string().optional(),
      mime_type: z.string().optional(),
      file_size: z.number().optional(),
    })
    .optional(),
  reply_to_message: z.object({ message_id: id }).optional(),
});
export const updateSchema = z.object({
  update_id: id,
  message: message.optional(),
  edited_message: message.optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: user,
      data: z.string().max(64).optional(),
      message: message.optional(),
    })
    .optional(),
});
export type Update = z.infer<typeof updateSchema>;
export function media(m: z.infer<typeof message>) {
  if (m.photo?.length) {
    const p = [...m.photo].sort(
      (a, b) => b.width * b.height - a.width * a.height,
    )[0];
    if (p.file_size && p.file_size > limit("MAX_FILE_BYTES", 19000000))
      throw new Error("FILE_TOO_LARGE");
    return {
      file_id: p.file_id,
      unique_id: p.file_unique_id,
      mime: "image/jpeg",
      size: p.file_size || 0,
    };
  }
  if (m.document) {
    const d = m.document;
    if (!["image/jpeg", "image/png", "image/webp"].includes(d.mime_type || ""))
      throw new Error("UNSUPPORTED_IMAGE");
    if (d.file_size && d.file_size > limit("MAX_FILE_BYTES", 19000000))
      throw new Error("FILE_TOO_LARGE");
    return {
      file_id: d.file_id,
      unique_id: d.file_unique_id,
      mime: d.mime_type!,
      size: d.file_size || 0,
    };
  }
  return null;
}
export class RemoteError extends Error {
  constructor(
    public status: number,
    public retryAfter = 0,
    public reason = "REMOTE_ERROR",
  ) {
    super(reason);
  }
}
export async function telegram(method: string, body: unknown) {
  const r = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  );
  const data = await r.json();
  if (!r.ok || !data.ok)
    throw new RemoteError(
      data.error_code || r.status,
      data.parameters?.retry_after || 0,
      "TELEGRAM_ERROR",
    );
  return data.result;
}
export async function download(fileId: string, expectedMime: string) {
  const f = await telegram("getFile", { file_id: fileId });
  const path = String(f.file_path);
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes(".."))
    throw new Error("INVALID_FILE_PATH");
  const r = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`,
    { signal: AbortSignal.timeout(18000) },
  );
  if (!r.ok || !r.body) throw new RemoteError(r.status, 0, "DOWNLOAD_FAILED");
  const reader = r.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit("MAX_FILE_BYTES", 19000000))
        throw new Error("FILE_TOO_LARGE");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(parts);
  if (signature(bytes) !== expectedMime) throw new Error("INVALID_SIGNATURE");
  return bytes;
}
export function signature(b: Uint8Array) {
  const x = Buffer.from(b);
  if (x.length >= 3 && x[0] === 255 && x[1] === 216 && x[2] === 255)
    return "image/jpeg";
  if (x.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    x.length >= 12 &&
    x.toString("ascii", 0, 4) === "RIFF" &&
    x.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  throw new Error("INVALID_SIGNATURE");
}
