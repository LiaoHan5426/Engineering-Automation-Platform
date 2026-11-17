// @vitest-environment jsdom
import { h as vueH } from 'vue'
/** Inert factory content for row placement and label tests; menu gestures belong to ui-context-menu. */
import type { ContextMenuButtonProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
/** Factory placeholder retaining only the caller's accessible label and styling. */
export const renderMenuButton: PropsRenderFactories['renderFactorySlot'] = (_name, owner) => {
  const { label, className } = owner as ContextMenuButtonProps
  return vueH('button', { type: 'button', 'aria-label': label, class: className })
}
