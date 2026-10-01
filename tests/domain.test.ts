import { describe, it, expect } from "vitest";
import {
  parseDate,
  mutate,
  snapshot,
  transition,
  today,
  type Session,
  type Media,
} from "@/lib/domain";
import { signature, media } from "@/server/telegram";
import { retryPolicy } from "@/server/retry";
import { RemoteError } from "@/server/telegram";
const base: Session = {
  id: "session-1",
  session_no: "12",
  workspace_id: "w",
  bot_id: "b",
  actor_id: "a",
  chat_id: "1",
  thread_id: "0",
  state: "configuring",
  step: "review",
  revision: 3,
  draft: {
    folderId: "folder-2",
    folderName: "สมชาย",
    job: "UPS",
    system: "QUARK",
    branch: "RAM",
    workDate: "2026-09-24",
    closed: true,
  },
  expires_at: "2099-01-01",
  snapshot: null,
  work_folder_drive_id: null,
  stop_requested: false,
};
const files: Media[] = [
  {
    id: "f2",
    message_id: "20",
    telegram_file_id: "same",
    unique_id: "same",
    mime: "image/jpeg",
    size: 5,
  },
  {
    id: "f1",
    message_id: "10",
    telegram_file_id: "same",
    unique_id: "same",
    mime: "image/png",
    size: 5,
  },
];
describe("work date and names", () => {
  it.each(["24.9.69", "24/9/2569", "24.9.2026", "2026-09-24"])(
    "parses %s explicitly",
    (v) => expect(parseDate(v)).toBe("2026-09-24"),
  );
  it.each(["31.2.69", "2025-02-29", "00.9.69", "24.13.69", "text"])(
    "rejects %s",
    (v) => expect(() => parseDate(v)).toThrow(),
  );
  it("handles leap day and Bangkok midnight", () => {
    expect(parseDate("29.2.67")).toBe("2024-02-29");
    expect(today(new Date("2026-09-28T17:01:00Z"))).toBe("2026-09-29");
  });
  it("keeps button date stable after midnight", () =>
    expect(mutate(base, "date", "2026-09-24|today").draft.workDate).toBe(
      "2026-09-24",
    ));
  it("freezes message order without content dedupe", () => {
    const snap = snapshot(base, files);
    expect(snap.files).toHaveLength(2);
    expect(snap.files[0].id).toBe("f1");
    expect(snap.files[0].target_name).toBe(
      "20260924_RAM_UPS_QUARK_S000012_001.png",
    );
  });
  it("new sessions have different names", () =>
    expect(snapshot(base, files).folderName).not.toBe(
      snapshot({ ...base, session_no: "13" }, files).folderName,
    ));
  it.each(["UPS", "MOUSE_KEYBOARD", "OTHER"] as const)(
    "both systems supported for %s",
    (job) => {
      for (const system of ["CCTV", "QUARK"] as const)
        expect(
          snapshot(
            {
              ...base,
              draft: {
                ...base.draft,
                job,
                system,
                item: "เมาส์",
                detail: "จุดขาย",
              },
            },
            files,
          ).path,
        ).toContain(system);
    },
  );
});
describe("state invariants", () => {
  it("folder selection is preference, not owner", () => {
    const n = mutate(base, "folder", "different|ต้น");
    expect(n.draft.folderName).toBe("ต้น");
    expect(n.revision).toBe(4);
  });
  it("new folder remains draft until confirmation", () => {
    expect(mutate(base, "name", "นุ๊ก").draft.pendingName).toBe("นุ๊ก");
    expect(mutate(base, "cancel").state).toBe("cancelled");
  });
  it("refuses unclosed / empty previews", () => {
    expect(() =>
      snapshot({ ...base, draft: { ...base.draft, closed: false } }, files),
    ).toThrow("INCOMPLETE");
    expect(() => snapshot(base, [])).toThrow();
  });
  it("clears irrelevant fields when changing job and invalidates preview", () => {
    const n = mutate(
      { ...base, state: "preview", draft: { ...base.draft, item: "เมาส์" } },
      "job",
      "UPS",
    );
    expect(n.draft.item).toBeUndefined();
    expect(n.state).toBe("configuring");
  });
  it("confirmed snapshots cannot be edited", () =>
    expect(() =>
      mutate({ ...base, state: "queued" }, "date", "2026-01-01"),
    ).toThrow("IMMUTABLE"));
  it("completed cannot return to upload", () =>
    expect(() => transition("completed", "uploading")).toThrow());
});
describe("media and retry", () => {
  it("checks actual signature", () => {
    expect(signature(Buffer.from([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(() => signature(Buffer.from("fake.png"))).toThrow();
  });
  it("selects largest photo variant", () =>
    expect(
      media({
        message_id: 1,
        chat: { id: 1, type: "private" },
        photo: [
          { file_id: "small", file_unique_id: "1", width: 10, height: 10 },
          { file_id: "large", file_unique_id: "2", width: 20, height: 20 },
        ],
      })?.file_id,
    ).toBe("large"));
  it("respects Retry-After and cap", () => {
    expect(
      retryPolicy(new RemoteError(429, 99), 1, 5, () => 0).delaySeconds,
    ).toBe(99);
    expect(retryPolicy(new RemoteError(503), 5).retry).toBe(false);
  });
  it("permission failures stop, rate limit retries", () => {
    expect(
      retryPolicy(new RemoteError(403, 0, "insufficientPermissions"), 1).retry,
    ).toBe(false);
    expect(
      retryPolicy(new RemoteError(403, 0, "rateLimitExceeded"), 1).retry,
    ).toBe(true);
  });
});

it("OTHER requires a description, skips item selection and names files as OTHER", () => {
  let s = mutate({ ...base, state: "configuring" }, "job", "OTHER");
  s = mutate(s, "system", "CCTV");
  s = mutate(s, "branch", "123");
  expect(s.step).toBe("detail");
  expect(() =>
    snapshot({ ...s, draft: { ...s.draft, detail: "", closed: true } }, files),
  ).toThrow("INCOMPLETE");
  s = mutate(s, "detail", "เปลี่ยนจอ");
  s = mutate(s, "date", "2026-10-01");
  const result = snapshot({ ...s, draft: { ...s.draft, closed: true } }, files);
  expect(result.path).toContain("/ อื่น /");
  expect(result.files[0].target_name).toContain("_OTHER_CCTV_");
});
