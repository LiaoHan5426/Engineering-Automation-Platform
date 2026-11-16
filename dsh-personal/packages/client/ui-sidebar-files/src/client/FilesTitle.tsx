/** The files tab's title glyph and captured label. */
import { defineComponent, h, Fragment } from 'vue'
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './FilesBody.module.css'

/** Native title component selecting the current tab information during setup. */
export const FilesTitle = defineComponent((props: PropsRuntime<'sidebar.right.pane.tab.title'>) => {
  const info = props.useTabInfo()
  return () => h(Fragment, null, [h(FileTypeIcon, { kind: 'folder', size: 16, className: css.titleIcon }), info.value.tab.title])
}, { name: 'FilesTitle', props: ['useTabInfo'], inheritAttrs: false })
