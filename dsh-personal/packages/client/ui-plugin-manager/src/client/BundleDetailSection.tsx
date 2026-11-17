import { defineComponent, computed, watch, h, onMounted } from 'vue'
import {
  DetailDocument,
  detailDocumentState,
  useDetailDocumentLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  bundleDetailKey,
  type BundleDetailFailure,
  type BundleDetailsState,
} from './detail-store.ts'
type Translate = PropsLocale<'pluginManager'>['t']
const FAILURE_KEYS = {
  'too-large': 'detailTooLarge',
  network: 'detailNetwork',
  denied: 'detailFailed',
  'git-unavailable': 'detailFailed',
  invalid: 'detailInvalid',
  other: 'detailFailed',
} as const satisfies Record<BundleDetailFailure, string>
/** What the section reads and calls; the page passes them from its injected face. */
export interface BundleDetailSectionProps {
  readonly name: string
  readonly version: string | undefined
  /** Whether the bundle's files are unavailable, so the Host reads its offered version from the npm file CDNs. */
  readonly fromNpm: boolean
  readonly language: string
  readonly details: BundleDetailsState
  readonly t: Translate
  readonly load: (
    name: string,
    version: string | undefined,
    language: string,
    fromNpm: boolean,
  ) => void
  readonly retry: (
    name: string,
    version: string | undefined,
    language: string,
    fromNpm: boolean,
  ) => void
  readonly image: (
    name: string,
    document: string,
    destination: string,
    fromNpm: boolean,
  ) => string | undefined
}
/**
 * Read and render a bundle's detail document in the active language; relative images load from the Host beside it.
 * @param props - the bundle, the language, the reads, and the page's callbacks.
 * @returns the section, or null when the bundle has no document.
 */
export const BundleDetailSection = defineComponent(
  (props: BundleDetailSectionProps) => {
    const name = computed(() => props.name)
    const version = computed(() => props.version)
    const fromNpm = computed(() => props.fromNpm)
    const language = computed(() => props.language)
    const details = computed(() => props.details)
    const t = computed(() => props.t)
    const load = computed(() => props.load)
    const retry = computed(() => props.retry)
    const image = computed(() => props.image)
    const key = computed(() => bundleDetailKey(name.value, version.value, language.value))
    const state = computed(() => details.value[key.value])
    const labels = useDetailDocumentLabels(() => ({
      title: t.value('detailTitle'),
      loading: t.value('detailLoading'),
      retry: t.value('retry'),
      copy: t.value('copy'),
      copied: t.value('copied'),
      codeBlock: t.value('codeBlock.title'),
      wrap: t.value('codeBlock.wrap'),
      unwrap: t.value('codeBlock.unwrap'),
      footnotes: t.value('detailFootnotes'),
    }))
    const detail = computed(() =>
      state.value?.status === 'ready' ? state.value.detail : undefined,
    )
    const document = computed(() =>
      detail.value?.status === 'found' ? detail.value.path : undefined,
    )
    const images = computed(() => {
      const path = document.value
      return path === undefined
        ? undefined
        : { resolve: (value: string) => image.value(name.value, path, value, fromNpm.value) }
    })
    const shown = computed(() =>
      detailDocumentState(
        state.value?.status === 'error'
          ? { status: 'error', message: t.value(FAILURE_KEYS[state.value.failure]) }
          : state.value === undefined || state.value.status === 'loading'
            ? state.value
            : {
              status: 'ready',
              markdown: detail.value?.status === 'found' ? detail.value.markdown : undefined,
            },
      ),
    )
    onMounted(() =>
      watch(
        [() => key.value, () => details.value],
        (_value, _previous) => {
          (() => {
            load.value(name.value, version.value, language.value, fromNpm.value)
          })()
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      h(DetailDocument, {
        state: shown.value,
        labels: labels.value,
        images: images.value,
        onRetry: () => {
          retry.value(name.value, version.value, language.value, fromNpm.value)
        },
      })
  },
  {
    props: ['name', 'version', 'fromNpm', 'language', 'details', 't', 'load', 'retry', 'image'],
    inheritAttrs: false,
  },
)
