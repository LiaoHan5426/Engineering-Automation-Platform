import { nextTick } from "vue";
import { h, Fragment, defineComponent } from "vue";
// @vitest-environment jsdom
import {
  act,
  cleanup,
  render as renderNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import type { TranscriptViewMode } from "../src/chat-settings.ts";
import {
  COLLAPSE_TIMINGS,
  FOLDED_REPLIES,
  derivePresentationPolicy,
  presentationPolicyFor,
  type ChatPresentationPolicy,
  type CollapseTiming,
  type FoldedReplies,
} from "../src/client/presentation-policy.ts";
afterEach(cleanup);
describe("Chat presentation policy", () => {
  it.each([
    ["compact", true, "collapsed", false, false],
    ["standard", true, "collapsed", true, true],
    ["detailed", true, "history", true, true],
    ["verbose", false, "none", true, false],
  ] as const)(
    "maps %s to stable presentation capabilities",
    (mode, foldCompletedTurns, stepGrouping, settledReasoningPreview, liveProcessDetail) => {
      const policy = presentationPolicyFor(mode);
      expect(policy).toEqual({
        mode,
        collapseTiming: "completion",
        foldedReplies: "all",
        foldCompletedTurns,
        stepGrouping,
        settledReasoningPreview,
        liveProcessDetail,
      });
      expect(presentationPolicyFor(mode)).toBe(policy);
      expect(presentationPolicyFor(mode, "completion")).toBe(policy);
      expect(presentationPolicyFor(mode, "completion", "all")).toBe(policy);
      const deferred = presentationPolicyFor(mode, "next-input");
      expect(deferred).toEqual({ ...policy, collapseTiming: "next-input" });
      expect(presentationPolicyFor(mode, "next-input")).toBe(deferred);
      expect(deferred).not.toBe(policy);
      const finalOnly = presentationPolicyFor(mode, "completion", "final");
      expect(finalOnly).toEqual({ ...policy, foldedReplies: "final" });
      expect(presentationPolicyFor(mode, "completion", "final")).toBe(finalOnly);
    },
  );
  it("keeps all sixteen mode, timing, and folded-reply policies distinct and stable", () => {
    const policies = new Set<ChatPresentationPolicy>();
    for (const mode of ["compact", "standard", "detailed", "verbose"] as const) {
      for (const timing of COLLAPSE_TIMINGS) {
        for (const replies of FOLDED_REPLIES)
          policies.add(presentationPolicyFor(mode, timing, replies));
      }
    }
    expect(policies.size).toBe(16);
  });
  it("forwards all three preferences and removes their subscriptions on disposal", () => {
    const mode = createSnapshotStore<TranscriptViewMode>("compact");
    const timing = createSnapshotStore<CollapseTiming>("completion");
    const replies = createSnapshotStore<FoldedReplies>("all");
    const policy = derivePresentationPolicy(mode, timing, replies);
    const listener = vi.fn();
    const dispose = policy.subscribe(listener);
    expect(policy.getSnapshot()).toBe(presentationPolicyFor("compact"));
    mode.set("detailed");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(policy.getSnapshot()).toBe(presentationPolicyFor("detailed"));
    timing.set("next-input");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(policy.getSnapshot()).toBe(presentationPolicyFor("detailed", "next-input"));
    timing.set("next-input");
    expect(listener).toHaveBeenCalledTimes(2);
    replies.set("final");
    expect(listener).toHaveBeenCalledTimes(3);
    expect(policy.getSnapshot()).toBe(presentationPolicyFor("detailed", "next-input", "final"));
    dispose();
    mode.set("verbose");
    timing.set("completion");
    replies.set("all");
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it("renders only consumers whose selected field changes", async () => {
    const mode = createSnapshotStore<TranscriptViewMode>("compact");
    const timing = createSnapshotStore<CollapseTiming>("completion");
    const usePresentation = bindSnapshotSelector(
      derivePresentationPolicy(mode, timing, createSnapshotStore<FoldedReplies>("all")),
    );
    const foldRender = vi.fn();
    const previewRender = vi.fn();
    const Fold = defineComponent(() => {
      const selected = usePresentation((policy) => policy.foldCompletedTurns);
      return () => {
        foldRender(selected.value);
        return h("span", null, [String(selected.value)]);
      };
    });
    const Preview = defineComponent(() => {
      const selected = usePresentation((policy) => policy.settledReasoningPreview);
      return () => {
        previewRender(selected.value);
        return h("span", null, [String(selected.value)]);
      };
    });
    await render(h(Fragment, null, [h(Fold, null, []), h(Preview, null, [])]));
    expect(foldRender).toHaveBeenCalledTimes(1);
    expect(previewRender).toHaveBeenCalledTimes(1);
    await act(() => {
      mode.set("detailed");
    });
    expect(foldRender).toHaveBeenCalledTimes(1);
    expect(previewRender).toHaveBeenCalledTimes(2);
    await act(() => {
      mode.set("standard");
    });
    expect(foldRender).toHaveBeenCalledTimes(1);
    expect(previewRender).toHaveBeenCalledTimes(2);
    await act(() => {
      mode.set("compact");
    });
    expect(foldRender).toHaveBeenCalledTimes(1);
    expect(previewRender).toHaveBeenCalledTimes(3);
    await act(() => {
      timing.set("next-input");
    });
    expect(foldRender).toHaveBeenCalledTimes(1);
    expect(previewRender).toHaveBeenCalledTimes(3);
  });
});

async function render(...args: Parameters<typeof renderNative>) {
  const view = renderNative(...args);
  await nextTick();
  return view;
}
