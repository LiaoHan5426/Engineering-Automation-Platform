import { h, useId, defineComponent, computed, shallowRef, type VNodeChild } from 'vue'
import clsx from 'clsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import { TaskMenu } from './TaskMenu.tsx'
import type { TaskMenuEntry } from './TaskMenu.tsx'
import { zoneChoices, zoneName } from './schedule-format.ts'
import { loadRecentTimeZones, rememberTimeZone } from './recent-time-zones.ts'
import css from './TaskManagerPage.module.css'
/** A labelled menu row using the current task detail's trigger, portal, and keyboard behavior. */
export const RuleSelectRow = defineComponent(
  (props: {
    readonly label: string
    readonly value: string
    readonly current: string
    readonly items: readonly TaskMenuEntry[]
    readonly disabled: boolean
    readonly onChange: (value: string) => void
    readonly onDismiss?: () => void
    readonly header?: VNodeChild
    readonly listClassName?: string | undefined
  }) => {
    const open = shallowRef(false)
    const close = (): void => {
      open.value = false
      props.onDismiss?.()
    }
    return () => {
      return h(TaskMenu, {
        className: clsx(css.ruleRowMenu),
        open: open.value && !props.disabled,
        onClose: close,
        items: props.items,
        selectedId: props.value,
        align: 'end',
        portal: true,
        header: props.header,
        listClassName: props.listClassName,
        onSelect: (id) => {
          close()
          props.onChange(id)
        },
        anchor: h(
          'button',
          {
            type: 'button',
            class: css.ruleValue,
            disabled: props.disabled,
            'aria-haspopup': 'menu',
            'aria-expanded': open.value && !props.disabled,
            onClick: () => {
              if (open.value) close()
              else open.value = true
            },
          },
          [
            h('span', { class: css.ruleLabel }, [props.label]),
            ' ',
            h('span', { class: clsx(css.ruleValueFace, css.ruleControl) }, [
              h('span', { class: css.ruleCurrent }, [props.current]),
              h(IconChevronDownOutlineRegular, {}),
            ]),
          ],
        ),
      })
    }
  },
  {
    props: [
      'label',
      'value',
      'current',
      'items',
      'disabled',
      'onChange',
      'onDismiss',
      'header',
      'listClassName',
    ],
  },
)
/** The current task detail's searchable, localized zone menu with recent choices. */
export const RuleZoneRow = defineComponent(
  (
    props: PropsLocale<'schedule.manager'> & {
      readonly value: string
      readonly disabled: boolean
      readonly onChange: (value: string) => void
    },
  ) => {
    const systemZone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    const query = shallowRef('')
    const recent = shallowRef((() => loadRecentTimeZones(systemZone.value))())
    const id = useId()
    const catalog = computed(() => {
      const byLabel = new Map<
        string,
        {
          id: string
          label: string
          zones: string[]
        }
      >()
      const at = Date.now()
      for (const zone of zoneChoices(props.value, systemZone.value, at)) {
        const label = zoneName(zone, systemZone.value, props.t, at)
        const existing = byLabel.get(label)
        if (existing === undefined) byLabel.set(label, { id: zone, label, zones: [zone] })
        else {
          existing.zones.push(zone)
          if (zone === props.value) existing.id = zone
        }
      }
      return [...byLabel.values()]
    })
    const rowIndex = computed(
      () =>
        new TextSearchIndex(
          catalog.value.map(item => ({
            item,
            zones: new TextSearchIndex(item.zones, zone => ({ fuzzy: [zone, item.label] })),
          })),
          ({ item }) => ({ fuzzy: [...item.zones, item.label] }),
        ),
    )
    const searching = computed(() => query.value.trim() !== '')
    const matches = computed(() =>
      rowIndex.value.search(query.value).map(({ item, zones }) => {
        if (!searching.value) return item
        const named = zones.search(query.value)
        return { ...item, id: named.includes(item.id) ? item.id : (named[0] ?? item.id) }
      }),
    )
    const recentItems = computed(() =>
      !searching.value
        ? recent.value
          .flatMap((zone) => {
            const item = catalog.value.find(item => item.zones.includes(zone))
            return item === undefined ? [] : [{ ...item, id: zone }]
          })
          .filter(
            (item, index, items) =>
              items.findIndex(candidate => candidate.label === item.label) === index,
          )
        : [],
    )
    const available = computed(() =>
      matches.value.filter(
        item => !recentItems.value.some(recent => recent.label === item.label),
      ),
    )
    const items = computed<readonly TaskMenuEntry[]>(() =>
      recentItems.value.length === 0
        ? available.value
        : available.value.length === 0
          ? recentItems.value
          : [...recentItems.value, { type: 'separator', id: `${id}-recent` }, ...available.value],
    )
    return () => {
      return h(RuleSelectRow, {
        label: props.t('timing.zone'),
        value: props.value,
        current: zoneName(props.value, systemZone.value, props.t),
        disabled: props.disabled,
        onDismiss: () => {
          query.value = ''
        },
        items:
          items.value.length === 0
            ? [{ id: `${id}-empty`, label: props.t('timing.zoneNoResults'), disabled: true }]
            : items.value,
        listClassName: css.zoneMenu,
        header: h('input', {
          class: css.zoneSearch,
          type: 'search',
          value: query.value,
          'data-menu-field': '',
          placeholder: props.t('timing.zoneSearch'),
          'aria-label': props.t('timing.zoneSearch'),
          onInput: (event) => {
            query.value = (event.currentTarget as HTMLInputElement).value
          },
        }),
        onChange: (zone) => {
          query.value = ''
          recent.value = (recent => rememberTimeZone(recent, zone))(recent.value)
          props.onChange(zone)
        },
      })
    }
  },
  { props: ['value', 'disabled', 'onChange', 't'] },
)
