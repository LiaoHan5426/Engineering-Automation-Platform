import { computed, shallowRef, watch, onMounted, type ComputedRef } from 'vue'
/** A changes view's filter lens: the request to the Host, its progress and result, and which hunks it folds. */
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ForgeDiffHunk,
  ForgeLensFrame,
  ForgeLensKeep,
  ForgeLensRequest,
  ForgeLineRange,
  ForgeRegisteredLens,
} from '../types.ts'
import type { HostStream } from './source.ts'
/** Where a lens request stands for the shown files. */
export type LensRun =
  /** No lens is chosen, or the files have not loaded. */
  | {
    readonly kind: 'idle'
  }
  /** The lens runs; `done` and `total` are null before it reports progress. */
  | {
    readonly kind: 'running'
    readonly done: number | null
    readonly total: number | null
  }
  /** The files the lens keeps, by path. */
  | {
    readonly kind: 'ready'
    readonly files: Readonly<Record<string, ForgeLensKeep>>
  }
  /**
   * The request failed with a Remote error code and message, or with `forgePanel/lens-interrupted` and no message when the
   * stream ended without a result, as after a lost connection.
   */
  | {
    readonly kind: 'failed'
    readonly code: string
    readonly message: string
  }
/** What a view knows when it asks for a lens. */
export interface LensRunInput {
  /** Whether the view is visible; a hidden view starts no request. */
  readonly visible: boolean
  /** The chosen registered lens, or null for none. */
  readonly lens: ForgeRegisteredLens | null
  /** The source of the shown files, or null before they load. */
  readonly source: ForgeLensRequest['source'] | null
  /** `lensVersion` of the shown files, or null before they load. */
  readonly version: string | null
  /** Changes on each retry. */
  readonly attempt: number
  /** Open the Host's lens stream. */
  readonly open: (request: ForgeLensRequest, signal: AbortSignal) => HostStream<ForgeLensFrame>
}
/** The run of the chosen lens and the results already known for the shown files. */
export interface LensRunState {
  readonly run: LensRun
  /**
   * Read what a registered lens keeps of the shown files.
   * @returns the kept files once that lens, at that version, answered for the shown source and files.
   */
  readonly resultOf: (
    lens: ForgeRegisteredLens,
  ) => Readonly<Record<string, ForgeLensKeep>> | undefined
}
const IDLE: LensRun = { kind: 'idle' }
/** The files each lens keeps, by lens identity and version. */
type LensResults = ReadonlyMap<string, Readonly<Record<string, ForgeLensKeep>>>
const NO_RESULTS: LensResults = new Map()
/** Names one lens at one registered version, so a lens registered again at another version is asked again. */
function lensKeyOf(lens: ForgeRegisteredLens): string {
  return `${lens.id}\u0000${lens.version}`
}
/** Run the selected lens for the visible source and retain results by lens version.
 * @param readInput - getter for visibility, source, selected lens, and stream operation.
 * @returns reactive run status and results for the current source.
 */
