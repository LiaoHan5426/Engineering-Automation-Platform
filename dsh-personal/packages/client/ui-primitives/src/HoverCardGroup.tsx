import { defineComponent, h, provide, onMounted, onBeforeUnmount, shallowRef, type InjectionKey, type PropType } from 'vue'

interface GroupState {
  isWarm: () => boolean
  enter: (overCard: boolean) => void
  leave: () => void
  containsCard: (target: EventTarget | null) => boolean
  shown: (owner: symbol, dismiss: () => void, element: HTMLElement) => void
  release: (owner: symbol) => void
}

/** Private coordination shared only by opted-in HoverCards inside one mounted group. */
export const HoverCardGroupContext = Symbol('HoverCardGroup') as InjectionKey<GroupState>

/**
 * Share first-display dwell across a list and its active portal, including the card's existing pointer grace.
 * @param props - Physical container tag and styling; the default slot supplies the list contents.
 * @param props.className - classes for the physical list container.
 * @param props.as - physical container tag; use span to preserve inline text layout.
 * @returns the list container and its private hover coordinator.
 */
export const HoverCardGroup = defineComponent({
  name: 'HoverCardGroup',
  props: { className: String, as: { type: String as PropType<'div' | 'span'>, default: 'div' } },
  setup(props, { slots }) {
    const root = shallowRef<HTMLElement | null>(null)
    const group: GroupState = (() => {
      let pointer: 'outside' | 'list' | 'card' = 'outside'
      let warm = false
      let active: { owner: symbol; dismiss: () => void; element: HTMLElement } | null = null
      return {
        isWarm: () => warm,
        enter: (overCard) => {
          pointer = overCard ? 'card' : 'list'
          if (overCard) warm = true
        },
        leave: () => {
          pointer = 'outside'
          // A displayed card owns the grace across the gap; its release ends an outside visit.
          if (active === null) warm = false
        },
        containsCard: target => target instanceof Node && active !== null && active.element.contains(target),
        shown: (owner, dismiss, element) => {
        // Keyboard focus can replace the portal under the pointer without a pointer-out event.
          if (pointer === 'card') { pointer = 'outside'; warm = false }
          if (pointer === 'list') warm = true
          const previous = active
          active = { owner, dismiss, element }
          if (previous !== null && previous.owner !== owner) previous.dismiss()
        },
        release: (owner) => {
          if (active?.owner !== owner) return
          active = null
          if (pointer !== 'list') { pointer = 'outside'; warm = false }
        },
      }
    })()
    provide(HoverCardGroupContext, group)
    const inside = (target: EventTarget | null) => target instanceof Node && (root.value?.contains(
      target) === true || group.containsCard(target))
    const over = (event: PointerEvent) => { if (inside(event.target)) group.enter(group.containsCard(event.target)) }
    const out = (event: PointerEvent) => { if (inside(event.target) && !inside(event.relatedTarget)) group.leave() }
    onMounted(() => { document.addEventListener('pointerover', over, true); document.addEventListener('pointerout', out, true) })
    onBeforeUnmount(() => { document.removeEventListener('pointerover', over, true); document.removeEventListener('pointerout', out, true) })
    return () => h(props.as, { ref: root, class: props.className }, slots.default?.())
  },
})
