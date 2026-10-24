export type HandoffSource = "chat" | "builder";

export interface HandoffDraft {
  source: HandoffSource;
  sourceRef: string;
  summary: string;
}

/** The visible text the operator submits. Mock approval is not an input. */
export function chatHandoff(draft: string, conversationId: string | null): HandoffDraft | null {
  const summary = draft.trim();
  if (!summary) return null;
  return { source: "chat", sourceRef: conversationId ?? "draft", summary };
}

export function builderHandoff(instanceId: "alpha" | "beta", title: string, body: string): HandoffDraft | null {
  const summary = [title.trim(), body.trim()].filter(Boolean).join("\n");
  if (!summary) return null;
  return { source: "builder", sourceRef: `builder-${instanceId}`, summary };
}

/** One in-flight submission. A second click while busy does not start another record. */
export function beginHandoff(gate: { busy: boolean }): boolean {
  if (gate.busy) return false;
  gate.busy = true;
  return true;
}

export function handoffSucceeded(record: {
  status?: string;
  execution?: string;
  approval?: string;
  grant?: string;
}): boolean {
  return (
    record.status === "recorded" &&
    record.execution === "not_started" &&
    record.approval === "not_requested" &&
    record.grant === "none"
  );
}
