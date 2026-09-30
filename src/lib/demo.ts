import type { Draft } from "./domain";
export interface Row {
  id: string;
  session_no: string;
  state: string;
  work_date: string;
  created_at: string;
  draft: Draft;
  username: string;
  uploaded: number;
  total: number;
  work_folder_drive_id?: string;
}
export const demoRows: Row[] = [
  {
    id: "demo-1236",
    session_no: "1236",
    state: "completed",
    work_date: "2026-09-24",
    created_at: "2026-09-29T02:18:00Z",
    draft: {
      folderName: "นุ๊ก",
      job: "UPS",
      system: "CCTV",
      branch: "RAM",
      detail: "จุดแคชเชียร์",
    },
    username: "nook_it",
    uploaded: 3,
    total: 3,
  },
  {
    id: "demo-1235",
    session_no: "1235",
    state: "partial",
    work_date: "2026-09-28",
    created_at: "2026-09-29T02:02:00Z",
    draft: {
      folderName: "สมชาย",
      job: "MOUSE_KEYBOARD",
      system: "QUARK",
      branch: "SEE",
      item: "คีย์บอร์ด",
      detail: "คอม Q1",
    },
    username: "nook_it",
    uploaded: 2,
    total: 3,
  },
  {
    id: "demo-1234",
    session_no: "1234",
    state: "queued",
    work_date: "2026-09-29",
    created_at: "2026-09-29T01:45:00Z",
    draft: {
      folderName: "นุ๊ก",
      job: "MOUSE_KEYBOARD",
      system: "CCTV",
      branch: "BCP",
      item: "เมาส์",
      detail: "ค.กลางคืน",
    },
    username: "somchai",
    uploaded: 0,
    total: 5,
  },
  {
    id: "demo-1233",
    session_no: "1233",
    state: "completed",
    work_date: "2026-09-27",
    created_at: "2026-09-28T09:30:00Z",
    draft: { folderName: "ต้น", job: "UPS", system: "QUARK", branch: "BCP" },
    username: "ton_support",
    uploaded: 4,
    total: 4,
  },
  {
    id: "demo-1232",
    session_no: "1232",
    state: "failed",
    work_date: "2026-09-26",
    created_at: "2026-09-28T07:00:00Z",
    draft: { folderName: "สมชาย", job: "UPS", system: "CCTV", branch: "RAM" },
    username: "somchai",
    uploaded: 0,
    total: 2,
  },
];
