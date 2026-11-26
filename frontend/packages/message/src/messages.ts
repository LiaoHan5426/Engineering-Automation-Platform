import {
  defineComponent,
  inject,
  shallowRef,
  watch,
  type App,
  type InjectionKey,
  type ObjectDirective,
  type PropType,
} from 'vue'

export interface MessageContent {
  text: string
  title?: string
  tone?: 'info' | 'warning' | 'error'
}

type Kind = 'message' | 'notify'
type Entry = MessageContent & { id: number; kind: Kind }

const messageKey: InjectionKey<ReturnType<typeof createQueue>> = Symbol('eap.message')

function createQueue() {
  const entries = shallowRef<Entry[]>([])
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 0

  function dismiss(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    entries.value = entries.value.filter((entry) => entry.id !== id)
  }

  function show(kind: Kind, content: MessageContent) {
    const id = ++nextId
    const oldest = entries.value[0]
    if (entries.value.length >= 5 && oldest) dismiss(oldest.id)
    entries.value = [...entries.value, { ...content, id, kind }]
    if (kind === 'message')
      timers.set(
        id,
        setTimeout(() => dismiss(id), 6000),
      )
    return () => dismiss(id)
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    entries.value = []
  }

  return {
    entries,
    dismiss,
    clear,
    message: (content: MessageContent) => show('message', content),
    notify: (content: MessageContent) => show('notify', content),
  }
}

export function useMessages() {
  const messages = inject(messageKey)
  if (!messages) throw new Error('Install createMessagePlugin() before using messages')
  return messages
}

function triggerComponent(name: string, kind: Kind) {
  return defineComponent({
    name,
    props: {
      open: Boolean,
      content: { type: Object as PropType<MessageContent>, required: true },
    },
    setup(props) {
      const messages = useMessages()
      watch(
        () => props.open,
        (open, _, onCleanup) => {
          if (open) onCleanup(messages[kind](props.content))
        },
        { immediate: true },
      )
      return () => null
    },
  })
}

export const Message = triggerComponent('Message', 'message')
export const Notify = triggerComponent('Notify', 'notify')

export function createMessagePlugin() {
  const messages = createQueue()

  function directive(kind: Kind): ObjectDirective<HTMLElement, MessageContent | undefined> {
    const bindings = new WeakMap<
      HTMLElement,
      {
        content: MessageContent | undefined
        click: (event: MouseEvent) => void
      }
    >()
    return {
      mounted(element, binding) {
        const state = {
          content: binding.value,
          click(event: MouseEvent) {
            if (!event.defaultPrevented && state.content) messages[kind](state.content)
          },
        }
        bindings.set(element, state)
        element.addEventListener('click', state.click)
      },
      updated(element, binding) {
        const state = bindings.get(element)
        if (state) state.content = binding.value
      },
      beforeUnmount(element) {
        const state = bindings.get(element)
        if (state) element.removeEventListener('click', state.click)
        bindings.delete(element)
      },
    }
  }

  return {
    install(app: App) {
      app.provide(messageKey, messages)
      app.directive('message', directive('message'))
      app.directive('notify', directive('notify'))
      app.onUnmount(messages.clear)
    },
  }
}
