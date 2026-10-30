export type PendingWrite = "none" | "confirm" | "blocked" | "applied" | "baseline" | "refused" | "conflict";

/** Names the write that is actually waiting. An empty hash is not a write that can be confirmed. Refusal/conflict are local decisions and do not imply the file was written. */
export function pendingWrite(input: {
  policy: string;
  files: ReadonlyArray<{ baseHash?: string }>;
  applied: boolean;
  refused?: boolean;
  conflict?: boolean;
}): PendingWrite {
  if (!input.files.length) return "none";
  if (input.applied) return "applied";
  if (input.refused) return "refused";
  if (input.conflict) return "conflict";
  if (input.files.some((file) => !String(file.baseHash ?? "").trim())) return "baseline";
  if (input.policy === "read_only") return "blocked";
  return "confirm";
}
