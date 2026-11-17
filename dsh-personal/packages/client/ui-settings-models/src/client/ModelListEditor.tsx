import { normalizeClass } from 'vue'
import { h, Fragment, shallowRef, defineComponent, watch } from 'vue'
/**
 * The model list of one pi-ai provider profile, plus the action that asks the
 * provider what it serves.
 *
 * The list is the profile's `models` array as the card holds it: an empty list
 * means "serve this route's built-in catalog", and any entry replaces that
 * catalog, so a row is only ever added deliberately. Fetching asks the endpoint
 * **the form currently shows** — including a key typed but not yet saved — so
 * adding a provider is one pass instead of save-then-return; the reply is
 * candidates the user picks from, never configuration written behind them. The
 * picker opens with the configured models checked, so confirming it adds the
 * newly checked candidates and removes the unchecked configured ones in the
 * draft; configured rows the reply does not list are kept, and a confirmation
 * that would empty the list is refused.
 *
 * A provider that cannot be interrogated (an unreachable endpoint, a protocol
 * with no readable listing) is not a dead end: the failure is shown next to the
 * rows the user can still fill in by hand.
 */
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-api-remotes/client'
import {
  AnimatedRows,
  Button,
  IconPlusOutlineRegular,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import { formatCapacity, parseCapacity } from './DeepSeekModelsEditor.tsx'
import type { ModelsOperations } from './operations.ts'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { en } from './locales.ts'
import { ModelRow } from './ModelRow.tsx'
import { useModelRows } from './useModelRows.ts'
import type { CapacityField } from './useModelRows.ts'
import styles from './ModelsSection.module.css'
/**
 * One configured model row. Fields this card does not edit must survive an
 * edit rather than being dropped by a rebuild.
 */
export type ModelDraft = DeepSeekModelDraft
/** A row's text field, or the empty string when unset or not a string. */
function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}
/** A row's numeric field, or `undefined` when unset or not a number. */
function numberOf(model: ModelDraft, key: string): number | undefined {
  const value = model[key]
  return typeof value === 'number' ? value : undefined
}
/** What an interrogation needs, taken from the live form. */
export interface ProbeTarget {
  /** Settings namespace whose adapter family answers. */
  settingsNs: string
  /**
   * Route being edited, when the card edits one. An adapter that already
   * describes it answers from its own registry, so such a card can ask without
   * an endpoint at all.
   */
  provider?: string
  /** Endpoint as the form currently shows it. */
  baseURL?: string
  /** Wire protocol the form names, when it names one. */
  api?: string
  /** Key typed into the form and not yet stored, when there is one. */
  apiKey?: string
}
/** Props of {@link ModelListEditor}. */
export interface ModelListEditorProps {
  /** The rows as currently drafted. */
  models: readonly ModelDraft[]
  /** Installed provider whose catalog supplies defaults without endpoint I/O. */
  catalogProvider?: string | undefined
  /**
   * Reasoning levels a hand-declared route's rows may declare in
   * `reasoningEfforts`, in escalation order; absent or empty shows no
   * reasoning control, leaving a catalog model's levels to the catalog.
   */
  reasoningLevels?: readonly string[] | undefined
  /** Whether the route's protocol accepts only {@link reasoningLevels}, each sent under its own name. */
  reasoningLevelsOnly?: boolean | undefined
  /** Route input types for models absent from the installed catalog. */
  defaultInput?: readonly string[] | undefined
  /** Whether the user layer currently owns the whole array; absent on a create. */
  overridden?: boolean
  /** Replace the drafted rows. */
  onChange: (models: ModelDraft[]) => void
  /** Remove the user-owned array and return to inheritance; absent on a create. */
  onReset?: () => void
  /** Endpoint facts for the fetch action. */
  probe: ProbeTarget
  /**
   * Copy key naming why the fetch action is unavailable, or `undefined` when
   * it is. The card owns this because the key it would send is judged there:
   * asking with a key the form has already refused spends a round trip to be
   * told what the field already says.
   */
  probeBlocked?: keyof typeof en | undefined
  /** The Host operations whose interrogation answers the fetch action. */
  operations: ModelsOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control (read-only deployment or a pending write). */
  disabled: boolean
  /**
   * Called once per change with whether an endpoint interrogation is in
   * flight. The owning card folds it into its own busy state so the surface
   * around the card — a mode switch, say — can refuse to move while the
   * answer, and the picker it opens, is still bound for this list.
   */
  onBusyChange: (busy: boolean) => void
}
/**
 * What an empty capacity field is worth, shown as its placeholder so a row left
 * blank does not read as a model with no capacity at all.
 *
 * These hints match llm-pi-ai's built-in `defaultContextWindow` and
 * `defaultMaxTokens` in decimal K/M notation. Provider overrides are not
 * available to this component and are not reflected in the hints.
 */
