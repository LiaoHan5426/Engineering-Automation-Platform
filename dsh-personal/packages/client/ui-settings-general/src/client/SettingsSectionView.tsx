/** Reusable rendering of a settings section. */
import { defineComponent } from 'vue'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
/** Render the requested entry with its owner's leave action. */
export const SettingsSectionView = defineComponent((props: FactoryComponentPropsOf<'settings.section.view'>) => () => props.renderSlot('settings.section', { close: props.close }, { only: props.id }), { props: ['id', 'close', 'renderSlot'] })
