import { h, shallowRef, defineComponent, watch } from 'vue'
/**
 * The card that declares a provider pi-ai does not ship — a gateway, a
 * self-hosted server, or a provider newer than the installed catalog.
 *
 * This is a create, not an edit, which is why it is its own form rather than
 * the provider editor with extra fields: the route id is being *chosen* here,
 * and the settings address does not exist until it is. It renders as the
 * custom-API panel of the section's add card; the card's mode switch names it
 * when both modes are offered, and with the custom mode alone the card shows
 * this form directly. One `settings.mutate` sets the whole profile at
 * `providers.<route>`; the key travels separately through `credentials/set`
 * under the reference the profile records, exactly as an existing provider's
 * key does.
 *
 * The three fields a hand-declared route cannot default — endpoint, protocol,
 * and at least one model — are required here rather than at load, so the
 * failure names the field while the user is still looking at it.
 *
 * There is deliberately no provider-scoped reasoning-effort control, here or
 * on the editor card: effort is a per-MODEL capability, and the models under
 * one provider disagree about it, so a provider-scoped control can only be set
 * to a value some of them reject. Each model row of a hand-declared route
 * declares its own `reasoningEfforts` instead, and the composer's model picker
 * offers each model those levels.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { apiKeyFailure } from './apiKey.ts'
import { ApiKeyInput } from './ApiKeyInput.tsx'
import { EditorFooter } from './EditorFooter.tsx'
import { validateDeepSeekModels } from './DeepSeekModelsEditor.tsx'
import { ModelListEditor } from './ModelListEditor.tsx'
import type { ModelDraft } from './ModelListEditor.tsx'
import { validateReasoningEfforts } from './ModelReasoningEfforts.tsx'
import { deriveKeyRef } from './store.ts'
import { protocolLabel } from './protocol-label.ts'
import { protocolNeedsKey, protocolReasoningLevels } from './protocol-rules.ts'
import type { ModelsOperations } from './operations.ts'
import type { en, ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'
/** The settings namespace a hand-declared provider is written into. */
const NS = 'llm-pi-ai'
/**
 * A route id usable as a settings key AND as the stem of a credential name.
 * The leading letter is the second half of that: `deriveKeyRef` uppercases the
 * id and replaces every non-alphanumeric run with `_`, and a credential
 * reference is a POSIX shell identifier, which cannot start with a digit. A
 * digit-leading id passes every check this card makes and then fails at the
 * credential seam with a raw regular expression the user cannot act on.
 */
const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/**
 * Endpoint examples for protocols whose SDK expects a different base than an
 * OpenAI-compatible `/v1`: Anthropic's SDK appends `/v1/messages`, and the
 * Gemini protocol expects the API version in the base URL.
 */
const BASE_URL_PLACEHOLDERS: Readonly<Record<string, ModelsKey>> = {
  'anthropic-messages': 'customAnthropicBaseUrlPlaceholder',
  'google-generative-ai': 'customGeminiBaseUrlPlaceholder',
}
function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
/** Props of {@link CustomProviderCard}. */
export interface CustomProviderCardProps {
  /** Route ids already declared, so the card refuses to shadow one. */
  taken: readonly string[]
  /** Wire protocols the adapter can serve, in the order it reports them. */
  protocols: readonly string[]
  /** Reasoning levels the adapter's schema accepts, in escalation order; empty shows no reasoning control. */
  reasoningLevels: readonly string[]
  /**
   * Revision of the `llm-pi-ai` user section this card opened at, sent with
   * the create so a route another tab declared meanwhile is a refusal rather
   * than a silent overwrite of its whole profile.
   */
  revision: number
  /** The Host operations this card writes and interrogates through. */
  operations: ModelsOperations
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable writes (read-only settings provider). */
  readOnly: boolean
  /** Close the card; `changed` reports whether a provider was created. */
  onClose: (changed: boolean) => void
  /**
   * Called once per change with whether the create or the list's endpoint
   * interrogation is in flight, so the owner can hold its surface still.
   */
  onBusyChange?: (busy: boolean) => void
}
/**
 * Render the custom-provider creation card.
 * @param props - existing routes, protocol choices, wire faces, and copy.
 * @returns the creation card.
 */
