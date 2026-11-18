/** DOM test mounting for native Vue primitives, with explicit disposal per spec. */
import { createApp, h, nextTick, render, type VNode } from "vue";
import { onTestFinished } from "vite-plus/test";

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
  const failure: { error?: unknown } = {};
  app.config.errorHandler = (error) => {
    if (!("error" in failure)) failure.error = error;
  };
  try {
    app.mount(container);
  } catch (error) {
    app.unmount();
    container.remove();
    throw error;
  } finally {
    delete app.config.errorHandler;
  }
  if ("error" in failure) {
    app.unmount();
    container.remove();
    throw failure.error;
  }
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
    container,
    rerender: (next: VNode) => {
      render(h(TestRoot, { node: next }), container);
    },
    unmount,
  };
}
