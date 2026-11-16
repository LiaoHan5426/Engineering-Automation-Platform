import { computed, shallowRef, watch, onMounted, type ComputedRef } from "vue";
/** Reads the review threads of the change request a changes view shows and places them in its files. */
import type { ForgeReviewData, ForgeReviewThread } from "@deepseek-ai/dsh-experimental-forge/types";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { LineThread } from "./ReviewThreads.tsx";
import { placeThread, type ThreadPlace, type ThreadView } from "./review-threads.ts";
/** What the changes view knows about its change request when it reads threads. */
export interface ThreadReadInput {
  /** Whether the view is visible; a hidden view reads nothing. */
  readonly visible: boolean;
  /** Binding URL of the change request, or null for local changes. */
  readonly url: string | null;
  /** Head commit of the latest status, or null before one. */
  readonly head: string | null;
  /** Update time of the latest status, or null before one. */
  readonly updatedAt: string | null;
  /** Epoch milliseconds of the latest status, so every status asks the Host again; the Host answers from memory until the threads age. */
  readonly statusAt: number | null;
  /** Changes on each refresh. */
  readonly attempt: number;
  /** Changes after each write that may have changed the threads, which the Host no longer answers from memory. */
  readonly revision: number;
  /** Read the threads at a head commit; `fresh` skips the threads the host keeps. */
  readonly read: (
    url: string,
    headSha: string,
    fresh: boolean,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeReviewData>>;
}
/** The last threads read and why the latest read failed. */
export interface ThreadReadState {
  /** Threads of the last successful read for the URL, at any head, or null. */
  readonly review: ForgeReviewData | null;
  /** Message of the latest failed read, or null, also when the provider cannot read reviews. */
  readonly failure: string | null;
}
/** Read threads for the visible change request and cancel superseded reads.
 * @param readInput - getter for the request identity, refresh generation, and reader.
 * @returns the last successful review and latest failure for the current URL.
 */
export function useThreadRead(readInput: () => ThreadReadInput): ComputedRef<ThreadReadState> {
  const bound0 = computed(() => readInput());
  const visible = computed(() => bound0.value.visible);
  const url = computed(() => bound0.value.url);
  const head = computed(() => bound0.value.head);
  const updatedAt = computed(() => bound0.value.updatedAt);
  const statusAt = computed(() => bound0.value.statusAt);
  const attempt = computed(() => bound0.value.attempt);
  const revision = computed(() => bound0.value.revision);
  const read = computed(() => bound0.value.read);
  const state = shallowRef<
    ThreadReadState & {
      readonly url: string | null;
    }
  >({ url: null, review: null, failure: null });
  const readAttempt = shallowRef(attempt.value);
  onMounted(() => {
    watch(
      () => [
        visible.value,
        url.value,
        head.value,
        updatedAt.value,
        statusAt.value,
        attempt.value,
        revision.value,
        read.value,
      ],
      (_next, _previous, onCleanup) => {
        const generation0 = visible.value;
        const generation1 = url.value;
        const generation2 = head.value;
        const generation5 = attempt.value;
        const generation7 = read.value;
        if (!generation0 || generation1 === null || generation2 === null) return;
        const fresh = readAttempt.value !== generation5;
        readAttempt.value = generation5;
        const controller = new AbortController();
        void generation7(generation1, generation2, fresh, controller.signal).then((result) => {
          if (controller.signal.aborted) return;
          if (result.ok) {
            state.value = { url: generation1, review: result.value, failure: null };
            return;
          }
          const { code, message } = result.error;
          if (code === "forgePanel/stale-head") return;
          state.value = ((previous) => ({
            url: generation1,
            review: previous.url === generation1 ? previous.review : null,
            failure: code === "forgePanel/review-unsupported" ? null : message,
          }))(state.value);
        });
        onCleanup(() => {
          controller.abort();
        });
      },
      { immediate: true, flush: "post" },
    );
  });
  return computed(() => {
    return state.value.url === url.value ? state.value : { review: null, failure: null };
  });
}
/** Threads of one file grouped by where they show, and how many of them are unresolved. */
export interface PlacedFileThreads {
  readonly lines: readonly LineThread[];
  readonly file: readonly ForgeReviewThread[];
  readonly outdated: readonly ForgeReviewThread[];
  readonly unresolved: number;
}
/** One thread and where the shown changes place it. */
export interface PlacedThread {
  readonly thread: ForgeReviewThread;
  readonly place: ThreadPlace;
}
/** Every thread with its place and the threads of each file. */
export interface PlacedThreads {
  /** Every thread in host order with its place. */
  readonly entries: readonly PlacedThread[];
  /** Threads of each path. */
  readonly files: ReadonlyMap<string, PlacedFileThreads>;
  /** Unresolved threads by path, for the file tree. */
  readonly unresolved: ReadonlyMap<string, number>;
}
const NONE: PlacedThreads = { entries: [], files: new Map(), unresolved: new Map() };
/** Place review threads against the displayed changes.
 * @param readReview - getter for the current review data.
 * @param readView - getter for the displayed commit range.
 * @returns reactive placements and unresolved counts by file.
 */
export function usePlacedThreads(
  readReview: () => ForgeReviewData | null,
  readView: () => ThreadView | null,
): ComputedRef<PlacedThreads> {
  return computed((): PlacedThreads => {
    const review = readReview();
    const view = readView();
    const commits = view?.commits ?? null;
    const end = view?.end ?? null;
    return (() => {
      if (review === null || end === null) return NONE;
      const entries: PlacedThread[] = [];
      const files = new Map<
        string,
        {
          lines: LineThread[];
          file: ForgeReviewThread[];
          outdated: ForgeReviewThread[];
          unresolved: number;
        }
      >();
      const unresolved = new Map<string, number>();
      for (const thread of review.threads) {
        const place = placeThread(thread, { head: review.headSha, end, commits });
        entries.push({ thread, place });
        let group = files.get(thread.path);
        if (group === undefined) {
          group = { lines: [], file: [], outdated: [], unresolved: 0 };
          files.set(thread.path, group);
        }
        if (place.kind === "line") group.lines.push({ thread, place });
        else if (place.kind === "file") group.file.push(thread);
        else if (place.kind === "outdated") group.outdated.push(thread);
        if (!thread.resolved) {
          group.unresolved += 1;
          unresolved.set(thread.path, group.unresolved);
        }
      }
      return { entries, files, unresolved };
    })();
  });
}
