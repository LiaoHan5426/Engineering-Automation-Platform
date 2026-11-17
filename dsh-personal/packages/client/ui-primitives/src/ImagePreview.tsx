/** Passive, contained image preview for Markdown image links. */
import { defineComponent, h, shallowRef, watch } from 'vue'
import { IconLoadingOutlineRegular } from './icons/index.tsx'
import css from './ImagePreview.module.css'

/** A contained image with owner-localized loading and failure status. */
export const ImagePreview = defineComponent({
  name: 'ImagePreview',
  props: {
    src: { type: String, required: true }, alt: { type: String, required: true },
    loadingLabel: { type: String, required: true }, failedLabel: { type: String, required: true },
  },
  setup(props) {
    const state = shallowRef<'loading' | 'ready' | 'failed'>('loading')
    watch(() => props.src, () => { state.value = 'loading' }, { flush: 'sync' })
    return () => h('span', { class: css.frame }, [
      state.value !== 'failed' ? h('img', { key: props.src, src: props.src, alt: props.alt, loading: 'lazy', decoding: 'async',
        referrerpolicy: 'no-referrer', class: css.image, 'data-ready': state.value === 'ready' || undefined,
        onLoad: () => { state.value = 'ready' }, onError: () => { state.value = 'failed' } }) : null,
      state.value !== 'ready' ? h('span', { class: css.status, role: 'status' }, [
        state.value === 'loading' ? h(IconLoadingOutlineRegular, { size: 16 }) : null,
        h('span', state.value === 'loading' ? props.loadingLabel : props.failedLabel),
      ]) : null,
    ])
  },
})
