/** Native Vue setup components with explicit runtime prop names. */
import { defineComponent, type DefineSetupFnComponent, type VNodeChild } from "vue";

/**
 * Declare a native Vue component with the slot-derived input type.
 * @param keys - runtime prop names, including renderer-provided seats used by setup.
 * @param setup - one scope-owned setup returning the component render function.
 * @returns the typed Vue component definition.
 */
export function defineSlotComponent<P extends object>(
  keys: (keyof P & string)[],
  setup: (props: P) => () => VNodeChild,
): DefineSetupFnComponent<P> {
  return defineComponent(setup, { props: keys, inheritAttrs: false });
}
