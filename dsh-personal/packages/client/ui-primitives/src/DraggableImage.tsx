/** Original-image drag gestures owned by a presentation primitive. */
import { defineComponent, h, type PropType, type ImgHTMLAttributes, type ComponentPublicInstance } from 'vue'
import { useImageDrag } from './image-drag.ts'
import type { FileDragActions } from './file-drag-actions.ts'

/** Image presentation plus original content and explicit file preparation callbacks. */
export interface DraggableImageProps extends Omit<ImgHTMLAttributes, 'src' | 'draggable' | 'onDragstart' | 'onDragend' | 'onPointerenter' | 'onPointerleave' | 'onPointerdown' | 'onPointerup' | 'onClickCapture'> {
  readonly fileDrag: FileDragActions
  readonly src: string
  readonly name: string
  readonly resourceAddress?: string | undefined
  readonly original?: File | undefined
  readonly elementRef?: ((element: HTMLImageElement | null) => void) | undefined
}

/** Native image events prepare original-file dragging and suppress its following mouse click. */
export const DraggableImage = defineComponent({
  name: 'DraggableImage',
  inheritAttrs: false,
  props: {
    fileDrag: { type: Object as PropType<FileDragActions>, required: true },
    src: { type: String, required: true }, name: { type: String, required: true },
    original: Object as PropType<File>, resourceAddress: String,
    elementRef: Function as PropType<(element: HTMLImageElement | null) => void>,
  },
  setup(props, { attrs }) {
    const drag = useImageDrag(() => ({ actions: props.fileDrag, src: props.src, name: props.name,
      original: props.original, resourceAddress: props.resourceAddress }))
    return () => h('img', { ...attrs, ...drag, src: props.src, draggable: true,
      ref: (element: Element | ComponentPublicInstance | null) => props.elementRef?.(
        element instanceof HTMLImageElement ? element : null) })
  },
})
