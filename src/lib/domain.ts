export const jobs = {
  MOUSE_KEYBOARD: "รายการสาขาซื้อ เมาส์ + คีย์บอร์ด",
  UPS: "เครื่องสำรองไฟ",
} as const;
export type State =
  | "collecting"
  | "configuring"
  | "preview"
  | "queued"
  | "provisioning"
  | "uploading"
  | "retry_wait"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"
  | "stopped";
export type Step =
  | "folder"
  | "new_folder"
  | "search_folder"
  | "job"
  | "system"
  | "branch"
  | "enter_branch"
  | "item"
  | "detail"
  | "date"
  | "enter_date"
  | "review";
export interface Draft {
  folderId?: string;
  folderName?: string;
  pendingName?: string;
  job?: keyof typeof jobs;
  system?: "CCTV" | "QUARK";
  branch?: string;
  item?: string;
  detail?: string;
  workDate?: string;
  dateSource?: string;
  dateRaw?: string;
  closed?: boolean;
}
export interface Session {
  root_message_id?: string;
  is_group?: boolean;
  id: string;
  session_no: string;
  workspace_id: string;
  bot_id: string;
  actor_id: string;
  chat_id: string;
  thread_id: string;
  state: State;
  step: Step;
  revision: number;
  draft: Draft;
  expires_at: string;
  snapshot: Snapshot | null;
  work_folder_drive_id: string | null;
  stop_requested: boolean;
}
export interface Media {
  id: string;
  message_id: string;
  telegram_file_id: string;
  unique_id: string;
  media_group_id?: string;
  mime: string;
  size: number;
  sequence?: number;
  target_name?: string;
  drive_file_id?: string;
  status?: string;
}
export interface Snapshot {
  draft: Draft;
  files: Media[];
  folderName: string;
  path: string;
}
export const editable = ["collecting", "configuring", "preview"];
export function clean(value: string, max = 120) {
  const v = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .replace(/\s+/g, " ");
  if (!v || [...v].length > max) throw new Error("INVALID_TEXT");
  return v;
}
export function parseDate(raw: string): string {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  const thai = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/.exec(raw.trim());
  if (iso) {
    [, y, m, d] = iso.map(Number);
  } else if (thai) {
    d = +thai[1];
    m = +thai[2];
    y = +thai[3];
    y = thai[3].length === 2 ? 2500 + y - 543 : y >= 2400 ? y - 543 : y;
  } else throw new Error("INVALID_DATE");
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1900 ||
    y > 2200 ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    throw new Error("INVALID_DATE");
  return dt.toISOString().slice(0, 10);
}
export function today(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${String(y + 543).slice(-2)}`;
}
export function fullDate(iso: string) {
  return (
    new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(iso + "T00:00:00Z")) + ` (${iso})`
  );
}
export function folderName(d: Draft, no: string) {
  if (!d.workDate || !d.branch || !d.job) throw new Error("INCOMPLETE");
  const suffix = `${shortDate(d.workDate)} [S-${no.padStart(6, "0")}]`;
  const start =
    d.job === "UPS"
      ? `เครื่องสำรองไฟ สาขา ${d.branch} ${d.detail || ""}`
      : `สาขา ${d.branch} - ${d.item || ""} ${d.detail || ""} ซื้อเมื่อ`;
  return `${clean(start, 1000).slice(0, 170 - suffix.length)} ${suffix}`;
}
export function snapshot(s: Session, files: Media[]): Snapshot {
  const d = s.draft;
  if (
    !d.closed ||
    !(d.folderId || d.pendingName) ||
    !d.job ||
    !d.system ||
    !d.branch ||
    !d.workDate ||
    (d.job === "MOUSE_KEYBOARD" && (!d.item || !d.detail)) ||
    !files.length
  )
    throw new Error("INCOMPLETE");
  const name = folderName(d, s.session_no);
  const sorted = [...files].sort((a, b) =>
    BigInt(a.message_id) < BigInt(b.message_id) ? -1 : 1,
  );
  return {
    draft: { ...d },
    folderName: name,
    path: `งาน IT / ${d.folderName || d.pendingName} / ${jobs[d.job]} / ${d.system} / ${name}`,
    files: sorted.map((f, i) => ({
      ...f,
      sequence: i + 1,
      target_name: `${d.workDate!.replaceAll("-", "")}_${d.branch!.replace(/[^a-zA-Z0-9ก-๙_-]/g, "_")}_${d.job}_${d.system}_S${s.session_no.padStart(6, "0")}_${String(i + 1).padStart(3, "0")}.${({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[f.mime]}`,
    })),
  };
}
const transitions: Record<State, State[]> = {
  collecting: ["configuring", "cancelled", "expired"],
  configuring: ["preview", "cancelled", "expired"],
  preview: ["configuring", "queued", "cancelled", "expired"],
  queued: ["provisioning", "cancelled", "stopped"],
  provisioning: ["uploading", "retry_wait", "failed", "stopped"],
  uploading: ["completed", "partial", "retry_wait", "failed", "stopped"],
  retry_wait: ["provisioning", "uploading", "failed", "partial", "stopped"],
  partial: ["queued", "stopped"],
  failed: ["queued", "stopped"],
  completed: [],
  cancelled: [],
  expired: [],
  stopped: [],
};
export function transition(from: State, to: State) {
  if (!transitions[from].includes(to)) throw new Error("INVALID_TRANSITION");
  return to;
}
export function mutate(s: Session, action: string, value?: string): Session {
  if (!editable.includes(s.state)) throw new Error("IMMUTABLE");
  const n = structuredClone(s);
  n.revision++;
  n.state = "configuring";
  const d = n.draft;
  if (action === "cancel") {
    n.state = "cancelled";
    return n;
  }
  if (action === "finish") d.closed = true;
  else if (action === "edit") n.step = "folder";
  else if (action === "back") {
    const steps: Step[] = [
      "folder",
      "job",
      "system",
      "branch",
      ...(d.job === "UPS" ? [] : ["item" as Step]),
      "detail",
      "date",
      "review",
    ];
    n.step = steps[Math.max(0, steps.indexOf(n.step) - 1)];
  } else if (action === "new") n.step = "new_folder";
  else if (action === "search") n.step = "search_folder";
  else if (action === "folder") {
    d.folderId = value!.split("|")[0];
    d.folderName = value!.split("|").slice(1).join("|");
    delete d.pendingName;
    n.step = "job";
  } else if (action === "name") {
    d.pendingName = clean(value!, 80);
    delete d.folderId;
    delete d.folderName;
    n.step = "job";
  } else if (action === "job") {
    if (value !== "UPS" && value !== "MOUSE_KEYBOARD")
      throw new Error("INVALID_JOB");
    d.job = value;
    delete d.item;
    n.step = "system";
  } else if (action === "system") {
    if (value !== "CCTV" && value !== "QUARK")
      throw new Error("INVALID_SYSTEM");
    d.system = value;
    n.step = "branch";
  } else if (action === "branch") {
    if (value === "custom") n.step = "enter_branch";
    else {
      d.branch = clean(value!, 40);
      n.step = d.job === "UPS" ? "detail" : "item";
    }
  } else if (action === "item") {
    d.item = clean(value!, 40);
    n.step = "detail";
  } else if (action === "detail") {
    d.detail = value ? clean(value) : "";
    n.step = "date";
  } else if (action === "date") {
    if (value === "custom") n.step = "enter_date";
    else {
      const [date, source] = value!.split("|");
      d.workDate = parseDate(date);
      d.dateSource = source || "custom";
      d.dateRaw = date;
      n.step = "review";
    }
  } else if (action !== "finish") throw new Error("INVALID_ACTION");
  if (n.step === "review" && d.closed) n.state = "preview";
  return n;
}
