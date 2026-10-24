import { describe, expect, it } from "vite-plus/test";
import { beginMission, missionLocked, missionShell } from "./mission";

describe("mission shell", () => {
  it("accepts only the fixed unexecuted states", () => {
    expect(missionShell({
      status: "created",
      execution: "not_started",
      approval: "not_requested",
      grant: "none",
      verification: "not_requested",
    })).toBe(true);
    expect(missionShell({
      status: "completed",
      execution: "not_started",
      approval: "not_requested",
      grant: "none",
      verification: "passed",
    })).toBe(false);
    expect(missionLocked({
      status: "created",
      execution: "succeeded",
      approval: "not_requested",
      grant: "none",
      verification: "not_requested",
    })).toBe(true);
    expect(missionShell({
      status: "created",
      execution: "succeeded",
      approval: "not_requested",
      grant: "none",
      verification: "not_requested",
    })).toBe(false);
  });

  it("drops a second click while the first request is busy", () => {
    const gate = { busy: false };
    expect(beginMission(gate)).toBe(true);
    expect(beginMission(gate)).toBe(false);
  });
});
