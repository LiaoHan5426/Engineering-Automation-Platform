// @vitest-environment jsdom
import { h, nextTick, shallowRef, computed } from "vue";
import type { VNodeChild } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import {
  render as nativeRender,
  cleanup,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import type { TabId } from "@deepseek-ai/dsh-client-ui-dockkit";
import { BrowserNavigation } from "../src/client/browser/BrowserNavigation.ts";
import type { BrowserTitleProps } from "../src/client/view/BrowserTitle.tsx";
import { BrowserTitle } from "../src/client/view/BrowserTitle.tsx";
const TAB = "tab" as TabId;
const snapshot = shallowRef(BrowserNavigation.empty());
afterEach(cleanup);
function props(entry = false): BrowserTitleProps {
  const state = entry
    ? {
        ...BrowserNavigation.empty(),
        entries: [{ kind: "https" as const, url: "https://example.test/", title: "Loaded page" }],
        index: 0,
      }
    : BrowserNavigation.empty();
  snapshot.value = state;
  return {
    useTabInfo: () => shallowRef({ tab: { id: TAB, title: "Browser" } }),
    useStore: (selector) => computed(() => selector({ byTab: { [TAB]: snapshot.value } })),
  } as BrowserTitleProps;
}
describe("BrowserTitle", () => {
  it("uses the current page title and falls back to the tab title", async () => {
    const view = await render(h(BrowserTitle, { ...props(true) }));
    expect(view.getByText("Loaded page")).toBeDefined();
    await view.rerender(h(BrowserTitle, { ...props() }));
    expect(view.getByText("Browser")).toBeDefined();
  });
});
async function render(node: VNodeChild) {
  const view = nativeRender(node);
  await nextTick();
  return view;
}
