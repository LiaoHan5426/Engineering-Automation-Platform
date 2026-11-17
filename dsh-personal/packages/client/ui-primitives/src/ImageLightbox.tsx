/** Document-level original-image preview with focus containment and restoration. */
import { defineComponent, h, onMounted, onBeforeUnmount, shallowRef, Teleport, type PropType, type HTMLAttributes } from 'vue'
import { IconCloseOutlineRegular } from './icons/index.tsx'
import css from './ImageLightbox.module.css'

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface ImageLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

/** A body-portaled image dialog; an open image menu retains keyboard ownership. */
export const ImageLightbox = defineComponent({
  name: 'ImageLightbox',
  props: {
    src: { type: String, required: true }, alt: { type: String, required: true },
    labels: { type: Object as PropType<ImageLightboxLabels>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
    contextMenuProps: Object as PropType<Pick<HTMLAttributes, 'onContextmenu' | 'onKeydown' | 'tabindex'>>,
  },
  setup(props) {
    const close = shallowRef<HTMLButtonElement | null>(null)
    let restore: HTMLElement | null = null
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.activeElement?.closest('[role="menu"]')) return
      if (event.key === 'Escape') { event.stopPropagation(); props.onClose() }
      if (event.key === 'Tab') { event.preventDefault(); close.value?.focus() }
    }
    onMounted(() => {
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
      close.value?.focus()
      window.addEventListener('keydown', keydown, true)
    })
    onBeforeUnmount(() => { window.removeEventListener('keydown', keydown, true); restore?.focus() })
    return () => h(Teleport, { to: document.body }, h('div', {
      class: css.backdrop, role: 'dialog', 'aria-modal': 'true', 'aria-label': props.labels.dialog,
    }, h('div', { class: css.stage }, [
      h('div', { class: css.mask, 'aria-hidden': 'true', onMousedown: props.onClose }),
      h('img', { class: css.image, src: props.src, alt: props.alt, ...props.contextMenuProps }),
      h('button', { ref: close, type: 'button', class: css.close, 'aria-label': props.labels.close, onClick: props.onClose },
        h(IconCloseOutlineRegular, { size: 16 })),
    ])))
  },
})
