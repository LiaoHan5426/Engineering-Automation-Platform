// @vitest-environment jsdom
/** Framework props remain declared and reactive across the deferred terminal load. */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { defineComponent, h, shallowRef, type ComponentPublicInstance } from "vue";
import { act, cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import type { TerminalBodyProps } from "../src/client/terminal.tsx";
import { LazyTerminalBody } from "../src/client/LazyTerminalBody.tsx";

const observed = vi.hoisted(() => ({
  load: Promise.withResolvers<undefined>(),
  loaded: vi.fn(),
  mounted: vi.fn(),
  unmounted: vi.fn(),
  received: vi.fn<(props: TerminalBodyProps) => void>(),
}));

vi.mock("../src/client/terminal.tsx", async () => {
  observed.loaded();
  await observed.load.promise;
  const { defineComponent, h, onUnmounted, watchEffect } = await import("vue");
  return {
    TerminalBody: defineComponent(
      (props: TerminalBodyProps, { attrs, slots }) => {
        observed.mounted();
        onUnmounted(observed.unmounted);
        watchEffect(() => {
          observed.received({ ...props });
        });
        return () => h("section", { ...attrs }, slots.default?.());
      },
      { props: ["useTabInfo", "useTerminal", "useTheme", "view", "t"], inheritAttrs: false },
    ),
  };
});

afterEach(cleanup);

function bodyProps(): TerminalBodyProps {
  return {
    useTabInfo: vi.fn<TerminalBodyProps["useTabInfo"]>(),
    useTerminal: () => {
      throw new Error("The forwarding fixture does not read terminal state");
    },
    useTheme: () => {
      throw new Error("The forwarding fixture does not read theme state");
    },
    view: vi.fn<TerminalBodyProps["view"]>(),
    t: vi.fn<TerminalBodyProps["t"]>(),
  };
}

it("loads on mount and forwards declared props, updates, slots, attributes and teardown", async () => {
  expect(observed.loaded).not.toHaveBeenCalled();
  const declared = "props" in LazyTerminalBody ? LazyTerminalBody.props : undefined;
  expect(declared).toEqual(["useTabInfo", "useTerminal", "useTheme", "view", "t"]);
  const owner = shallowRef<ComponentPublicInstance | null>(null);
  const current = shallowRef({ props: bodyProps(), attribute: "first", text: "first slot" });
  const Host = defineComponent(
    () => () =>
      h(
        LazyTerminalBody,
        {
          ...current.value.props,
          ref: owner,
          "data-owner": current.value.attribute,
        },
        { default: () => h("span", current.value.text) },
      ),
  );
  const view = render(h(Host));
  await vi.waitFor(() => {
    expect(observed.loaded).toHaveBeenCalledTimes(1);
  });
  expect(observed.received).not.toHaveBeenCalled();
  const pending = bodyProps();
  await act(() => {
    current.value = { ...current.value, props: pending };
  });
  observed.load.resolve(undefined);
  await vi.waitFor(() => {
    expect(observed.received).toHaveBeenLastCalledWith(pending);
  });
  expect(observed.loaded).toHaveBeenCalledTimes(1);
  expect(observed.mounted).toHaveBeenCalledTimes(1);
  expect(view.getByText("first slot").parentElement?.dataset.owner).toBe("first");
  expect(owner.value?.$el).toBe(view.getByText("first slot").parentElement);

  const updated = bodyProps();
  await act(() => {
    current.value = { props: updated, attribute: "second", text: "second slot" };
  });
  expect(observed.received).toHaveBeenLastCalledWith(updated);
  expect(observed.loaded).toHaveBeenCalledTimes(1);
  expect(observed.mounted).toHaveBeenCalledTimes(1);
  expect(view.getByText("second slot").parentElement?.dataset.owner).toBe("second");
  expect(owner.value?.$el).toBe(view.getByText("second slot").parentElement);
  view.unmount();
  expect(owner.value).toBeNull();
  expect(observed.unmounted).toHaveBeenCalledTimes(1);
});
