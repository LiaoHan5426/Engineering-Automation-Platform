// @vitest-environment jsdom
/** Agent-preset visibility through native Session bindings and keyed snapshot hooks. */
import { defineComponent, h, shallowRef } from "vue";
import { expect, it, vi } from "vite-plus/test";
import { SlotTestRuntime } from "@deepseek-ai/dsh-client-test-runtime";
import type { SessionReference } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ComposedProps } from "@deepseek-ai/dsh-client-ui-slots";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import { AgentPresetSeat } from "../src/client/AgentPresetSeat.tsx";
import type { AgentPresetSeatState } from "../src/client/seat-store.ts";
import { en, zh } from "../src/client/locales.ts";
import { brandString } from "@deepseek-ai/dsh-brand";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { act } from "../../../test-support/client-runtime/src/vue-test.ts";

it("offers the preset before binding and only for a main-view Session after binding", async () => {
  const runtime = await SlotTestRuntime.create();
  try {
    const locale = new LocaleRuntime(runtime.ctx);
    locale.setLocale("en");
    runtime.slots.installLocale(locale);
    runtime.ctx.effect(() => locale.register("settings.agentPreset", { en, zh }));
    const seat = createSnapshotStore<AgentPresetSeatState>({
      current: "standard",
      options: [{ id: "standard" }],
      busy: false,
      error: null,
      introduce: false,
    });
    const target = shallowRef<SessionReference>();
    const load = vi.fn(async () => {});
    type RootProps = ComposedProps<
      "root",
      never,
      "conversation.hero.agentPreset",
      undefined,
      object
    >;
    const Root = defineComponent(
      (props: RootProps) => () =>
        target.value === undefined
          ? props.renderSlot("conversation.hero.agentPreset", {})
          : h(
              props.SessionProvider,
              {
                session: target.value,
              },
              { default: () => props.renderSlot("conversation.hero.agentPreset", {}) },
            ),
      {
        inheritAttrs: false,
        props: ["SessionProvider", "renderSlot"],
      },
    );
    await runtime.root.declare(
      {
        "conversation.hero.agentPreset": { kind: "single", scope: "session-maybe" },
      },
      Root,
    );
    runtime.ctx.effect(() =>
      runtime.slots.register(
        {
          name: "conversation.hero.agentPreset",
          locale: "settings.agentPreset",
          inject: () => ({
            hooks: { agentPresetSeat: seat, developerTools: createSnapshotStore(false) },
            load,
            select: async () => undefined,
            dismissRefusal: () => {},
            introduced: () => {},
          }),
        },
        AgentPresetSeat,
      ),
    );
    const view = runtime.renderRoot();
    expect(view.getByRole("button", { name: "Standard mode" })).toBeTruthy();

    const mainId = brandString<SessionId>("main");
    const otherId = brandString<SessionId>("other");
    await runtime.sessions.add({ id: mainId, summary: { blank: true } });
    const main = runtime.sessions.retainFor(runtime.ctx, mainId, { source: "mainView" });
    await main.ready;
    await act(() => {
      target.value = main;
    });
    expect(view.getByRole("button", { name: "Standard mode" })).toBeTruthy();

    await runtime.sessions.add({ id: otherId, summary: { blank: true } });
    const other = runtime.sessions.retainFor(runtime.ctx, otherId, { source: "testView" });
    await other.ready;
    await act(() => {
      target.value = other;
    });
    expect(view.queryByRole("button", { name: "Standard mode" })).toBeNull();

    const otherMain = runtime.sessions.retainFor(runtime.ctx, otherId, { source: "mainView" });
    await otherMain.ready;
    await act(() => {});
    expect(view.getByRole("button", { name: "Standard mode" })).toBeTruthy();
    await act(() => {
      otherMain.release();
    });
    expect(view.queryByRole("button", { name: "Standard mode" })).toBeNull();
    await act(() => {
      target.value = undefined;
    });
    expect(view.getByRole("button", { name: "Standard mode" })).toBeTruthy();
    expect(load).toHaveBeenCalled();
  } finally {
    await runtime.dispose();
  }
});
