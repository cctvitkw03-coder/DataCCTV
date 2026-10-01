import {
  mutate,
  today,
  editable,
  type Draft,
  type Session,
  type Step,
} from "./domain";

export function quickDraft(
  last?: Draft,
  folder?: { id: string; display_name: string },
): Draft {
  return {
    flow: "quick",
    ...(folder ? { folderId: folder.id, folderName: folder.display_name } : {}),
    ...(last?.job ? { job: last.job } : {}),
    ...(last?.system ? { system: last.system } : {}),
    workDate: today(),
    dateSource: "today",
    closed: false,
  };
}
export function missingStep(d: Draft): Step | undefined {
  if (!(d.folderId || d.pendingName)) return "folder";
  if (!d.job) return "job";
  if (!d.system) return "system";
  if (!d.branch) return "enter_branch";
  if (d.job === "MOUSE_KEYBOARD" && !d.item) return "item";
  if (d.job === "MOUSE_KEYBOARD" && !d.detail) return "detail";
  if (!d.workDate) return "date";
}
export function mutateFlow(
  s: Session,
  action: string,
  value?: string,
): Session {
  if (s.draft.flow !== "quick") return mutate(s, action, value);
  if (!editable.includes(s.state)) throw Error("IMMUTABLE");
  if (action === "classic") {
    const n = structuredClone(s);
    delete n.draft.flow;
    n.revision++;
    n.state = "configuring";
    n.step = "folder";
    return n;
  }
  if (action === "edit_field") {
    const steps: Record<string, Step> = {
      folder: "folder",
      job: "job",
      system: "system",
      branch: "enter_branch",
      item: "item",
      detail: "detail",
      date: "date",
    };
    if (!value || !steps[value]) throw Error("INVALID_ACTION");
    return {
      ...structuredClone(s),
      revision: s.revision + 1,
      state: "configuring",
      step: steps[value],
    };
  }
  if (action === "back" || action === "edit") {
    return {
      ...structuredClone(s),
      revision: s.revision + 1,
      state:
        !missingStep(s.draft) && s.draft.closed ? "preview" : "configuring",
      step: "review",
    };
  }
  const n = mutate(s, action, value);
  if (action === "cancel") return n;
  if (action === "finish") {
    n.step = missingStep(n.draft) || "review";
  } else if (
    !["new", "search"].includes(action) &&
    !(action === "branch" && value === "custom") &&
    !(action === "date" && value === "custom")
  ) {
    if (action === "job" && s.draft.job !== n.draft.job) delete n.draft.detail;
    n.step = "review";
  }
  n.state =
    n.step === "review" && !missingStep(n.draft) && n.draft.closed
      ? "preview"
      : "configuring";
  return n;
}
