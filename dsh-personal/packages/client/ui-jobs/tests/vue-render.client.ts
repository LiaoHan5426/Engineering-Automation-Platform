/** Native Vue mounting and DOM interaction helpers for job component specs. */
import { createApp, shallowRef, nextTick, type VNode } from "vue";
import { fireEvent as dispatch, createEvent, getQueriesForElement } from "@testing-library/dom";
export { screen, waitFor, within, createEvent } from "@testing-library/dom";

let nextRoot = 0;
const mounted = new Map<HTMLElement, () => void>();

export function render(node: VNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const current = shallowRef(node);
  const app = createApp({ render: () => current.value });
  app.config.idPrefix = `jobs-${nextRoot++}`;
  app.mount(container);
  mounted.set(container, () => app.unmount());
  return {
    container,
    ...getQueriesForElement(document.body),
    rerender(next: VNode) {
      current.value = next;
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
        const eventName = key === "change" ? "input" : key === "doubleClick" ? "dblClick" : key;
        const make = createEvent[eventName as keyof typeof createEvent];
        return fire(element, make(element, options));
      },
    ]),
  ),
) as object as typeof fire & AsyncFire;
