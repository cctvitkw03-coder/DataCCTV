import { it, expect } from "vitest";
import { quickDraft, mutateFlow, missingStep } from "@/lib/quick-flow";
import { mutate, today, type Session } from "@/lib/domain";
const base = (): Session => ({
  id: "s",
  session_no: "1",
  workspace_id: "w",
  bot_id: "b",
  actor_id: "a",
  chat_id: "1",
  thread_id: "0",
  state: "configuring",
  step: "review",
  revision: 1,
  expires_at: "2099-01-01",
  snapshot: null,
  work_folder_drive_id: null,
  stop_requested: false,
  draft: quickDraft(
    {
      job: "UPS",
      system: "CCTV",
      branch: "OLD",
      detail: "OLD",
      workDate: "2000-01-01",
    },
    { id: "f", display_name: "Name" },
  ),
});
it("defaults copy only reusable fields, reset branch/details and use Bangkok today", () => {
  const d = base().draft;
  expect(d).toMatchObject({
    folderId: "f",
    job: "UPS",
    system: "CCTV",
    workDate: today(),
    closed: false,
  });
  expect(d.branch).toBeUndefined();
  expect(d.detail).toBeUndefined();
  expect(d.item).toBeUndefined();
});
it("missing branch cannot reach confirmation", () => {
  const s = mutateFlow(base(), "finish");
  expect(s.state).toBe("configuring");
  expect(s.step).toBe("enter_branch");
});
it("summary editing preserves other fields and requires photo completion", () => {
  let s = mutateFlow(base(), "edit_field", "branch");
  expect(s.step).toBe("enter_branch");
  s = mutateFlow(s, "branch", "123");
  expect(s.step).toBe("review");
  expect(s.state).toBe("configuring");
  s = mutateFlow(s, "finish");
  expect(s.state).toBe("preview");
  s = mutateFlow(s, "edit_field", "date");
  s = mutateFlow(s, "date", "2026-09-30|custom");
  expect(s.state).toBe("preview");
  expect(s.draft.branch).toBe("123");
  expect(s.draft.workDate).toBe("2026-09-30");
});
it("mouse keyboard still requires item and detail and job change clears old detail", () => {
  let s = mutateFlow(base(), "branch", "123");
  s.draft.detail = "UPS note";
  s = mutateFlow(s, "job", "MOUSE_KEYBOARD");
  expect(s.draft.detail).toBeUndefined();
  expect(missingStep(s.draft)).toBe("item");
  s = mutateFlow(s, "item", "เมาส์");
  expect(missingStep(s.draft)).toBe("detail");
});
it("classic flow remains unchanged and rollback preserves entered values", () => {
  const quick = base();
  quick.draft.branch = "123";
  const classic = mutateFlow(quick, "classic");
  expect(classic.draft.flow).toBeUndefined();
  expect(classic.draft.branch).toBe("123");
  expect(classic.step).toBe("folder");
  expect(mutateFlow(classic, "job", "UPS")).toEqual(
    mutate(classic, "job", "UPS"),
  );
});
it("confirmed sessions cannot be edited or switched back", () => {
  const s = base();
  s.state = "queued";
  expect(() => mutateFlow(s, "classic")).toThrow("IMMUTABLE");
  expect(() => mutateFlow(s, "edit_field", "branch")).toThrow("IMMUTABLE");
});
