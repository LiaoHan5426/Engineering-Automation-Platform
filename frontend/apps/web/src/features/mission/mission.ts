/** One in-flight create. A second click while busy does not start another request. */
export function beginMission(gate: { busy: boolean }): boolean {
  if (gate.busy) return false;
  gate.busy = true;
  return true;
}

const EXECUTION = new Set([
  "not_started",
  "running",
  "cancelling",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "interrupted",
]);

/** A stored shell that has not been started. */
export function missionShell(record: {
  status?: string;
  execution?: string;
  approval?: string;
  grant?: string;
  verification?: string;
}): boolean {
  return (
    record.status === "created" &&
    record.execution === "not_started" &&
    record.approval === "not_requested" &&
    record.grant === "none" &&
    record.verification === "not_requested"
  );
}

/** Locked mission columns. A changed execution projection is still the same shell. */
export function missionLocked(record: {
  status?: string;
  execution?: string;
  approval?: string;
  grant?: string;
  verification?: string;
}): boolean {
  return (
    record.status === "created" &&
    record.approval === "not_requested" &&
    record.grant === "none" &&
    record.verification === "not_requested" &&
    EXECUTION.has(record.execution ?? "")
  );
}
