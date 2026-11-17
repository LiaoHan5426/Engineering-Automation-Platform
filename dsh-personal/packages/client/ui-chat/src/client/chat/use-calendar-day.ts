// Component-local calendar-day tick keeps message clocks current across midnight.
import { onMounted, onScopeDispose, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.ts'

/** Local calendar-day epoch, advanced at the next local midnight.
 * @returns a readonly ref to the start of the current local day.
 */
export function useCalendarDay(): Readonly<ShallowRef<number>> {
  const day = shallowRef(startOfLocalDay(Date.now()))
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = (): void => {
    const now = Date.now()
    day.value = startOfLocalDay(now)
    timer = setTimeout(arm, msUntilNextLocalMidnight(now))
  }
  onMounted(() => { timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now())) })
  onScopeDispose(() => { clearTimeout(timer) })
  return shallowReadonly(day)
}
