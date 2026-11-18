// @vitest-environment jsdom
import { Context } from "@deepseek-ai/cordis";
import {
  createClientModuleSystem,
  type ClientModuleLoaderTarget,
} from "@deepseek-ai/dsh-client-modules/client";
import { getCurrentInstance, h, nextTick, onScopeDispose, shallowRef, useId } from "vue";
import { expect, it, onTestFinished, vi } from "vite-plus/test";
import { SlotRegistry } from "../src/client/registry.ts";
import { UiRenderer } from "../src/client/renderer.ts";
import { createVueSlotRenderer } from "../src/client/vue/slots.ts";
import { defineSlotComponent } from "../src/client/vue/components.ts";

it("hydrates the kernel boot element before handing off to native Vue slots", async () => {
  const ctx = new Context();
  await ctx.plugin(SlotRegistry);
  const target: ClientModuleLoaderTarget = {
    mode: "queue",
    pendingQueue: [],
    load: () => {},
    create: (options) =>
      createClientModuleSystem(target, { id: "bootstrap", exports: {} }, options),
  };
  const modules = target.create({
    boot: { rev: "0", entries: [], batches: [] },
    staticModules: [],
  });
  ctx.reflect.provide("modules", modules);
  const absent = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
  const current = { getSnapshot: () => absent, subscribe: () => () => {} };
  ctx.slots.installScope("session", { current, bindingSource: () => current });
  ctx.slots.install(createVueSlotRenderer());
  ctx.slots.register(
    { name: "root" },
    defineSlotComponent<object>([], () => () => h("p", "ready")),
  );
  const container = document.createElement("main");
  container.innerHTML = '<div class="boot" data-dsh-boot><b>loading</b></div>';
  document.body.append(container);
  const boot = container.firstElementChild;
  const renderer = new UiRenderer(ctx);
  try {
    renderer.mount(container);
    expect(container.firstElementChild).toBe(boot);
    expect(container.textContent).toBe("loading");
    await nextTick();
    expect(container.textContent).toBe("ready");
    expect(container.querySelector("[data-dsh-boot]")).toBeNull();
  } finally {
    renderer.dispose();
    container.remove();
    await ctx.fiber.dispose();
  }
});

it("owns CSS before Vue setup and scopes old mount disposers to their exact application", async () => {
  const ctx = new Context();
  await ctx.plugin(SlotRegistry);
  const target: ClientModuleLoaderTarget = {
    mode: "queue",
    pendingQueue: [],
    load: () => {},
    create: (options) =>
      createClientModuleSystem(target, { id: "bootstrap", exports: {} }, options),
  };
  const modules = target.create({
    boot: { rev: "0", entries: [], batches: [] },
    staticModules: [
      {
        id: "native-theme",
        factory: () => ({}),
        meta: () => ({
          stylesheets: { "native-theme.css": { text: () => ".native { display: block }" } },
        }),
      },
    ],
  });
  await modules.import("native-theme");
  ctx.reflect.provide("modules", modules);
  const absent = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
  const current = { getSnapshot: () => absent, subscribe: () => () => {} };
  ctx.slots.installScope("session", { current, bindingSource: () => current });
  ctx.slots.install(createVueSlotRenderer());
  let setups = 0;
  let releases = 0;
  ctx.slots.register(
    { name: "root" },
    defineSlotComponent<object>([], () => {
      setups += 1;
      expect(document.head.querySelector('style[data-path="native-theme.css"]')).not.toBeNull();
      onScopeDispose(() => {
        releases += 1;
      });
      return () => h("p", "native mounted");
    }),
  );
  const container = document.createElement("main");
  document.body.append(container);
  const renderer = new UiRenderer(ctx);
  try {
    const first = renderer.mount(container);
    expect(container.textContent).toBe("native mounted");
    expect(() => renderer.mount(container)).toThrow("already mounted");
    first();
    first();
    expect(releases).toBe(1);
    expect(document.head.querySelector('style[data-path="native-theme.css"]')).toBeNull();
    const second = renderer.mount(container);
    first();
    expect(container.textContent).toBe("native mounted");
    expect(setups).toBe(2);
    expect(releases).toBe(1);
    renderer.dispose();
    second();
    expect(releases).toBe(2);
    expect(document.head.querySelector('style[data-path="native-theme.css"]')).toBeNull();
    expect(() => renderer.mount(container)).toThrow("disposed renderer");
  } finally {
    renderer.dispose();
    container.remove();
    await ctx.fiber.dispose();
  }
});

