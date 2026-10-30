import { describe, expect, it } from "vite-plus/test";
import { pendingWrite } from "./pendingWrite";

describe("pending write", () => {
  it("does not call an empty baseline ready to confirm", () => {
    expect(pendingWrite({ policy: "review", files: [{ baseHash: "" }], applied: false })).toBe("baseline");
    expect(pendingWrite({ policy: "read_only", files: [{ baseHash: "abc" }], applied: false })).toBe("blocked");
  });

  it("asks for confirmation only when a hash is present and the policy allows it", () => {
    expect(pendingWrite({ policy: "review", files: [{ baseHash: "abc" }], applied: false })).toBe("confirm");
    expect(pendingWrite({ policy: "review", files: [{ baseHash: "abc" }], applied: true })).toBe("applied");
    expect(pendingWrite({ policy: "review", files: [], applied: false })).toBe("none");
    expect(pendingWrite({ policy: "review", files: [{ baseHash: "" }], applied: false, refused: true })).toBe("refused");
    expect(pendingWrite({ policy: "review", files: [{ baseHash: "abc" }], applied: false, conflict: true })).toBe("conflict");
  });
});
