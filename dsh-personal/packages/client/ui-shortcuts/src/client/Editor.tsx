/** Inline physical-key recording and revision-aware command editing. */
import { computed, defineComponent, h, onScopeDispose, ref, shallowRef, useId, watch } from 'vue'
import clsx from 'clsx'
import {
  ShortcutKeys,
  focusWithoutRing,
  observeComposition,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ShortcutBinding,
  ShortcutCommandId,
  ShortcutEdit,
  ShortcutRevision,
} from '@deepseek-ai/dsh-client-shortcuts/protocol'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReferenceInjected } from './Reference.tsx'
import { shortcutFailure, shortcutReadFailure } from './feedback.ts'
import css from './Reference.module.css'

type EditorInjected = ReferenceInjected
type EditorProps = InjectFace<EditorInjected> &
  PropsLocale<'shortcuts'> & {
    target: ShortcutCatalogEntry
    onClose(this: void): void
    onSaved(this: void): void
    onError(this: void, message: string): void
  }

/** Own a physical-key recording lifetime and save against the reviewed revision. */
export const ShortcutEditor = defineComponent(
  (props: EditorProps) => {
    const config = props.useConfig(value => value)
    const catalog = props.useCatalog(value => value)
    const fixed = props.useFixedCatalog(value => value)
    const revision = ref<ShortcutRevision>(config.value.revision)
    const candidate = shallowRef<ShortcutBinding | null>(null)
    const captured = ref(false)
    const busy = ref(false)
    const nativeReady = ref(props.runtime === 'web')
    const message = ref('')
    const retry = shallowRef<ShortcutBinding | null>(null)
    const descriptionId = useId()
    const recorder = shallowRef<HTMLButtonElement | null>(null)
    let alive = true
    let writing = false
    let restart = () => {}
    onScopeDispose(() => {
      alive = false
    })
    const stale = computed(() => revision.value !== config.value.revision)
    const report = (text: string): void => {
      message.value = text
      props.onError(text)
    }
    const save = async (
      operation: ShortcutEdit,
      reviewedRevision = revision.value,
    ): Promise<void> => {
      if (writing) return
      writing = true
      busy.value = true
      const result = await props.edit(operation, reviewedRevision)
      if (!alive) return
      writing = false
      busy.value = false
      if (result.status === 'saved') props.onSaved()
      else {
        retry.value = operation.type === 'set' ? operation.binding : null
        report(shortcutFailure(result, [...catalog.value, ...fixed.value], props.t, props.runtime))
      }
    }
    const capture = (binding: ShortcutBinding, id: ShortcutCommandId): void => {
      candidate.value = binding
      captured.value = true
      retry.value = null
      const described = props.describeBinding(binding)
      const conflicts = described.conflicts
        .filter(value => value !== id)
        .map(
          value =>
            [...catalog.value, ...fixed.value].find(row => row.id === value)?.label ?? value,
        )
      if (described.issue !== null) {
        report(props.t(described.issue))
        return
      }
      if (conflicts.length > 0) {
        report(props.t('conflict', { commands: conflicts.join(', ') }))
        return
      }
      if (stale.value) {
        retry.value = binding
        report(props.t('stale'))
        return
      }
      if (config.value.status !== 'ready') {
        report(
          config.value.status === 'loading'
            ? props.t('not-ready')
            : shortcutReadFailure(config.value, props.runtime, props.t),
        )
        return
      }
      void save({ type: 'set', id, binding })
    }
    watch(
      [
        () => props.describeBinding,
        () => props.recording,
        () => props.t,
        () => props.target.id,
        () => props.runtime,
        () => props.platform,
      ],
      (_current, _previous, cleanup) => {
        const { describeBinding, recording, t, runtime, platform } = props
        const targetId = props.target.id
        const desktopChords =
          runtime === 'desktop' && (platform === 'macos' || platform === 'windows')
        let disposed = false
        void recording(true).then(
          () => {
            if (!disposed) nativeReady.value = true
          },
          () => {
            if (!disposed) report(t('native-failed'))
          },
        )
        const composition = observeComposition(document)
        let pending: ShortcutBinding | null = null
        let dead = false
        let blocked = false
        const held = new Set<string>()
        const reset = (): void => {
          pending = null
          held.clear()
          blocked = false
          dead = false
        }
        restart = reset
        const down = (event: KeyboardEvent): void => {
          if (composition.guards(event) || event.getModifierState('AltGraph')) {
            if (desktopChords) reset()
            return
          }
          if (
            (!desktopChords || document.activeElement !== recorder.value) &&
            event.key === 'Escape' &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey
          ) {
            event.preventDefault()
            event.stopPropagation()
            if (!event.repeat && !writing) props.onClose()
            return
          }
          const commandDeadKey =
            runtime === 'web' &&
            platform === 'macos' &&
            document.activeElement === recorder.value &&
            event.code === 'KeyN' &&
            event.metaKey &&
            event.altKey &&
            !event.ctrlKey &&
            !event.shiftKey
          if (event.key === 'Dead' && !commandDeadKey) {
            if (desktopChords) reset()
            dead = true
            return
          }
          if (dead) {
            dead = false
            return
          }
          const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(
            value =>
              ({
                control: event.ctrlKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
              })[value],
          )
          const recordTab =
            desktopChords ||
            ((platform === 'macos' || platform === 'windows') && modifiers.length >= 3)
          if (document.activeElement !== recorder.value || (event.key === 'Tab' && !recordTab))
            return
          event.preventDefault()
          event.stopPropagation()
          if (writing || event.repeat) return
          if (/^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(event.code)) {
            if (desktopChords && pending !== null) {
              reset()
              candidate.value = null
              captured.value = false
            }
            return
          }
          if (desktopChords) {
            held.add(event.code)
            if (blocked) return
            if (held.size > 2) {
              blocked = true
              pending = null
              report(t('too-many-keys'))
              return
            }
          }
          try {
            const codes: [string, ...string[]] = [
              event.code,
              ...(desktopChords ? [...held].filter(value => value !== event.code) : []),
            ]
            pending = describeBinding({
              code: codes[0],
              ...(codes[1] === undefined ? {} : { secondCode: codes[1] }),
              modifiers,
            }).binding
            candidate.value = pending
            captured.value = desktopChords
            message.value = ''
            retry.value = null
          } catch (_error) {
            blocked = desktopChords
            pending = null
            report(t('unsupported-key'))
          }
        }
        const up = (event: KeyboardEvent): void => {
          held.delete(event.code)
          if (desktopChords && document.activeElement === recorder.value) {
            event.preventDefault()
            event.stopPropagation()
          }
          const binding =
            pending !== null &&
            (pending.code === event.code ||
              pending.secondCode === event.code ||
              pending.modifiers.some(
                modifier => modifier === event.code.replace(/(Left|Right)$/u, '').toLowerCase(),
              ))
              ? pending
              : null
          if (binding !== null) {
            pending = null
            blocked = desktopChords
          }
          // macOS can omit the character keyup while Command is held.
          if (
            desktopChords &&
            (held.size === 0 || (platform === 'macos' && /^Meta(Left|Right)$/u.test(event.code)))
          ) {
            held.clear()
            blocked = false
          }
          if (binding === null) return
          capture(binding, targetId)
        }
        const blur = (): void => {
          reset()
          if (desktopChords) {
            candidate.value = null
            captured.value = false
          }
        }
        const focus = (): void => {
          if (document.activeElement !== recorder.value) blur()
        }
        document.addEventListener('keydown', down, true)
        document.addEventListener('keyup', up, true)
        window.addEventListener('blur', blur)
        if (desktopChords) {
          document.addEventListener('focusin', focus, true)
          document.addEventListener('compositionstart', blur, true)
        }
        cleanup(() => {
          disposed = true
          composition.dispose()
          document.removeEventListener('keydown', down, true)
          document.removeEventListener('keyup', up, true)
          window.removeEventListener('blur', blur)
          document.removeEventListener('focusin', focus, true)
          document.removeEventListener('compositionstart', blur, true)
          void recording(false).catch(() => {})
        })
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      [nativeReady, recorder],
      () => {
        if (nativeReady.value && recorder.value !== null) focusWithoutRing(recorder.value)
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      const desktopChords =
        props.runtime === 'desktop' && (props.platform === 'macos' || props.platform === 'windows')
      const readonly = busy.value || stale.value || config.value.status !== 'ready'
      const review =
        stale.value &&
        h(
          'div',
          {
            class: css.review,
          },
          [
            h('span', {}, [props.t('stale')]),
            h(
              'button',
              {
                type: 'button',
                class: css.inlineAction,
                disabled: busy.value,
                onClick: () => {
                  revision.value = config.value.revision
                  message.value = ''
                },
              },
              [props.t('review')],
            ),
          ],
        )
      return h(
        'div',
        {
          class: css.inlineEditor,
          role: 'group',
          'aria-label': props.target.label,
          'data-shortcut-modal': 'shortcut-edit',
          'aria-busy': busy.value,
        },
        [
          h(
            'div',
            {
              class: css.inlineControls,
            },
            [
              h(
                'button',
                {
                  type: 'button',
                  class: css.inlineAction,
                  disabled: readonly,
                  onClick: () => {
                    void save({ type: 'reset', id: props.target.id })
                  },
                },
                [props.t('reset')],
              ),
              props.target.binding !== null &&
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.inlineAction,
                    disabled: readonly,
                    onClick: () => {
                      void save({ type: 'set', id: props.target.id, binding: null })
                    },
                  },
                  [props.t('clear')],
                ),
              h(
                'button',
                {
                  ref: recorder,
                  type: 'button',
                  class: clsx(css.recorder, message.value && css.invalid),
                  disabled: !nativeReady.value,
                  'aria-disabled': busy.value || !nativeReady.value,
                  onBlur: () => {
                    restart()
                  },
                  'aria-label': props.t('record'),
                  'aria-invalid': message.value !== '',
                  'aria-describedby': descriptionId,
                  onClick: () => {
                    if (!writing) {
                      restart()
                      captured.value = false
                      message.value = ''
                      retry.value = null
                    }
                  },
                },
                [
                  captured.value && message.value === ''
                    ? h(ShortcutKeys, {
                      keys: props.describeBinding(candidate.value).keys,
                      className: css.recorded,
                    })
                    : props.t('record'),
                ],
              ),
            ],
          ),
          h(
            'span',
            {
              id: descriptionId,
              class: css.srOnly,
            },
            [
              message.value ||
                (desktopChords
                  ? ''
                  : props.t(
                    props.runtime === 'web'
                      ? props.platform === 'windows'
                        ? 'windows-web-help'
                        : props.platform === 'macos'
                          ? 'macos-web-help'
                          : 'web-help'
                      : 'record-help',
                  )),
            ],
          ),
          review,
          retry.value !== null &&
            !stale.value &&
            h(
              'button',
              {
                type: 'button',
                class: css.inlineAction,
                disabled: readonly,
                onClick: () => {
                  const binding = retry.value
                  if (binding !== null) capture(binding, props.target.id)
                },
              },
              [props.t('retry-save')],
            ),
        ],
      )
    }
  },
  {
    name: 'ShortcutEditor',
    inheritAttrs: false,
    props: [
      'target',
      'onClose',
      'onSaved',
      'onError',
      'useCatalog',
      'useConfig',
      'useFixedCatalog',
      'edit',
      'recording',
      'describeBinding',
      'runtime',
      'platform',
      't',
    ],
  },
)
