/** One in-flight create. A second click while busy does not start another request. */
export function beginMission(gate: { busy: boolean }): boolean {
  if (gate.busy) return false;
  gate.busy = true;
  return true;
}

/** A stored shell. Anything else is not success, completion, or a passed verification. */
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