const CAPACITY_HINT: Readonly<Record<CapacityField, string>> = {
  contextWindow: '1M',
  maxTokens: '128K',
}
/**
 * Spell a stored count for a field that may be unset. The spelling itself is
 * {@link formatCapacity}, shared with the DeepSeek catalog editor so both
 * surfaces read and write one K/M vocabulary.
 * @param value - stored capacity, or `undefined` for an unset field.
 * @returns the field text, empty when unset.
 */
function capacitySpelling(value: number | undefined): string {
  return value === undefined ? '' : formatCapacity(value)
}
/** Adopt a candidate, preserving disclosed capacities and input types. */
function adopt(candidate: LlmDiscoveredModel): ModelDraft {
  return {
    id: candidate.id,
    ...(candidate.name === undefined ? {} : { name: candidate.name }),
    ...(candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow }),
    ...(candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens }),
    ...(candidate.inputModalities === undefined ? {} : { input: [...candidate.inputModalities] }),
  }
}
/**
 * Render the model list with its fetch action.
 * @param props - the drafted rows, probe target, wire face, and copy.
 * @returns the model-list editor.
 */
export const ModelListEditor = defineComponent(
  (props: ModelListEditorProps) => {
    const busyRef = shallowRef(false)
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === 'function' ? value(busyRef.value) : value
    }
    const failureRef = shallowRef<string | undefined>(undefined)
    const setFailure = (
      value:
        | typeof failureRef.value
        | ((previous: typeof failureRef.value) => typeof failureRef.value),
    ): void => {
      failureRef.value = typeof value === 'function' ? value(failureRef.value) : value
    }
    const inheritedCatalogRef = shallowRef<
      | {
        provider: string
        models: readonly LlmDiscoveredModel[]
      }
      | undefined
    >(undefined)
    const setInheritedCatalog = (
      value:
        | typeof inheritedCatalogRef.value
        | ((previous: typeof inheritedCatalogRef.value) => typeof inheritedCatalogRef.value),
    ): void => {
      inheritedCatalogRef.value =
        typeof value === 'function' ? value(inheritedCatalogRef.value) : value
    }
    const candidatesRef = shallowRef<readonly LlmDiscoveredModel[] | undefined>(undefined)
    const setCandidates = (
      value:
        | typeof candidatesRef.value
        | ((previous: typeof candidatesRef.value) => typeof candidatesRef.value),
    ): void => {
      candidatesRef.value = typeof value === 'function' ? value(candidatesRef.value) : value
    }
    const flippedRef = shallowRef<ReadonlySet<string>>(new Set())
    const setFlipped = (
      value:
        | typeof flippedRef.value
        | ((previous: typeof flippedRef.value) => typeof flippedRef.value),
    ): void => {
      flippedRef.value = typeof value === 'function' ? value(flippedRef.value) : value
    }
    const candidateQueryRef = shallowRef('')
    const setCandidateQuery = (
      value:
        | typeof candidateQueryRef.value
        | ((previous: typeof candidateQueryRef.value) => typeof candidateQueryRef.value),
    ): void => {
      candidateQueryRef.value =
        typeof value === 'function' ? value(candidateQueryRef.value) : value
    }
    const rowState = useModelRows(
      () => props.models,
      (value) => { props.onChange(value) },
      () => props.disabled,
    )
    watch([busyRef, () => props.onBusyChange], () => { props.onBusyChange(busyRef.value) }, {
      immediate: true,
    })
    watch(
      [() => props.catalogProvider, () => props.operations, () => props.probe.settingsNs],
      ([catalogProvider, operations, ns], _previous, onCleanup) => {
        if (catalogProvider === undefined) return
        let current = true
        onCleanup(() => {
          current = false
        })
        void operations.discoverModels(ns, { provider: catalogProvider }).then((answer) => {
          if (!current) return
          setInheritedCatalog({
            provider: catalogProvider,
            models: answer.kind === 'found' ? answer.models : [],
          })
          setFailure(answer.kind === 'refused' ? answer.message : undefined)
        })
      },
      { immediate: true },
    )
    return () => {
      const { models, onChange, probe, operations, t, disabled } = props
      const { catalogProvider } = props
      const busy = busyRef.value
      const failure = failureRef.value
      const inheritedCatalog = inheritedCatalogRef.value
      const catalog =
        inheritedCatalog?.provider === catalogProvider ? inheritedCatalog?.models : undefined
      const inputDefaults = (() =>
        new Map(catalog?.map(model => [model.id, model.inputModalities])))()
      const candidates = candidatesRef.value
      const flipped = flippedRef.value
      const candidateQuery = candidateQueryRef.value
      const editCapacity = (index: number, field: CapacityField, text: string): void => {
        rowState.edit(index, field, text)
        patch(index, { [field]: parseCapacity(text) })
      }
      const capacityText = (model: ModelDraft, index: number, field: CapacityField): string =>
        rowState.rows[index]?.editing.get(field) ?? capacitySpelling(numberOf(model, field))
      const patch = (index: number, next: Record<string, string | number | undefined>): void => {
        onChange(
          models.map((model, at) => {
            if (at !== index) return model
            // Rebuilt rather than spread over: an emptied optional field has to leave
            // the profile, not be stored as a value its schema would reject.
            // Spread first so a field this card does not edit survives; an emptied
            // optional field is then dropped rather than stored as a value its
            // schema would reject.
            const cleared = new Set(
              Object.entries(next)
                .filter(([, value]) => value === undefined || value === '')
                .map(([key]) => key),
            )
            return Object.fromEntries(
              Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key)),
            )
          }),
        )
      }
      const fetchModels = async (): Promise<void> => {
        setBusy(true)
        setFailure(undefined)
        try {
          const answer = await operations.discoverModels(probe.settingsNs, {
            ...(probe.provider === undefined ? {} : { provider: probe.provider }),
            ...(probe.baseURL === undefined || probe.baseURL.length === 0
              ? {}
              : { baseURL: probe.baseURL }),
            ...(probe.api === undefined ? {} : { api: probe.api }),
            ...(probe.apiKey === undefined ? {} : { apiKey: probe.apiKey }),
          })
          if (answer.kind === 'refused') {
            setFailure(answer.message)
            return
          }
          const found = answer.models
          if (catalogProvider !== undefined)
            setInheritedCatalog({ provider: catalogProvider, models: found })
          if (found.length === 0) {
            setFailure(t('fetchEmpty'))
            return
          }
          setCandidateQuery('')
          setFlipped(new Set())
          // A listing may repeat an id; the picker and the list hold each model once.
          setCandidates([...new Map(found.map(model => [model.id, model])).values()])
        } finally {
          setBusy(false)
        }
      }
      const closePicker = (): void => {
        setCandidates(undefined)
        setFlipped(new Set())
        setCandidateQuery('')
      }
      const configuredIds = new Set(
        models.map(model => textOf(model, 'id')).filter(id => id.length > 0),
      )
      const pickedByDefault = (id: string): boolean =>
        configuredIds.size === 0 || configuredIds.has(id)
      const isPicked = (id: string): boolean => pickedByDefault(id) !== flipped.has(id)
      const activeCandidates = candidates ?? []
      const candidateIndex = (() =>
        new TextSearchIndex(candidates ?? [], candidate => ({
          fuzzy: [candidate.id, candidate.name],
        })))()
      const listed = new Set(activeCandidates.map(candidate => candidate.id))
      const removedRows = new Set<number>()
      models.forEach((model, at) => {
        const id = textOf(model, 'id')
        if (listed.has(id) && !isPicked(id)) removedRows.add(at)
      })
      const keptRows = models.filter((_model, at) => !removedRows.has(at))
      const keptIds = new Set(keptRows.map(model => textOf(model, 'id')))
      const addedRows = activeCandidates
        .filter(candidate => isPicked(candidate.id) && !keptIds.has(candidate.id))
        .map(adopt)
      const emptiesList = models.length > 0 && keptRows.length === 0 && addedRows.length === 0
      const adoptPicked = (): void => {
        onChange([...keptRows, ...addedRows])
        rowState.forget(removedRows)
        closePicker()
      }
      const toggle = (id: string): void => {
        setFlipped((current) => {
          const next = new Set(current)
          if (!next.delete(id)) next.add(id)
          return next
        })
      }
      const visibleCandidates = candidateIndex.search(candidateQuery)
      const allVisibleCandidatesPicked =
        visibleCandidates.length > 0 &&
        visibleCandidates.every(candidate => isPicked(candidate.id))
      const toggleVisibleCandidates = (): void => {
        // Only visible candidates change: a hidden checked one may be a configured
        // model, and clearing it would remove that model unseen.
        const target = !allVisibleCandidatesPicked
        setFlipped((current) => {
          const next = new Set(current)
          for (const candidate of visibleCandidates) {
            if (pickedByDefault(candidate.id) === target) next.delete(candidate.id)
            else next.add(candidate.id)
          }
          return next
        })
      }
      const askable =
        probe.provider !== undefined || (probe.baseURL !== undefined && probe.baseURL.length > 0)
      return h('section', { class: styles['modelCatalog'], 'aria-label': t('models') }, [
        h('div', { class: styles['modelListHead'] }, [
          h('div', { class: styles['modelCatalogHeading'] }, [
            h('span', { class: styles['modelCatalogTitle'] }, t('models')),
            props.overridden === undefined
              ? null
              : h(
                'span',
                { class: styles['modelCatalogMeta'] },
                props.overridden ? t('modelsCustomized') : t('modelsInherited'),
              ),
          ]),
          props.overridden === true && props.onReset !== undefined
            ? h(
              'button',
              {
                type: 'button',
                class: styles['linkButton'],
                disabled: disabled,
                onClick: () => {
                  rowState.reset()
                  props.onReset?.()
                },
              },
              t('resetModels'),
            )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: styles['linkButton'],
              disabled: disabled || busy || !askable || props.probeBlocked !== undefined,
              title:
                props.probeBlocked !== undefined
                  ? t(props.probeBlocked)
                  : askable
                    ? undefined
                    : t('fetchNeedsBaseUrl'),
              onClick: () => {
                void fetchModels()
              },
            },
            busy ? t('fetching') : t('fetchModels'),
          ),
        ]),
        models.length === 0 ? h('p', { class: styles['modelEmpty'] }, t('modelsEmpty')) : null,
        h(
          AnimatedRows,
          {
            className: normalizeClass(styles['modelList']),
            rowKeys: rowState.rows.map(row => String(row.key)),
            ready: true,
            resetKey: '',
          },
          {
            default: () =>
              rowState.rows.map(({ model, key, expanded, order }, index) =>
                h(ModelRow, {
                  key: key,
                  rowKey: key,
                  order: order,
                  model: model,
                  position: index + 1,
                  inputField: 'input',
                  inputFallback: inputDefaults.get(textOf(model, 'id')) ?? props.defaultInput,
                  inputLoading: catalogProvider !== undefined && catalog === undefined,
                  reasoningLevels: props.reasoningLevels,
                  reasoningLevelsOnly: props.reasoningLevelsOnly,
                  expanded: expanded,
                  disabled: disabled,
                  t: t,
                  contextWindow: {
                    value: capacityText(model, index, 'contextWindow'),
                    placeholder: CAPACITY_HINT.contextWindow,
                    onChange: (text) => {
                      editCapacity(index, 'contextWindow', text)
                    },
                  },
                  maxTokens: {
                    value: capacityText(model, index, 'maxTokens'),
                    placeholder: CAPACITY_HINT.maxTokens,
                    onChange: (text) => {
                      editCapacity(index, 'maxTokens', text)
                    },
                  },
                  onFieldChange: (field, value) => {
                    patch(index, { [field]: value })
                  },
                  onChange: (next) => {
                    onChange(models.map((row, at) => (at === index ? next : row)))
                  },
                  onToggle: () => {
                    rowState.toggle(index)
                  },
                  onRemove: () => {
                    onChange(models.filter((_model, at) => at !== index))
                    rowState.forget(new Set([index]))
                  },
                }),
              ),
          },
        ),
        h(
          'button',
          {
            type: 'button',
            class: styles['addModelButton'],
            disabled: disabled,
            onClick: () => {
              onChange([...models, { id: '' }])
            },
          },
          [h(IconPlusOutlineRegular, { size: 14 }), t('addModel')],
        ),
        failure !== undefined ? h('p', { class: styles['error'] }, failure) : null,
        h(
          Modal,
          {
            open: candidates !== undefined,
            onClose: closePicker,
            title: t('fetchTitle'),
            closeLabel: t('close'),
            description: t('fetchDescription'),
            className: normalizeClass(styles['fetchDialog']),
          },
          {
            footer: () =>
              h(Fragment, null, [
                h(
                  Button,
                  { variant: 'outline', onClick: closePicker },
                  {
                    default: () => t('cancel'),
                  },
                ),
                h(
                  Button,
                  {
                    variant: 'outline',
                    disabled: emptiesList,
                    title: emptiesList ? t('fetchKeepOne') : undefined,
                    onClick: adoptPicked,
                  },
                  {
                    default: () => t('fetchAdopt'),
                  },
                ),
              ]),
            default: () => [
              h('div', { class: styles['candidateToolbar'] }, [
                h('input', {
                  class: `${styles['input']} ${styles['candidateSearch']}`,
                  type: 'search',
                  value: candidateQuery,
                  placeholder: t('fetchSearch'),
                  'aria-label': t('fetchSearch'),
                  onInput: (event: InputEvent) => {
                    setCandidateQuery((event.target as HTMLInputElement).value)
                  },
                }),
                h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'sm',
                    disabled: visibleCandidates.length === 0,
                    onClick: toggleVisibleCandidates,
                  },
                  {
                    default: () =>
                      t(
                        allVisibleCandidatesPicked
                          ? 'fetchDeselectAll'
                          : /** Route input types for models absent from the installed catalog. */ 'fetchSelectAll',
                      ),
                  },
                ),
              ]),
              visibleCandidates.length === 0
                ? h('p', { class: styles['candidateEmpty'], role: 'status' }, t('fetchNoMatches'))
                : h(
                  'ul',
                  { class: styles['candidateList'] },
                  visibleCandidates.map(candidate =>
                    h(
                      'li',
                      { key: candidate.id, class: styles['candidate'] },
                      h('label', { class: styles['candidateLabel'] }, [
                        h('input', {
                          type: 'checkbox',
                          checked: isPicked(candidate.id),
                          onInput: () => {
                            toggle(candidate.id)
                          },
                        }),
                        h(
                          'span',
                          { class: styles['candidateId'], title: candidate.name ?? candidate.id },
                          candidate.id,
                        ),
                      ]),
                    ),
                  ),
                ),
            ],
          },
        ),
      ])
    }
  },
  {
    inheritAttrs: false,
    props: [
      'models',
      'catalogProvider',
      'reasoningLevels',
      'reasoningLevelsOnly',
      'defaultInput',
      'overridden',
      'onChange',
      'onReset',
      'probe',
      'probeBlocked',
      'operations',
      't',
      'disabled',
      'onBusyChange',
    ],
  },
)
