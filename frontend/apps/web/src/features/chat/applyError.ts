import { errorMessage } from "../../lib/presentation";

/** Map apply HTTP failures to stable codes for UI copy. Unknown errors keep the raw message. */
export function applyFailureCode(error: unknown): string {
  const raw = errorMessage(error);
  if (raw.includes("FILE_CHANGED_SINCE_PROPOSAL")) return "FILE_CHANGED_SINCE_PROPOSAL";
  if (raw.includes("BASELINE_UNKNOWN")) return "BASELINE_UNKNOWN";
  if (raw.includes("READ_ONLY_PROPOSAL")) return "READ_ONLY_PROPOSAL";
  if (raw.includes("WRITE_CONFIRMATION_REQUIRED")) return "WRITE_CONFIRMATION_REQUIRED";
  if (raw.includes("AUTHORIZED_ROOT_MISSING")) return "AUTHORIZED_ROOT_MISSING";
  return "";
}

export function applyFailureMessage(error: unknown, translate: (key: string) => string): string {
  const code = applyFailureCode(error);
  if (code === "FILE_CHANGED_SINCE_PROPOSAL") return translate("task.applyConflict");
  if (code === "BASELINE_UNKNOWN") return translate("task.applyBaseline");
  if (code === "READ_ONLY_PROPOSAL") return translate("task.applyReadOnly");
  if (code === "AUTHORIZED_ROOT_MISSING") return translate("task.applyNoRoot");
  return errorMessage(error);
}
