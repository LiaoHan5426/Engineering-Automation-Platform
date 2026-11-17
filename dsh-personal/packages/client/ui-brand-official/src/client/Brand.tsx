import { defineComponent, h } from 'vue'
import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Render the official whale mark at the presentation requested by its host surface. */
export const OfficialBrandMark = defineComponent((props: SidebarBrandMarkOwnerProps) => () => h(FishLogo, { size: props.size }), {
  name: 'OfficialBrandMark', inheritAttrs: false, props: ['size'],
})

/** Render the official name artwork independently of its slotted mark. */
export const OfficialBrandName = defineComponent(() => () => h(BrandWordmark, { includeMark: false }), {
  name: 'OfficialBrandName', inheritAttrs: false,
})
