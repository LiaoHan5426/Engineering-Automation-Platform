import { describe, expect, it } from "vite-plus/test";
import { beginHandoff, builderHandoff, chatHandoff, handoffSucceeded } from "./handoff";

describe("handoff drafts", () => {
  it("records chat text without a conversation and never carries an approval", () => {
    const draft = chatHandoff("  以后再处理  ", null);
    expect(draft).toEqual({ source: "chat", sourceRef: "draft", summary: "以后再处理" });
    expect(draft && "approval" in draft).toBe(false);
    expect(chatHandoff("   ", "conversation")).toBeNull();
  });

  it("keeps two builder instances apart from the simulated card", () => {
    const alpha = builderHandoff("alpha", "结算页已改", "手工改过的正文");
    const beta = builderHandoff("beta", "目录页", "");
    expect(alpha?.sourceRef).toBe("builder-alpha");
    expect(beta?.sourceRef).toBe("builder-beta");
    expect(alpha?.summary).not.toBe(beta?.summary);
  });

  it("ignores a second click while busy and does not treat a forged grant as success", () => {
    const gate = { busy: false };
    const draft = "结算页已改";
    expect(beginHandoff(gate)).toBe(true);
    expect(beginHandoff(gate)).toBe(false);
    expect(draft).toBe("结算页已改");
    expect(handoffSucceeded({ status: "recorded", execution: "not_started", approval: "not_requested", grant: "none" })).toBe(true);
    expect(handoffSucceeded({ status: "completed", execution: "started", approval: "approved", grant: "repository.write" })).toBe(false);
  });
});
