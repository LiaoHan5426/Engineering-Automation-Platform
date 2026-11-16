/** Reference clock for relative time remaining and delivery-floor deadlines. */
import { readonly, shallowRef, watch, toValue, type MaybeRefOrGetter, type Ref } from "vue";

/** Refresh period for relative text naming whole seconds, minutes, hours, or days. */
export const RELATIVE_CLOCK_PERIOD_MS = 30_000;

/** Longest delay a timer holds before the platform would fire it immediately. */
const TIMER_LIMIT_MS = 2 ** 31 - 1;

/**
 * Sample epoch milliseconds periodically and at an optional delivery-floor deadline.
 * Timers belong to the calling component's effect scope and stop on disposal.
 * @param periodMs - refresh period, defaulting to half a minute.
 * @param wakeAt - reactive deadline; a past deadline samples immediately, and one beyond the timer limit waits for periodic sampling.
 * @returns the current sample, updated at each period and deadline.
 */
export function useRelativeClock(
  periodMs: number = RELATIVE_CLOCK_PERIOD_MS,
  wakeAt?: MaybeRefOrGetter<number | undefined>,
): Readonly<Ref<number>> {
  const now = shallowRef(Date.now());
  watch(
    () => periodMs,
    (_period, _previous, onCleanup) => {
      const timer = setInterval(() => {
        now.value = Date.now();
      }, periodMs);
      onCleanup(() => {
        clearInterval(timer);
      });
    },
    { immediate: true },
  );
  watch(
    () => toValue(wakeAt),
    (deadline, _previous, onCleanup) => {
      if (deadline === undefined || deadline - Date.now() > TIMER_LIMIT_MS) return;
      const timer = setTimeout(
        () => {
          now.value = Math.max(Date.now(), deadline);
        },
        Math.max(0, deadline - Date.now()),
      );
      onCleanup(() => {
        clearTimeout(timer);
      });
    },
    { immediate: true },
  );
  return readonly(now);
}
