import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
/** Real Slot/Factory rendering seats for standalone reasoning component tests. */
import { defineComponent, shallowRef, h, type VNodeChild } from "vue";
import { act } from "../../../test-support/client-runtime/src/vue-test.ts";
import { onTestFinished } from "vitest";
import { SlotTestRuntime } from "@deepseek-ai/dsh-client-test-runtime";
import { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import { en as commonEn } from "@deepseek-ai/dsh-client-locale/src/locales/en.ts";
import { zh as commonZh } from "@deepseek-ai/dsh-client-locale/src/locales/zh.ts";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { PropsRenderFactories, PropsRenderSlots } from "@deepseek-ai/dsh-client-ui-slots";
import { en, NS, zh } from "../src/client/locale.ts";
import {
  derivePresentationPolicy,
  type CollapseTiming,
  type FoldedReplies,
} from "../src/client/presentation-policy.ts";
import { registerChatNodeRenderers } from "../src/client/chat/register-node-renderers.ts";
import type { PerformanceUsageMode, TranscriptViewMode } from "../src/chat-settings.ts";
import { brandString } from "@deepseek-ai/dsh-brand";

type RenderSeats = GlobalStandardProps &
  PropsRenderSlots<"conversation.chat.reasoning.body"> &
  PropsRenderFactories;

interface ReasoningRenderFixture {
  runtime: SlotTestRuntime;
  owner: Awaited<ReturnType<SlotTestRuntime["mount"]>>;
  locale: LocaleRuntime;
  render(content: VNodeChild): Promise<ReturnType<SlotTestRuntime["renderRoot"]>>;
  renderSlot: RenderSeats["renderSlot"];
  renderFactorySlot: RenderSeats["renderFactorySlot"];
}

/**
 * Bind the shipped default Body and Content Factory through the production renderer.
 * @param language - active locale for the official default labels.
 * @returns rendering seats and the registry for replacement/lifecycle assertions.
 */
export async function createReasoningRenderFixture(
  language = "zh",
): Promise<ReasoningRenderFixture> {
  const runtime = await SlotTestRuntime.create();
  onTestFinished(() => runtime.dispose());
  const locale = new LocaleRuntime(runtime.ctx);
  runtime.ctx.provide("locale", locale);
  locale.register("common", { en: commonEn, zh: commonZh });
  locale.register(NS, { en, zh });
  locale.setLocale(language);
  runtime.slots.installLocale(locale);
  const captured: { seats?: RenderSeats; setContent?: (content: VNodeChild) => void } = {};
  const content = shallowRef<VNodeChild>(null);
  await runtime.root.declare(
    {
      "conversation.chat.reasoning.body": { kind: "single", scope: "session" },
    },
    defineComponent(
      (props: RenderSeats) => {
        captured.seats = props;
        captured.setContent = (next) => {
          content.value = next;
        };
        return () => content.value;
      },
      { props: ["renderSlot", "renderFactorySlot", "SessionProvider"] },
    ),
  );
  const owner = await runtime.mount({
    inject: ["slots"],
    apply: (ctx) => {
      registerChatNodeRenderers(
        ctx,
        createSnapshotStore<PerformanceUsageMode>("detailed"),
        derivePresentationPolicy(
          createSnapshotStore<TranscriptViewMode>("detailed"),
          createSnapshotStore<CollapseTiming>("completion"),
          createSnapshotStore<FoldedReplies>("all"),
        ),
      );
    },
  });
  await runtime.sessions.add({ id: "reasoning-fixture" });
  const session = runtime.sessions.retainFor(
    runtime.ctx,
    brandString<SessionId>("reasoning-fixture"),
  );
  const view = runtime.renderRoot();
  const { seats, setContent } = captured;
  if (seats === undefined || setContent === undefined)
    throw new Error("reasoning fixture root did not render");
  const { SessionProvider } = seats;
  const renderSlot: RenderSeats["renderSlot"] = (key, props, options) =>
    h(SessionProvider, { session }, { default: () => seats.renderSlot(key, props, options) });
  const update = async (content: VNodeChild): Promise<void> => {
    await act(() => {
      setContent(content);
    });
  };
  const render = async (content: VNodeChild) => {
    await update(content);
    return { ...view, rerender: update };
  };
  return { runtime, owner, locale, render, renderSlot, renderFactorySlot: seats.renderFactorySlot };
}
