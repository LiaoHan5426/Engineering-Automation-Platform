// @vitest-environment jsdom
import { defineComponent, h, Fragment, effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fireEvent, within } from "@testing-library/dom";
import {
  cleanupVue as cleanup,
  flushVue as act,
  renderVue,
} from "../../ui-primitives/tests/vue-render.ts";
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...within(document.body) };
}
import { createSnapshotStore, type ObservableSnapshot } from "@deepseek-ai/dsh-client-store";
import type { UseDisclosure } from "../src/client/contract/slots.ts";
import { bindDisclosure, useDisclosure } from "../src/client/chat/use-disclosure.ts";
afterEach(cleanup);
const Disclosure = defineComponent(
  (props: { useDisclosure: UseDisclosure; label: string }) => {
    const disclosure = props.useDisclosure();
    return () =>
      h(
        "button",
        {
          "aria-expanded": disclosure.value.expanded,
          onClick: disclosure.value.toggle,
        },
        [props.label],
      );
  },
  { props: ["useDisclosure", "label"] },
);
const Forward = defineComponent(
  (props: { useDisclosure: UseDisclosure; label: string }) => () =>
    h(Disclosure, {
      ...props,
    }),
  { props: ["useDisclosure", "label"] },
);
describe("injected disclosure state", () => {
  it("supports local explicit reveal and collapse without a reset source", async () => {
    const Group = defineComponent(
      (props: { label: string }) => {
        const disclosure = useDisclosure();
        return () =>
          h(Fragment, null, [
            h("output", null, [disclosure.value.expanded ? props.label : "Closed"]),
            h(
              "button",
              {
                onClick: () => {
                  disclosure.value.setExpanded(true);
                },
              },
              ["Reveal"],
            ),
            h(
              "button",
              {
                onClick: () => {
                  disclosure.value.setExpanded(false);
                },
              },
              ["Collapse"],
            ),
          ]);
      },
      { props: ["label"] },
    );
    const view = render(
      h(Group, {
        label: "First",
      }),
    );
    expect(view.getByText("Closed")).toBeTruthy();
    await act(() => fireEvent.click(view.getByRole("button", { name: "Reveal" })));
    expect(view.getByText("First")).toBeTruthy();
    await act(() => {
      view.rerender(
        h(Group, {
          label: "Updated",
        }),
      );
    });
    expect(view.getByText("Updated")).toBeTruthy();
    await act(() => fireEvent.click(view.getByRole("button", { name: "Collapse" })));
    expect(view.getByText("Closed")).toBeTruthy();
  });
  it("subscribes only where the forwarded Hook is called and releases those subscriptions", async () => {
    const reset = createSnapshotStore(0);
    const release = vi.fn();
    const subscribe = vi.fn((listener: () => void) => {
      const off = reset.subscribe(listener);
      return () => {
        off();
        release();
      };
    });
    const source: ObservableSnapshot<number> = {
      getSnapshot: () => reset.getSnapshot(),
      subscribe,
    };
    const useDisclosure = bindDisclosure(source);
    expect(subscribe).not.toHaveBeenCalled();
    const view = render(
      h(Forward, {
        useDisclosure: useDisclosure,
        label: "Details",
      }),
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
    const button = view.getByRole("button", { name: "Details" });
    await act(() => fireEvent.click(button));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await act(() => {
      reset.set(1);
    });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(view.getByRole("button", { name: "Details" })).toBe(button);
    expect(subscribe).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("keeps each disclosure independent while resetting all consumers of the same source", async () => {
    const reset = createSnapshotStore(0);
    const otherReset = createSnapshotStore(0);
    const useDisclosure = bindDisclosure(reset);
    const useOtherDisclosure = bindDisclosure(otherReset);
    const view = render(
      h(Fragment, null, [
        h(Forward, {
          useDisclosure: useDisclosure,
          label: "First",
        }),
        h(Forward, {
          useDisclosure: useDisclosure,
          label: "Second",
        }),
        h(Forward, {
          useDisclosure: useOtherDisclosure,
          label: "Other Turn",
        }),
      ]),
    );
    const first = view.getByRole("button", { name: "First" });
    const second = view.getByRole("button", { name: "Second" });
    const other = view.getByRole("button", { name: "Other Turn" });
    await act(() => fireEvent.click(first));
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    await act(() => fireEvent.click(second));
    await act(() => fireEvent.click(other));
    await act(() => {
      reset.set(1);
    });
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    expect(other.getAttribute("aria-expanded")).toBe("true");
    await act(() => fireEvent.click(first));
    expect(first.getAttribute("aria-expanded")).toBe("true");
    await act(() => fireEvent.click(first));
    expect(first.getAttribute("aria-expanded")).toBe("false");
    await act(() => fireEvent.click(second));
    await act(() => {
      reset.set(2);
    });
    expect(second.getAttribute("aria-expanded")).toBe("false");
  });
});
it("releases a subscription returned after its effect scope stops during setup", () => {
  const scope = effectScope();
  const reset = createSnapshotStore(0);
  const getSnapshot = vi.fn(() => reset.getSnapshot());
  const release = vi.fn();
  const source: ObservableSnapshot<number> = {
    getSnapshot,
    subscribe(listener) {
      const unsubscribe = reset.subscribe(listener);
      scope.stop();
      reset.set(1);
      return () => {
        unsubscribe();
        release();
      };
    },
  };
  const disclosure = scope.run(() => bindDisclosure(source)());
  expect(disclosure).toBeDefined();
  expect(release).toHaveBeenCalledOnce();
  expect(getSnapshot).toHaveBeenCalledOnce();
  reset.set(2);
  scope.stop();
  expect(release).toHaveBeenCalledOnce();
  expect(getSnapshot).toHaveBeenCalledOnce();
});
it("closes the subscription setup race, retains action identities and ignores stale callbacks", () => {
  const scope = effectScope();
  let version = 0;
  let notify: (() => void) | undefined;
  const release = vi.fn();
  const source = {
    getSnapshot() {
      expect(this).toBe(source);
      return version;
    },
    subscribe(listener: () => void) {
      expect(this).toBe(source);
      notify = listener;
      version = 1;
      return release;
    },
  };
  const disclosure = scope.run(() => bindDisclosure(source)())!;
  const actions = disclosure.value;
  actions.setExpanded(true);
  expect(disclosure.value.expanded).toBe(true);
  version = 2;
  notify!();
  expect(disclosure.value.expanded).toBe(false);
  expect(disclosure.value.toggle).toBe(actions.toggle);
  expect(disclosure.value.setExpanded).toBe(actions.setExpanded);
  actions.toggle();
  expect(disclosure.value.expanded).toBe(true);
  scope.stop();
  expect(release).toHaveBeenCalledOnce();
  version = 3;
  notify!();
  expect(disclosure.value.expanded).toBe(true);
});
