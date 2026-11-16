// @vitest-environment jsdom
import { act, cleanup } from "../src/vue-test.ts";
import { h, defineComponent, effectScope } from "vue";
import type { SessionLiveEventEntry } from "@deepseek-ai/dsh-api-session-controller/client";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { EMPTY_CHAT_SNAPSHOT } from "@deepseek-ai/dsh-client-ui-chat/client";
import { EMPTY_CONVERSATION_SNAPSHOT } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { WorkspaceId } from "@deepseek-ai/dsh-api-workspace-controller/client";
import type { MainPanelId, PanelInfo } from "@deepseek-ai/dsh-client-ui-layout/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  allowAllAccess,
  bindSnapshotSelector,
  chatSnapshot,
  conversationSnapshot,
  SlotTestRuntime,
  usePinnedBrowserLanguages,
} from "../src/index.ts";
const originalLanguages = [...navigator.languages];
const originalLanguage = navigator.language;
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "trt.panel-info": {
      kind: "keyed";
      scope: "root";
      owner: {
        label: string;
      };
    };
  }
}
usePinnedBrowserLanguages("zh-CN", "en-US");
afterEach(cleanup);
afterAll(() => {
  expect(navigator.languages).toEqual(originalLanguages);
  expect(navigator.language).toBe(originalLanguage);
});
function entry(seq: number): SessionLiveEventEntry {
  return {
    type: "event",
    event: {
      type: "fixture/event",
      seq,
      time: seq,
      data: { seq },
      ignorable: true,
    } as unknown as SessionLiveEventEntry["event"],
  };
}
describe("fixture helpers", () => {
  it("allows every action on every resource through the hand-built access Hooks", () => {
    expect(allowAllAccess.useRemoteAccess("session/list").value).toBe(true);
    expect(allowAllAccess.useAccess("session/fork").value).toBe(true);
    expect(allowAllAccess.useSessionAccess("s1" as SessionId, "session/fork").value).toBe(true);
    expect(allowAllAccess.useWorkspaceAccess("w1" as WorkspaceId, "workspace/follow").value).toBe(
      true,
    );
  });
  it("installs an allow-all remoteAccess service whose sources never change", async () => {
    const runtime = await SlotTestRuntime.create();
    try {
      const source = runtime.ctx.remoteAccess.source("session", "s1", "session/fork");
      expect(source.getSnapshot()).toBe(true);
      const unsubscribe = source.subscribe(() => {});
      unsubscribe();
      expect(source.getSnapshot()).toBe(true);
    } finally {
      await runtime.dispose();
    }
  });
  it("retracts default root sources without removing their live replacements", async () => {
    const runtime = await SlotTestRuntime.create();
    const hooks = { workspaces: runtime.workspaces.list, panelInfo: runtime.panelInfo };
    let releaseReplacement: (() => void) | undefined;
    try {
      runtime.releaseWorkspaceSource();
      runtime.releasePanelInfoSource();
      releaseReplacement = runtime.slots.provideRoot({ hooks });
      runtime.releaseWorkspaceSource();
      runtime.releasePanelInfoSource();
      for (const key of ["workspaces", "panelInfo"] as const) {
        expect(() => runtime.slots.provideRoot({ hooks: { [key]: hooks[key] } })).toThrow(
          `duplicate root standard hook '${key}'`,
        );
      }
    } finally {
      try {
        releaseReplacement?.();
        runtime.releaseWorkspaceSource();
        runtime.releasePanelInfoSource();
      } finally {
        await runtime.dispose();
      }
    }
  });
  it("drives panel hooks, retains keyed selection on owner updates, and releases the default source", async () => {
    const runtime = await SlotTestRuntime.create();
    try {
      await runtime.declare({ "trt.panel-info": { kind: "keyed", scope: "root" } });
      runtime.slots.register(
        { name: "trt.panel-info", key: "probe" },
        defineComponent(
          (props: PropsRuntime<"trt.panel-info">) => {
            const panel = props.usePanelInfo((info) => info.activePanelId);
            return () => h("span", null, [props.label, ":", panel.value ?? "conversation"]);
          },
          { props: ["usePanelInfo", "label"] },
        ),
      );
      const view = await runtime.renderSlot(
        "trt.panel-info",
        { label: "first" },
        { entryKey: "probe" },
      );
      expect(view.container.textContent).toBe("first:conversation");
      await act(() => {
        runtime.panelInfo.set({ activePanelId: "custom" as MainPanelId });
      });
      expect(view.container.textContent).toBe("first:custom");
      await view.update({ label: "next" });
      expect(view.container.textContent).toBe("next:custom");
      const replacement = createSnapshotStore<PanelInfo>({ activePanelId: null });
      await act(async () => {
        runtime.releasePanelInfoSource();
        await runtime.mount({
          inject: ["slots"],
          apply(ctx) {
            ctx.slots.provideRoot({ hooks: { panelInfo: replacement } });
          },
        });
      });
      expect(view.container.textContent).toBe("next:conversation");
    } finally {
      await runtime.dispose();
    }
  });
  it("rejects uploads and reading marks until a suite replaces their default stubs", async () => {
    const runtime = await SlotTestRuntime.create();
    expect(runtime.ctx.uiSession.sessionStatus.readingReady.getSnapshot()).toBe(true);
    await expect(runtime.fileUpload.upload("fixture-session" as SessionId)).rejects.toThrow(
      "file upload is not stubbed",
    );
    await expect(
      runtime.ctx.uiSession.sessionStatus.mark("fixture-session" as SessionId, true),
    ).rejects.toThrow("reading mark is not stubbed");
    await expect(runtime.fileUpload.uploadImage("fixture-session" as SessionId)).rejects.toThrow(
      "image upload is not stubbed",
    );
    await runtime.dispose();
  });
  it("builds independent Conversation and Chat snapshots with optional overrides", () => {
    const conversation = conversationSnapshot();
    expect(conversation).toEqual(EMPTY_CONVERSATION_SNAPSHOT);
    expect(conversation).not.toBe(EMPTY_CONVERSATION_SNAPSHOT);
    const activeTargets = new Set(["chat"]);
    expect(conversationSnapshot({ activeTargets }).activeTargets).toBe(activeTargets);
    const chat = chatSnapshot();
    expect(chat).toEqual(EMPTY_CHAT_SNAPSHOT);
    expect(chat).not.toBe(EMPTY_CHAT_SNAPSHOT);
    const order = ["node-1"];
    expect(chatSnapshot({ order }).order).toBe(order);
  });
  it("binds an observable snapshot through the production selector hook", async () => {
    const source = createSnapshotStore({ value: 1 });
    const useValue = bindSnapshotSelector(source);
    const scope = effectScope();
    const selected = scope.run(() => useValue((snapshot) => snapshot.value))!;
    expect(selected.value).toBe(1);
    await act(() => {
      source.update((draft) => {
        draft.value = 2;
      });
    });
    expect(selected.value).toBe(2);
    scope.stop();
  });
  it("pins both browser language fields for the calling suite", () => {
    expect(navigator.languages).toEqual(["zh-CN", "en-US"]);
    expect(navigator.language).toBe("zh-CN");
  });
});
describe("Session fixture lifecycle", () => {
  it("initializes and drives complete event windows through replace, prepend, and append", async () => {
    const runtime = await SlotTestRuntime.create();
    const first = entry(1);
    const older = entry(0);
    const live = entry(2);
    await runtime.sessions.add({ id: "events", events: [first] });
    expect(runtime.sessions.behavior("events").eventSource.getSnapshot()).toMatchObject({
      entries: [first],
      hasMore: false,
      change: { kind: "replace", entries: [first] },
    });
    await runtime.sessions.add({ id: "has-more", hasMore: true });
    expect(runtime.sessions.behavior("has-more").eventSource.getSnapshot()).toMatchObject({
      entries: [],
      hasMore: true,
    });
    await runtime.sessions.replaceEvents("events", [first]);
    await runtime.sessions.prependEvents("events", [older]);
    await runtime.sessions.appendEvent("events", live);
    expect(runtime.sessions.behavior("events").eventSource.getSnapshot()).toMatchObject({
      entries: [older, first, live],
      hasMore: false,
      change: { kind: "append", entries: [live] },
    });
    await runtime.dispose();
  });
  it("requires an explicit create stub and records successful create and refresh calls", async () => {
    const runtime = await SlotTestRuntime.create();
    await expect(runtime.sessions.create()).rejects.toThrow(/create is not stubbed/);
    await runtime.sessions.add({ id: "created" });
    const create = vi.fn(() => Promise.resolve("created" as SessionId));
    runtime.sessions.stubCreate(create);
    await expect(runtime.sessions.create({ cwd: "/workspace" })).resolves.toBe("created");
    await expect(runtime.sessions.refresh()).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({ cwd: "/workspace" });
    expect(runtime.sessions.calls.slice(-2)).toEqual([
      { method: "create", args: [{ cwd: "/workspace" }] },
      { method: "refresh", args: [] },
    ]);
    await runtime.dispose();
  });
  it("borrows only retained scopes and disposes their generation with the runtime", async () => {
    const runtime = await SlotTestRuntime.create();
    await runtime.sessions.add({ id: "scope-only" });
    expect(runtime.sessions.scope("scope-only")).toBeUndefined();
    const reference = runtime.sessions.retain("scope-only" as SessionId);
    await reference.ready;
    const scope = runtime.sessions.scope("scope-only");
    expect(scope).toBeDefined();
    const release = vi.fn();
    scope?.effect(() => release, "fixture scope release");
    runtime.releaseWorkspaceSource();
    await runtime.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(() => reference.binding).toThrow("released");
  });
});
