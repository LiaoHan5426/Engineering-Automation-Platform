import { normalizeClass, defineComponent, h } from 'vue'
import type { Ref } from 'vue'
/** Work-detail choices with radio-group keyboard navigation. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { OnboardingProcess } from '../onboarding-settings.ts'
import type { DesktopOnboardingProps } from './onboarding-contract.ts'
import compactIcon from './assets/onboarding-compact.svg'
import standardIcon from './assets/onboarding-standard.svg'
import detailedIcon from './assets/onboarding-detailed.svg'
import css from './DesktopOnboarding.module.css'
const options = [
  {
    value: 'compact',
    titleKey: 'onboardingCompact',
    descriptionKey: 'onboardingCompactDescription',
    icon: compactIcon,
    size: 40,
  },
  {
    value: 'standard',
    titleKey: 'onboardingStandard',
    descriptionKey: 'onboardingStandardDescription',
    icon: standardIcon,
    size: 36,
  },
  {
    value: 'detailed',
    titleKey: 'onboardingDetailed',
    descriptionKey: 'onboardingDetailedDescription',
    icon: detailedIcon,
    size: 36,
  },
] as const
/** @param props - selected detail, localized copy and persistence callbacks. @returns the process step. */
export const OnboardingProcessStep = defineComponent(
  (
    componentProps: Pick<DesktopOnboardingProps, 't'> & {
      heading: Ref<HTMLHeadingElement | null>
      busy: boolean
      process: OnboardingProcess | null
      onSelect: (value: OnboardingProcess) => void
      onComplete: () => void
    },
  ) => {
    const onKeydown = (event: KeyboardEvent, value: OnboardingProcess) => {
      if (componentProps.busy) return
      const direction =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0
      if (direction === 0) return
      event.preventDefault()
      const nextIndex =
        (options.findIndex(option => option.value === value) + direction + options.length) %
        options.length
      const next = options[nextIndex as 0 | 1 | 2]
      componentProps.onSelect(next.value);
      (event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null)
        ?.querySelector<HTMLButtonElement>(`[data-process="${next.value}"]`)
        ?.focus()
    }
    return () => {
      const render_prop_heading = componentProps.heading
      const render_prop_t = componentProps.t
      const render_prop_process = componentProps.process
      const render_prop_busy = componentProps.busy
      const render_prop_onSelect = componentProps.onSelect
      const render_prop_onComplete = componentProps.onComplete
      return h('div', { class: `${css.content} ${css.process}` }, [
        h('div', { class: css.copy }, [
          h('h1', { id: 'desktop-onboarding-title', ref: render_prop_heading, tabIndex: -1 }, [
            render_prop_t('onboardingProcess'),
          ]),
          h('p', { class: css.subtitle }, [render_prop_t('onboardingProcessDescription')]),
        ]),
        h(
          'div',
          {
            class: css.processCards,
            role: 'radiogroup',
            'aria-labelledby': 'desktop-onboarding-title',
          },
          [
            options.map(option =>
              h(
                'button',
                {
                  type: 'button',
                  role: 'radio',
                  key: option.value,
                  'data-process': option.value,
                  'aria-checked': render_prop_process === option.value,
                  tabIndex:
                    render_prop_process === option.value ||
                    (render_prop_process === null && option.value === 'compact')
                      ? 0
                      : -1,
                  class: `${css.card} ${render_prop_process === option.value ? css.selected : ''}`,
                  'aria-disabled': render_prop_busy,
                  onClick: () => {
                    if (!render_prop_busy) render_prop_onSelect(option.value)
                  },
                  onKeydown: (event) => {
                    onKeydown(event, option.value)
                  },
                },
                [
                  h('span', { class: css.processIcon }, [
                    h('img', {
                      src: option.icon,
                      width: option.size,
                      height: option.size,
                      alt: '',
                    }),
                  ]),
                  h('span', { class: css.cardTitle }, [render_prop_t(option.titleKey)]),
                  h('span', { class: css.cardDescription }, [render_prop_t(option.descriptionKey)]),
                ],
              ),
            ),
          ],
        ),
        h('div', { class: css.primaryAction }, [
          render_prop_process !== null &&
            h(
              Button,
              {
                className: normalizeClass(css.action),
                variant: 'primary',
                'aria-disabled': render_prop_busy,
                onClick: () => {
                  if (!render_prop_busy) render_prop_onComplete()
                },
              },
              {
                default: () => render_prop_t('onboardingEnter'),
              },
            ),
        ]),
      ])
    }
  },
  { inheritAttrs: false, props: ['t', 'heading', 'busy', 'process', 'onSelect', 'onComplete'] },
)
