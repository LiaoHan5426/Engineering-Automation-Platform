// @vitest-environment jsdom
import { act, cleanup, render, bindDirectory } from "./vue-render.client.ts";
import { fireEvent, screen } from "@testing-library/dom";
import { h, defineComponent, onMounted } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import type { ModelSelectProps } from "../src/client/ModelSelect.tsx";
import type { OwnerOf } from "@deepseek-ai/dsh-client-ui-slots";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { ModelDirectoryState } from "../src/client/directory.ts";
import { ModelSelect } from "../src/client/ModelSelect.tsx";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
async function setup(autoFocus = true) {
  const directory = createSnapshotStore<ModelDirectoryState>({
    current: { provider: "fixture", model: "fixture" },
    routable: true,
    groups: [{ id: "fixture", name: "Fixture", models: [{ id: "fixture", name: "Fixture" }] }],
    failures: [],
    status: "ready",
    pending: null,
    error: null,
  });
  const FocusedToggle = defineComponent(() => {
    let button: HTMLButtonElement | null = null;
    onMounted(() => {
      if (autoFocus) button?.focus();
    });
    return () =>
      h(
        "button",
        {
          type: "button",
          role: "switch",
          "aria-checked": "false",
          ref: (node) => {
            if (node instanceof HTMLButtonElement) button = node;
          },
          onClick: change,
        },
        "Fixture setting",
      );
  });
  const change = vi.fn();
  const select = vi.fn();
  const renderSlot: ModelSelectProps["renderSlot"] = (name, owner, options) => {
    if (name === "conversation.input.model.options") {
      const controls = owner as object as OwnerOf<"conversation.input.model.options">;
      return h(
        "button",
        {
          type: "button",
          role: "menuitem",
          "data-model-menu-pane": "fixture",
          disabled: controls.locked,
          onClick: () => {
            controls.openPane({ key: "fixture", title: "Fixture settings" });
          },
        },
        ["Fixture settings"],
      );
    }
    if (name === "conversation.input.model.pane") {
      const controls = owner as object as OwnerOf<"conversation.input.model.pane">;
      expect(options?.entryKey).toBe("fixture");
      return [h(FocusedToggle, { disabled: controls.locked }), h("p", {}, ["Fixture explanation"])];
    }
    return options?.fallback ?? null;
  };
  render(
    h(
      ModelSelect,
      {
        locked: false,
        available: true,
        useDirectory: bindDirectory(directory),
        load: vi.fn(),
        select: select,
        resolveText: (text) => (typeof text === "string" ? text : text.en),
        t: makeTranslate(en),
        renderSlot: renderSlot,
      },
      { default: () => [] },
    ),
  );
  const trigger = screen.getByRole("button", { name: /^Select model/ });
  await act(() => fireEvent.click(trigger));
  return { trigger, change, select, directory };
}
it("dispatches a keyed page and returns focus to its invoking summary on Escape", async () => {
  const { trigger, change, select } = await setup();
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  const toggle = screen.getByRole("switch");
  expect(document.activeElement).toBe(toggle);
  expect(screen.getByRole("group", { name: "Fixture settings" })).toBeTruthy();
  await act(() => fireEvent.blur(toggle, { relatedTarget: null }));
  expect(screen.getByText("Fixture explanation")).toBeTruthy();
  await act(() => fireEvent.keyDown(toggle, { key: "Escape" }));
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Fixture settings" }));
  expect(screen.queryByRole("switch")).toBeNull();
  await act(() => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(change).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
it("keeps the owned return focus when removing its focused detail control emits a null blur", async () => {
  const { trigger } = await setup();
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  const toggle = screen.getByRole("switch");
  expect(document.activeElement).toBe(toggle);
  let removalBlur = 0;
  const removeChild = Node.prototype.removeChild;
  const removal = vi.spyOn(Node.prototype, "removeChild").mockImplementation(function <
    T extends Node,
  >(this: Node, child: T): T {
    if (child.contains(toggle)) {
      // Chromium dispatches this while the old control is still connected, after
      // back() changes pane state and before Vue's post watcher restores focus.
      expect(toggle.isConnected).toBe(true);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      removalBlur++;
      toggle.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    }
    return removeChild.call(this, child) as T;
  });
  try {
    await act(() => fireEvent.keyDown(toggle, { key: "Escape" }));
    expect(removalBlur).toBe(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const summary = screen.getByRole("menuitem", { name: "Fixture settings" });
    expect(document.activeElement).toBe(summary);
    await act(() => fireEvent.keyDown(summary, { key: "Escape" }));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  } finally {
    removal.mockRestore();
  }
});
it("closes immediately for an outside focus target during a pending pane return", async () => {
  const { trigger } = await setup();
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  const toggle = screen.getByRole("switch");
  await act(() => {
    fireEvent.keyDown(toggle, { key: "Escape" });
    toggle.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true"); // DOM is not committed yet.
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
it("closes a settled root menu on a null blur without a pending pane handoff", async () => {
  const { trigger } = await setup();
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  await act(() => fireEvent.keyDown(screen.getByRole("switch"), { key: "Escape" }));
  await act(() => {
    screen
      .getByRole("menuitem", { name: "Fixture settings" })
      .dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
it("keeps focus on the page surface when the page places none, so Escape still returns", async () => {
  await setup(false);
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  const surface = screen.getByRole("group", { name: "Fixture settings" });
  expect(document.activeElement).toBe(surface);
  await act(() => fireEvent.keyDown(surface, { key: "Escape" }));
  expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Fixture settings" }));
});
it("closes a detail pane on an outside touch press that dispatches no mousedown", async () => {
  const { trigger } = await setup();
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  await act(() => fireEvent.blur(screen.getByRole("switch"), { relatedTarget: null }));
  await act(() => fireEvent.pointerDown(screen.getByText("Fixture explanation")));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await act(() => fireEvent.pointerDown(document.body));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
it.each([false, true])(
  "closes a detail pane on Tab without changing its setting (shift: %s)",
  async (shiftKey) => {
    const { trigger, change } = await setup();
    await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
    await act(() => fireEvent.keyDown(screen.getByRole("switch"), { key: "Tab", shiftKey }));
    await act(async () => {});
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(change).not.toHaveBeenCalled();
  },
);
it("keeps the baseline model-save lock on both summary and detail controls", async () => {
  const { directory } = await setup();
  await act(() => {
    directory.update((state) => {
      state.pending = { provider: "fixture", model: "fixture" };
    });
  });
  expect(screen.getByRole("menuitem", { name: "Fixture settings" }).hasAttribute("disabled")).toBe(
    true,
  );
  await act(() => {
    directory.update((state) => {
      state.pending = null;
    });
  });
  await act(() => fireEvent.click(screen.getByRole("menuitem", { name: "Fixture settings" })));
  await act(() => {
    directory.update((state) => {
      state.pending = { provider: "fixture", model: "fixture" };
    });
  });
  expect(screen.getByRole("switch").hasAttribute("disabled")).toBe(true);
});
