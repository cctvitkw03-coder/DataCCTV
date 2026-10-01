"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { GoogleConnect } from "./google-connect";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  HelpCircle,
  Images,
  LayoutDashboard,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  TriangleAlert,
  X,
  Send,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  jobs,
  fullDate,
  type Session,
  mutate,
  snapshot,
  type Media,
} from "@/lib/domain";
import type { Row } from "@/lib/demo";
const statuses: Record<string, string> = {
  completed: "สำเร็จ",
  partial: "สำเร็จบางส่วน",
  queued: "รอประมวลผล",
  uploading: "กำลังอัปโหลด",
  provisioning: "สร้างโฟลเดอร์",
  retry_wait: "รอลองใหม่",
  failed: "ต้องตรวจสอบ",
  stopped: "หยุดแล้ว",
  collecting: "รับรูป",
  configuring: "เลือกข้อมูล",
  preview: "รอยืนยัน",
  cancelled: "ยกเลิก",
  expired: "หมดอายุ",
};
type FileDetail = {
  id: string;
  target_name: string;
  status: string;
  attempts: number;
  last_error_code?: string;
  drive_file_id?: string;
};
export function Dashboard({
  initial,
  isDemo,
  role,
}: {
  initial: Row[];
  isDemo: boolean;
  role: string;
}) {
  const [rows, setRows] = useState(initial),
    [tab, setTab] = useState("ภาพรวม"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [system, setSystem] = useState(""),
    [job, setJob] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [dateKind, setDateKind] = useState("work"),
    [selected, setSelected] = useState<Row | null>(null),
    [notice, setNotice] = useState(""),
    [files, setFiles] = useState<FileDetail[]>([]),
    [busy, setBusy] = useState(false),
    [folderRows, setFolderRows] = useState<
      {
        id: string;
        display_name: string;
        status: string;
        drive_folder_id: string;
      }[]
    >([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const filtered = rows.filter(
    (r) =>
      `${r.draft.folderName || r.draft.pendingName} ${r.draft.branch} ${r.draft.detail || ""} ${r.username} ${r.session_no}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status || r.state === status) &&
      (!system || r.draft.system === system) &&
      (!job || r.draft.job === job) &&
      (!from ||
        (dateKind === "work" ? r.work_date : r.created_at.slice(0, 10)) >=
          from) &&
      (!to ||
        (dateKind === "work" ? r.work_date : r.created_at.slice(0, 10)) <= to),
  );
  async function selectTab(t: string) {
    setTab(t);
    if (t === "โฟลเดอร์ชื่อ" && !isDemo) {
      const r = await fetch("/api/user-folders");
      if (r.ok) setFolderRows(await r.json());
      else setNotice("โหลดรายการไม่ได้ กรุณาตรวจสิทธิ์");
    }
  }
  async function open(r: Row) {
    setSelected(r);
    setFiles([]);
    dialog.current?.showModal();
    if (!isDemo) {
      const res = await fetch(`/api/sessions/${r.id}`);
      if (res.ok) setFiles((await res.json()).files);
      else setNotice("โหลดรายละเอียดไม่ได้");
    }
  }
  async function refresh() {
    if (isDemo) {
      setNotice("ข้อมูลสาธิตเท่านั้น ไม่มีการเชื่อมต่อบริการจริง");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/sessions");
      if (!r.ok) throw Error();
      setRows((await r.json()).rows);
    } catch {
      setNotice("โหลดรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function action(which: "retry" | "stop") {
    if (!selected) return;
    if (isDemo) {
      setRows(
        rows.map((r) =>
          r.id === selected.id
            ? { ...r, state: which === "retry" ? "queued" : "stopped" }
            : r,
        ),
      );
      setNotice("จำลองการเปลี่ยนสถานะในหน้านี้เท่านั้น ไม่มีการอัปโหลดจริง");
      dialog.current?.close();
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${selected.id}/${which}`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      if (!r.ok) throw Error();
      setNotice(
        which === "retry"
          ? "นำงานเดิมเข้าคิวแล้ว"
          : "ขอหยุดก่อนทำขั้นตอนถัดไปแล้ว",
      );
      dialog.current?.close();
      await refresh();
    } catch {
      setNotice("ดำเนินการไม่ได้ กรุณาตรวจสิทธิ์หรือสถานะงาน");
    } finally {
      setBusy(false);
    }
  }
  const completed = rows.filter((r) => r.state === "completed").length,
    pending = rows.filter((r) =>
      ["queued", "uploading", "provisioning", "retry_wait"].includes(r.state),
    ).length,
    attention = rows.filter((r) =>
      ["partial", "failed"].includes(r.state),
    ).length;
  return (
    <div>
      <aside className="sidebar fixed inset-y-0 left-0 flex w-60 flex-col border-r border-slate-200 bg-white px-5 py-8">
        <Link href="/" className="mb-10 flex items-center gap-3 px-2">
          <span className="rounded-xl bg-teal-700 p-2.5 text-white">
            <FolderOpen size={23} />
          </span>
          <span>
            <strong className="text-lg">งาน IT</strong>
            <span className="block text-[11px] tracking-widest text-slate-400">
              PHOTO MANAGER
            </span>
          </span>
        </Link>
        <p className="px-4 text-[10px] tracking-[.15em] text-slate-400">
          พื้นที่ทำงาน
        </p>
        <nav className="space-y-1">
          {[
            [LayoutDashboard, "ภาพรวม"],
            [Images, "ชุดรูปทั้งหมด"],
            [Folder, "โฟลเดอร์ชื่อ"],
            [Send, "ทดลอง Bot"],
            [Settings, "การตั้งค่า"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Folder;
            return (
              <button
                key={String(label)}
                onClick={() => selectTab(String(label))}
                className={`nav-button ${tab === label ? "active" : ""}`}
              >
                <I size={18} />
                {String(label)}
                {label === "ชุดรูปทั้งหมด" && (
                  <span className="ml-auto rounded bg-slate-100 px-2 text-xs">
                    {rows.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-slate-100 bg-slate-50 p-4">
          <ShieldCheck className="mb-3 text-teal-700" size={21} />
          <strong className="text-xs">โฟลเดอร์เลือกได้ทุกคน</strong>
          <p className="mb-0 mt-2 text-xs text-slate-500">
            ชื่อที่ใช้ล่าสุดเป็นตัวช่วยเลือก ไม่ใช่การกำหนดสิทธิ์
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold">
            IT
          </div>
          <div>
            <b className="text-xs">ผู้ดูแลพื้นที่งาน</b>
            <div className="text-[11px] text-slate-400">
              {isDemo ? "บัญชีสาธิต" : role}
            </div>
          </div>
        </div>
      </aside>
      <main className="main-content ml-60">
        <header className="topbar flex items-center justify-between border-b border-slate-200 bg-white px-10 py-5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FolderOpen size={15} /> พื้นที่ทำงาน <ChevronRight size={12} />
            <span className="text-slate-600">{tab}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="desktop-note text-xs text-slate-400">
              Telegram → Google Drive
            </span>
            <span
              className={`badge ${isDemo ? "status-partial" : "status-queued"}`}
            >
              {isDemo ? "DEMO" : "LIVE"}
            </span>
          </div>
        </header>
        <div className="main-pad mx-auto max-w-[1500px] px-10 py-8">
          {isDemo && (
            <div className="mb-7 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <TriangleAlert size={16} className="shrink-0" />
              <span>
                <b>โหมดสาธิต</b> — ข้อมูลทุกแถวเป็นตัวอย่าง
                การลองปุ่มไม่สร้างโฟลเดอร์หรือส่งรูปไปบริการจริง
              </span>
            </div>
          )}
          <div className="mobile-nav mb-5">
            <label className="text-xs text-slate-500">
              เมนู{" "}
              <select
                aria-label="เมนูหลัก"
                value={tab}
                onChange={(e) => selectTab(e.target.value)}
              >
                {[
                  "ภาพรวม",
                  "ชุดรูปทั้งหมด",
                  "โฟลเดอร์ชื่อ",
                  "ทดลอง Bot",
                  "การตั้งค่า",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-xs font-semibold tracking-widest text-teal-700">
                IT OPERATIONS / PHOTO LIBRARY
              </div>
              <h1 className="mb-2 text-3xl font-semibold tracking-tight">
                {tab === "ภาพรวม" ? "ทุกชุดรูป จัดการได้ในที่เดียว" : tab}
              </h1>
              <p className="mb-0 text-sm text-slate-500">
                ติดตามงานจาก Telegram และจัดเก็บเป็นระเบียบใน Google Drive
              </p>
            </div>
            <Button variant="outline" onClick={refresh} disabled={busy}>
              <RefreshCw size={15} /> รีเฟรช
            </Button>
          </div>
          {notice && (
            <div
              role="status"
              className="mb-5 flex justify-between rounded-xl bg-teal-50 p-4 text-sm text-teal-800"
            >
              {notice}
              <button aria-label="ปิดข้อความ" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {["ภาพรวม", "ชุดรูปทั้งหมด"].includes(tab) ? (
            <>
              <div className="stats-grid mb-8 grid grid-cols-4 gap-5">
                {[
                  [
                    Images,
                    "รูปที่จัดเก็บแล้ว",
                    rows.reduce((a, r) => a + Number(r.uploaded), 0),
                    "จากชุดรูปในรายการ",
                    "text-teal-700",
                    "bg-teal-50",
                  ],
                  [
                    Check,
                    "ชุดงานสำเร็จ",
                    completed,
                    "จัดเก็บครบทุกภาพ",
                    "text-emerald-600",
                    "bg-emerald-50",
                  ],
                  [
                    Clock,
                    "กำลังดำเนินการ",
                    pending,
                    "รอคิวและกำลังอัปโหลด",
                    "text-blue-600",
                    "bg-blue-50",
                  ],
                  [
                    TriangleAlert,
                    "ต้องตรวจสอบ",
                    attention,
                    "สำเร็จบางส่วน / มีข้อผิดพลาด",
                    "text-amber-600",
                    "bg-amber-50",
                  ],
                ].map(([Icon, label, value, note, color, bg]) => {
                  const I = Icon as typeof Images;
                  return (
                    <div className="card p-5" key={String(label)}>
                      <div className="mb-5 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500">
                          {String(label)}
                        </span>
                        <span className={`rounded-lg p-2 ${bg} ${color}`}>
                          <I size={18} />
                        </span>
                      </div>
                      <div className="mb-2 text-3xl font-semibold">
                        {String(value)}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          {label === "รูปที่จัดเก็บแล้ว" ? "รูป" : "ชุด"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {String(note)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <section className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 p-5">
                  <div>
                    <h2 className="mb-1 text-base font-semibold">
                      ชุดรูปทั้งหมด{" "}
                      <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
                        {rows.length}
                      </span>
                    </h2>
                    <p className="mb-0 text-xs text-slate-400">
                      แต่ละชุดที่ยืนยันจะสร้างโฟลเดอร์งานใหม่เสมอ
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    แสดงล่าสุดสูงสุด 200 ชุด
                  </span>
                </div>
                <div className="space-y-3 p-5">
                  <div className="filter-row flex flex-wrap gap-3">
                    <input
                      aria-label="ค้นหา"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="min-w-48 flex-1"
                      placeholder="ค้นหาสาขา ชื่อ ผู้ส่ง หรือรายละเอียด..."
                    />
                    <select
                      aria-label="สถานะ"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="">ทุกสถานะ</option>
                      {Object.entries(statuses).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="ประเภทงาน"
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                    >
                      <option value="">ทุกประเภทงาน</option>
                      {Object.entries(jobs).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="ระบบ"
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                    >
                      <option value="">ทุกระบบ</option>
                      <option>CCTV</option>
                      <option>QUARK</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select
                      aria-label="ชนิดวันที่"
                      value={dateKind}
                      onChange={(e) => setDateKind(e.target.value)}
                    >
                      <option value="work">วันที่งาน</option>
                      <option value="received">วันที่รับรูป</option>
                    </select>
                    <input
                      aria-label="ตั้งแต่วันที่"
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                    <span className="text-slate-400">ถึง</span>
                    <input
                      aria-label="ถึงวันที่"
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                    <button
                      className="ml-2 text-teal-700"
                      onClick={() => {
                        setQuery("");
                        setStatus("");
                        setSystem("");
                        setJob("");
                        setFrom("");
                        setTo("");
                      }}
                    >
                      ล้างตัวกรอง
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "ชุดงาน / วันที่งาน",
                          "โฟลเดอร์ชื่อ / ผู้ส่งจริง",
                          "ประเภทงาน / ระบบ",
                          "สาขา",
                          "รูปที่บันทึก",
                          "สถานะ",
                          "",
                        ].map((t, i) => (
                          <th key={i}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/70">
                          <td>
                            <button
                              onClick={() => open(r)}
                              className="font-semibold text-teal-800"
                            >
                              S-{r.session_no.padStart(6, "0")}
                            </button>
                            <div className="text-[11px] text-slate-400">
                              {r.work_date || "ยังไม่เลือกวันที่"}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <Folder size={15} className="text-amber-500" />
                              {r.draft.folderName ||
                                r.draft.pendingName ||
                                "ยังไม่เลือก"}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">
                              ส่งโดย @{r.username || "ไม่มี username"}
                            </div>
                          </td>
                          <td>
                            <div>{r.draft.job ? jobs[r.draft.job] : "—"}</div>
                            <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                              {r.draft.system || "—"}
                            </span>
                          </td>
                          <td className="font-medium">
                            {r.draft.branch || "—"}
                          </td>
                          <td>
                            <span
                              className={
                                Number(r.uploaded) === Number(r.total)
                                  ? "text-teal-700"
                                  : "text-slate-600"
                              }
                            >
                              {r.uploaded}
                            </span>
                            <span className="text-slate-400"> / {r.total}</span>
                            <div className="mt-2 h-1 w-14 overflow-hidden rounded bg-slate-100">
                              <div
                                className="h-full bg-teal-500"
                                style={{
                                  width: `${(Number(r.uploaded) / Math.max(1, Number(r.total))) * 100}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <span className={`badge status-${r.state}`}>
                              {statuses[r.state] || r.state}
                            </span>
                          </td>
                          <td>
                            <button
                              aria-label={`รายละเอียด S-${r.session_no}`}
                              onClick={() => open(r)}
                            >
                              <ChevronRight
                                size={17}
                                className="text-slate-400"
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="p-16 text-center text-slate-400">
                      <Search className="mx-auto mb-3" />
                      ไม่พบชุดรูปที่ตรงกับตัวกรอง
                    </div>
                  )}
                </div>
                <div className="flex justify-between px-5 py-4 text-[11px] text-slate-400">
                  <span>
                    แสดง {filtered.length} จาก {rows.length} ชุด
                  </span>
                  <span>วันที่งานแยกจากวันที่รับรูป</span>
                </div>
              </section>
              <div className="mt-5 flex items-start gap-2 text-xs text-slate-400">
                <HelpCircle size={15} />
                <span>
                  หากสำเร็จบางส่วน ระบบ retry เฉพาะรูปที่เหลือ โดยใช้โฟลเดอร์และ
                  ID เดิม
                </span>
              </div>
            </>
          ) : tab === "ทดลอง Bot" ? (
            <BotDemo />
          ) : tab === "โฟลเดอร์ชื่อ" ? (
            <section className="card p-6">
              <h2 className="text-lg font-semibold">
                โฟลเดอร์สำหรับจัดหมวดหมู่
              </h2>
              <p className="text-slate-500">
                ผู้ส่งทุกคนเลือกชื่ออื่นได้ ไม่ผูกสิทธิ์กับ Telegram user
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {(isDemo
                  ? ["นุ๊ก", "สมชาย", "ต้น"].map((name, i) => ({
                      id: String(i),
                      display_name: name,
                      status: "demo",
                      drive_folder_id: "",
                    }))
                  : folderRows
                ).map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    <Folder className="mb-4 text-amber-500" />
                    <b>{f.display_name}</b>
                    <div className="mt-2 text-xs text-slate-400">
                      {isDemo ? "โฟลเดอร์จำลอง" : f.status}
                    </div>
                    <div className="mt-3 text-xs">
                      เมาส์ + คีย์บอร์ด · UPS · อื่น
                      <br />
                      CCTV · QUARK
                    </div>
                    {f.drive_folder_id && (
                      <a
                        className="mt-3 block text-xs text-teal-700"
                        href={`https://drive.google.com/drive/folders/${f.drive_folder_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        เปิด Drive ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="card max-w-3xl p-7">
              <h2 className="text-lg font-semibold">การเชื่อมต่อและข้อจำกัด</h2>
              {[
                [
                  "Telegram Bot",
                  isDemo
                    ? "ยังไม่เชื่อมต่อ · โหมดสาธิต"
                    : "ใช้การตั้งค่าฝั่ง server",
                ],
                [
                  "Google Drive",
                  isDemo
                    ? "ไม่มีการสร้างหรืออัปโหลดไฟล์จริง"
                    : "ต้องทดสอบ sandbox root และ OAuth / Shared Drive",
                ],
                [
                  "Supabase",
                  isDemo
                    ? "แสดงข้อมูลตัวอย่างใน browser"
                    : "Auth + Postgres พร้อมตรวจ workspace membership",
                ],
                ["ขอบเขตที่เปิด", "แชตส่วนตัว · JPEG / PNG / WebP"],
                [
                  "การเปิดใช้จริง",
                  "ต้องผ่าน integration test และ UAT ก่อน production",
                ],
              ].map(([a, b]) => (
                <div
                  key={a}
                  className="flex flex-wrap justify-between gap-3 border-b border-slate-100 py-4"
                >
                  <span>{a}</span>
                  <span className="text-sm text-slate-500">{b}</span>
                </div>
              ))}
              <p className="mb-0 mt-5 text-xs text-slate-400">
                เปลี่ยน credentials ผ่าน environment ของ deployment เท่านั้น
                ไม่แสดง secrets ในหน้านี้
              </p>
              <GoogleConnect isDemo={isDemo} admin={role === "admin"} />
            </section>
          )}
          <footer className="mt-10 flex flex-wrap justify-between gap-3 text-[10px] text-slate-400">
            <span>งาน IT · Telegram Drive Photo Manager</span>
            <span>
              {isDemo
                ? "DEMO DATA / ไม่ใช่ผลจากบริการจริง"
                : "ข้อมูลภายใน workspace"}{" "}
              · Asia/Bangkok
            </span>
          </footer>
        </div>
      </main>
      <dialog ref={dialog}>
        {selected && (
          <div className="p-5">
            <div className="mb-6 flex justify-between">
              <div>
                <p className="mb-1 text-xs text-teal-700">
                  รายละเอียดชุดรูป {isDemo ? "· จำลอง" : ""}
                </p>
                <h2 className="mb-0 text-xl font-semibold">
                  S-{selected.session_no.padStart(6, "0")}
                </h2>
              </div>
              <button
                aria-label="ปิดรายละเอียด"
                onClick={() => dialog.current?.close()}
              >
                <X />
              </button>
            </div>
            <div className="mb-5 rounded-xl bg-slate-50 p-4 text-sm">
              งาน IT / {selected.draft.folderName} /{" "}
              {selected.draft.job ? jobs[selected.draft.job] : "—"} /{" "}
              {selected.draft.system}
              <div className="mt-2 text-xs text-slate-500">
                ผู้ส่งจริง @{selected.username} · สาขา {selected.draft.branch}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5 text-sm">
              <div>
                <span className="label">วันที่งานที่เลือก</span>
                <p>{selected.work_date ? fullDate(selected.work_date) : "—"}</p>
              </div>
              <div>
                <span className="label">เวลารับรูป</span>
                <p>
                  {new Date(selected.created_at).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </p>
              </div>
            </div>
            <p className="text-sm">
              จัดเก็บแล้ว {selected.uploaded} / {selected.total} รูป ·{" "}
              <span className={`badge status-${selected.state}`}>
                {statuses[selected.state]}
              </span>
            </p>
            <div className="mb-6 space-y-2">
              {(isDemo
                ? Array.from({ length: Number(selected.total) }, (_, i) => ({
                    id: String(i),
                    target_name: `รูปที่ ${i + 1} · ตัวอย่าง`,
                    status:
                      i < Number(selected.uploaded) ? "uploaded" : "pending",
                    attempts: i < Number(selected.uploaded) ? 1 : 0,
                  }))
                : files
              ).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
                >
                  <Images size={18} className="text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {f.target_name || "รอยืนยัน"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {f.status === "uploaded" ? "บันทึกแล้ว" : f.status} ·{" "}
                    {f.attempts} ครั้ง
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {selected.work_folder_drive_id && !isDemo && (
                <Button asChild>
                  <a
                    href={`https://drive.google.com/drive/folders/${selected.work_folder_drive_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={15} /> เปิด Google Drive
                  </a>
                </Button>
              )}
              {role !== "viewer" &&
                ["partial", "failed"].includes(selected.state) && (
                  <Button disabled={busy} onClick={() => action("retry")}>
                    <RefreshCw size={15} /> ลองใหม่เฉพาะรูปที่เหลือ
                  </Button>
                )}
              {role !== "viewer" &&
                [
                  "partial",
                  "failed",
                  "queued",
                  "uploading",
                  "retry_wait",
                ].includes(selected.state) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => action("stop")}
                  >
                    หยุดงานที่เหลือ
                  </Button>
                )}
            </div>
            <p className="mb-0 mt-4 text-xs text-slate-400">
              การหยุดไม่ลบรูปที่บันทึกแล้ว{" "}
              {isDemo ? "ภาพตัวอย่างไม่ใช่ไฟล์จาก Drive" : ""}
            </p>
          </div>
        )}
      </dialog>
    </div>
  );
}
function BotDemo() {
  const initial: Session = {
    id: "demo",
    session_no: "2001",
    workspace_id: "demo",
    bot_id: "demo",
    actor_id: "demo",
    chat_id: "1",
    thread_id: "0",
    state: "collecting",
    step: "folder",
    revision: 0,
    draft: {},
    expires_at: "2099-01-01",
    snapshot: null,
    work_folder_drive_id: null,
    stop_requested: false,
  };
  const [s, setS] = useState(initial),
    [count, setCount] = useState(0),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const media: Media[] = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    message_id: String(i),
    telegram_file_id: "demo",
    unique_id: "demo",
    mime: "image/jpeg",
    size: 100,
  }));
  function go(a: string, v?: string) {
    try {
      setS(mutate(s, a, v));
      setText("");
      setError("");
    } catch {
      setError("กรุณาตรวจรูปแบบข้อมูล");
    }
  }
  let preview;
  try {
    preview = snapshot(s, media);
  } catch {}
  return (
    <section className="card max-w-3xl p-7">
      <div className="mb-5 flex items-center gap-3">
        <Send className="text-teal-700" />
        <h2 className="mb-0 text-lg font-semibold">
          ทดลองขั้นตอน Bot แบบจำลอง
        </h2>
      </div>
      <p className="text-sm text-slate-500">
        ทดสอบการเลือกข้อมูลและ preview โดยไม่ใช้บัญชี Telegram หรือ Drive
      </p>
      <div className="mb-5 rounded-xl bg-slate-50 p-5">
        <div className="mb-3 text-xs text-slate-400">
          สถานะ {s.state} · revision {s.revision} · {count} รูป
        </div>
        {preview ? (
          <>
            <h3 className="font-semibold">ตรวจสอบก่อนสร้าง</h3>
            <p className="break-words text-sm">{preview.path}</p>
            <p>
              {fullDate(s.draft.workDate!)} · {count} รูป
            </p>
          </>
        ) : (
          <p className="mb-0">
            {count
              ? `ขั้นตอน: ${{ folder: "เลือกโฟลเดอร์ชื่อ", job: "ประเภทงาน", system: "ระบบ", branch: "สาขา", item: "อุปกรณ์", detail: "เครื่อง / จุดใช้งาน", date: "วันที่งาน", new_folder: "ชื่อใหม่", enter_date: "กรอกวันที่", enter_branch: "กรอกสาขา", search_folder: "ค้นหาชื่อ", review: "กดส่งครบแล้วเพื่อ preview" }[s.step]}`
              : "ส่งรูปก่อนเพื่อเริ่มชุดงาน"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!["queued", "cancelled"].includes(s.state) && (
          <Button
            variant="outline"
            onClick={() => {
              setCount(count + 1);
              setS({
                ...s,
                state: "configuring",
                revision: s.revision + 1,
                draft: { ...s.draft, closed: false },
              });
            }}
          >
            เพิ่มรูปจำลอง
          </Button>
        )}
        {count > 0 && !["queued", "cancelled"].includes(s.state) && (
          <>
            {s.step === "folder" && (
              <>
                {["นุ๊ก", "สมชาย", "ต้น"].map((v, i) => (
                  <Button key={v} onClick={() => go("folder", `${i}|${v}`)}>
                    {v}
                  </Button>
                ))}
                <Button variant="outline" onClick={() => go("new")}>
                  สร้างชื่อใหม่
                </Button>
              </>
            )}
            {s.step === "job" &&
              Object.entries(jobs).map(([v, l]) => (
                <Button key={v} onClick={() => go("job", v)}>
                  {l}
                </Button>
              ))}
            {s.step === "system" &&
              ["CCTV", "QUARK"].map((v) => (
                <Button key={v} onClick={() => go("system", v)}>
                  {v}
                </Button>
              ))}
            {s.step === "branch" &&
              ["BCP", "SEE", "RAM"].map((v) => (
                <Button key={v} onClick={() => go("branch", v)}>
                  {v}
                </Button>
              ))}
            {s.step === "item" &&
              ["เมาส์", "คีย์บอร์ด", "เมาส์ + คีย์บอร์ด"].map((v) => (
                <Button key={v} onClick={() => go("item", v)}>
                  {v}
                </Button>
              ))}
            {s.step === "date" && (
              <>
                <Button onClick={() => go("date", "2026-09-29|today")}>
                  29.9.69 (ตัวอย่าง)
                </Button>
                <Button onClick={() => go("date", "2026-09-28|yesterday")}>
                  28.9.69
                </Button>
                <Button variant="outline" onClick={() => go("date", "custom")}>
                  ระบุเอง
                </Button>
              </>
            )}
            {["detail", "new_folder", "enter_date"].includes(s.step) && (
              <>
                <input
                  aria-label="กรอกข้อมูล Bot"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    s.step === "enter_date" ? "24.9.69" : "พิมพ์ข้อมูล"
                  }
                />
                <Button
                  onClick={() =>
                    go(
                      s.step === "new_folder"
                        ? "name"
                        : s.step === "enter_date"
                          ? "date"
                          : "detail",
                      text,
                    )
                  }
                >
                  ถัดไป
                </Button>
              </>
            )}
            {!s.draft.closed && (
              <Button variant="outline" onClick={() => go("finish")}>
                ส่งครบแล้ว
              </Button>
            )}
            {preview && (
              <Button
                onClick={() =>
                  setS({ ...s, state: "queued", snapshot: preview })
                }
              >
                ยืนยันแบบจำลอง
              </Button>
            )}
            <Button variant="ghost" onClick={() => go("back")}>
              ย้อนกลับ
            </Button>
            <Button variant="ghost" onClick={() => go("cancel")}>
              ยกเลิก
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setS(initial);
            setCount(0);
            setError("");
          }}
        >
          เริ่มใหม่
        </Button>
      </div>
      {error && <p className="mt-3 text-red-600">{error}</p>}
      {s.state === "queued" && (
        <p role="status" className="mt-5 text-teal-700">
          ยืนยันตัวอย่างแล้ว — ไม่มีการสร้างโฟลเดอร์จริง
        </p>
      )}
    </section>
  );
}
