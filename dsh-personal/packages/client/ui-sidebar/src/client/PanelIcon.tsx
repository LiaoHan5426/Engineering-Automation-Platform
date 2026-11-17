/** Shared rendering of plugin-owned panel icons in navigation rows and menus. */
import { defineComponent } from 'vue'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './contract/slots.ts'

/**
 * Render the icon registered for one panel at the caller's size and selection state.
 * @param props - Panel identity, icon presentation, and the authorized child renderer.
 * @returns The matching panel icon.
 */
export const PanelIcon = defineComponent((props: FactoryComponentPropsOf<'sidebar.panel.icon'>) => {
  return () => props.renderSlot('sidebar.panellist', { size: props.size, active: props.active }, { only: props.id })
}, { props: ['id','size','active','renderSlot','renderFactorySlot','useFactorySlot','useSessions','usePanelInfo','useSessionRetainInfo','useRemoteAccess','useSessionAccess'], inheritAttrs:false })
