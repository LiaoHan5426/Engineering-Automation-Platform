// @vitest-environment jsdom
import { h } from "vue";
import { act, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent, screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vite-plus/test";
import { ShareCapabilitiesPicker } from "../src/client/ShareCapabilitiesPicker.tsx";
import type { OfferedPlugin } from "../src/client/share-types.ts";
const t = ((key: string) => key) as never;
const offered: readonly OfferedPlugin[] = [
  {
    plugin: "mekGit",
    endpoints: ["mekGit/commit"],
    descriptions: { "mekGit/commit": "提交当前工作区" },
  },
];
describe("plugin method picker", () => {
  it("renders a partial plugin with its method description", async () => {
    const onChange = vi.fn();
    render(
      h(ShareCapabilitiesPicker, {
        offered: offered,
        access: "custom",
        selection: [{ plugin: "mekGit", mode: "selected", endpoints: ["mekGit/commit"] }],
        disabled: false,
        controlId: "capabilities",
        onAccessChange: vi.fn(),
        onChange: onChange,
        t: t,
      }),
    );
    expect(screen.getByText("提交当前工作区")).toBeTruthy();
    expect(screen.getByText("commit")).toBeTruthy();
    await act(() => fireEvent.click(screen.getByRole("checkbox")));
    expect(onChange).toHaveBeenCalled();
  });
  it("reports the global switch as none when the last exposed plugin closes", async () => {
    const onAccessChange = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      h(ShareCapabilitiesPicker, {
        offered: offered,
        access: "custom",
        selection: [{ plugin: "mekGit", mode: "all" }],
        disabled: false,
        controlId: "capabilities",
        onAccessChange: onAccessChange,
        onChange: onChange,
        t: t,
      }),
    );
    await act(() =>
      fireEvent.click(
        within(container).getByRole("tab", { name: "dialog.capabilities.tier.none" }),
      ),
    );
    expect(onAccessChange).toHaveBeenCalledWith("none");
    expect(onChange).toHaveBeenCalledWith([]);
  });
  it("renders nothing when every offered plugin has no methods", () => {
    const { container } = render(
      h(ShareCapabilitiesPicker, {
        offered: [{ plugin: "empty", endpoints: [] }],
        access: "none",
        selection: [],
        disabled: false,
        controlId: "capabilities",
        onAccessChange: vi.fn(),
        onChange: vi.fn(),
        t: t,
      }),
    );
    expect(container.childElementCount).toBe(0);
  });
});
