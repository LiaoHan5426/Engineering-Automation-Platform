/** Built-in task recommendations that prefill a new Session. */
import { defineComponent, h, useId } from 'vue'
import { Button, IconClockOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskManagerKey } from './task-manager-locales.ts'
import { BranchGlyph, CalendarCheckGlyph, CloudSunGlyph, DumbbellGlyph, IssueGlyph, NewspaperGlyph, PluginCheckGlyph, SunriseGlyph } from './RecommendationArtwork.tsx'
import css from './TaskManagerPage.module.css'

const RECOMMENDATIONS = [
  { id: 'dailyBrief', Glyph: SunriseGlyph },
  { id: 'weeklyReview', Glyph: CalendarCheckGlyph },
  { id: 'issueScan', Glyph: IssueGlyph },
  { id: 'pluginCompat', Glyph: PluginCheckGlyph },
  { id: 'topicTracking', Glyph: NewspaperGlyph },
  { id: 'branchCleanup', Glyph: BranchGlyph },
  { id: 'weather', Glyph: CloudSunGlyph },
  { id: 'workout', Glyph: DumbbellGlyph },
] as const

/** Localized recommendation copy and the Session prefill action. */
export interface ScheduleRecommendationsProps {
  readonly t: (key: TaskManagerKey) => string
  readonly onUse: (prompt: string) => void
}

/** Render recommendations with accessible descriptions and default run times. */
export const ScheduleRecommendations = defineComponent((props: ScheduleRecommendationsProps) => {
  const baseId = useId()
  return () => h('section', {
    class: css.recommendations,
    'aria-labelledby': baseId + '-heading',
    'data-testid': 'schedule-recommendations',
  }, [
    h('h2', { id: baseId + '-heading', class: css.recommendationsHeading }, props.t('recommend.heading')),
    h('ul', { class: css.recommendationGrid }, RECOMMENDATIONS.map(({ id, Glyph }) => h('li', { key: id }, [
      h(Button, {
        class: css.recommendation,
        'aria-label': props.t(`recommend.${id}.title`),
        'aria-describedby': baseId + '-' + id + '-description ' + baseId + '-' + id + '-schedule',
        onClick: () => props.onUse(props.t(`recommend.${id}.prompt`)),
      }, { default: () => [
        h('span', { class: css.tile }, [h(Glyph, { class: css.tileGlyph }), h(IconPlusOutlineRegular, { class: css.tilePlus, size: 18 })]),
        h('span', { class: css.recommendationContent }, [
          h('span', { class: css.recommendationTitle }, props.t(`recommend.${id}.title`)),
          h('span', { class: css.recommendationDetails }, [
            h('span', { id: baseId + '-' + id + '-description', class: css.recommendationDescription }, props.t(`recommend.${id}.description`)),
            h('span', { id: baseId + '-' + id + '-schedule', class: css.recommendationWhen }, [h(IconClockOutlineRegular, { class: css.whenGlyph, size: 14 }), props.t(`recommend.${id}.schedule`)]),
          ]),
        ]),
      ] }),
    ]))),
  ])
}, { name: 'ScheduleRecommendations', props: ['t', 'onUse'] })
