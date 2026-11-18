// @vitest-environment jsdom
import {
  defineComponent,
  watch,
  watchEffect,
  shallowRef,
  onScopeDispose,
  h as vueH,
  onMounted,
} from "vue";
import { SlotAssemblyError } from "../src/client/errors.ts";

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {} from "@testing-library/dom";
import { cleanupVue as cleanup, flushVue as act } from "../../ui-primitives/tests/vue-render.ts";

import { Context } from "@deepseek-ai/cordis";
import {
  createClientModuleSystem,
  type ClientModuleLoader,
  type ClientModuleLoaderTarget,
} from "@deepseek-ai/dsh-client-modules/client";
import { SlotRegistry } from "../src/client/registry.ts";
import type { SlotScopeAdapter, StandardSourceBinding } from "../src/client/index.ts";
import { apply as nodeApply } from "@deepseek-ai/dsh-client-ui-renderer";
import * as UiRenderer from "../src/client/index.ts";
const mounted: (() => void)[] = [];
afterEach(async () => {
  await act(() => {
    for (const unmount of mounted.splice(0)) unmount();
  });
  vi.restoreAllMocks();
  cleanup();
  document.body.innerHTML = "";
});
const stabilize = async (fn: () => void | Promise<void>): Promise<void> => {
  await act(async () => {
    await fn();
  });
};
async function bench(beforeApply?: (modules: ClientModuleLoader) => void) {
  const ctx = new Context();
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
  beforeApply?.(modules);
  ctx.reflect.provide("modules", modules);
  const fiber = ctx.plugin({ inject: [...UiRenderer.inject], apply: UiRenderer.apply });
  await fiber.await();
  const slots = ctx.get("slots") as SlotRegistry;
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  };
  const current = {
    getSnapshot: () => absentBinding,
    subscribe: () => () => {},
  };
  const adapter: SlotScopeAdapter = {
    current,
    bindingSource: () => current,
  };
  slots.installScope("session", adapter);
  return { ctx, slots, fiber, modules, target };
}
function container(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}
describe("UI renderer plugin", () => {
  it("provides no host-side behavior", () => {
    expect(() => {
      nodeApply();
    }).not.toThrow();
  });
  it("installs the renderer and mounts the assembled application", async () => {
    const { ctx, slots } = await bench();
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const renderer = ctx.get("uiRenderer");
    expect(renderer).toBeDefined();
    const el = container();
    await act(() => {
      mounted.push(renderer!.mount(el));
    });
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy();
  });
  it("installs module CSS before rendering and removes it after the Vue application unmounts", async () => {
    const { ctx, slots, modules, target } = await bench();
    const css = () => document.head.querySelector('style[data-path="root-style"]');
    target.load({
      id: "root-module",
      factory: () => ({}),
      meta: () => ({ stylesheets: { "root-style": { text: () => ".root { display: block }" } } }),
    });
    await modules.import("root-module");
    let cleanupSawStyles = false;
    slots.register(
      { name: "root" },
      defineComponent(
        (_props: {}) => {
          expect(css()).not.toBeNull();
          onMounted(() =>
            watch(
              () => [],
              (_value, _previous, onCleanup) => {
                const cleanup = (() => () => {
                  cleanupSawStyles = css() !== null;
                })();
                if (typeof cleanup === "function") onCleanup(cleanup);
              },
              { immediate: true, flush: "post" },
            ),
          );
          return () =>
            vueH("div", {
              "data-testid": "styled-root",
            });
        },
        {
          props: [],
          inheritAttrs: false,
        },
      ),
    );
    const el = container();
    let unmount!: () => void;
    await act(() => {
      unmount = ctx.get("uiRenderer")!.mount(el);
    });
    mounted.push(unmount);
    expect(el.querySelector('[data-testid="styled-root"]')).not.toBeNull();
    await act(() => {
      unmount();
    });
    expect(cleanupSawStyles).toBe(true);
    expect(css()).toBeNull();
  });
  it("does not subscribe to module records until the application mounts", async () => {
    const subscribed = vi.fn();
    const { ctx, slots, target, modules } = await bench((modules) => {
      const subscribe = modules.subscribeModules.bind(modules);
      vi.spyOn(modules, "subscribeModules").mockImplementation((listener) => {
        subscribed();
        return subscribe(listener);
      });
    });
    const meta = vi.fn(() => ({
      stylesheets: { idle: { text: () => ".idle { display: block }" } },
    }));
    target.load({ id: "idle", factory: () => ({}), meta });
    await modules.import("idle");
    expect(subscribed).not.toHaveBeenCalled();
    expect(meta).not.toHaveBeenCalled();
    expect(document.head.querySelector('style[data-path="idle"]')).toBeNull();
    slots.register({ name: "root" }, () => vueH("div", null));
    await act(() => {
      mounted.push(ctx.get("uiRenderer")!.mount(container()));
    });
    expect(subscribed).toHaveBeenCalledTimes(1);
    expect(meta).toHaveBeenCalledTimes(1);
  });
  it("rejects a second simultaneous mount without disturbing the first application", async () => {
    const { ctx, slots, modules } = await bench();
    const subscribe = vi.spyOn(modules, "subscribeModules");
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const renderer = ctx.get("uiRenderer")!;
    const first = container();
    const second = container();
    await act(() => {
      mounted.push(renderer.mount(first));
    });
    expect(() => renderer.mount(second)).toThrow("already mounted");
    expect(first.querySelector('[data-testid="root-probe"]')).not.toBeNull();
    expect(second.childNodes).toHaveLength(0);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
  it("keeps an old mount disposer from removing a later root and its styles", async () => {
    const { ctx, slots, modules, target } = await bench();
    target.load({
      id: "remount-style",
      factory: () => ({}),
      meta: () => ({ stylesheets: { remount: { text: () => ".remount { display: block }" } } }),
    });
    await modules.import("remount-style");
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const renderer = ctx.get("uiRenderer")!;
    const first = container();
    let oldUnmount!: () => void;
    await act(() => {
      oldUnmount = renderer.mount(first);
    });
    await act(() => {
      oldUnmount();
    });
    expect(first.childNodes).toHaveLength(0);
    expect(document.head.querySelector('style[data-path="remount"]')).toBeNull();
    const second = container();
    await act(() => {
      mounted.push(renderer.mount(second));
    });
    const style = document.head.querySelector('style[data-path="remount"]');
    expect(style).not.toBeNull();
    await act(() => {
      oldUnmount();
    });
    expect(second.querySelector('[data-testid="root-probe"]')).not.toBeNull();
    expect(document.head.querySelector('style[data-path="remount"]')).toBe(style);
  });
  it.each(["meta", "text"] as const)(
    "mounts the application when an initial %s producer fails and styles the corrected module",
    async (failureStage) => {
      const { ctx, slots, modules, target } = await bench();
      const failure = new Error(`initial ${failureStage} failed`);
      target.load({
        id: "broken-style",
        factory: () => ({}),
        meta: () => {
          if (failureStage === "meta") throw failure;
          return {
            stylesheets: {
              retry: {
                text: () => {
                  throw failure;
                },
              },
            },
          };
        },
      });
      target.load({
        id: "healthy-style",
        factory: () => ({}),
        meta: () => ({ stylesheets: { healthy: { text: () => ".healthy { display: block }" } } }),
      });
      await modules.import("broken-style");
      await modules.import("healthy-style");
      slots.register({ name: "root" }, () =>
        vueH("div", {
          "data-testid": "root-probe",
        }),
      );
      const renderer = ctx.get("uiRenderer")!;
      const el = container();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await act(() => {
        mounted.push(renderer.mount(el));
      });
      expect(el.querySelector('[data-testid="root-probe"]')).not.toBeNull();
      expect(document.head.querySelector('style[data-path="healthy"]')).not.toBeNull();
      expect(document.head.querySelector('style[data-path="retry"]')).toBeNull();
      expect(error.mock.calls).toEqual([[expect.stringContaining('"broken-style"'), failure]]);
      modules.invalidate("broken-style");
      target.load({
        id: "broken-style",
        factory: () => ({}),
        meta: () => ({ stylesheets: { retry: { text: () => ".retry { display: block }" } } }),
      });
      await modules.import("broken-style");
      expect(document.head.querySelector('style[data-path="retry"]')).not.toBeNull();
      expect(error).toHaveBeenCalledTimes(1);
    },
  );
  it("releases styles if Vue application creation fails and can mount afterward", async () => {
    let subscriptions = 0;
    const { ctx, slots, modules, target } = await bench((modules) => {
      const subscribe = modules.subscribeModules.bind(modules);
      vi.spyOn(modules, "subscribeModules").mockImplementation((listener) => {
        subscriptions++;
        const stop = subscribe(listener);
        return () => {
          subscriptions--;
          stop();
        };
      });
    });
    target.load({
      id: "root-creation",
      factory: () => ({}),
      meta: () => ({ stylesheets: { creation: { text: () => ".creation { display: block }" } } }),
    });
    await modules.import("root-creation");
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const renderer = ctx.get("uiRenderer")!;
    const el = container();
    const events = vi.spyOn(el, "insertBefore").mockImplementation(() => {
      throw new Error("cannot insert mounted content");
    });
    await expect(async () => {
      await act(() => {
        renderer.mount(el);
      });
    }).rejects.toThrow("cannot insert mounted content");
    expect(subscriptions).toBe(0);
    expect(document.head.querySelector('style[data-path="creation"]')).toBeNull();
    events.mockRestore();
    const replacement = container();
    await act(() => {
      mounted.push(renderer.mount(replacement));
    });
    expect(replacement.querySelector('[data-testid="root-probe"]')).not.toBeNull();
    expect(subscriptions).toBe(1);
  });
  it("hydrates the boot page before switching to the assembled application", async () => {
    const { ctx, slots } = await bench();
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const el = container();
    el.innerHTML =
      '<div class="boot" data-dsh-boot=""><div><div class="spinner" data-dsh-boot-spinner="" style="--dsh-boot-arc: 180deg"></div><div>Loading plugins…</div></div></div>';
    const boot = el.firstElementChild;
    const observer = new MutationObserver(() => {});
    observer.observe(el, { childList: true, subtree: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(() => {
      mounted.push(ctx.get("uiRenderer")!.mount(el));
    });
    const records = observer.takeRecords();
    observer.disconnect();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy();
    expect(records.some((record) => record.target === boot)).toBe(false);
  });
  it("returns an unmount disposer", async () => {
    const { ctx, slots } = await bench();
    slots.register({ name: "root" }, () =>
      vueH("div", {
        "data-testid": "root-probe",
      }),
    );
    const el = container();
    let unmount: () => void = () => {};
    await act(() => {
      unmount = ctx.get("uiRenderer")!.mount(el);
    });
    await act(() => {
      unmount();
    });
    expect(el.querySelector('[data-testid="root-probe"]')).toBeNull();
  });
  it("unmounts its owned root and styles when the plugin leaves and rejects stale service calls", async () => {
    let subscriptions = 0;
    const { ctx, slots, fiber, modules, target } = await bench((modules) => {
      const subscribe = modules.subscribeModules.bind(modules);
      vi.spyOn(modules, "subscribeModules").mockImplementation((listener) => {
        subscriptions++;
        const stop = subscribe(listener);
        return () => {
          subscriptions--;
          stop();
        };
      });
    });
    target.load({
      id: "owned-root",
      factory: () => ({}),
      meta: () => ({ stylesheets: { owned: { text: () => ".owned { display: block }" } } }),
    });
    await modules.import("owned-root");
    let cleanupSawStyles = false;
    slots.register(
      { name: "root" },
      defineComponent(
        (_props: {}) => {
          onMounted(() =>
            watch(
              () => [],
              (_value, _previous, onCleanup) => {
                const cleanup = (() => () => {
                  cleanupSawStyles =
                    document.head.querySelector('style[data-path="owned"]') !== null;
                })();
                if (typeof cleanup === "function") onCleanup(cleanup);
              },
              { immediate: true, flush: "post" },
            ),
          );
          return () =>
            vueH("div", {
              "data-testid": "root-probe",
            });
        },
        {
          props: [],
          inheritAttrs: false,
        },
      ),
    );
    const renderer = ctx.get("uiRenderer")!;
    const el = container();
    await act(() => {
      mounted.push(renderer.mount(el));
    });
    await stabilize(() => fiber.dispose());
    expect(el.childNodes).toHaveLength(0);
    expect(cleanupSawStyles).toBe(true);
    expect(document.head.querySelector('style[data-path="owned"]')).toBeNull();
    expect(subscriptions).toBe(0);
    expect(ctx.get("uiRenderer")).toBeUndefined();
    expect(() => renderer.mount(container())).toThrow("disposed renderer");
  });
  it("releases style resources even when native cleanup throws", async () => {
    let subscriptions = 0;
    const { ctx, slots, modules, target } = await bench((modules) => {
      const subscribe = modules.subscribeModules.bind(modules);
      vi.spyOn(modules, "subscribeModules").mockImplementation((listener) => {
        subscriptions++;
        const stop = subscribe(listener);
        return () => {
          subscriptions--;
          stop();
        };
      });
    });
    target.load({
      id: "cleanup-style",
      factory: () => ({}),
      meta: () => ({ stylesheets: { cleanup: { text: () => ".cleanup { display: block }" } } }),
    });
    await modules.import("cleanup-style");
    const failure = new Error("layout cleanup failed");
    slots.register(
      { name: "root" },
      defineComponent(
        (_props: {}) => {
          onMounted(() =>
            watch(
              () => [],
              (_value, _previous, onCleanup) => {
                const cleanup = (() => () => {
                  throw failure;
                })();
                if (typeof cleanup === "function") onCleanup(cleanup);
              },
              { immediate: true, flush: "post" },
            ),
          );
          return () => vueH("div", null);
        },
        {
          props: [],
          inheritAttrs: false,
        },
      ),
    );
    const renderer = ctx.get("uiRenderer")!;
    let unmount!: () => void;
    await act(() => {
      unmount = renderer.mount(container());
    });
    mounted.push(unmount);
    const expectedError = (event: ErrorEvent): void => {
      if (event.error === failure) event.preventDefault();
    };
    window.addEventListener("error", expectedError);
    try {
      await expect(
        act(() => {
          unmount();
        }),
      ).rejects.toMatchObject({
        message: "renderer: unmount cleanup failed",
        errors: [failure],
      });
    } finally {
      window.removeEventListener("error", expectedError);
    }
    expect(subscriptions).toBe(0);
    expect(document.head.querySelector('style[data-path="cleanup"]')).toBeNull();
    await expect(
      act(() => {
        unmount();
      }),
    ).resolves.toBeUndefined();
  });
  it("releases setup scopes after an initial assembly failure and permits a clean retry", async () => {
    const { ctx, slots } = await bench();
    const revision = shallowRef(0);
    let reads = 0;
    let releases = 0;
    const failure = new SlotAssemblyError("initial assembly failure");
    const remove = slots.register(
      { name: "root" },
      defineComponent(() => {
        watchEffect(() => {
          void revision.value;
          reads++;
        });
        onScopeDispose(() => {
          releases++;
        });
        throw failure;
        return () => null;
      }),
    );
    const renderer = ctx.get("uiRenderer")!;
    expect(() => renderer.mount(container())).toThrow(failure);
    expect(releases).toBe(1);
    revision.value++;
    await act(() => {});
    expect(reads).toBe(1);
    remove();
    slots.register({ name: "root" }, () => vueH("div", "recovered"));
    const destination = container();
    mounted.push(renderer.mount(destination));
    expect(destination.textContent).toBe("recovered");
  });
  it("retracts the service and renderer with its fiber", async () => {
    const { ctx, slots, fiber } = await bench();
    await stabilize(() => fiber.dispose());
    expect(ctx.get("uiRenderer")).toBeUndefined();
    expect(() => slots.renderSlot("root", {})).toThrow("not installed");
  });
});
