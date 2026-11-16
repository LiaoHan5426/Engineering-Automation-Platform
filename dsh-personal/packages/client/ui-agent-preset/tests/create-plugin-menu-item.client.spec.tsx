import { h, defineComponent, shallowRef, nextTick } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as dispatchDom, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowAllAccess, bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { Menu, MenuItemButton } from "@deepseek-ai/dsh-client-ui-primitives";
import { CreatePluginMenuItem } from "../src/client/CreatePluginMenuItem.tsx";
import type { AgentPresetSettingsState } from "../src/client/settings-store.ts";
import { en } from "../src/client/locales.ts";
afterEach(cleanup);
const translations: ReadonlyMap<string, string> = new Map(Object.entries(en));
function unusedHook(): never {
  throw new Error("Create plugin does not read this slot source");
}
async function view(roster: Partial<AgentPresetSettingsState> = {}, inMenu = false) {
  const agentPresets = createSnapshotStore<AgentPresetSettingsState>({
    status: "ready",
    error: null,
    options: [{ id: "standard" }, { id: "cordis" }],
    ...roster,
  });
  const calls: string[] = [];
  const startCreatorDraft = vi.fn(() => {
    calls.push("start");
  });
  const onDismiss = vi.fn(() => {
    calls.push("dismiss");
  });
  const load = vi.fn(async () => {});
  const props: InstanceType<typeof CreatePluginMenuItem>["$props"] = {
    t: (key) => translations.get(key) ?? key,
    useAgentPresets: bindSnapshotSelector(agentPresets),
    usePanelInfo: unusedHook,
    useSessions: unusedHook,
    useSessionStatus: unusedHook,
    useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook,
    useResource: unusedHook,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    load,
    startCreatorDraft,
    onDismiss,
  };
  const TestMenu = defineComponent(() => {
    const open = shallowRef(true);
    const setOpen = (value: boolean) => {
      open.value = value;
    };
    return () =>
      h(
        Menu,
        {
          open: open.value,
          items: [],
          autoFocus: true,
          onClose: () => {
            setOpen(false);
          },
        },
        {
          anchor: () => h("button", { type: "button" }, ["Add plugin"]),
          default: () => [
            h(
              MenuItemButton,
              { onSelect: () => {} },
              { default: () => ["Install a third-party plugin"] },
            ),
            h(CreatePluginMenuItem, {
              ...props,
              onDismiss: () => {
                onDismiss();
                setOpen(false);
              },
            }),
          ],
        },
      );
  });
  await render(inMenu ? h(TestMenu) : h(CreatePluginMenuItem, { ...props }));
  return { agentPresets, load, startCreatorDraft, onDismiss, calls };
}
function item(): HTMLElement {
  return screen.getByRole("menuitem", { name: new RegExp(en.createPlugin) });
}
describe("Create plugin menu item", () => {
  it("explains Creator and dismisses the menu before starting it exactly once", async () => {
    const actions = await view({}, true);
    expect(actions.load).toHaveBeenCalledOnce();
    expect(item().textContent).toContain(en.createPluginDescription);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.startCreatorDraft).not.toHaveBeenCalled();
    await fireEvent.click(item());
    expect(actions.calls).toEqual(["dismiss", "start"]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("supports keyboard selection through the shared menu and closes before navigation", async () => {
    const actions = await view({}, true);
    const trigger = item();
    trigger.focus();
    await fireEvent.keyDown(trigger, { key: "Tab" });
    expect(actions.calls).toEqual(["dismiss", "start"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it.each(["idle", "loading", "error", "unavailable"] as const)(
    "keeps a disabled entry while the roster is %s",
    async (status) => {
      const actions = await view({ status });
      expect(item()).toHaveProperty("disabled", true);
      const description =
        status === "idle" || status === "loading"
          ? en.createPluginChecking
          : en.createPluginUnavailable;
      expect(item().textContent).toContain(description);
      await fireEvent.click(item());
      expect(actions.calls).toEqual([]);
    },
  );
  it("disables the same entry when Creator leaves the roster", async () => {
    const actions = await view();
    const original = item();
    await act(() => {
      actions.agentPresets.set({ status: "ready", error: null, options: [{ id: "standard" }] });
    });
    expect(item()).toBe(original);
    expect(item()).toHaveProperty("disabled", true);
    expect(item().textContent).toContain(en.createPluginMissing);
    await fireEvent.click(item());
    expect(actions.calls).toEqual([]);
  });
  it("keeps the same second menu item through ready, loading, and ready states", async () => {
    const actions = await view({}, true);
    const menu = screen.getByRole("menu");
    const before = screen.getAllByRole("menuitem");
    const original = item();
    expect(before[1]).toBe(original);
    expect(original).toHaveProperty("disabled", false);
    await act(() => {
      actions.agentPresets.set({ ...actions.agentPresets.getSnapshot(), status: "loading" });
    });
    expect(screen.getByRole("menu")).toBe(menu);
    expect(screen.getAllByRole("menuitem")).toEqual(before);
    expect(item()).toBe(original);
    expect(original).toHaveProperty("disabled", true);
    expect(original.textContent).toContain(en.createPluginChecking);
    await fireEvent.click(original);
    expect(actions.calls).toEqual([]);
    await act(() => {
      actions.agentPresets.set({ ...actions.agentPresets.getSnapshot(), status: "ready" });
    });
    expect(screen.getByRole("menu")).toBe(menu);
    expect(screen.getAllByRole("menuitem")).toEqual(before);
    expect(item()).toBe(original);
    expect(original).toHaveProperty("disabled", false);
    expect(original.textContent).toContain(en.createPluginDescription);
    await fireEvent.click(original);
    expect(actions.calls).toEqual(["dismiss", "start"]);
  });
});
async function render(...args: Parameters<typeof mountNative>) {
  const view = mountNative(...args);
  await nextTick();
  return view;
}
const fireEvent = new Proxy(dispatchDom, {
  get(target, key) {
    const method = Reflect.get(target, key);
    return typeof method === "function"
      ? async (...args: unknown[]) => {
          await nextTick();
          const result = method(...args);
          await nextTick();
          return result;
        }
      : method;
  },
});
