// @vitest-environment jsdom
import { h as vueH } from "vue";
/** Document loading text and compact additional-page feedback. */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { LoadingIndicator } from "../src/client/LoadingIndicator.tsx";
afterEach(cleanup);
describe("LoadingIndicator", () => {
  it("shows the localized document status with a larger spinner", () => {
    const view = render(
      vueH(LoadingIndicator, {
        label: "文档渲染中...",
      }),
    );
    const status = view.getByRole("status", { name: "文档渲染中..." });
    expect(status.textContent).toBe("文档渲染中...");
    expect(status.querySelector("svg")?.getAttribute("width")).toBe("28");
  });
  it("keeps additional-page loading compact and accessible", () => {
    const view = render(
      vueH(LoadingIndicator, {
        inline: true,
        label: "Reading…",
      }),
    );
    const status = view.getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.getAttribute("aria-label")).toBe("Reading…");
    expect(status.querySelector('[data-state="ongoing"]')).not.toBeNull();
  });
});
