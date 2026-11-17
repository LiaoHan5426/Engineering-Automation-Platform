/**
 * Resolve the task one task tab shows.
 *
 * The Sidebar persists a tab's layout record but not the navigation parameters
 * its opener passed, so a restored tab falls back to the binding this page kind
 * last wrote for that layout id. The tab's body and its chip resolve the shown
 * task the same way; the body additionally needs to know whether the current
 * layout still carries parameters, because only a navigated tab reports a
 * missing task.
 * @module
 */
import { computed, watch, type Ref } from 'vue'
import type { SidebarRightNavigationParams } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { scheduleTaskParams } from './definition.ts'
import type { TaskTabBindings, TaskTabPage, TaskTabTarget } from './task-tab-bindings.ts'

/** The layout and navigation fields one task tab carries. */
export interface TaskTabSource extends TaskTabPage {
  /** Navigation the tab's last open carried; a restored record carries no parameters. */
  readonly navigation: { readonly params: SidebarRightNavigationParams; readonly revision: number }
}

/** The task one task tab resolves, and where it came from. */
export interface TaskTabTargetResolution {
  /** Whether the current layout still carries the opener's navigation parameters. */
  readonly navigated: boolean
  /** Task the navigation named, or undefined when it carried another type's parameters. */
  readonly navigation: TaskTabTarget | undefined
  /** Binding this page kind wrote for this layout id, read only for a restored record. */
  readonly recovered: TaskTabTarget | undefined
  /** Task to show: the navigation's, or the restored binding's. */
  readonly params: TaskTabTarget | undefined
}

/**
 * Resolve the task one task tab shows from its navigation or its stored binding.
 * @param sessionId - the Session holding the tab.
 * @param tab - the tab's layout fields and its last navigation.
 * @param taskBindings - provider-owned binding store for restored task tabs.
 * @returns the navigation, the recovered binding, and the task to show.
 */
export function useTaskTabTarget(
  sessionId: () => SessionId,
  tab: () => TaskTabSource,
  taskBindings: () => TaskTabBindings,
): Readonly<Ref<TaskTabTargetResolution>> {
  const navigated = computed(() => tab().navigation.params !== undefined)
  const recovered = computed(() =>
    navigated.value
      ? undefined
      : taskBindings().read(sessionId(), {
        id: tab().id,
        kind: tab().kind,
        contentId: tab().contentId,
      }),
  )
  watch(
    [
      taskBindings,
      sessionId,
      () => tab().id,
      () => tab().kind,
      () => tab().contentId,
      navigated,
      () => tab().navigation.revision,
    ],
    () => {
      if (!navigated.value)
        taskBindings().dropMismatched(sessionId(), {
          id: tab().id,
          kind: tab().kind,
          contentId: tab().contentId,
        })
    },
    { immediate: true, flush: 'post' },
  )
  return computed(() => {
    const navigation = scheduleTaskParams(tab().navigation.params)
    return {
      navigated: navigated.value,
      navigation,
      recovered: recovered.value,
      params: navigation ?? recovered.value,
    }
  })
}