it.each([false, true])(
  "keeps useId labels unique and stable across independent apps (without platform randomUUID: %s)",
  async (withoutRandomUUID) => {
    if (withoutRandomUUID) {
      const bare = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
      vi.stubGlobal("crypto", bare);
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      expect("randomUUID" in globalThis.crypto).toBe(false);
      expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    }
    const prefixes: (string | undefined)[] = [];
    let releases = 0;
    const contexts: Context[] = [];
    const renderers: UiRenderer[] = [];
    const containers: HTMLElement[] = [];
    const revision = shallowRef(0);
    try {
      for (let index = 0; index < 2; index += 1) {
        const ctx = new Context();
        contexts.push(ctx);
        await ctx.plugin(SlotRegistry);
        const target: ClientModuleLoaderTarget = {
          mode: "queue",
          pendingQueue: [],
          load: () => {},
          create: (options) =>
            createClientModuleSystem(target, { id: "bootstrap", exports: {} }, options),
        };
        ctx.reflect.provide(
          "modules",
          target.create({ boot: { rev: "0", entries: [], batches: [] }, staticModules: [] }),
        );
        const absent = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
        const current = { getSnapshot: () => absent, subscribe: () => () => {} };
        ctx.slots.installScope("session", { current, bindingSource: () => current });
        ctx.slots.install(createVueSlotRenderer());
        ctx.slots.register(
          { name: "root" },
          defineSlotComponent<object>([], () => {
            const id = useId();
            prefixes.push(getCurrentInstance()!.appContext.config.idPrefix);
            onScopeDispose(() => {
              releases += 1;
            });
            return () =>
              h("div", [h("label", { for: id }, `field ${revision.value}`), h("input", { id })]);
          }),
        );
        const container = document.createElement("main");
        containers.push(container);
        document.body.append(container);
        const renderer = new UiRenderer(ctx);
        renderers.push(renderer);
        renderer.mount(container);
      }
      const inputs = containers.map((container) => container.querySelector("input")!);
      const labels = containers.map((container) => container.querySelector("label")!);
      expect(prefixes).toHaveLength(2);
      expect(prefixes[0]).toMatch(/^dsh-/);
      expect(prefixes[1]).toMatch(/^dsh-/);
      expect(prefixes[0]).not.toBe(prefixes[1]);
      expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
      labels.forEach((label, index) => {
        expect(label.control).toBe(inputs[index]);
      });
      const ids = inputs.map((input) => input.id);
      revision.value += 1;
      await nextTick();
      expect(containers.map((container) => container.querySelector("input")!.id)).toEqual(ids);
      labels.forEach((label) => {
        expect(label.textContent).toBe("field 1");
      });
      expect(releases).toBe(0);
      renderers.forEach((renderer) => {
        renderer.dispose();
      });
      expect(releases).toBe(2);
      expect(containers.map((container) => container.childElementCount)).toEqual([0, 0]);
      renderers.forEach((renderer) => {
        renderer.dispose();
      });
      expect(releases).toBe(2);
    } finally {
      renderers.forEach((renderer) => {
        renderer.dispose();
      });
      containers.forEach((container) => {
        container.remove();
      });
      await Promise.all(contexts.map((ctx) => ctx.fiber.dispose()));
    }
  },
);
