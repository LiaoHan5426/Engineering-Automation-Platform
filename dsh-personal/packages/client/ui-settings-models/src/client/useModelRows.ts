/** Local model-row identities, disclosures, capacity text, and draft ordering. */

import { computed, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'

/** Text fields whose unfinished spelling belongs to one draft row. */
export type CapacityField = 'contextWindow' | 'maxTokens'

interface RowState {
  key: number
  expanded: boolean
  editing: Map<CapacityField, string>
}

/** Drag state and actions for one model row within its editor. */
export interface ModelRowOrder {
  dragging: boolean
  target: 'before' | 'after' | undefined
  canDrop: boolean
  onStart: () => void
  onEnd: () => void
  onOver: (half: 'before' | 'after') => void
  onLeave: () => void
  onDrop: (half: 'before' | 'after') => void
  onMove: (offset: -1 | 1) => void
}

interface ModelRows {
  rows: (RowState & { model: DeepSeekModelDraft; order: ModelRowOrder })[]
  toggle: (index: number) => void
  edit: (index: number, field: CapacityField, text: string | undefined) => void
  forget: (removed: ReadonlySet<number>) => void
  reset: () => void
}

/** One editor-local identity; editing a model ID never replaces its controls. */
function createRow(key: number): RowState {
  return { key, expanded: false, editing: new Map() }
}

/**
 * Keep row state with its model through draft moves and removals.
 * @param models - getter for the current draft array, owned by the provider card.
 * @param onChange - replaces only that card's draft array.
 * @param disabled - getter that prevents reordering while the card cannot be edited.
 * @returns reactive row state and local editing and ordering actions.
 */
export function useModelRows(
  models: MaybeRefOrGetter<readonly DeepSeekModelDraft[]>,
  onChange: (models: DeepSeekModelDraft[]) => void,
  disabled: MaybeRefOrGetter<boolean>,
): ModelRows {
  let nextKey = 0
  const stored = shallowRef(toValue(models).map(() => createRow(nextKey++)))
  const dragged = shallowRef<number>()
  const target = shallowRef<{ key: number; half: 'before' | 'after' }>()
  watch(
    () => toValue(models).length,
    (length) => {
      stored.value = Array.from(
        { length },
        (_, index) => stored.value[index] ?? createRow(nextKey++),
      )
    },
    { flush: 'sync' },
  )
  const endDrag = (): void => {
    dragged.value = undefined
    target.value = undefined
  }
  const rowAt = (index: number): RowState => {
    const state = stored.value[index]
    if (state === undefined) throw new Error('Model row state is out of sync')
    return state
  }
  const move = (from: number, to: number): void => {
    const current = toValue(models)
    if (toValue(disabled) || from === to || from < 0 || to < 0 || to >= current.length) return
    const entries = current.map((model, index) => ({ model, state: rowAt(index) }))
    const moved = entries.splice(from, 1)
    entries.splice(to, 0, ...moved)
    stored.value = entries.map(entry => entry.state)
    onChange(entries.map(entry => entry.model))
  }
  const rows = computed(() =>
    toValue(models).map((model, index) => {
      const state = rowAt(index)
      return {
        ...state,
        model,
        order: {
          dragging: dragged.value === state.key,
          target: target.value?.key === state.key ? target.value.half : undefined,
          canDrop: !toValue(disabled) && dragged.value !== undefined,
          onStart: (): void => {
            dragged.value = state.key
          },
          onEnd: endDrag,
          onOver: (half: 'before' | 'after'): void => {
            if (target.value?.key !== state.key || target.value.half !== half)
              target.value = { key: state.key, half }
          },
          onLeave: (): void => {
            if (target.value?.key === state.key) target.value = undefined
          },
          onDrop: (half: 'before' | 'after'): void => {
            const from = stored.value.findIndex(row => row.key === dragged.value)
            const insertion = index + (half === 'after' ? 1 : 0)
            move(from, insertion > from ? insertion - 1 : insertion)
            endDrag()
          },
          onMove: (offset: -1 | 1): void => {
            move(index, index + offset)
          },
        },
      }
    }),
  )
  return {
    get rows() {
      return rows.value
    },
    toggle: (index): void => {
      stored.value = stored.value.map((row, at) =>
        at === index ? { ...row, expanded: !row.expanded } : row,
      )
    },
    edit: (index, field, text): void => {
      stored.value = stored.value.map((row, at) => {
        if (at !== index) return row
        const editing = new Map(row.editing)
        if (text === undefined) editing.delete(field)
        else editing.set(field, text)
        return { ...row, editing }
      })
    },
    forget: (removed): void => {
      stored.value = stored.value.filter((_row, index) => !removed.has(index))
      endDrag()
    },
    reset: (): void => {
      stored.value = toValue(models).map(() => createRow(nextKey++))
      endDrag()
    },
  }
}