export function useLensRun(readInput: () => LensRunInput): ComputedRef<LensRunState> {
  const bound0 = computed(() => readInput())
  const visible = computed(() => bound0.value.visible)
  const lens = computed(() => bound0.value.lens)
  const source = computed(() => bound0.value.source)
  const version = computed(() => bound0.value.version)
  const attempt = computed(() => bound0.value.attempt)
  const open = computed(() => bound0.value.open)
  const scope = computed(() =>
    source.value === null || version.value === null
      ? null
      : `${JSON.stringify(source.value)}\u0000${version.value}`,
  )
  const kept = shallowRef<{
    readonly scope: string | null
    readonly files: LensResults
  }>({ scope: null, files: new Map() })
  const results = computed(() =>
    kept.value.scope === scope.value ? kept.value.files : NO_RESULTS,
  )
  const run = shallowRef<{
    readonly key: string
    readonly run: LensRun
  } | null>(null)
  const lensId = computed(() => lens.value?.id ?? null)
  const lensKey = computed(() => (lens.value === null ? null : lensKeyOf(lens.value)))
  const key = computed(() =>
    lensKey.value === null || scope.value === null
      ? null
      : `${scope.value}\u0000${lensKey.value}\u0000${attempt.value}`,
  )
  const known = computed(() =>
    lensKey.value === null ? undefined : results.value.get(lensKey.value),
  )
  onMounted(() => {
    watch(
      (/** Whether the view is visible; a hidden view starts no request. */) => [
        visible.value,
        key.value,
        lensId.value,
        lensKey.value,
        scope.value,
        source.value,
        version.value,
        known.value,
        open.value,
      ],
      (_next, _previous, onCleanup) => {
        const generation0 = visible.value
        const generation1 = key.value
        const generation2 = lensId.value
        const generation3 = lensKey.value
        const generation4 = scope.value
        const generation5 = source.value
        const generation6 = version.value
        const generation7 = known.value
        const generation8 = open.value
        if (
          !generation0 ||
          generation1 === null ||
          generation2 === null ||
          generation3 === null ||
          generation5 === null ||
          generation6 === null
        )
          return
        if (generation7 !== undefined) return
        const controller = new AbortController()
        const stream = generation8(
          { source: generation5, version: generation6, lens: generation2 },
          controller.signal,
        )
        run.value = { key: generation1, run: { kind: 'running', done: null, total: null } }
        void (async () => {
          try {
            for await (const frame of stream) {
              if (controller.signal.aborted) return
              if (frame.kind === 'progress') {
                run.value = {
                  key: generation1,
                  run: { kind: 'running', done: frame.done, total: frame.total },
                }
                continue
              }
              kept.value = (previous => ({
                scope: generation4,
                files: new Map(previous.scope === generation4 ? previous.files : []).set(
                  generation3,
                  frame.files,
                ),
              }))(kept.value)
              return
            }
            if (!controller.signal.aborted)
              run.value = {
                key: generation1,
                run: { kind: 'failed', code: 'forgePanel/lens-interrupted', message: '' },
              }
          } catch (error) {
            if (controller.signal.aborted) return
            const failure = remoteErrorOf(error)
            run.value = {
              key: generation1,
              run: {
                kind: 'failed',
                code: failure?.code ?? 'forgePanel/lens-failed',
                message:
                  failure?.message ?? (error instanceof Error ? error.message : String(error)),
              },
            }
          }
        })()
        onCleanup(() => {
          controller.abort()
          stream.dispose()
        })
      },
      { immediate: true, flush: 'post' },
    )
  })
  const shown = computed<LensRun>(() =>
    key.value === null
      ? IDLE
      : known.value !== undefined
        ? { kind: 'ready', files: known.value }
        : run.value?.key === key.value
          ? run.value.run
          : IDLE,
  )
  return computed(() => {
    return { run: shown.value, resultOf: entry => results.value.get(lensKeyOf(entry)) }
  })
}
/** Whether a hunk's lines on one side meet any of the ranges. */
function meets(start: number, count: number, ranges: readonly ForgeLineRange[]): boolean {
  const end = start + count - 1
  return count > 0 && ranges.some(range => range.start <= end && range.end >= start)
}
/**
 * The hunks of a kept file that touch none of the lens's lines on either side.
 * @param hunks - the file's hunks.
 * @param keep - what the lens keeps of the file.
 * @returns the indexes of the hunks to fold, empty when the lens names no lines.
 */
export function foldedHunks(
  hunks: readonly ForgeDiffHunk[],
  keep: ForgeLensKeep,
): ReadonlySet<number> {
  const ranges = keep.ranges
  if (ranges === undefined) return new Set()
  const folded = new Set<number>()
  for (const [index, hunk] of hunks.entries()) {
    if (
      !meets(hunk.oldStart, hunk.oldLines, ranges.old) &&
      !meets(hunk.newStart, hunk.newLines, ranges.new)
    )
      folded.add(index)
  }
  return folded
}
