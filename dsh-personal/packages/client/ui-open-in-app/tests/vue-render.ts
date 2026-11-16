/** DOM test mounting for native Vue tool rows, with explicit disposal per spec. */
import { createApp, effectScope, h, nextTick, render, type VNode } from "vue";
import { onTestFinished } from "vitest";
import { getQueriesForElement } from "@testing-library/dom";

const disposers = new Set<() => void>();

/** Dispose mounted test applications before restoring browser globals. */
export function cleanupVue(): void {
  for (const dispose of disposers) dispose();
}

/** Flush a test-driven browser callback and its reactive DOM updates.
 * @param update - Timer, focus, or observer callback to drive.
 * @returns Completion after Vue applies pending updates.
 */
export async function flushVue<T>(update: () => T): Promise<Awaited<T>> {
  const result = await update();
  await nextTick();
  return result;
}

let mountId = 0;
function TestRoot(props: { node: VNode }) {
  return props.node;
}

/** Mount a vnode into the document and retain Vue's patch path for subsequent updates.
 * @param node - initial component vnode.
 * @returns the container, update operation, and disposal operation.
 */
export function renderVue(node: VNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const app = createApp(TestRoot, { node });
  app.config.idPrefix = `test-${mountId++}`;
  app.mount(container);
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    disposers.delete(unmount);
    app.unmount();
    container.remove();
  };
  disposers.add(unmount);
  onTestFinished(unmount);
  return {
    ...getQueriesForElement(document.body),
    container,
    rerender: (next: VNode) => {
      render(h(TestRoot, { node: next }), container);
    },
    unmount,
  };
}

/** Run a native composable in a scope owned by the spec.
 * @param factory - composable setup.
 * @returns its result and explicit scope disposal.
 */
export function renderHookVue<T>(factory: () => T) {
  const scope = effectScope();
  let current!: T;
  scope.run(() => {
    current = factory();
  });
  const unmount = () => {
    scope.stop();
    disposers.delete(unmount);
  };
  disposers.add(unmount);
  onTestFinished(unmount);
  return { result: { current }, unmount };
}
