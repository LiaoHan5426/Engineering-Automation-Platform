import { computed, shallowRef, watchEffect, type Ref } from 'vue'
import { supportsHighlighting } from './highlight.ts'

const noop = (): void => {}

/** One document-wide observer; activated elements leave it permanently. */
class HighlightViewport {
  private observer: IntersectionObserver | undefined
  private readonly activators = new Map<Element, () => void>()

  observe(element: Element, activate: () => void): () => void {
    if (typeof IntersectionObserver === 'undefined') {
      activate()
      return noop
    }
    this.observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const current = this.activators.get(entry.target)
        /* v8 ignore next -- the observer reports only elements still registered with it. */
        if (current === undefined) continue
        this.activators.delete(entry.target)
        this.observer?.unobserve(entry.target)
        current()
      }
      this.releaseEmptyObserver()
    })
    this.activators.set(element, activate)
    this.observer.observe(element)
    return () => {
      this.activators.delete(element)
      this.observer?.unobserve(element)
      this.releaseEmptyObserver()
    }
  }

  private releaseEmptyObserver(): void {
    if (this.activators.size > 0) return
    this.observer?.disconnect()
    this.observer = undefined
  }
}

const highlightViewport = new HighlightViewport()

/**
 * Activate one supported code surface when it first intersects the viewport.
 * Activation lasts for the component lifetime; browsers without
 * IntersectionObserver activate immediately.
 * @param target - Code surface whose plain rendering reserves its geometry.
 * @param lang - Optional language hint.
 * @returns Whether this component may build highlighted output.
 */
export function useViewportHighlighting(
  target: Readonly<Ref<Element | null>>,
  lang: () => string | undefined,
): Readonly<Ref<boolean>> {
  const activated = shallowRef(false)
  const supported = computed(() => supportsHighlighting(lang()))
  watchEffect((onCleanup) => {
    if (activated.value || !supported.value || target.value === null) return
    onCleanup(highlightViewport.observe(target.value, () => { activated.value = true }))
  }, { flush: 'post' })
  return computed(() => activated.value && supported.value)
}
