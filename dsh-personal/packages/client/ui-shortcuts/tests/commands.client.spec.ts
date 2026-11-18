// @vitest-environment jsdom
import { describe, expect, onTestFinished, vi } from "vite-plus/test";
import { defineComponent, h, Fragment } from "vue";
import { bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import {
  flushVue as act,
  cleanupVue as cleanup,
  renderVue as render,
} from "../../ui-primitives/tests/vue-render.ts";
import {
  createClientTest,
  webApp,
} from "@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type {} from "@deepseek-ai/dsh-client-shortcuts/client";
import type {
  DesktopKeyboardApi,
  DesktopShortcutInput,
  ShortcutCommandId,
} from "@deepseek-ai/dsh-client-shortcuts/protocol";
import type { createSettingsShellStore } from "../../ui-settings-general/src/client/shell-store.ts";
import type { createLayoutStore } from "../../ui-layout/src/client/stores.ts";
import type { ReferenceInjected } from "../src/client/Reference.tsx";
import type { createShortcutsStore } from "../src/client/store.ts";

const it = createClientTest({ roster: webApp });

describe("assembled shortcut command owners", () => {
  it("keeps desktop defaults out of Web and removes commands on owner unload", async ({
    start,
  }) => {
    const client = await start();
    const shortcuts = client.ctx.shortcuts;
    const overlay = client.ctx.slots
      .entries("shell.overlay")
      .find((entry) => entry.options.id === "shortcuts")!;
    const injected: Partial<ReferenceInjected> | undefined = overlay.inject?.();
    if (
      injected?.hooks === undefined ||
      injected.describeBinding === undefined ||
      injected.recording === undefined ||
      injected.edit === undefined
    ) {
      throw new Error("expected the shortcut reference actions");
    }
    expect(injected.hooks.catalog).toBe(shortcuts.catalog);
    await vi.waitFor(() => {
      expect(shortcuts.config.getSnapshot().status).toBe("ready");
    });
    expect(injected.describeBinding(null).keys).toEqual([]);
    await injected.recording(false);
    const shortcut = shortcuts.catalog.getSnapshot().find((row) => row.id === "shortcuts.open")!;
    expect(
      (
        await injected.edit(
          { type: "reset", id: shortcut.id },
          shortcuts.config.getSnapshot().revision,
        )
      ).status,
    ).toBe("saved");
    const row = client.ctx.slots
      .entries("settings.general.item")
      .find((entry) => entry.options.id === "shortcuts")!;
    const rowInjected: Partial<ReferenceInjected> | undefined = row.inject?.();
    expect(rowInjected?.hooks?.catalog).toBe(shortcuts.catalog);
    const ownerIds = ["settings.open", "shortcuts.open", "sidebar.left.toggle"];
    const ownedRows = () =>
      shortcuts.catalog.getSnapshot().filter((row) => ownerIds.includes(row.id));
    expect(
      ownedRows()
        .map((row) => row.id)
        .sort(),
    ).toEqual(ownerIds);
    expect(
      ownedRows()
        .filter((row) => row.keys.length > 0)
        .map((row) => row.id),
    ).toEqual(["shortcuts.open"]);
    const conversationIds = [
      "fixed.send",
      "fixed.newline",
      "fixed.complementary",
      "fixed.slash",
      "fixed.mention",
      "response.stop",
    ];
    const fixedIds = () => shortcuts.fixedCatalog.getSnapshot().map((row) => row.id);
    expect(fixedIds()).toEqual(expect.arrayContaining(conversationIds));
    expect(
      shortcuts.fixedCatalog.getSnapshot().find((row) => row.id === "response.stop"),
    ).toMatchObject({ group: "input", keys: ["Esc", "Esc"] });
    await client.unload("@deepseek-ai/dsh-client-ui-shortcuts");
    expect(fixedIds()).toEqual(expect.arrayContaining(conversationIds));
    expect(fixedIds()).not.toContain("fixed.move");
    await client.unload("@deepseek-ai/dsh-client-ui-conversation");
    for (const id of conversationIds) expect(fixedIds()).not.toContain(id);
    for (const owner of ["ui-settings-general", "ui-layout"])
      await client.unload(`@deepseek-ai/dsh-client-${owner}`);
    expect(ownedRows()).toEqual([]);
    expect(shortcuts.fixedCatalog.getSnapshot().some((row) => row.id.startsWith("fixed."))).toBe(
      false,
    );
  }, 60_000);

  it("toggles foreground dialogs, permits shortcuts above settings, and blocks settings behind shortcuts", async ({
    start,
  }) => {
    const previous = document.documentElement.dataset.platform;
    const previousBridge = Object.getOwnPropertyDescriptor(window, "dshDesktop");
    const listeners = new Set<(input: DesktopShortcutInput) => void>();
    const keyboard: DesktopKeyboardApi = {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      closeWindow: async () => {},
    };
    Object.defineProperty(window, "dshDesktop", { configurable: true, value: { keyboard } });
    document.documentElement.dataset.platform = "darwin";
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    onTestFinished(() => {
      cleanup();
      modal.remove();
      if (previousBridge === undefined) Reflect.deleteProperty(window, "dshDesktop");
      else Object.defineProperty(window, "dshDesktop", previousBridge);
      if (previous === undefined) delete document.documentElement.dataset.platform;
      else document.documentElement.dataset.platform = previous;
    });
    const client = await start();
    const shortcuts = client.ctx.shortcuts;
    const settings = (
      client.ctx.slots.entries("sidebar.settings")[0]!.store as ReturnType<
        typeof createSettingsShellStore
      >
    ).create();
    const reference = (
      client.ctx.slots.entries("shell.overlay").find((entry) => entry.options.id === "shortcuts")!
        .store as ReturnType<typeof createShortcutsStore>
    ).create();
    const layout = (
      client.ctx.slots.entries("root")[0]!.store as ReturnType<typeof createLayoutStore>
    ).create();
    const Dialogs = defineComponent(() => {
      const settingsState = bindSnapshotSelector(settings)((state) => state);
      const referenceState = bindSnapshotSelector(reference)((state) => state);
      return () =>
        h(Fragment, null, [
          h(Modal, {
            open: settingsState.value.open,
            title: "Settings",
            closeLabel: "Close settings",
            shortcutModal: "settings",
            onClose: settings.actions.close,
          }),
          h(Modal, {
            open: referenceState.value.open,
            title: "Shortcuts",
            closeLabel: "Close shortcuts",
            shortcutModal: "shortcuts",
            onClose: reference.actions.close,
          }),
        ]);
    });
    render(h(Dialogs));
    const press = async (code: string, repeat = false): Promise<void> => {
      await act(() => {
        for (const listener of listeners)
          listener({
            kind: "keyboard",
            revision: shortcuts.config.getSnapshot().revision,
            frameName: "",
            code,
            control: false,
            alt: false,
            shift: false,
            meta: true,
            repeat,
          });
      });
    };
    await press("Comma");
    expect(settings.getSnapshot().open).toBe(true);
    const opened = settings.getSnapshot();
    await press("Comma", true);
    expect(settings.getSnapshot()).toBe(opened);
    await press("Comma");
    expect(settings.getSnapshot().open).toBe(false);
    await press("Comma");
    await act(() => {
      settings.actions.select("general");
    });
    const selected = settings.getSnapshot();
    await press("Slash");
    expect(reference.getSnapshot().open).toBe(true);
    await act(() => {
      reference.actions.search("session");
    });
    const searched = reference.getSnapshot();
    await press("Slash", true);
    await press("Comma");
    expect(settings.getSnapshot()).toBe(selected);
    expect(reference.getSnapshot()).toBe(searched);

    document.body.append(modal);
    await press("Comma");
    await press("Slash");
    expect(settings.getSnapshot()).toBe(selected);
    expect(reference.getSnapshot()).toBe(searched);
    modal.remove();

    await press("Slash");
    expect(reference.getSnapshot()).toMatchObject({ open: false, query: "" });
    expect(settings.getSnapshot()).toBe(selected);
    await press("Comma");
    expect(settings.getSnapshot()).toEqual({ open: false, activeId: undefined });
    await press("Slash");
    expect(reference.getSnapshot().open).toBe(true);
    await press("Comma");
    expect(settings.getSnapshot().open).toBe(false);
    const sidebar = layout.getSnapshot().layoutInfo.sidebar;
    await press("KeyB");
    expect(layout.getSnapshot().layoutInfo.sidebar).toBe(sidebar);
    await press("Slash");
    expect(reference.getSnapshot().open).toBe(false);
    await press("KeyB");
    expect(layout.getSnapshot().layoutInfo.sidebar).not.toBe(sidebar);
    await press("KeyB", true);
    expect(layout.getSnapshot().layoutInfo.sidebar).not.toBe(sidebar);
    await press("KeyB");
    expect(layout.getSnapshot().layoutInfo.sidebar).toBe(sidebar);
    const menu = async (commandId: ShortcutCommandId): Promise<void> => {
      await act(() => {
        for (const listener of listeners)
          listener({ kind: "menu", commandId, revision: shortcuts.config.getSnapshot().revision });
      });
    };
    await menu("settings.open" as ShortcutCommandId);
    expect(settings.getSnapshot().open).toBe(true);
    await press("KeyB");
    expect(layout.getSnapshot().layoutInfo.sidebar).toBe(sidebar);
    await menu("settings.open" as ShortcutCommandId);
    expect(settings.getSnapshot().open).toBe(false);
    await menu("shortcuts.open" as ShortcutCommandId);
    expect(reference.getSnapshot().open).toBe(true);
    await menu("settings.open" as ShortcutCommandId);
    expect(settings.getSnapshot().open).toBe(false);
    await menu("shortcuts.open" as ShortcutCommandId);
    expect(reference.getSnapshot().open).toBe(false);
  });
});
