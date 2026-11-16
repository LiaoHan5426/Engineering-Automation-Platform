/** Native Vue mounting and DOM interaction helpers for docking component specs. */
import { render as renderVNode, nextTick, type VNode } from "vue";
import { fireEvent as dispatch, getQueriesForElement } from "@testing-library/dom";
export { screen } from "@testing-library/dom";

const mounted = new Set<HTMLElement>();

export function render(node: VNode) {
  const container = document.createElement("div");
  document.body.append(container);
  mounted.add(container);
  renderVNode(node, container);
  return {
    container,
    ...getQueriesForElement(document.body),
    rerender(next: VNode) {
      renderVNode(next, container);
    },
    unmount() {
      renderVNode(null, container);
      container.remove();
      mounted.delete(container);
    },
  };
}

export function cleanup(): void {
  for (const container of mounted) {
    renderVNode(null, container);
    container.remove();
  }
  mounted.clear();
}

export async function act(action: () => void): Promise<void> {
  action();
  await nextTick();
}

type AsyncFire = {
  [K in keyof typeof dispatch]: (...args: Parameters<(typeof dispatch)[K]>) => Promise<boolean>;
};
const fire = async (...args: Parameters<typeof dispatch>): Promise<boolean> => {
  const result = dispatch(...args);
  await nextTick();
  return result;
};
export const fireEvent = Object.assign(
  fire,
  Object.fromEntries(
    Object.entries(dispatch).map(([key, handler]) => [
      key,
      async (...args: Parameters<typeof handler>) => {
        const result = handler(...args);
        await nextTick();
        return result;
      },
    ]),
  ),
) as object as typeof fire & AsyncFire;
