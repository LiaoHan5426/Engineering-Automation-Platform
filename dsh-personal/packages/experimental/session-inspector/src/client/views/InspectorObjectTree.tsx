import { defineComponent, h, computed, shallowRef, type DefineSetupFnComponent } from 'vue'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
/** Shared value rendering for JSON details and lazy runtime objects with identity links. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { InspectorObjects, InspectorObjectReference } from './objects.ts'
import { InspectorObjectValue, type InspectorObjectEntry } from './object-value.ts'
import css from './inspector.module.css'
/** Original value and Session-local reference navigation. */
export type InspectorObjectTreeProps = PropsLocale<'session-inspector'> & {
  readonly value: unknown
  readonly objects: InspectorObjects
  readonly navigate: (reference: InspectorObjectReference) => void
}
interface ValueTreeProps extends PropsLocale<'session-inspector'> {
  readonly value: unknown
  readonly navigation?:
    | {
      readonly objects: InspectorObjects
      readonly navigate: InspectorObjectTreeProps['navigate']
      readonly revision: object | undefined
    }
    | undefined
}
interface BranchProps extends ValueTreeProps {
  readonly name: string
  readonly path: string
  readonly ancestors: ReadonlyMap<object, string>
  readonly root?: boolean
  readonly accessor?: boolean
  readonly absent?: boolean
}
const PAGE_SIZE = 50
const ObjectBranch: DefineSetupFnComponent<BranchProps> = defineComponent(
  (props: BranchProps) => {
    const json = computed(() => props.navigation === undefined)
    const objects = computed(() => props.navigation?.objects)
    const revision = computed(() => props.navigation?.revision)
    const expanded = shallowRef(props.root === true || json.value)
    const setExpanded = (
      next: typeof expanded.value | ((previous: typeof expanded.value) => typeof expanded.value),
    ) => {
      expanded.value = typeof next === 'function' ? next(expanded.value) : next
    }
    const limit = shallowRef(json.value ? Infinity : PAGE_SIZE)
    const setLimit = (
      next: typeof limit.value | ((previous: typeof limit.value) => typeof limit.value),
    ) => {
      limit.value = typeof next === 'function' ? next(limit.value) : next
    }
    const content = computed(() => {
      void revision.value
      try {
        const reference =
          !props.root && props.value !== null && typeof props.value === 'object'
            ? objects.value?.reference(props.value)
            : undefined
        const circular =
          props.value !== null && typeof props.value === 'object'
            ? props.ancestors.get(props.value)
            : undefined
        const inline = reference === undefined || reference.kind === 'nodeData'
        const display =
          inline && circular === undefined && !props.accessor
            ? new InspectorObjectValue(props.value)
            : undefined
        const entries: InspectorObjectEntry[] = []
        if (expanded.value && display?.expandable === true) {
          for (const entry of display.entries()) {
            if (json.value && entry.properties) continue
            entries.push(entry)
            if (entries.length > limit.value) break
          }
        }
        return { reference, circular, display, entries, error: undefined }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    })
    const children = computed(() => {
      const next = new Map(props.ancestors)
      if (props.value !== null && typeof props.value === 'object')
        next.set(props.value, props.path)
      return next
    })
    return () => {
      const field = h('span', { class: css.objectField }, [props.name, ': '])
      if (content.value.error !== undefined)
        return h('li', { role: 'alert' }, [field, content.value.error])
      if (props.absent)
        return h('li', null, [
          field,
          h('span', { class: css.objectMuted }, [props.t('object.absent')]),
        ])
      if (props.accessor)
        return h('li', null, [
          field,
          h('span', { class: css.objectMuted }, [props.t('object.accessor')]),
        ])
      const reference = content.value.reference
      const link =
        reference === undefined || props.navigation === undefined
          ? undefined
          : h(
            'button',
            {
              type: 'button',
              class: css.objectReference,
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                props.navigation?.navigate(reference)
              },
            },
            ['\u2197 ', props.t(`object.${reference.kind}`), ' \u00B7 ', reference.identity],
          )
      if (
        reference !== undefined &&
        (reference.kind !== 'nodeData' || content.value.circular !== undefined)
      )
        return h('li', null, [field, link])
      if (content.value.circular !== undefined)
        return h('li', null, [
          field,
          h('span', { class: css.objectMuted }, ['\u21A9 ', content.value.circular]),
        ])
      // oxlint-disable-next-line typescript/no-non-null-assertion -- Accessors, references, cycles, and read errors return above.
      const display = content.value.display!
      if (!display.expandable)
        return h('li', null, [field, h('span', { class: css.objectValue }, [display.label])])
      return h('li', null, [
        h(
          'details',
          {
            open: expanded.value,
            onToggle: (event) => {
              setExpanded((event.currentTarget as HTMLDetailsElement).open)
            },
          },
          [
            h('summary', null, [
              field,
              link,
              ' ',
              h('span', { class: css.objectMuted }, [display.label]),
            ]),
            expanded.value &&
              h('ul', null, [
                content.value.entries.slice(0, limit.value).map(({ key, properties, ...entry }) =>
                  h(ObjectBranch, {
                    key: key,
                    ...entry,
                    name: properties ? props.t('object.properties') : entry.name,
                    path: properties ? props.path : `${props.path}.${entry.name}`,
                    ancestors: children.value,
                    navigation: props.navigation,
                    t: props.t,
                  }),
                ),
                content.value.entries.length === 0 &&
                  h('li', { class: css.objectMuted }, [props.t('object.empty')]),
                content.value.entries.length > limit.value &&
                  h('li', null, [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.objectReference,
                        onClick: () => {
                          setLimit(value => value + PAGE_SIZE)
                        },
                      },
                      [props.t('object.more')],
                    ),
                  ]),
              ]),
          ],
        ),
      ])
    }
  },
  {
    props: ['value', 'name', 'path', 'ancestors', 'root', 'accessor', 'absent', 'navigation', 't'],
  },
)
const ValueTree = defineComponent(
  (props: ValueTreeProps) => {
    const ancestors = computed(() => new Map<object, string>())
    return () => {
      return h('ul', { class: css.objectTree }, [
        h(ObjectBranch, { ...props, name: '$', path: '$', ancestors: ancestors.value, root: true }),
      ])
    }
  },
  { props: ['value', 'navigation', 't'] },
)
/**
 * Display serialized Inspector JSON with every container initially expanded and no reference navigation.
 * @param props - Successful inspectorJson output and localized tree labels; empty text represents undefined.
 * @returns The same value tree as Chat details, without collection paging or runtime-object links.
 */
