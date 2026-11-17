/** Translation controls for one expanded reasoning body. */
import { computed, defineComponent, h, shallowRef, watch } from 'vue'
import { Button, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRenderFactories,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { CotTranslationPreferences } from '../preferences.ts'
import { ReasoningTranslation, type TranslateText, type TranslationState } from './translation.ts'
import { NS } from './locales.ts'
import css from './Translation.module.css'

/** Registry-side values and callbacks bound for the reasoning contribution. */
export interface TranslationBodyInjected {
  hooks: {
    preferences: HostObservable<CotTranslationPreferences>
    translationLocale: HostObservable<LocaleSnapshot>
    translationLimit: HostObservable<number>
  }
  translate: TranslateText
}

export type TranslationBodyProps = PropsRuntime<'conversation.chat.reasoning.body'> &
  PropsRenderFactories &
  PropsLocale<typeof NS> &
  InjectFace<TranslationBodyInjected>

/**
 * Render translated reasoning, retaining the complete original until a failed request is retried.
 * @param props - display-ready reasoning, translation preferences, and cancellation-aware callback.
 * @returns compact Markdown and translation status with a retry action on failure.
 */
export const TranslationBody = defineComponent(
  (props: TranslationBodyProps) => {
    const preferences = props.usePreferences(value => value)
    const locale = props.useTranslationLocale(value => value.active)
    const maxTextChars = props.useTranslationLimit(value => value)
    const targetLanguage = computed(() =>
      preferences.value.targetLanguage === 'auto' ? locale.value : preferences.value.targetLanguage,
    )
    const state = shallowRef<TranslationState>({ text: props.text, pending: false, failed: false })
    const original = shallowRef(false)
    let translation: ReasoningTranslation | undefined
    watch(
      [() => preferences.value.provider, targetLanguage, maxTextChars, () => props.translate],
      ([provider, language, limit, translate], _previous, onCleanup) => {
        const controller = new ReasoningTranslation(
          { provider, targetLanguage: language },
          limit,
          translate,
          (value) => {
            state.value = value
          },
        )
        translation = controller
        onCleanup(() => {
          controller.dispose()
          if (translation === controller) translation = undefined
        })
        controller.update(props.text, props.running)
      },
      { immediate: true, flush: 'sync' },
    )
    watch(
      [() => props.text, () => props.running],
      ([text, running]) => {
        translation?.update(text, running)
      },
      { flush: 'sync' },
    )
    const labels = computed(() => ({
      code: {
        copyLabel: props.t('copy'),
        copiedLabel: props.t('copied'),
        toolbarLabels: {
          codeLabel: props.t('codeTitle'),
          wrapLabel: props.t('wrap'),
          unwrapLabel: props.t('unwrap'),
        },
      },
      footnotes: props.t('footnotes'),
    }))
    return () => {
      const showOriginal = original.value || state.value.failed
      return h(
        'div',
        {
          'data-cot-translation': 'true',
          'data-translation-state': state.value.failed
            ? 'failed'
            : state.value.pending
              ? 'pending'
              : 'ready',
          'data-translation-view': showOriginal ? 'original' : 'translated',
        },
        [
          h('div', { class: css.toolbar }, [
            h(
              Button,
              {
                className: css.viewToggle ?? '',
                size: 'sm',
                variant: 'ghost',
                disabled: state.value.failed,
                onClick: () => {
                  original.value = !showOriginal
                },
              },
              { default: () => props.t(showOriginal ? 'translation' : 'original') },
            ),
            state.value.pending
              ? h('span', { role: 'status', 'aria-label': props.t('translating') }, [
                h(IconLoadingOutlineRegular, { size: 14, className: css.spinner ?? '' }),
              ])
              : null,
            state.value.failed
              ? [
                h('span', { class: css.failure, role: 'status' }, props.t('failed')),
                h(
                  Button,
                  {
                    size: 'sm',
                    variant: 'ghost',
                    onClick: () => {
                      translation?.retry()
                    },
                  },
                  { default: () => props.t('retry') },
                ),
              ]
              : null,
          ]),
          props.renderFactorySlot('conversation.chat.reasoning.content', {
            text: showOriginal ? props.text : state.value.text,
            running: props.running,
            labels: labels.value,
          }),
        ],
      )
    }
  },
  {
    props: [
      'text',
      'running',
      'translate',
      't',
      'renderFactorySlot',
      'usePreferences',
      'useTranslationLocale',
      'useTranslationLimit',
    ],
    inheritAttrs: false,
  },
)
