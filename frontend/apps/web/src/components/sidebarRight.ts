import { onMounted, onUnmounted, ref } from 'vue'

/** Layout column the shell declares and plugins seat into. */
export const SIDEBAR_RIGHT_ID = 'eap-cordis-sidebar-right'

/**
 * Mirrors the seat/collapse attributes of the layout sidebar column. Plugins own the
 * seat attribute, so the column is observed instead of tracked in shared state.
 */
export function useSidebarRight() {
  const seated = ref(false)
  const collapsed = ref(false)
  let observer: MutationObserver | undefined

  function sync() {
    const column = document.getElementById(SIDEBAR_RIGHT_ID)
    seated.value = !!column?.hasAttribute('data-sidebar-right-seat')
    collapsed.value = !!column?.hasAttribute('data-collapsed')
  }

  function setCollapsed(next: boolean) {
    const column = document.getElementById(SIDEBAR_RIGHT_ID)
    if (!column?.hasAttribute('data-sidebar-right-seat')) return
    if (next) column.setAttribute('data-collapsed', '')
    else column.removeAttribute('data-collapsed')
    sync()
  }

  onMounted(() => {
    const column = document.getElementById(SIDEBAR_RIGHT_ID)
    if (column) {
      observer = new MutationObserver(sync)
      observer.observe(column, {
        attributes: true,
        attributeFilter: ['data-sidebar-right-seat', 'data-collapsed', 'hidden'],
      })
    }
    sync()
  })
  onUnmounted(() => observer?.disconnect())

  return { seated, collapsed, setCollapsed }
}
