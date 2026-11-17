import { defineComponent, h, shallowRef, watch } from 'vue'
/** Preset selection settings: the roster, its default, mode help, a read-only view of each composition, and the Creator-mode entry. */
import {
  Button,
  IconBrowseOutlineRegular,
  IconPlusOutlineRegular,
  Modal,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentPresetSectionState } from './section-store.ts'
import { isBuiltInPreset, presetDisplayText } from './locales.ts'
import { requiresCodingTools } from './settings-store.ts'
import {
  PresetGuideDialog,
  presetGuide,
  trapPresetReaderTab,
  type PresetGuidePage,
} from './PresetGuideDialog.tsx'
import css from './AgentPresetSection.module.css'
/** Settings actions and their shared controller state. */
export interface AgentPresetSectionInjected {
  hooks: {
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
    /** Shared Coding Tools preference; off hides the built-in PTC and Minimal cards. */
    developerTools: ObservableSnapshot<boolean>
  }
  /** Stage the `cordis` preset and start a Creator-mode task; absent without a conversation flow. */
  startCreatorDraft?: () => void
  load: () => Promise<void>
  /** Open one preset's declared composition in the read-only viewer. */
  view: (id: string) => Promise<void>
  /** Close the read-only viewer. */
  closeView: () => void
  makeDefault: (id: string) => Promise<void>
}
/** Props assembled by the settings renderer. */
export type AgentPresetSectionProps = PropsRuntime<'settings.section'> &
  PropsLocale<'settings.agentPreset'> &
  InjectFace<AgentPresetSectionInjected>
