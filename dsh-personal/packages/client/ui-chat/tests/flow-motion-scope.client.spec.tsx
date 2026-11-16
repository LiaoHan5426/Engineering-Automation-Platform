import { h, defineComponent, nextTick, shallowRef, effectScope } from "vue";
import { useMotionHidden } from "../src/client/chat/flow-motion.ts";
// @vitest-environment jsdom
/** Fold coordination belongs to its viewport; ordinary searchable hiding stays immediate. */
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatViewport } from "../src/client/chat/use-chat-viewport.ts";
import { ScrollFollow } from "../src/client/chat/use-scroll-follow.ts";
import { useSearchableHidden } from "../src/client/chat/searchable-hidden.ts";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function viewport() {
  const list = document.createElement("div");
  const column = document.createElement("div");
  const row = document.createElement("div");
  const spacer = document.createElement("div");
  spacer.dataset.chatTurnSpacer = "";
  Object.defineProperty(row, "offsetHeight", { value: 80 });
  column.append(row);
  list.append(column, spacer);
  document.body.append(list);
  const owner = new ChatViewport();
  owner.attach(list, column);
  const unbind = owner.bindReader({
    follow: new ScrollFollow(false, 25),
    landedAtTail: vi.fn(),
    pending: () => false,
  });
  return {
    list,
    row,
    spacer,
    owner,
    dispose: () => {
      unbind();
      owner.detach();
      list.remove();
    },
  };
}
it("isolates fold anchoring and batch room between viewports", async () => {
  const first = viewport();
  const second = viewport();
  try {
    first.owner.motion.collapse(first.row, () => {
      first.row.hidden = true;
    });
    await Promise.resolve();

    expect(first.list.style.overflowAnchor).toBe("none");

    expect(first.spacer.style.height).toBe("80px");

    expect(second.list.style.overflowAnchor).toBe("");

    expect(second.spacer.style.height).toBe("");
  } finally {
    first.dispose();
    second.dispose();
  }

  expect(vi.getTimerCount()).toBe(0);
});
const Searchable = defineComponent(
  (props: { hidden: boolean }) => {
    const ref = useSearchableHidden(
      () => props.hidden,
      () => {},
    );
    return () => h("div", { ref: ref, "data-testid": "row" }, ["Details"]);
  },
  { props: ["hidden"] },
);
it("keeps ordinary searchable hiding immediate inside a motion-enabled parent", async () => {
  const view = await render(
    h("div", { "data-chat-motion": "" }, [h(Searchable, { hidden: false })]),
  );
  const row = view.getByTestId("row");
  Object.defineProperty(row, "offsetHeight", { value: 80 });
  await view.rerender(h("div", { "data-chat-motion": "" }, [h(Searchable, { hidden: true })]));

  expect(row.getAttribute("hidden")).toBe("until-found");

  expect(row.style.transition).toBe("");
  await act(() => {
    vi.runAllTimers();
  });
});
it("applies header visibility to a committed element without fold motion", async () => {
  const element = document.createElement("div");
  element.hidden = true;
  const target = shallowRef<HTMLElement | null>(element);
  const hidden = shallowRef(false);
  const scope = effectScope();
  try {
    scope.run(() => useMotionHidden(target, hidden, undefined));
    await nextTick();
    expect(element.hidden).toBe(false);
    hidden.value = true;
    await nextTick();
    expect(element.hidden).toBe(true);
    hidden.value = false;
    await nextTick();
    expect(element.hidden).toBe(false);
  } finally {
    scope.stop();
  }
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
