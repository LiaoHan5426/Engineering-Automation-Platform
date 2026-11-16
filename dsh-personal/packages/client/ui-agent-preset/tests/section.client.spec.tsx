import { h, nextTick } from "vue";
// @vitest-environment jsdom
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
import {
  act,
  cleanup,
  render as mountNative,
} from "../../../test-support/client-runtime/src/vue-test.ts";
import { fireEvent as dispatchDom, screen, waitFor, within } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import { allowAllAccess, bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  AgentPresetSection,
  type AgentPresetSectionProps,
} from "../src/client/AgentPresetSection.tsx";
import type { AgentPresetSectionState } from "../src/client/section-store.ts";
import { en } from "../src/client/locales.ts";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const translations: ReadonlyMap<string, string> = new Map(Object.entries(en));
function unusedHook(): never {
  throw new Error("This section does not read global slot sources");
}
async function view(
  partial: Partial<AgentPresetSectionState> = {},
  startCreatorDraft?: () => void,
  outerClose?: () => void,
  enabled = true,
) {
  const developerTools = createSnapshotStore(enabled);
  const store = createSnapshotStore<AgentPresetSectionState>({
    status: "ready",
    error: null,
    saving: false,
    rows: [
      { id: "standard", isDefault: true },
      { id: "mine", name: "Mine", isDefault: false },
    ],
    view: null,
    ...partial,
  });
  const actions = {
    load: vi.fn(async () => {}),
    view: vi.fn(async () => {}),
    closeView: vi.fn(),
    makeDefault: vi.fn(async () => {}),
    close: vi.fn(),
  };
  const props: AgentPresetSectionProps = {
    ...actions,
    ...(startCreatorDraft === undefined ? {} : { startCreatorDraft }),
    usePanelInfo: unusedHook,
    useSessions: unusedHook,
    useSessionStatus: unusedHook,
    useSessionRetainInfo: unusedHook,
    useWorkspaces: unusedHook,
    useResource: unusedHook,
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    useAgentPresetSection: bindSnapshotSelector(store),
    useDeveloperTools: bindSnapshotSelector(developerTools),
    t: (key) => translations.get(key) ?? key,
  };
  await render(
    outerClose === undefined
      ? h(AgentPresetSection, { ...props })
      : h(
          Modal,
          { open: true, onClose: outerClose, title: "Settings", closeLabel: "Close" },
          { default: () => [h(AgentPresetSection, { ...props })] },
        ),
  );
  return { ...actions, store, developerTools };
}
function rowFor(id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-agent-preset-id="${id}"]`);
  if (row === null) throw new Error(`no card for ${id}`);
  return row;
}
it.each([false, true])(
  "offers Standard, Creator and custom defaults with Coding Tools %s",
  async (enabled) => {
    const actions = await view(
      {
        rows: [
          { id: "standard", isDefault: false },
          { id: "ptc", isDefault: false },
          { id: "minimal", isDefault: true },
          { id: "cordis", isDefault: false },
          { id: "mine", name: "Mine", isDefault: false },
        ],
      },
      vi.fn(),
      undefined,
      enabled,
    );
    expect(
      screen.queryByRole("button", { name: `${en.setDefault}: ${en.presetPtcName}` }) !== null,
    ).toBe(enabled);
    expect(
      screen.queryByRole("button", { name: `${en.inUse}: ${en.presetMinimalName}` }) !== null,
    ).toBe(enabled);
    for (const [id, name] of [
      ["standard", en.presetStandardName],
      ["cordis", en.presetCordisName],
      ["mine", "Mine"],
    ]) {
      const button = screen.getByRole<HTMLButtonElement>("button", {
        name: `${en.setDefault}: ${name}`,
      });
      expect(button.disabled).toBe(false);
      await fireEvent.click(button);
      expect(actions.makeDefault).toHaveBeenLastCalledWith(id);
    }
    expect(screen.getByRole<HTMLButtonElement>("button", { name: en.creatorDraft }).disabled).toBe(
      false,
    );
  },
);
it("updates visible settings choices without writing defaults from the renderer", async () => {
  const actions = await view({
    rows: [
      { id: "standard", isDefault: false },
      { id: "ptc", isDefault: false },
      { id: "minimal", isDefault: true },
      { id: "cordis", isDefault: false },
    ],
  });
  const rows = actions.store.getSnapshot().rows;
  await act(() => {
    actions.developerTools.set(false);
  });
  expect(document.querySelector('[data-agent-preset-id="ptc"]')).toBeNull();
  expect(document.querySelector('[data-agent-preset-id="minimal"]')).toBeNull();
  expect(rowFor("standard")).toBeTruthy();
  expect(rowFor("cordis")).toBeTruthy();
  expect(actions.makeDefault).not.toHaveBeenCalled();
  expect(actions.store.getSnapshot().rows).toBe(rows);
  await act(() => {
    actions.developerTools.set(true);
  });
  expect(screen.getByRole("button", { name: `${en.inUse}: ${en.presetMinimalName}` })).toBeTruthy();
  expect(rowFor("ptc")).toBeTruthy();
});
it.each(["ptc", "minimal"])(
  "keeps a named custom %s override selectable with Coding Tools off",
  async (id) => {
    const actions = await view(
      { rows: [{ id, name: "My mode", isDefault: false }] },
      undefined,
      undefined,
      false,
    );
    await fireEvent.click(screen.getByRole("button", { name: `${en.setDefault}: My mode` }));
    expect(actions.makeDefault).toHaveBeenCalledWith(id);
  },
);
it("reads the roster once and sets a default from the card body", async () => {
  const actions = await view();
  expect(screen.queryByRole("switch")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: `${en.setDefault}: Mine` }));
  expect(actions.makeDefault).toHaveBeenCalledWith("mine");
  await waitFor(() => {
    expect(actions.load).toHaveBeenCalledOnce();
  });
  expect(screen.queryByRole("button", { name: /^Edit plugins/ })).toBeNull();
});
it("replaces the default preset group tag with its new-task default status", async () => {
  await view();
  const standard = rowFor("standard");
  expect(within(standard).queryByText(en.builtInGroup)).toBeNull();
  expect(within(standard).getByText(en.inUse)).toBeTruthy();
  expect(within(standard).queryByText(en.setDefault)).toBeNull();
  expect(within(rowFor("mine")).getByText(en.customGroup)).toBeTruthy();
});
it("omits an empty group instead of leaving a heading behind", async () => {
  await view({ rows: [{ id: "standard", isDefault: true }] });
  expect(screen.getByRole("heading", { name: en.builtInGroup })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: en.customGroup })).toBeNull();
});
it("keeps the custom group and its Creator entry while the roster has none", async () => {
  await view({ rows: [{ id: "cordis", isDefault: true }] }, vi.fn());
  const group = screen.getByRole("heading", { name: en.customGroup }).closest("section");
  expect(group).not.toBeNull();
  expect(within(group!).queryByRole("list")).toBeNull();
  expect(within(group!).getByRole("button", { name: en.creatorDraft })).toBeTruthy();
});
it("launches a Creator-mode task from the entry and closes the settings dialog", async () => {
  const launch = vi.fn();
  const actions = await view({ rows: [{ id: "cordis", isDefault: true }] }, launch);
  await fireEvent.click(screen.getByRole("button", { name: en.creatorDraft }));
  expect(launch).toHaveBeenCalledOnce();
  expect(actions.close).toHaveBeenCalledOnce();
});
it("offers no Creator entry without the conversation flow or the cordis preset", async () => {
  await view({ rows: [{ id: "cordis", isDefault: true }] });
  expect(screen.queryByRole("button", { name: en.creatorDraft })).toBeNull();
  cleanup();
  await view({}, vi.fn());
  expect(screen.queryByRole("button", { name: en.creatorDraft })).toBeNull();
});
it("disables the Creator entry while a default is being saved", async () => {
  const launch = vi.fn();
  await view({ saving: true, rows: [{ id: "cordis", isDefault: true }] }, launch);
  const button = screen.getByRole<HTMLButtonElement>("button", { name: en.creatorDraft });
  expect(button.disabled).toBe(true);
  await fireEvent.click(button);
  expect(launch).not.toHaveBeenCalled();
});
it("reads a declared composition read-only from every card, broken ones included", async () => {
  const actions = await view({
    rows: [
      { id: "standard", isDefault: true },
      { id: "broken", isDefault: false, broken: "Missing plugin" },
    ],
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  await fireEvent.click(
    within(rowFor("standard")).getByRole("button", {
      name: `${en.view}: ${en.presetStandardName}`,
    }),
  );
  expect(actions.view).toHaveBeenCalledWith("standard");
  await fireEvent.click(
    within(rowFor("broken")).getByRole("button", { name: `${en.view}: broken` }),
  );
  expect(actions.view).toHaveBeenLastCalledWith("broken");
  expect(actions.makeDefault).not.toHaveBeenCalled();
});
it("shows the open composition under the preset display name, without copy, and closes it from the footer", async () => {
  const actions = await view({
    view: { id: "standard", title: "standard", content: "- id: tool-fs\n  name: fs\n" },
  });
  const dialog = screen.getByRole("dialog", { name: `${en.view} · ${en.presetStandardName}` });
  expect(dialog.querySelector("pre")?.textContent).toBe("- id: tool-fs\n  name: fs\n");
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  expect(dialog.querySelectorAll("p")).toHaveLength(0);
  await fireEvent.click(within(dialog).getAllByRole("button", { name: en.close }).at(-1)!);
  expect(actions.closeView).toHaveBeenCalledOnce();
  cleanup();
  await view({ view: { id: "gone", title: "Gone", content: "[]\n" } });
  expect(screen.getByRole("dialog", { name: `${en.view} · Gone` })).toBeTruthy();
});
it("keeps Escape inside the composition viewer when Settings is also open", async () => {
  const closeSettings = vi.fn();
  const actions = await view({}, undefined, closeSettings);
  const trigger = within(rowFor("standard")).getByRole("button", {
    name: `${en.view}: ${en.presetStandardName}`,
  });
  trigger.focus();
  await fireEvent.click(trigger);
  await act(() => {
    actions.store.set({
      ...actions.store.getSnapshot(),
      view: { id: "standard", title: "standard", content: "[]\n" },
    });
  });
  const dialog = screen.getByRole("dialog", { name: `${en.view} · ${en.presetStandardName}` });
  const [header, footer] = within(dialog).getAllByRole("button", { name: en.close });
  expect(document.activeElement).toBe(footer);
  await fireEvent.keyDown(footer!, { key: "Tab" });
  expect(document.activeElement).toBe(header);
  await fireEvent.keyDown(header!, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(footer);
  await fireEvent.keyDown(footer!, { key: "Escape" });
  expect(actions.closeView).toHaveBeenCalledOnce();
  expect(closeSettings).not.toHaveBeenCalled();
  expect(actions.close).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});
it("clears an open viewer when the settings section unmounts", async () => {
  const actions = await view({ view: { id: "standard", title: "standard", content: "[]\n" } });
  cleanup();
  expect(actions.closeView).toHaveBeenCalledOnce();
});
it("shows roster errors without hiding the roster", async () => {
  const actions = await view({
    error: "Roster stale",
    rows: [
      { id: "broken", isDefault: false, broken: "Missing plugin" },
      { id: "mine", name: "Mine", isDefault: false },
    ],
  });
  expect(screen.getAllByRole("alert").map((node) => node.textContent)).toEqual([
    "Roster stale",
    "Missing plugin",
  ]);
  await fireEvent.click(screen.getByRole("button", { name: `${en.setDefault}: Mine` }));
  expect(actions.makeDefault).toHaveBeenCalledWith("mine");
});
it("keeps a broken card focusable for diagnostics and refuses to select it", async () => {
  const actions = await view({
    rows: [{ id: "broken", isDefault: false, broken: "Missing plugin" }],
  });
  const card = screen.getByRole<HTMLButtonElement>("button", { name: "Failed to load: broken" });
  expect(card.disabled).toBe(false);
  expect(card.getAttribute("aria-disabled")).toBe("true");
  await fireEvent.click(card);
  expect(actions.makeDefault).not.toHaveBeenCalled();
});
it.each([
  ["standard", en.presetStandardName, "How it works", "Fix a bug"],
  ["ptc", en.presetPtcName, "How tools are called", "Check a set of configuration files"],
  ["minimal", en.presetMinimalName, "What is included", "Compare performance on a small bug fix"],
  ["cordis", en.presetCordisName, "What you can create", "Add a UI"],
])(
  "opens both help sections for %s without changing the default",
  async (id, name, heading, exampleTitle) => {
    const actions = await view({ rows: [{ id, isDefault: false }] });
    const trigger = within(rowFor(id)).getByRole("button", {
      name: `${en.modeExplanation}: ${name}`,
    });
    trigger.focus();
    await fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name });
    expect(within(dialog).getByRole("heading", { name: heading })).toBeTruthy();
    const usage = within(dialog).getByRole("tab", { name: en.howToUse });
    await fireEvent.click(usage);
    expect(usage.getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByRole("heading", { name: exampleTitle })).toBeTruthy();
    expect(within(dialog).getAllByText(en.guideExampleTask).length).toBeGreaterThan(0);
    await fireEvent.click(within(dialog).getByRole("tab", { name: en.modeExplanation }));
    expect(within(dialog).getByRole("heading", { name: heading })).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole("button", { name: en.close }));
    expect(document.activeElement).toBe(trigger);
    await fireEvent.click(
      within(rowFor(id)).getByRole("button", { name: `${en.howToUse}: ${name}` }),
    );
    expect(
      within(screen.getByRole("dialog"))
        .getByRole("tab", { name: en.howToUse })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(actions.makeDefault).not.toHaveBeenCalled();
  },
);
it("keeps keyboard focus in help and dismisses only the reader on Escape", async () => {
  const closeSettings = vi.fn();
  const actions = await view({}, undefined, closeSettings);
  const trigger = within(rowFor("standard")).getByRole("button", {
    name: `${en.modeExplanation}: ${en.presetStandardName}`,
  });
  trigger.focus();
  await fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: en.presetStandardName });
  const details = within(dialog).getByRole("tab", { name: en.modeExplanation });
  const panel = within(dialog).getByRole("tabpanel", { name: en.modeExplanation });
  const close = within(dialog).getByRole("button", { name: en.close });
  expect(document.activeElement).toBe(details);
  expect(await fireEvent.keyDown(details, { key: "Tab" })).toBe(true);
  panel.focus();
  await fireEvent.keyDown(panel, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  await fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(panel);
  await fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: en.presetStandardName })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(document.activeElement).toBe(trigger);
  expect(closeSettings).not.toHaveBeenCalled();
  expect(actions.close).not.toHaveBeenCalled();
});
it("connects keyboard selection to the visible guide panel", async () => {
  await view();
  await fireEvent.click(
    within(rowFor("standard")).getByRole("button", {
      name: `${en.modeExplanation}: ${en.presetStandardName}`,
    }),
  );
  const dialog = screen.getByRole("dialog");
  const details = within(dialog).getByRole("tab", { name: en.modeExplanation });
  const usage = within(dialog).getByRole("tab", { name: en.howToUse });
  expect(details.tabIndex).toBe(0);
  expect(usage.tabIndex).toBe(-1);
  await fireEvent.keyDown(details, { key: "ArrowRight" });
  const panel = within(dialog).getByRole("tabpanel", { name: en.howToUse });
  expect(panel.id).toBe(usage.getAttribute("aria-controls"));
  expect(document.activeElement).toBe(usage);
  expect(usage.getAttribute("aria-selected")).toBe("true");
  expect(details.tabIndex).toBe(-1);
  expect(usage.tabIndex).toBe(0);
  expect(within(dialog).queryByRole("tabpanel", { name: en.modeExplanation })).toBeNull();
});
it("does not attach built-in claims to named or unknown presets", async () => {
  await view({
    rows: [
      { id: "ptc", name: "My PTC", isDefault: false },
      { id: "third-party", isDefault: false },
    ],
  });
  expect(screen.queryByRole("button", { name: new RegExp(en.modeExplanation) })).toBeNull();
  expect(screen.queryByRole("button", { name: new RegExp(en.howToUse) })).toBeNull();
});
it("leaves help usable while a default is being saved", async () => {
  const actions = await view({ saving: true });
  await fireEvent.click(
    within(rowFor("standard")).getByRole("button", {
      name: `${en.howToUse}: ${en.presetStandardName}`,
    }),
  );
  expect(screen.getByRole("dialog", { name: en.presetStandardName })).toBeTruthy();
  expect(actions.makeDefault).not.toHaveBeenCalled();
});
it("closes help even when the browser reports no previously focused element", async () => {
  const descriptor: TypedPropertyDescriptor<Element | null> = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "activeElement",
  )!;
  const readActiveElement = descriptor.get!.bind(document);
  // Only the initial unfocused body is absent; modal controls must observe subsequent focus.
  const activeElement = vi.spyOn(document, "activeElement", "get").mockImplementation(() => {
    const focused = readActiveElement();
    return focused === document.body ? null : focused;
  });
  try {
    await view();
    await fireEvent.click(
      within(rowFor("standard")).getByRole("button", {
        name: `${en.modeExplanation}: ${en.presetStandardName}`,
      }),
    );
    await fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: en.close }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  } finally {
    activeElement.mockRestore();
  }
});
it.each([false, true])(
  "only offers a description tooltip when the card clips it: %s",
  async (overflow) => {
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(overflow ? 400 : 80);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(80);
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    vi.useFakeTimers();
    await view({ rows: [{ id: "mine", isDefault: false, description: "Preset description" }] });
    await fireEvent.pointerEnter(screen.getByText("Preset description"));
    await act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole("tooltip")?.textContent ?? null).toBe(
      overflow ? "Preset description" : null,
    );
    cleanup();
    expect(disconnect).toHaveBeenCalledTimes(overflow ? 2 : 1);
  },
);
it("renders descriptions and allows selection without resize observation", async () => {
  vi.stubGlobal("ResizeObserver", undefined);
  const actions = await view({
    rows: [{ id: "mine", name: "Mine", isDefault: false, description: "Preset description" }],
  });
  expect(screen.getByText("Preset description")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: `${en.setDefault}: Mine` }));
  expect(actions.makeDefault).toHaveBeenCalledWith("mine");
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
