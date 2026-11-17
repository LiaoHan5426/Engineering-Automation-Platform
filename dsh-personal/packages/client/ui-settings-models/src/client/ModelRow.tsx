import { h, defineComponent, nextTick } from 'vue'
/** Shared model fields and actions for both adapter catalog editors. */
import {
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconDragHandleOutlineRegular,
  IconTrashOutlineRegular,
  Tooltip,
  useRowDragPreview,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { ModelsKey } from './locales.ts'
import { ModelInputTypes } from './ModelInputTypes.tsx'
import { ModelReasoningEfforts } from './ModelReasoningEfforts.tsx'
import type { ModelRowOrder } from './useModelRows.ts'
import styles from './ModelsSection.module.css'
/** A capacity's editable text and adapter-specific inherited hint. */
interface CapacityInput {
  value: string
  placeholder: string
  onChange: (value: string) => void
  onBlur?: () => void
}
/** Adapter-owned data and actions for one model row. */
interface ModelRowProps {
  model: DeepSeekModelDraft
  rowKey: number
  position: number
  order: ModelRowOrder
  inputField: 'inputModalities' | 'input'
  inputFallback?: readonly string[] | undefined
  inputLoading?: boolean
  /** Levels the row's `reasoningEfforts` may declare; absent or empty shows no reasoning control. */
  reasoningLevels?: readonly string[] | undefined
  /** Whether the route's protocol accepts only {@link reasoningLevels}, each sent under its own name. */
  reasoningLevelsOnly?: boolean | undefined
  expanded: boolean
  disabled: boolean
  t: (key: ModelsKey) => string
  contextWindow: CapacityInput
  maxTokens: CapacityInput
  onFieldChange: (field: 'id' | 'name', value: string | undefined) => void
  onIdBlur?: (value: string) => void
  onChange: (model: DeepSeekModelDraft) => void
  onToggle: () => void
  onRemove: () => void
}
function rowHalf(event: DragEvent): 'before' | 'after' {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}
/**
 * Render model fields with the display name in the expanded area of narrow rows.
 * @param props - drafted fields and their owning editor's actions.
 * @returns one expandable model entry.
 */
export const ModelRow = defineComponent(
  (props: ModelRowProps) => {
    const preview = useRowDragPreview(styles['modelDragPreview'] as string)
    return () => {
      const { model, position, t, disabled } = props
      const modelField = (field: 'id' | 'name') =>
        h(
          'label',
          { class: `${styles['modelField']} ${field === 'name' ? styles['modelName'] : ''}` },
          [
            field === 'name'
              ? h(
                'span',
                { class: `${styles['modelFieldLabel']} ${styles['modelNameLabel']}` },
                t('modelName'),
              )
              : null,
            h('input', {
              class: styles['input'],
              type: 'text',
              value: typeof model[field] === 'string' ? model[field] : '',
              placeholder: t(field === 'id' ? 'modelId' : 'modelName'),
              'aria-label': `${t(field === 'id' ? 'modelId' : 'modelName')} ${String(position)}`,
              disabled: disabled,
              onFocus: field === 'name' && !props.expanded ? props.onToggle : undefined,
              onInput: (event: InputEvent) => {
                const value = (event.target as HTMLInputElement).value
                props.onFieldChange(field, field === 'name' && value === '' ? undefined : value)
              },
              onBlur:
                field === 'id'
                  ? (event: FocusEvent) =>
                    props.onIdBlur?.((event.target as HTMLInputElement).value)
                  : undefined,
            }),
          ],
        )
      return h(
        'div',
        {
          class: styles['modelEntry'],
          'data-row-key': props.rowKey,
          'data-dragging': props.order.dragging || undefined,
          'data-drop-target': props.order.dragging ? undefined : props.order.target,
          onDragover: (event: DragEvent) => {
            if (!props.order.canDrop) return
            event.preventDefault()
            if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
            props.order.onOver(rowHalf(event))
          },
          onDragleave: (event: DragEvent) => {
            if (
              event.relatedTarget instanceof Node &&
              (event.currentTarget as HTMLElement).contains(event.relatedTarget)
            )
              return
            props.order.onLeave()
          },
          onDrop: (event: DragEvent) => {
            if (!props.order.canDrop) return
            event.preventDefault()
            props.order.onDrop(rowHalf(event))
          },
        },
        h('div', { class: styles['modelRow'], 'data-expanded': props.expanded || undefined }, [
          h(
            Tooltip,
            { label: t('reorderModelHelp'), portal: true },
            {
              default: () =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: `${styles['iconButton']} ${styles['modelDragHandle']}`,
                    'aria-label': `${t('reorderModel')} ${String(position)}`,
                    'aria-keyshortcuts': 'ArrowUp ArrowDown',
                    'aria-description': t('reorderModelHelp'),
                    disabled: disabled,
                    draggable: !disabled,
                    onDragstart: (event: DragEvent) => {
                      if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer?.setData(
                        'application/x-dsh-model-order',
                        String(position),
                      )
                      props.order.onStart()
                      preview.start(
                        event,
                        (event.currentTarget as HTMLElement).closest<HTMLElement>(
                          '[data-row-key]',
                        ) ?? undefined,
                      )
                    },
                    onDragend: () => {
                      if (preview.clear()) props.order.onEnd()
                    },
                    onKeydown: (event: KeyboardEvent) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                      event.preventDefault()
                      event.stopPropagation()
                      const handle = event.currentTarget
                      const focused =
                        handle instanceof HTMLButtonElement &&
                        handle.ownerDocument.activeElement === handle
                      props.order.onMove(event.key === 'ArrowUp' ? -1 : 1)
                      if (focused)
                        void nextTick(() => {
                          const doc = handle.ownerDocument
                          // Moving a keyed row can blur its retained handle during DOM insertion.
                          if (
                            !handle.isConnected ||
                            handle.disabled ||
                            !doc.hasFocus() ||
                            doc.activeElement !== doc.body
                          )
                            return
                          handle.focus({ preventScroll: true })
                          handle.scrollIntoView({ block: 'nearest' })
                        })
                    },
                  },
                  h(IconDragHandleOutlineRegular, { size: 14 }),
                ),
            },
          ),
          modelField('id'),
          h(
            'button',
            {
              type: 'button',
              class: styles['iconButton'],
              'aria-label': `${t('modelAdvanced')} ${String(position)}`,
              'aria-expanded': props.expanded,
              title: t('modelAdvanced'),
              onClick: (event: MouseEvent) => {
                (event.currentTarget as HTMLElement).focus()
                props.onToggle()
              },
            },
            props.expanded
              ? h(IconChevronDownOutlineRegular, null)
              : h(IconChevronRightOutlineRegular, null),
          ),
          h(
            'button',
            {
              type: 'button',
              class: `${styles['iconButton']} ${styles['iconButtonDanger']}`,
              'aria-label': `${t('removeModel')} ${String(position)}`,
              title: t('removeModel'),
              disabled: disabled,
              onClick: props.onRemove,
            },
            h(IconTrashOutlineRegular, { size: 14 }),
          ),
          modelField('name'),
          props.expanded
            ? h('div', { class: styles['modelAdvanced'] }, [
              (['contextWindow', 'maxTokens'] as const).map(field =>
                h('label', { class: styles['modelField'], key: field }, [
                  h('span', { class: styles['modelFieldLabel'] }, t(field)),
                  h('input', {
                    class: styles['input'],
                    type: 'text',
                    inputMode: 'numeric',
                    value: props[field].value,
                    placeholder: props[field].placeholder,
                    'aria-label': `${t(field)} ${String(position)}`,
                    disabled: disabled,
                    onInput: (event: InputEvent) => {
                      props[field].onChange((event.target as HTMLInputElement).value)
                    },
                    onBlur: props[field].onBlur,
                  }),
                ]),
              ),
              h(ModelInputTypes, {
                model: model,
                field: props.inputField,
                position: position,
                fallback: props.inputFallback,
                disabled: disabled || props.inputLoading === true,
                t: t,
                onChange: props.onChange,
              }),
              props.reasoningLevels !== undefined && props.reasoningLevels.length > 0
                ? h(ModelReasoningEfforts, {
                  model: model,
                  levels: props.reasoningLevels,
                  levelsOnly: props.reasoningLevelsOnly === true,
                  position: position,
                  disabled: disabled,
                  t: t,
                  onChange: props.onChange,
                })
                : null,
            ])
            : null,
        ]),
      )
    }
  },
  {
    inheritAttrs: false,
    props: [
      'model',
      'rowKey',
      'position',
      'order',
      'inputField',
      'inputFallback',
      'inputLoading',
      'reasoningLevels',
      'reasoningLevelsOnly',
      'expanded',
      'disabled',
      't',
      'contextWindow',
      'maxTokens',
      'onFieldChange',
      'onIdBlur',
      'onChange',
      'onToggle',
      'onRemove',
    ],
  },
)
