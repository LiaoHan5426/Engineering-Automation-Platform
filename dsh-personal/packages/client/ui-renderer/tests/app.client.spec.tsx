// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { SlotTestRuntime } from "@deepseek-ai/dsh-client-test-runtime";
import { h } from "vue";

let runtime: SlotTestRuntime | undefined;

afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});

describe("native application root", () => {
  it("fails loud when the slot registry is unavailable", () => {
    const ctx = new Context();
    expect(() => ctx.slots.renderSlot("root", {})).toThrow();
  });

  it("renders the root slot tree", async () => {
    runtime = await SlotTestRuntime.create();
    await runtime.root.declare({}, () => h("div", { "data-testid": "frame" }));
    const view = runtime.renderRoot();
    expect(view.getByTestId("frame")).toBeTruthy();
  });
});
