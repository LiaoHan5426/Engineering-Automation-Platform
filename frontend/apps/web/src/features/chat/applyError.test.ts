import { describe, expect, it } from "vite-plus/test";
import { applyFailureCode, applyFailureMessage } from "./applyError";

describe("applyFailure", () => {
  it("maps FILE_CHANGED_SINCE_PROPOSAL to conflict copy", () => {
    const error = new Error("FILE_CHANGED_SINCE_PROPOSAL");
    expect(applyFailureCode(error)).toBe("FILE_CHANGED_SINCE_PROPOSAL");
    expect(applyFailureMessage(error, (key) => key)).toBe("task.applyConflict");
  });

  it("keeps unknown errors as presentation text", () => {
    expect(applyFailureCode(new Error("boom"))).toBe("");
    expect(applyFailureMessage(new Error("boom"), (key) => key)).toBe("boom");
  });
});
