import { nextTick } from "vue";
import { h, Fragment, shallowRef, computed } from "vue";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { bindSnapshotSelector, makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import {
  AssistantMarkdown,
  type AssistantMarkdownProps,
} from "../src/client/chat/AssistantMarkdown.tsx";
import { useDetailedPresentation } from "./presentation-fixture.client.ts";
import { unusedImageLoader } from "./reasoning-component-fixture.tsx";
import { useDisclosure } from "../src/client/chat/use-disclosure.ts";
import { useSearchableHidden } from "../src/client/chat/searchable-hidden.ts";
import { ActivityPill, UsagePill, type StatPillProps } from "../src/client/chat/StatsPills.tsx";
import { zh } from "../src/client/locale.ts";
import { chatSnapshotFixture } from "./chat-snapshot-fixture.client.ts";
const t: AssistantMarkdownProps["t"] = makeTranslate(zh, commonZh);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("render branch tails", () => {
  it("AssistantMarkdown reasoning row is ok-state when not the streaming tail", async () => {
    const view = await render(
      h(AssistantMarkdown, {
        renderSlot: () => null,
        useDisclosure: useDisclosure,
        useGroupAction: useSearchableHidden,
        usePresentation: useDetailedPresentation,
        t: t,
        blocks: [
          { kind: "reasoning", text: "done thinking" },
          { kind: "text", text: "answer" },
        ],
        streaming: true,
        loadImage: unusedImageLoader,
      }),
    );
    // reasoning at index 0 with a later block: running is false → ok state.
    expect(view.container.querySelector('[data-state="ok"]')).not.toBeNull();
  });
  it("composer stats fall back to window-node counts and drop the usage pill without projections", async () => {
    // No sessionStats key → the window fold supplies the counts (the
    // assembly-without-the-unit fallback). Node `usage` is deliberately
    // ignored: billing rides the durable tokenUsage projection, so an absent
    // projection leaves counts only.
    const nodes = [
      { kind: "assistant", seq: 1, time: 1, turn: 1, step: 1, blocks: [] },
      {
        kind: "assistant",
        seq: 2,
        time: 2,
        turn: 1,
        step: 2,
        blocks: [],
        usage: { inputTokens: 4, outputTokens: 6 },
      },
      {
        kind: "assistant",
        seq: 3,
        time: 3,
        turn: 2,
        step: 1,
        blocks: [],
        usage: { inputTokens: 5 },
      },
    ] as const;
    const snap = chatSnapshotFixture({ nodes });
    const source = { getSnapshot: () => snap, subscribe: () => () => {} };
    const pillProps: StatPillProps = {
      usePerformanceUsage: (selector) => computed(() => selector("detailed")),
      t,
      useChat: bindSnapshotSelector(source),
      useProjection: () => shallowRef(undefined),
    };
    const view = await render(
      h(Fragment, null, [h(ActivityPill, { ...pillProps }), h(UsagePill, { ...pillProps })]),
    );
    expect(view.container.textContent).toBe("2 轮 3 步");
    // Window-fold counts carry no timed figure, so the pill is a static reading.
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });
  it("AssistantMarkdown reasoning as the streaming tail renders the running ring", async () => {
    const view = await render(
      h(AssistantMarkdown, {
        renderSlot: () => null,
        useDisclosure: useDisclosure,
        useGroupAction: useSearchableHidden,
        usePresentation: useDetailedPresentation,
        t: t,
        blocks: [{ kind: "reasoning", text: "still thinking" }],
        streaming: true,
        loadImage: unusedImageLoader,
      }),
    );
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull();
  });
});

async function render(...args: Parameters<typeof renderNative>) {
  const view = renderNative(...args);
  await nextTick();
  return view;
}