export const CustomProviderCard = defineComponent(
  (props: CustomProviderCardProps) => {
    const { protocols } = props
    const openedAtRef = shallowRef((() => props.revision)())
    const routeRef = shallowRef('')
    const setRoute = (
      value: typeof routeRef.value | ((previous: typeof routeRef.value) => typeof routeRef.value),
    ): void => {
      routeRef.value = typeof value === 'function' ? value(routeRef.value) : value
    }
    const displayNameRef = shallowRef('')
    const setDisplayName = (
      value:
        | typeof displayNameRef.value
        | ((previous: typeof displayNameRef.value) => typeof displayNameRef.value),
    ): void => {
      displayNameRef.value = typeof value === 'function' ? value(displayNameRef.value) : value
    }
    const baseURLRef = shallowRef('')
    const setBaseURL = (
      value:
        | typeof baseURLRef.value
        | ((previous: typeof baseURLRef.value) => typeof baseURLRef.value),
    ): void => {
      baseURLRef.value = typeof value === 'function' ? value(baseURLRef.value) : value
    }
    const protocolRef = shallowRef(protocols[0] ?? '')
    const setProtocol = (
      value:
        | typeof protocolRef.value
        | ((previous: typeof protocolRef.value) => typeof protocolRef.value),
    ): void => {
      protocolRef.value = typeof value === 'function' ? value(protocolRef.value) : value
    }
    const keyDraftRef = shallowRef('')
    const setKeyDraft = (
      value:
        | typeof keyDraftRef.value
        | ((previous: typeof keyDraftRef.value) => typeof keyDraftRef.value),
    ): void => {
      keyDraftRef.value = typeof value === 'function' ? value(keyDraftRef.value) : value
    }
    const modelsRef = shallowRef<readonly ModelDraft[]>([])
    const setModels = (
      value:
        | typeof modelsRef.value
        | ((previous: typeof modelsRef.value) => typeof modelsRef.value),
    ): void => {
      modelsRef.value = typeof value === 'function' ? value(modelsRef.value) : value
    }
    const busyRef = shallowRef(false)
    const setBusy = (
      value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
    ): void => {
      busyRef.value = typeof value === 'function' ? value(busyRef.value) : value
    }
    const listBusyRef = shallowRef(false)
    const setListBusy = (
      value:
        | typeof listBusyRef.value
        | ((previous: typeof listBusyRef.value) => typeof listBusyRef.value),
    ): void => {
      listBusyRef.value = typeof value === 'function' ? value(listBusyRef.value) : value
    }
    const failureRef = shallowRef<string | undefined>(undefined)
    const setFailure = (
      value:
        | typeof failureRef.value
        | ((previous: typeof failureRef.value) => typeof failureRef.value),
    ): void => {
      failureRef.value = typeof value === 'function' ? value(failureRef.value) : value
    }
    const committedRef = shallowRef(false)
    const setCommitted = (
      value:
        | typeof committedRef.value
        | ((previous: typeof committedRef.value) => typeof committedRef.value),
    ): void => {
      committedRef.value = typeof value === 'function' ? value(committedRef.value) : value
    }
    watch(
      [busyRef, listBusyRef, () => props.onBusyChange],
      () => props.onBusyChange?.(busyRef.value || listBusyRef.value),
      { immediate: true },
    )
    return () => {
      const { taken, protocols, reasoningLevels, operations, t } = props
      const openedAt = openedAtRef.value
      const route = routeRef.value
      const displayName = displayNameRef.value
      const baseURL = baseURLRef.value
      const protocol = protocolRef.value
      const keyDraft = keyDraftRef.value
      const models = modelsRef.value
      const busy = busyRef.value

      const failure = failureRef.value
      const committed = committedRef.value
      const disabled = props.readOnly || busy
      const profileDisabled = disabled || committed
      const routeInvalid = route.length > 0 && !ROUTE_PATTERN.test(route)
      const routeTaken = taken.includes(route)
      const normalizedBaseURL = baseURL.trim()
      const baseUrlInvalid = baseURL.length > 0 && !isHttpUrl(normalizedBaseURL)
      const reasoning = protocolReasoningLevels(protocol, reasoningLevels)
      const modelFailure =
        validateDeepSeekModels(models) ??
        validateReasoningEfforts(models, reasoning.levelsOnly ? reasoning.levels : undefined)
      const keyMissing = protocolNeedsKey(protocol) && keyDraft.trim().length === 0
      const keyFailure = keyMissing ? ('keyRequired' as const) : apiKeyFailure(keyDraft)
      const keyValue = keyDraft.trim()
      const ready =
        route.length > 0 &&
        !routeInvalid &&
        !routeTaken &&
        normalizedBaseURL.length > 0 &&
        !baseUrlInvalid &&
        models.length > 0 &&
        modelFailure === undefined &&
        keyFailure === undefined
      const hint =
        failure !== undefined ||
        ready ||
        // The key field prints its own failure directly beneath itself, so a card
        // blocked only by the key stays silent here rather than answering with the
        // next unmet gate — which is satisfied, and reads as a second, false fault.
        keyFailure !== undefined ||
        // Same for the route id, and it must be tested rather than assumed: the
        // fallback arm below reads "no models yet", so an unmet route gate would
        // fall through to it and contradict the filled-in list right above.
        route.length === 0 ||
        routeInvalid ||
        routeTaken ||
        baseUrlInvalid
          ? undefined
          : normalizedBaseURL.length === 0
            ? t('customNeedsBaseUrl')
            : modelFailure !== undefined
              ? `${t('model')} ${String(modelFailure.index + 1)}: ${t(modelFailure.key)}`
              : t('customNeedsModels')
      const createOnce = async (): Promise<string | undefined> => {
        const keyRef = deriveKeyRef(route)
        const storesKey = keyValue.length > 0
        if (!committed) {
          const profile = {
            ...(displayName.length === 0 ? {} : { displayName }),
            // The profile names the conventional reference only when this card is
            // about to store a key, matching the editor: a route declared with the
            // key left blank keeps its provider-native auth path (a credential
            // chain, ADC) instead of resolving a reference nothing ever sets.
            ...(storesKey ? { apiKeyEnv: keyRef } : {}),
            api: protocol,
            baseURL: normalizedBaseURL,
            models: models.map(model => ({ ...model })),
          }
          // `taken` is a snapshot too, so the id check alone cannot see a route
          // declared after this card opened; the revision makes that race a
          // `settings-conflict` instead of a write over the other profile.
          const written = await operations.writeSettings(
            NS,
            [{ op: 'set', path: ['providers', route], value: profile as JsonValue }],
            openedAt,
          )
          if (written.kind !== 'written') {
            return written.kind === 'conflict' ? t('conflict') : written.message
          }
          // The provider now exists. A retry after the key write below fails must
          // not re-run this mutate: the revision it holds is the one this write
          // just superseded, so the Host would answer `settings-conflict` and the
          // key could never be stored from this card at all.
          setCommitted(true)
        }
        if (storesKey) {
          const stored = await operations.storeCredential(keyRef, keyValue)
          // The profile landed; saying the key did not is the only honest report,
          // and the retry above now goes straight back to this write.
          if (stored !== undefined) return stored
        }
        return undefined
      }
      const create = async (): Promise<void> => {
        setBusy(true)
        setFailure(undefined)
        try {
          const outcome = await createOnce()
          if (outcome !== undefined) {
            setFailure(outcome)
            return
          }
          props.onClose(true)
        } finally {
          setBusy(false)
        }
      }
      return h('div', { class: styles['editor'] }, [
        h('div', { class: styles['field'] }, [
          h('span', { class: styles['fieldLabel'] }, t('customRoute')),
          h('input', {
            class: styles['input'],
            type: 'text',
            value: route,
            placeholder: 'acme-gateway',
            'aria-label': t('customRoute'),
            disabled: profileDisabled,
            onInput: (event: InputEvent) => {
              setRoute((event.target as HTMLInputElement).value)
            },
          }),
        ]),
        routeInvalid || routeTaken
          ? h(
            'p',
            { class: styles['error'] },
            t(routeInvalid ? 'customRouteInvalid' : 'customRouteTaken'),
          )
          : h('p', { class: styles['advancedHint'] }, t('customRouteHint')),
        h('div', { class: styles['field'] }, [
          h('span', { class: styles['fieldLabel'] }, t('customDisplayName')),
          h('input', {
            class: styles['input'],
            type: 'text',
            value: displayName,
            placeholder: route.length === 0 ? t('customDisplayName') : route,
            'aria-label': t('customDisplayName'),
            disabled: profileDisabled,
            onInput: (event: InputEvent) => {
              setDisplayName((event.target as HTMLInputElement).value)
            },
          }),
        ]),
        h('div', { class: styles['field'] }, [
          h('span', { class: styles['fieldLabel'] }, t('baseUrl')),
          h('input', {
            class: styles['input'],
            type: 'text',
            value: baseURL,
            placeholder: t(BASE_URL_PLACEHOLDERS[protocol] ?? 'customBaseUrlPlaceholder'),
            'aria-label': t('baseUrl'),
            'aria-invalid': baseUrlInvalid,
            disabled: profileDisabled,
            onInput: (event: InputEvent) => {
              setBaseURL((event.target as HTMLInputElement).value)
            },
          }),
        ]),
        baseUrlInvalid ? h('p', { class: styles['error'] }, t('customBaseUrlInvalid')) : null,
        h('div', { class: styles['field'] }, [
          h('span', { class: styles['fieldLabel'] }, t('customApi')),
          h(
            'select',
            {
              class: `${styles['input']} ${styles['selectInput']}`,
              value: protocol,
              'aria-label': t('customApi'),
              disabled: profileDisabled,
              onInput: (event: InputEvent) => {
                setProtocol((event.target as HTMLInputElement).value)
              },
            },
            protocols.map(choice =>
              h('option', { key: choice, value: choice }, protocolLabel(t, choice)),
            ),
          ),
        ]),
        h('div', { class: styles['field'] }, [
          h('span', { class: styles['fieldLabel'] }, t('keyInput')),
          h(ApiKeyInput, {
            t: t,
            value: keyDraft,
            placeholder: t('keyPlaceholder'),
            'aria-label': t('keyInput'),
            required: protocolNeedsKey(protocol),
            disabled: disabled,
            onInput: (event) => {
              setKeyDraft((event.target as HTMLInputElement).value)
            },
          }),
          keyFailure === undefined
            ? null
            : h(
              'p',
              { class: styles[keyMissing ? 'advancedHint' : 'error'] },
              t(keyFailure === 'keyBlank' ? 'keyBlankNew' : keyFailure),
            ),
        ]),
        h(ModelListEditor, {
          models: models,
          onChange: setModels,
          reasoningLevels: reasoning.levels,
          reasoningLevelsOnly: reasoning.levelsOnly,
          probe: {
            settingsNs: NS,
            baseURL: normalizedBaseURL,
            api: protocol,
            ...(keyValue.length === 0 ? {} : { apiKey: keyValue }),
          },
          probeBlocked: baseUrlInvalid
            ? 'customBaseUrlInvalid'
            : keyFailure === 'keyBlank' /**
                 * Endpoint examples for protocols whose SDK expects a different base than an
                 * OpenAI-compatible `/v1`: Anthropic's SDK appends `/v1/messages`, and the
                 * Gemini protocol expects the API version in the base URL.
                 */
              ? 'keyBlankNew'
              : keyFailure,
          operations: operations,
          t: t,
          disabled: profileDisabled,
          onBusyChange: setListBusy,
        }),
        failure !== undefined ? h('p', { class: styles['error'] }, failure) : null,
        hint === undefined ? null : h('p', { class: styles['advancedHint'] }, hint),
        h(EditorFooter, {
          t: t,
          busy: busy,
          submitDisabled: disabled || !ready,
          submitLabelKey: 'create',
          submitBusyLabelKey: 'creating',
          onCancel: () => {
            props.onClose(committed)
          },
          onSubmit: () => {
            void create()
          },
        }),
      ])
    }
  },
  {
    inheritAttrs: false,
    props: [
      'taken',
      'protocols',
      'reasoningLevels',
      'revision',
      'operations',
      't',
      'readOnly',
      'onClose',
      'onBusyChange',
    ],
  },
)
