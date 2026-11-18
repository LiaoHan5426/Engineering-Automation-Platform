import { defineComponent } from 'vue'
import type { EnvironmentSectionProps } from './slots.ts'
/** Environment contributions render directly into the section. */
export const EnvironmentSection = defineComponent((p: EnvironmentSectionProps) => () => p.renderSlot('conversation.session.panel.environment.row', { presentation: p.presentation, dismissOverlay: p.dismissOverlay }), { props: ['presentation', 'dismissOverlay', 'renderSlot'] })