export const InspectorJsonTree = defineComponent(
  (
    props: PropsLocale<'session-inspector'> & {
      readonly text: string
    },
  ) => {
    const value = computed(() => {
      const parsed: unknown = props.text === '' ? undefined : JSON.parse(props.text)
      return parsed
    })
    return () => {
      return h(ValueTree, { value: value.value, t: props.t })
    }
  },
  { props: ['text', 't'] },
)
/**
 * Inspect the root and nested Node data inline; other registered objects remain navigation links.
 * Node data titles also navigate, while repeated ancestors never expand recursively.
 * Expanded fields are cached until their value or Conversation publication changes.
 * @param props - Original object, weak identity lookup, locale, and reference activation.
 * @returns A lazily expanded, typed tree that retains Map keys and collection identities.
 */
export const InspectorObjectTree = defineComponent(
  (props: InspectorObjectTreeProps) => {
    const updates = props.objects.updates
    const subscribe = (listener: () => void) => updates.subscribe(listener)
    const getRevision = () => updates.getSnapshot()
    const revision = useObservableSelector(
      () => ({ subscribe: subscribe, getSnapshot: getRevision }),
      () => value => value,
    )
    return () => {
      return h(ValueTree, {
        value: props.value,
        t: props.t,
        navigation: { objects: props.objects, navigate: props.navigate, revision: revision.value },
      })
    }
  },
  { props: ['value', 'objects', 'navigate', 't'] },
)