const CardDescription = defineComponent(
  (props: { text: string }) => {
    const element = shallowRef<HTMLSpanElement | null>(null)
    const truncated = shallowRef(false)
    watch(
      () => [element.value, props.text],
      (_value, _previous, onCleanup) => {
        const el = element.value
        if (el === null) return
        const measure = () => {
          truncated.value = el.scrollHeight > el.clientHeight
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        onCleanup(() => { observer.disconnect() })
      },
      { flush: 'post' },
    )
    return () =>
      h(
        Tooltip,
        {
          label: props.text,
          side: 'bottom',
          delayMs: 400,
          disabled: !truncated.value,
          maxWidth: 360,
        },
        { default: () => h('span', { ref: element, class: css.cardDesc, title: '' }, props.text) },
      )
  },
  { props: ['text'] },
)
/** Render the roster with its default, mode help, composition viewer, and the guidance to Creator mode.
 * @param props Settings actions, snapshot hooks and localized text.
 * @returns The preset settings section.
 */
export const AgentPresetSection = defineComponent(
  (props: AgentPresetSectionProps) => {
    const { useAgentPresetSection, closeView, useDeveloperTools } = props
    const state = useAgentPresetSection(value => value)
    const developerTools = useDeveloperTools(enabled => enabled)
    const guide = shallowRef<{
      content: NonNullable<ReturnType<typeof presetGuide>>
      page: PresetGuidePage
    } | null>(null)
    const setGuide = (
      next: typeof guide.value | ((previous: typeof guide.value) => typeof guide.value),
    ) => {
      guide.value = typeof next === 'function' ? next(guide.value) : next
    }
    const viewTrigger = shallowRef<HTMLButtonElement | null>(null)
    const closeViewOnUnmount = shallowRef(closeView)
    watch(
      () => [props.load],
      (_next, _previous) => {
        (() => {
          void props.load()
        })()
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      () => [props.closeView],
      (_next, _previous) => {
        (() => {
          closeViewOnUnmount.value = props.closeView
        })()
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      () => [],
      (_next, _previous, onCleanup) => {
        const dispose = (() => () => {
          closeViewOnUnmount.value()
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    const closeViewer = () => {
      closeView()
      viewTrigger.value?.focus()
    }
    return () => {
      const { view, makeDefault, startCreatorDraft, close: closeSettings, t } = props
      const viewed = state.value.view
      const viewedRow =
        viewed === null ? undefined : state.value.rows.find(row => row.id === viewed.id)
      const viewedTitle =
        viewed === null
          ? ''
          : viewedRow === undefined
            ? viewed.title
            : presetDisplayText(viewedRow, t).name
      // Creator mode authors presets in conversation; it needs the flow to land a
      // session in and the self-referential preset on the roster.
      const creator =
        startCreatorDraft !== undefined && state.value.rows.some(row => row.id === 'cordis')
          ? startCreatorDraft
          : undefined
      /* The custom group is where a preset of one's own appears, so its entry
           stays on screen even while the group is empty. */
      const creatorButton =
        creator === undefined
          ? null
          : h(
            'button',
            {
              type: 'button',
              class: css.creatorButton,
              disabled: state.value.saving,
              onClick: () => {
                if (!state.value.saving) {
                  creator()
                  closeSettings()
                }
              },
            },
            [h(IconPlusOutlineRegular, { size: 14 }), t('creatorDraft')],
          )
      return h('section', { class: css.section }, [
        h('h2', { class: css.title }, [t('nav')]),
        h('p', { class: css.intro }, [t('sectionIntro')]),
        state.value.error === null
          ? null
          : h('p', { class: css.error, role: 'alert' }, [state.value.error]),
        ([true, false] as const).map((builtIn) => {
          const rows = state.value.rows.filter(
            row =>
              isBuiltInPreset(row) === builtIn &&
              (developerTools.value || !requiresCodingTools(row)),
          )
          const entry = builtIn ? null : creatorButton
          if (rows.length === 0 && entry === null) return null
          return h('section', { key: String(builtIn), class: css.group }, [
            h('h3', { class: css.groupHead }, [t(builtIn ? 'builtInGroup' : 'customGroup')]),
            rows.length === 0
              ? null
              : h('ul', { class: css.cards }, [
                rows.map((row) => {
                  const display = presetDisplayText(row, t)
                  const help = presetGuide(row.id, builtIn ? 'system' : 'user')
                  const selectionAction =
                    row.broken !== undefined
                      ? t('brokenBadge')
                      : t(row.isDefault ? 'inUse' : 'setDefault')
                  return h(
                    'li',
                    {
                      key: row.id,
                      'data-agent-preset-id': row.id,
                      class: [
                        css.card,
                        row.broken === undefined ? undefined : css.cardBroken,
                        row.isDefault ? css.cardActive : undefined,
                      ]
                        .filter(Boolean)
                        .join(' '),
                    },
                    [
                      h(
                        'button',
                        {
                          type: 'button',
                          class: css.cardMain,
                          'aria-pressed': row.isDefault,
                          disabled:
                              row.isDefault || (row.broken === undefined && state.value.saving),
                          'aria-disabled': row.broken !== undefined,
                          'aria-label': `${selectionAction}: ${display.name}`,
                          title: selectionAction,
                          onClick: () => {
                            if (row.broken === undefined) void makeDefault(row.id)
                          },
                        },
                        [
                          h('span', { class: css.cardHead }, [
                            h('span', { class: css.cardIdentity }, [
                              h('span', { class: css.cardName, title: display.name }, [
                                display.name,
                              ]),
                              row.broken === undefined
                                ? null
                                : h('span', { class: css.brokenBadge }, [
                                  t('brokenBadge'),
                                  h('span', { class: css.brokenTip, 'aria-hidden': 'true' }, [
                                    row.broken,
                                  ]),
                                ]),
                              h(
                                Tag,
                                { tone: row.isDefault ? 'solid' : 'outline' },
                                {
                                  default: () => [
                                    row.isDefault
                                      ? t('inUse')
                                      : t(builtIn ? 'builtInGroup' : 'customGroup'),
                                  ],
                                },
                              ),
                            ]),
                            h('code', { class: css.cardId, title: row.id }, [row.id]),
                          ]),
                          h(CardDescription, { text: display.description ?? t('noDescription') }),
                          row.broken === undefined
                            ? null
                            : h('span', { class: css.cardBrokenReason, role: 'alert' }, [
                              row.broken,
                            ]),
                        ],
                      ),
                      h('div', { class: css.cardFoot }, [
                        help === undefined
                          ? null
                          : h('div', { class: css.cardHelp }, [
                            h(
                              Button,
                              {
                                variant: 'ghost',
                                className: css.helpButton ?? '',
                                'aria-label': `${t('modeExplanation')}: ${display.name}`,
                                onClick: () => {
                                  setGuide({ content: help, page: 'explanation' })
                                },
                              },
                              { default: () => [t('modeExplanation')] },
                            ),
                            h(
                              Button,
                              {
                                variant: 'ghost',
                                className: css.helpButton ?? '',
                                'aria-label': `${t('howToUse')}: ${display.name}`,
                                onClick: () => {
                                  setGuide({ content: help, page: 'usage' })
                                },
                              },
                              { default: () => [t('howToUse')] },
                            ),
                          ]),
                        h(
                          'button',
                          {
                            type: 'button',
                            class: css.iconButton,
                            'data-tip': t('view'),
                            'aria-label': `${t('view')}: ${display.name}`,
                            onClick: (event) => {
                              viewTrigger.value =
                                event.currentTarget instanceof HTMLButtonElement
                                  ? event.currentTarget
                                  : null
                              void view(row.id)
                            },
                          },
                          [h(IconBrowseOutlineRegular)],
                        ),
                      ]),
                    ],
                  )
                }),
              ]),
            entry,
          ])
        }),
        guide.value === null
          ? null
          : h(PresetGuideDialog, {
            guide: guide.value.content,
            initialPage: guide.value.page,
            t: t,
            onClose: () => {
              setGuide(null)
            },
          }),
        h(
          Modal,
          {
            open: viewed !== null,
            onClose: closeViewer,
            closeLabel: t('close'),
            onKeyDownCapture: (event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                closeViewer()
              } else trapPresetReaderTab(event)
            },
            title: viewed === null ? '' : `${t('view')} · ${viewedTitle}`,
            className: (css.dialog ?? ''),
          },
          {
            footer: () =>
              h(
                Button,
                { variant: 'outline', 'data-modal-autofocus': '', onClick: closeViewer },
                { default: () => [t('close')] },
              ),
            default: () => [
              viewed === null ? null : h('pre', { class: css.viewerCode }, [viewed.content]),
            ],
          },
        ),
      ])
    }
  },
  {
    props: [
      'useAgentPresetSection',
      'load',
      'view',
      'closeView',
      'makeDefault',
      'startCreatorDraft',
      'close',
      'useDeveloperTools',
      't',
    ],
  },
)
