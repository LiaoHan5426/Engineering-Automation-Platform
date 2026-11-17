import { defineComponent, h, useId, type PropType } from 'vue'
import type { CodeFileType } from './code-file-types.ts'
import { CODE_FILE_ARTWORK, CODE_FILE_ICON_ID_TOKEN } from './code-file-icon-artwork.ts'

/** Full-color code-file artwork with instance-local SVG references. */
export const CodeFileIcon = defineComponent({
  name: 'CodeFileIcon',
  inheritAttrs: false,
  props: {
    type: { type: String as PropType<CodeFileType>, required: true },
    size: { type: Number, default: 20 },
    className: String,
  },
  setup(props) {
    const instanceId = `dsh-code-icon-${useId().replaceAll(':', '')}`
    return () => h('svg', {
      width: props.size, height: props.size, class: props.className,
      viewBox: '0 0 20 20', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
      // Tests reject unsafe markup and invalid local references in the static table.
      innerHTML: CODE_FILE_ARTWORK[props.type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId),
    })
  },
})
