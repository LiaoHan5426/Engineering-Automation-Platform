/** Native Vue mounting and DOM interaction helpers for action card component specs. */
import {
  isRef,
  createApp,
  shallowRef,
  nextTick,
  computed,
  inject,
  watch,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  type VNode,
} from "vue";
import { fireEvent as dispatch, createEvent, getQueriesForElement } from "@testing-library/dom";
export { screen, waitFor, within, createEvent, isInaccessible } from "@testing-library/dom";

const EPOCH = Symbol("fixture epoch");
let nextRoot = 0;
const mounted = new Map<HTMLElement, () => void>();

export function render(node: VNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const current = shallowRef(node);
  const app = createApp({ render: () => current.value });
  app.config.idPrefix = `schedule-${nextRoot++}`;
  const epoch = shallowRef(0);
  app.provide(EPOCH, epoch);
  app.mount(container);
  mounted.set(container, () => app.unmount());
  return {
    container,
    ...getQueriesForElement(document.body),
    rerender(next: VNode) {
      epoch.value++;
      current.value = next;
      return nextTick();
    },
    unmount() {
      app.unmount();
      container.remove();
      mounted.delete(container);
    },
  };
}

export function cleanup(): void {
  for (const [container, unmount] of mounted) {
    unmount();
    container.remove();
  }
  mounted.clear();
}

export async function act(action: () => void | Promise<void>): Promise<void> {
  await action();
  await nextTick();
}

type AsyncFire = {
  [K in keyof typeof dispatch]: (...args: Parameters<(typeof dispatch)[K]>) => Promise<boolean>;
};
const fire = async (...args: Parameters<typeof dispatch>): Promise<boolean> => {
  if (args[1].type === "click" && args[0] instanceof Element && args[0].matches(":disabled"))
    return false;
  // Match Vue Test Utils: an event created after binding must pass Vue's same-tick listener guard.
  Object.assign(args[1], { _vts: Date.now() + 1 });
  const result = dispatch(...args);
  await nextTick();
  return result;
};
export const fireEvent = Object.assign(
  fire,
  Object.fromEntries(
    Object.entries(dispatch).map(([key]) => [
      key,
      async (element: Element | Document | Node | Window, options?: object) => {
        const eventName = key === "doubleClick" ? "dblClick" : key;
        const make = createEvent[eventName as keyof typeof createEvent];
        return fire(element, make(element, options));
      },
    ]),
  ),
) as object as typeof fire & AsyncFire;

/** Keep test-provided selector sources live while preserving component identity. */
export function liveFixtureProps<P extends object>(props: P): () => P {
  const epoch = inject(EPOCH, shallowRef(0));
  const parent = getCurrentScope()!;
  const bindings: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!/^use[A-Z]/.test(key) || key === "useContextMenu" || key === "useResource") continue;
    const source = () => Reflect.get(props, key);
    if (typeof source() !== "function") continue;
    bindings[key] = (...args: unknown[]) => {
      let scope = parent.run(() => effectScope())!;
      const evaluate = () =>
        scope.run(() => {
          const hook: unknown = source();
          if (typeof hook !== "function") throw new Error("Expected a selector fixture");
          const selected: unknown = Reflect.apply(hook, undefined, args);
          if (!isRef(selected)) throw new Error("Expected a Vue ref from selector fixture");
          return selected;
        })!;
      const selected = shallowRef({ value: evaluate() });
      watch(
        [source, epoch],
        () => {
          scope.stop();
          scope = parent.run(() => effectScope())!;
          selected.value = { value: evaluate() };
        },
        { flush: "sync" },
      );
      onScopeDispose(() => scope.stop());
      return computed(() => selected.value.value.value);
    };
  }
  return () => Object.assign({}, props, bindings);
}
