import { computed, defineComponent, Fragment, h, shallowRef, useId, watch, watchEffect } from 'vue'
import { isBehindModal, observeComposition } from '@deepseek-ai/dsh-client-ui-primitives'
import { panelElementId, toggleElementId } from './element-ids.ts'
import type { SessionPanelProps, SessionPanelSectionOwnerProps } from './slots.ts'
import { presentationOf } from './visibility.ts'
import css from './SessionPanel.module.css'
/** Docked or floating session panel, with focus-preserving overlay dismissal. */
export const SessionPanel = defineComponent((p: SessionPanelProps) => {
  const probe = useId()
  const probeRef = p.createProbeRef(p.sessionId, probe)
  let lastProbe: HTMLElement | null = null
  const attachProbe = (element: unknown) => {
    const next = element instanceof HTMLElement ? element : null
    if (next === lastProbe) return
    lastProbe = next
    probeRef(next)
  }
  const panel = shallowRef<HTMLElement | null>(null)
  let focusInside = false
  const dockable = p.useProbes(probes => probes.get(probe) === true)
  const visibility = p.useVisibility(v => v)
  const sections = p.useSections(entries => entries)
  const presentation = computed(() => presentationOf(dockable.value, visibility.value, p.sessionId))
  const close = () => p.closeOverlay(p.sessionId)
  watchEffect(onCleanup => {
    if (presentation.value !== 'overlay') return
    const composition = observeComposition(document)
    const inside = (target: EventTarget | null) => target instanceof Element && (panel.value?.contains(target) === true || document.getElementById(toggleElementId(p.sessionId))?.contains(target) === true || target.closest('[role="menu"]') !== null)
    const onPointerDown = (event: PointerEvent) => { if (!inside(event.target)) close() }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || composition.guards(event) || event.defaultPrevented || isBehindModal(panel.value)) return
      event.preventDefault()
      const focused = panel.value?.contains(document.activeElement) === true
      close()
      if (focused) document.getElementById(toggleElementId(p.sessionId))?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); composition.dispose() })
  })
  watch(presentation, value => { if (value === 'hidden' && focusInside) { focusInside = false; document.getElementById(toggleElementId(p.sessionId))?.focus({ preventScroll: true }) } })
  return () => {
    const owner: SessionPanelSectionOwnerProps | undefined = presentation.value === 'hidden' ? undefined : { presentation: presentation.value, dismissOverlay: close }
    return h(Fragment, null, [h('span', { ref: attachProbe, class: css.dockProbe, 'data-session-panel-probe': '' }), owner === undefined ? null : h('aside', { id: panelElementId(p.sessionId), class: css.panel, 'aria-label': p.t('panel.name'), ref: panel, onFocusin: () => { focusInside = true }, onFocusout: (event: FocusEvent) => { if (event.relatedTarget instanceof Element && !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) focusInside = false }, 'data-session-panel': owner.presentation }, sections.value.map(section => {
      const titleId = panelElementId(p.sessionId) + '-' + section.id
      return h('section', { key: section.id, class: css.section, 'aria-labelledby': titleId, 'data-session-panel-section': section.id }, [h('div', { class: css.head }, [h('h2', { id: titleId, class: css.title }, section.label), h('div', { class: css.actions }, [p.renderSlot('conversation.session.panel.section.actions', {}, { entryKey: section.id })])]), h('div', { class: css.body }, [p.renderSlot('conversation.session.panel.section', owner, { only: section.id })])])
    }))])
  }
}, { props: ['sessionId', 'useVisibility', 'useSections', 'useProbes', 'createProbeRef', 'closeOverlay', 'renderSlot', 't'] })
