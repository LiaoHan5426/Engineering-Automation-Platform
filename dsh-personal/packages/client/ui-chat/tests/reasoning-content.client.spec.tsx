import { h, Fragment, defineComponent, shallowRef, nextTick } from "vue";
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vite-plus/test";
import { cleanup } from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as dispatchDom, within } from "@testing-library/dom";
import type { MarkdownLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRenderFactories, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { createReasoningRenderFixture } from "./reasoning-render-fixture.tsx";
const CODE = "```text\nfirst line\nsecond line\n```";
const labels: MarkdownLabels = {
  code: {
    copyLabel: "Copy snippet",
    copiedLabel: "Snippet copied",
    toolbarLabels: {
      codeLabel: "Snippet",
      wrapLabel: "Wrap snippet",
      unwrapLabel: "Unwrap snippet",
    },
  },
  footnotes: "References",
};
type WrappedBodyProps = PropsRuntime<"conversation.chat.reasoning.body"> & PropsRenderFactories;
const WrappedBody = defineComponent(
  (props: WrappedBodyProps) => {
    const original = shallowRef(false);
    return () =>
      h("section", { "data-testid": "wrapper" }, [
        h(
          "button",
          {
            onClick: () => {
              original.value = !original.value;
            },
          },
          ["Switch body"],
        ),
        props.renderFactorySlot("conversation.chat.reasoning.content", {
          text: original.value ? props.text : `Wrapped ${props.text}`,
          running: props.running,
        }),
      ]);
  },
  { props: ["text", "running", "renderFactorySlot"] },
);
afterEach(cleanup);
describe("reasoning Content Factory", () => {
  it("renders without a Session Provider and uses the current Chat labels by default", async () => {
    const b = await createReasoningRenderFixture("en");
    const view = await b.render(
      b.renderFactorySlot("conversation.chat.reasoning.content", { text: CODE, running: false }),
    );
    expect(view.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Wrap lines" })).toBeTruthy();
    expect(view.container.querySelector('[data-markdown-variant="compact"]')).not.toBeNull();
    expect(b.runtime.factoryOf("conversation.chat.reasoning.content").scope).toBe("root");
  });
  it("uses complete caller labels unchanged and returns to defaults when they are omitted", async () => {
    const b = await createReasoningRenderFixture("en");
    const view = await b.render(
      b.renderFactorySlot("conversation.chat.reasoning.content", {
        text: CODE,
        running: false,
        labels,
      }),
    );
    const markdown = view.container.querySelector('[data-markdown-variant="compact"]');
    expect(view.getByRole("button", { name: "Copy snippet" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Wrap snippet" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Copy" })).toBeNull();
    await view.rerender(
      b.renderFactorySlot("conversation.chat.reasoning.content", { text: CODE, running: false }),
    );
    expect(view.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Copy snippet" })).toBeNull();
    expect(view.container.querySelector('[data-markdown-variant="compact"]')).toBe(markdown);
  });
  it("keeps code wrapping state independent between two Factory occurrences", async () => {
    const b = await createReasoningRenderFixture("en");
    const view = await b.render(
      h(Fragment, null, [
        h("section", { "data-testid": "first" }, [
          b.renderFactorySlot("conversation.chat.reasoning.content", {
            text: CODE,
            running: false,
          }),
        ]),
        h("section", { "data-testid": "second" }, [
          b.renderFactorySlot("conversation.chat.reasoning.content", {
            text: CODE,
            running: false,
          }),
        ]),
      ]),
    );
    const first = within(view.getByTestId("first")).getByRole("button", { name: "Wrap lines" });
    const second = within(view.getByTestId("second")).getByRole("button", { name: "Wrap lines" });
    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(first);
    expect(first.getAttribute("aria-pressed")).toBe("false");
    expect(second.getAttribute("aria-pressed")).toBe("true");
  });
  it("restores the registered default after a wrapping plugin unloads and removes the Factory with its owner", async () => {
    const b = await createReasoningRenderFixture("en");
    const view = await b.render(
      b.renderSlot("conversation.chat.reasoning.body", {
        rawText: "Original model thought",
        text: "Original thought",
        running: false,
      }),
    );
    expect(view.getByText("Original thought")).toBeTruthy();
    expect(b.runtime.slots.entries("conversation.chat.reasoning.body")[0]?.options.priority).toBe(
      100,
    );
    const plugin = await b.runtime.mount({
      inject: ["slots"],
      apply: (ctx) => {
        ctx.slots.inject("conversation.chat.reasoning.body", () =>
          ctx.slots.register(
            {
              name: "conversation.chat.reasoning.body",
            },
            WrappedBody,
          ),
        );
      },
    });
    expect(view.getByText("Wrapped Original thought")).toBeTruthy();
    expect(view.queryByText("Original thought", { exact: true })).toBeNull();
    await fireEvent.click(view.getByRole("button", { name: "Switch body" }));
    expect(view.getByText("Original thought")).toBeTruthy();
    await plugin.dispose();
    expect(view.queryByTestId("wrapper")).toBeNull();
    expect(view.getByText("Original thought")).toBeTruthy();
    expect(view.queryAllByRole("button")).toHaveLength(0);
    view.unmount();
    await b.owner.dispose();
    expect(b.runtime.slots.entries("conversation.chat.reasoning.body")).toHaveLength(0);
    expect(() => b.runtime.factoryOf("conversation.chat.reasoning.content")).toThrow(
      "no definition",
    );
  });
});

const fireEvent = {
  async click(...args: Parameters<typeof dispatchDom.click>) {
    await nextTick();
    const result = dispatchDom.click(...args);
    await nextTick();
    return result;
  },
};
