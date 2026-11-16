import { h, defineComponent, nextTick } from "vue";
// @vitest-environment jsdom
import type { Context } from "@deepseek-ai/cordis";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import { usePinnedBrowserLanguages } from "@deepseek-ai/dsh-client-test-runtime";
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "../../../test-support/client-runtime/src/vue-test.ts";
import { expect, onTestFinished } from "vitest";
usePinnedBrowserLanguages("en-US");
import { SlotTestRuntime, bindSnapshotSelector } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { SettingsRoot } from "../src/client/SettingsRoot.tsx";
import type { SettingsRootComponentProps } from "../src/client/shell-contract.ts";
import { createSettingsShellStore } from "../src/client/shell-store.ts";
import { en } from "../src/client/locales.ts";
import { it } from "vitest";
function Section() {
  return null;
}
function SectionIcon({ size, active }: PropsRuntime<"settings.section.icon">) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      "data-testid": "section-icon",
      "data-active": active,
    },
    h("circle", { cx: "8", cy: "8", r: "6", fill: "currentColor" }),
  );
}
const contribution = {
  name: "test-settings-icon",
  inject: ["slots"],
  apply(ctx: Context) {
    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        {
          name: "settings.section",
          id: "custom",
          label: "Custom",
        },
        Section,
      ),
    );
    ctx.slots.inject("settings.section.icon", () =>
      ctx.slots.register(
        {
          name: "settings.section.icon",
          id: "custom",
          label: "Unused icon label",
        },
        SectionIcon,
      ),
    );
    ctx.slots.inject("settings.section.icon", () =>
      ctx.slots.register(
        {
          name: "settings.section.icon",
          id: "unmatched",
        },
        SectionIcon,
      ),
    );
  },
};
it("renders a contributed section icon and restores the default after its plugin unloads", async () => {
  // jsdom omits the browser method used when the settings row receives focus.
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value() {} });
  onTestFinished(() => {
    if (descriptor === undefined) Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    else Object.defineProperty(Element.prototype, "scrollIntoView", descriptor);
  });
  const runtime = await SlotTestRuntime.create();
  onTestFinished(() => runtime.dispose());
  const c = runtime;
  const shell = createSettingsShellStore().create();
  const rows = {
    getSnapshot: () =>
      c.slots
        .entries("settings.section")
        .map((entry) => ({
          id: entry.options.id!,
          order: entry.options.order ?? 0,
          label: String(entry.options.label),
        })),
    subscribe: (listener: () => void) => c.slots.subscribe("settings.section", listener),
  };
  const Root = defineComponent(
    (props: SettingsRootComponentProps) => {
      const sections = bindSnapshotSelector(rows);
      const store = bindSnapshotSelector(shell);
      const useConnectionState = bindSnapshotSelector(createSnapshotStore("connected" as const));
      const useDesktopUpdate = bindSnapshotSelector(
        createSnapshotStore({ failed: false, opening: false }),
      );
      const useShortcuts = bindSnapshotSelector(createSnapshotStore([]));
      const useOnboardingSteps = bindSnapshotSelector(createSnapshotStore([]));
      return () =>
        h(SettingsRoot, {
          ...props,
          wide: true,
          actions: shell.actions,
          useStore: store,
          useSections: sections,
          useConnectionState,
          useDesktopUpdate,
          useShortcuts,
          useOnboardingSteps,
          reconnect() {},
          openDesktopUpdate() {},
          t: (key) => (en as Record<string, string>)[key] ?? key,
        });
    },
    {
      inheritAttrs: false,
      props: [
        "renderSlot",
        "useSessions",
        "useSessionStatus",
        "usePanelInfo",
        "useSessionRetainInfo",
        "useResource",
        "useWorkspaces",
        "useContextMenu",
        "useRemoteAccess",
      ],
    },
  );
  await runtime.root.declare(
    {
      "settings.section": { kind: "list", scope: "root" },
      "settings.section.icon": { kind: "list", scope: "root", inline: true },
      "settings.trigger": { kind: "single", scope: "root" },
      "settings.header": { kind: "single", scope: "root" },
      "settings.close": { kind: "single", scope: "root" },
      "settings.action": { kind: "list", scope: "root" },
      "settings.launcher": { kind: "single", scope: "root" },
      "settings.onboarding": { kind: "list", scope: "root" },
    },
    Root as never,
  );
  c.slots.register({ name: "settings.section", id: "general", label: "General" }, Section);
  for (const [name, text] of [
    ["settings.trigger", "Settings"],
    ["settings.header", "Settings"],
    ["settings.close", "Close"],
  ] as const)
    c.slots.register({ name }, () => text);
  runtime.renderRoot();
  await nextTick();

  const plugin = c.ctx.plugin(contribution);
  await act(async () => {
    await plugin;
  });
  await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await nextTick();
  const row = screen.getByRole("button", { name: "Custom" });
  const icon = screen.getByTestId("section-icon");
  expect(row.contains(icon)).toBe(true);
  expect(row.querySelector('[data-slot="settings.section.icon"]')?.tagName).toBe("SPAN");
  expect(screen.getAllByTestId("section-icon")).toHaveLength(1);
  expect(icon.getAttribute("width")).toBe("16");
  expect(icon.getAttribute("data-active")).toBe("false");
  expect(row.textContent).toBe("Custom");
  const general = screen.getByRole("button", { name: "General" });
  expect(general.querySelector('[data-slot="settings.section.icon"]')?.tagName).toBe("SPAN");
  const fallback = general.querySelector("svg")?.getAttribute("data-icon");
  expect(fallback).toBeTruthy();
  await fireEvent.click(row);
  expect(icon.getAttribute("data-active")).toBe("true");
  expect(row.getAttribute("aria-current")).toBe("true");
  const replacement = c.ctx.plugin({
    name: "test-settings-icon-replacement",
    inject: ["slots"],
    apply(ctx) {
      ctx.slots.inject("settings.section.icon", () =>
        ctx.slots.register(
          {
            name: "settings.section.icon",
            id: "general",
          },
          SectionIcon,
        ),
      );
    },
  });
  await act(async () => {
    await replacement;
  });
  expect(general.querySelector('[data-testid="section-icon"]')).not.toBeNull();
  await act(async () => {
    await replacement.dispose();
  });
  expect(general.querySelector("svg")?.getAttribute("data-icon")).toBe(fallback);
  await act(async () => {
    await plugin.dispose();
  });
  expect(screen.queryByRole("button", { name: "Custom" })).toBeNull();
  expect(c.ctx.slots.entries("settings.section.icon")).toHaveLength(0);
}, 60000);
