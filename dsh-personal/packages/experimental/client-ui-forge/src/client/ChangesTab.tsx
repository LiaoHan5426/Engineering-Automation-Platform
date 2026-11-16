import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-renderer/client";
import {
  defineComponent,
  h,
  Fragment,
  computed,
  shallowRef,
  watch,
  onMounted,
  useId,
  type VNodeChild,
} from "vue";
/**
 * Body of the changes tab: the local changes of the Session's checkout in a
 * chosen scope, or the changes of one of its change requests, as one list of
 * file sections under a toolbar that jumps between files and switches the
 * layout. The view reads the changes when it opens, on each navigation, on
 * refresh, and when the change request's head or the checkout's `branch`
 * scope summary changes; a read keeps the previous changes on screen until it settles.
 * File sections receive values that keep their identity across renders, so a
 * render of the view redraws only the sections whose own values changed, and
 * an expanded file draws its lines once its section comes near the scrollport.
 */
import clsx from "clsx";
import {
  Button,
  IconBranchOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconCompareSplitOutlineRegular,
  IconInfoOutlineRegular,
  IconListPenOutlineRegular,
  IconNowrapFillRegular,
  IconRightUpOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  IconWrapFillRegular,
  Menu,
  StateDot,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { SidebarRightTabInfo } from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { assertNever } from "@deepseek-ai/dsh-util-values";
import { fileAddressFor, pathPartsOf } from "@deepseek-ai/dsh-util-workspace-path";
import type {
  ForgeBaseBranch,
  ForgeBaseBranches,
  ForgeChangeRequestDiff,
  ForgeCommitRange,
  ForgeDiffFile,
  ForgeExtensionState,
  ForgeLensFrame,
  ForgeLensKeep,
  ForgeLensRequest,
  ForgeLocalCommits,
  ForgeLocalDiff,
  ForgeLocalScope,
  ForgePanelChangeRequest,
  ForgePanelState,
} from "../types.ts";
import { lensVersion } from "../lens-version.ts";
import type {
  ForgeCommitList,
  ForgeReviewData,
  ForgeReviewRequest,
  ForgeReviewResult,
  ForgeReviewThread,
  ForgeReviewWrite,
  ForgeReviewWriteResult,
  ForgeThreadId,
  ForgeViewedFiles,
  ForgeViewedRequest,
} from "@deepseek-ai/dsh-experimental-forge/types";
import { sameReviewSource, type ReviewQueue } from "./review-queue.ts";
import { ReviewThread, useFileReview } from "./ReviewThread.tsx";
import type { ReviewActions } from "./ReviewComposer.tsx";
import { SubmitReview } from "./SubmitReview.tsx";
import type { ReviewSelection, ReviewSource } from "./review.ts";
import { BaseMenu } from "./BaseMenu.tsx";
import { parseChangesAddress, type ChangesSource } from "./changes-address.ts";
import type { ChangesLens, createChangesStore } from "./changes-store.ts";
import { CommitMenu } from "./CommitMenu.tsx";
import {
  HideTestsSwitch,
  LensControl,
  LensMenu,
  LENSES,
  ViewedProgress,
} from "./ReviewControls.tsx";
import { viewedStateOf, type ViewedFiles, type ViewedMarks } from "./viewed-files.ts";
import { hostViewedOf, useHostViewed, type HostViewed } from "./host-viewed.ts";
import { Counts, DiffFile, type DiffFileAction, type DiffFileHandlers } from "./DiffFile.tsx";
import { SectionReach } from "./section-reach.ts";
import { FileTreePane, type FileTreePosition } from "./FileTreePane.tsx";
import { changedFileTree, filesInTreeOrder } from "./file-tree.ts";
import { ChangedFilesMenu, type ChangedFilesState } from "./ChangedFiles.tsx";
import { drawnLines, matchesHunks, textLines } from "./diff-rows.ts";
import { ChangeRequestGlyph } from "./glyphs.tsx";
import type { ForgePanelKey, NS } from "./locales.ts";
import { RefreshGlyph } from "./RefreshGlyph.tsx";
import { ViewOptionsMenu } from "./ViewOptionsMenu.tsx";
import type { ForgeLensDescription } from "./changes-service.ts";
import type { SourcedAnnotation, ViewAnnotations } from "./annotations.ts";
import { foldedHunks, useLensRun } from "./lens-filter.ts";
import { LensFilterMenu } from "./LensFilter.tsx";
import { observeToolbarFold } from "./toolbar-fold.ts";
import type { FileThreads, ThreadActions, ThreadFocus, ThreadWrite } from "./ReviewThreads.tsx";
import { inFileOrder, type ThreadFilter } from "./review-threads.ts";
import { usePlacedThreads, useThreadRead, type PlacedThread } from "./thread-state.ts";
import { ThreadList } from "./ThreadList.tsx";
import type { HostStream, PanelSnapshot, StreamSnapshot } from "./source.ts";
import { numberOf, openChangeRequestOf, TONE_LABEL, toneOf } from "./status.ts";
import css from "./ChangesTab.module.css";
type Translate = PropsLocale<typeof NS>["t"];
/** Kind of a local scope. */
type ScopeKind = ForgeLocalScope["kind"];
/** A file the view scrolls to once, and the thread card it centers there with whether that card takes the focus. */
interface Wanted {
  readonly path: string;
  readonly center: {
    readonly id: ForgeThreadId;
    readonly focus: boolean;
  } | null;
}
/** Business face of the changes tab body. */
export interface ChangesTabInjected {
  /** Append a frozen comment to the main input without submitting it. */
  readonly addReviewToInput: (selection: ReviewSelection) => boolean;
  /** Records retained across Session switches and cleared when this tab occurrence closes. */
  readonly reviewQueue: (tab: Pick<SidebarRightTabInfo["tab"], "id" | "signal">) => ReviewQueue;
  /** Publish one comment or a completed review; never retries mutations. */
  readonly submitReview: (
    url: string,
    request: ForgeReviewRequest,
  ) => Promise<RemoteResult<ForgeReviewResult>>;
  /**
   * Panel source while visible, which the renderer releases for an inactive key; and the plugin annotations of a view by
   * its address, which the renderer binds as `useAnnotations`.
   */
  readonly keyedHooks: {
    readonly panel: (visibility: string) => HostObservable<PanelSnapshot> | undefined;
    readonly annotations: (address: string) => HostObservable<ViewAnnotations>;
  };
  /** Lens titles Client plugins describe and the Host's lenses and annotation limit; bound as `useLenses` and `useExtensions`. */
  readonly hooks: {
    readonly lenses: HostObservable<readonly ForgeLensDescription[]>;
    readonly extensions: HostObservable<StreamSnapshot<ForgeExtensionState | null>>;
  };
  /** Classify the shown files with a Host lens; `signal` aborts the stream. */
  readonly changesLens: (
    request: ForgeLensRequest,
    signal: AbortSignal,
  ) => HostStream<ForgeLensFrame>;
  /** Open the panel stream again after it ended. */
  readonly reconnect: () => void;
  /** Read the local changes of one scope; `signal` aborts the read. */
  readonly localDiff: (
    scope: ForgeLocalScope,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeLocalDiff>>;
  /** Read the branches the `branch` scope can compare with, whose names contain `query`; `signal` aborts the read. */
  readonly diffBases: (
    query: string,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeBaseBranches>>;
  /** Read the new side of one file in a local scope. */
  readonly localText: (scope: ForgeLocalScope, path: string) => Promise<RemoteResult<string>>;
  /** List the commits of the `branch` scope compared with `base`, or with the automatic fork point for null; `signal` aborts the read. */
  readonly localCommits: (
    base: string | null,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeLocalCommits>>;
  /** Read the changes of a change request, or of consecutive commits of it, by its binding URL; `signal` aborts the read. */
  readonly changeRequestDiff: (
    url: string,
    commits: ForgeCommitRange | null,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeChangeRequestDiff>>;
  /** List the commits of a change request, or null when its provider does not read commits; `signal` aborts the read. */
  readonly changeRequestCommits: (
    url: string,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeCommitList | null>>;
  /** The Session's viewed marks, kept in the browser for local changes, chosen commits, and hosts that keep none. */
  readonly viewedFiles: ViewedFiles;
  /**
   * Read the signed-in user's viewed marks on a change request's files at `headSha`, or null when its provider keeps
   * none; `signal` aborts the read.
   */
  readonly changeRequestViewed: (
    url: string,
    headSha: string,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeViewedFiles | null>>;
  /** Set or clear the signed-in user's viewed mark on one file of a change request. */
  readonly setFileViewed: (url: string, request: ForgeViewedRequest) => Promise<RemoteResult<void>>;
  /** Read one file of a change request at a commit. */
  readonly changeRequestText: (
    url: string,
    commit: string,
    path: string,
  ) => Promise<RemoteResult<string>>;
  /** Read the review threads of a change request at the head of its latest status; `signal` aborts the read. */
  readonly changeRequestReview: (
    url: string,
    headSha: string,
    fresh: boolean,
    signal: AbortSignal,
  ) => Promise<RemoteResult<ForgeReviewData>>;
  /** Write to the review threads or the pending review of a change request; never retries a write. */
  readonly changeRequestReviewWrite: (
    url: string,
    write: ForgeReviewWrite,
  ) => Promise<RemoteResult<ForgeReviewWriteResult>>;
  /** Quote a whole review thread of the change request at `url` in the main input without submitting it. */
  readonly addThreadToInput: (
    thread: ForgeReviewThread,
    url: string,
    range: string | null,
  ) => boolean;
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void;
  /** Copy a path to the clipboard and report the outcome. */
  readonly copyPath: (path: string) => void;
  /** Ask the Session's Agent to create a change request for its changes, reporting the outcome. */
  readonly createChangeRequest: () => void;
  /** Show a failure notice. */
  readonly report: (key: ForgePanelKey, params?: Readonly<Record<string, string>>) => void;
}
/** Full props of the changes tab body. */
export type ChangesTabProps = Pick<
  PropsRuntime<"sidebar.right.pane.tab">,
  "useTabInfo" | "sessionId"
> &
  Pick<
    PropsRenderSlots<
      | "forge.changes.toolbar"
      | "forge.changes.file.menu"
      | "forge.diff.line.annotation"
      | "forge.diff.comment.actions"
    >,
    "renderSlot"
  > &
  PropsStore<ReturnType<typeof createChangesStore>> &
  InjectFace<ChangesTabInjected> &
  PropsLocale<typeof NS>;
/** Changes of either source as the view draws them. */
type ChangesData =
  | {
      readonly kind: "local";
      readonly files: readonly ForgeDiffFile[];
      /** Scope the files were read in. */
      readonly scope: ForgeLocalScope;
      /** Name of what the `branch` scope compared with; null for other scopes. */
      readonly base: string | null;
      /** Untracked files left out. */
      readonly omitted: number;
    }
  | {
      readonly kind: "change";
      readonly files: readonly ForgeDiffFile[];
      /** Binding URL of the change request. */
      readonly url: string;
      /** Commit the files end at, the head or the last chosen commit, which supplies unchanged lines. */
      readonly headSha: string;
      /** Commits the files cover, or null for the whole change request. */
      readonly commits: ForgeCommitRange | null;
      /** Commits the checkout's branch has beyond the head, or null. */
      readonly localAhead: number | null;
      /** Web page of each file at the head. */
      readonly fileUrls: Readonly<Record<string, string>>;
      /** The code host's viewed marks of the whole change request, or null when the browser keeps the marks. */
      readonly viewed: HostViewed | null;
    };
/** Why the code host did not take a review write, and whether it may have applied it. */
interface WriteRefusal {
  readonly message: string;
  readonly unknown: boolean;
}
/** Unchanged lines and expanded gaps belong to one comparison. A local checkout can change between reads. */
interface Expansion {
  readonly source:
    | string
    | Extract<
        ChangesData,
        {
          kind: "local";
        }
      >
    | null;
  readonly texts: Readonly<Record<string, readonly string[] | "loading">>;
  readonly open: Readonly<Record<string, ReadonlySet<number>>>;
}
/** Files whose hunks draw more lines show the large-file notice until revealed. */
const LARGE_FILE_LINES = 1000;
/** Lines the files above may change before a file starts collapsed. */
const OPEN_LINES = 5000;
const NO_GAPS: ReadonlySet<number> = new Set();
const NO_FOLDS: ReadonlyMap<
  string,
  {
    readonly hunks: ReadonlySet<number>;
    readonly lens: string;
  }
> = new Map();
const NO_PATHS: ReadonlySet<string> = new Set();
const NO_ANNOTATIONS: ViewAnnotations = new Map();
/** The toolbar row's close action, which has no menu to close. */
function noop(): void {}
const SCOPE_LABEL: Record<ScopeKind, ForgePanelKey> = {
  branch: "diff.scope.branch",
  uncommitted: "diff.scope.uncommitted",
  unstaged: "diff.scope.unstaged",
  staged: "diff.scope.staged",
};
const SCOPE_NOTE: Record<Exclude<ScopeKind, "branch">, ForgePanelKey> = {
  uncommitted: "diff.scopeNote.uncommitted",
  unstaged: "diff.scopeNote.unstaged",
  staged: "diff.scopeNote.staged",
};
/** Failures with their own message; any other failure offers a retry. */
const FAILURE: Partial<Record<string, ForgePanelKey>> = {
  "forgePanel/not-a-checkout": "checkout.none",
  "forgePanel/no-fork-point": "diff.noForkPoint",
  "forgePanel/diff-too-large": "diff.tooLarge",
  "forgePanel/filter-config-failed": "diff.filterConfigFailed",
  "forgePanel/commits-missing": "commits.missing",
  "forgePanel/commits-not-linear": "commits.notLinear",
};
/** Failures of a chosen base branch, which offer the automatic fork point instead of a retry. */
const BASE_FAILURE: Partial<Record<string, ForgePanelKey>> = {
  "forgePanel/base-missing": "diff.baseMissing",
  "forgePanel/no-fork-point": "diff.baseUnrelated",
};
/**
 * Explain a failure of the `branch` scope that its chosen base branch caused.
 * @param failed - code of the failed read, or null.
 * @param base - branch the read compared with, or null for the automatic fork point and other scopes.
 * @param t - forge panel copy.
 * @returns the message naming the branch, or undefined for another failure or without a chosen branch.
 */
function baseFailureOf(
  failed: string | null,
  base: ForgeBaseBranch | null,
  t: Translate,
): string | undefined {
  const key = failed === null ? undefined : BASE_FAILURE[failed];
  return key === undefined || base === null ? undefined : t(key, { base: base.name });
}
/**
 * Read the changes a view shows. The whole change request also reads the host's viewed marks at the head of the latest
 * status, beside the diff; marks read at another head refuse the read as the diff refuses a moved head.
 * @param source - local changes or a change request.
 * @param scope - local scope to read.
 * @param commits - chosen commits of a change request, or null for all of it.
 * @param head - head commit of the change request's latest status, or null.
 * @param reads - the Remote reads.
 * @param signal - cancellation of the reads.
 * @returns the changes, or why they could not be read.
 */
async function readChanges(
  source: ChangesSource,
  scope: ForgeLocalScope,
  commits: ForgeCommitRange | null,
  head: string | null,
  reads: Pick<ChangesTabInjected, "localDiff" | "changeRequestDiff" | "changeRequestViewed">,
  signal: AbortSignal,
): Promise<RemoteResult<ChangesData>> {
  if (source.kind === "local") {
    const result = await reads.localDiff(scope, signal);
    if (!result.ok) return result;
    const { files, base, omitted } = result.value;
    return { ok: true, value: { kind: "local", files, scope, base, omitted } };
  }
  const [result, marks] = await Promise.all([
    reads.changeRequestDiff(source.url, commits, signal),
    commits === null && head !== null && head !== ""
      ? reads.changeRequestViewed(source.url, head, signal)
      : Promise.resolve(null),
  ]);
  if (!result.ok) return result;
  if (marks !== null && !marks.ok && marks.error.code === "forgePanel/stale-head") return marks;
  const { files, headSha, localAhead, fileUrls } = result.value;
  const viewed = hostViewedOf(marks, headSha);
  return {
    ok: true,
    value: {
      kind: "change",
      files,
      url: source.url,
      headSha,
      commits,
      localAhead,
      fileUrls,
      viewed,
    },
  };
}
/** The ref that identifies a comparison: the chosen base branch, or null for the automatic fork point and other scopes. */
function baseRefOf(scope: ForgeLocalScope): string | null {
  return scope.kind === "branch" ? scope.base : null;
}
/** The commits a local scope shows, or null for all of them and for scopes other than `branch`. */
function commitsOf(scope: ForgeLocalScope): ForgeCommitRange | null {
  return scope.kind === "branch" ? scope.commits : null;
}
/** The source review comments on loaded changes record: the change request head, or the local scope with its base. */
function reviewSourceOf(data: ChangesData): ReviewSource {
  return data.kind === "local"
    ? {
        kind: "local",
        scope: data.scope.kind,
        base: data.base,
        baseRef: baseRefOf(data.scope),
        commits: commitsOf(data.scope),
      }
    : { kind: "change", url: data.url, headSha: data.headSha, commits: data.commits };
}
/**
 * Identity of a diff source for viewed marks: the change request or local scope with its base ref and chosen commits.
 * A change request's marks stay across head commits, so a file whose change a new push altered reads as changed.
 */
function viewedSourceOf(source: ReviewSource): string {
  return JSON.stringify(
    source.kind === "local"
      ? ["local", source.scope, source.baseRef, source.commits]
      : ["change", source.url, source.commits],
  );
}
/**
 * The files that start expanded: every file not marked viewed until those above it change more than {@link OPEN_LINES} lines.
 * @param files - every file in display order.
 * @param marks - the viewed marks when the files loaded.
 * @returns the paths of the expanded files.
 */
function initiallyOpen(files: readonly ForgeDiffFile[], marks: ViewedMarks): ReadonlySet<string> {
  const open = new Set<string>();
  let above = 0;
  for (const file of files) {
    if (above > OPEN_LINES) break;
    if (viewedStateOf(marks, file.path, file.digest) === "viewed") continue;
    open.add(file.path);
    above += drawnLines(file);
  }
  return open;
}
/** Whether a file shows under a layer while test files hide or not, and among the files a filter lens keeps when one applies. */
function shownBy(
  file: ForgeDiffFile,
  lens: ChangesLens,
  hideTests: boolean,
  kept: Readonly<Record<string, ForgeLensKeep>> | null = null,
): boolean {
  return (
    !(hideTests && file.layer === "test") &&
    (lens === "all" || file.layer === lens) &&
    (kept === null || Object.hasOwn(kept, file.path))
  );
}
/** What a rename badge names: the old file name, or the old path when only the directory changed. */
function renamedFrom(previous: string, path: string): string {
  const name = pathPartsOf(previous).name;
  return name === pathPartsOf(path).name ? previous : name;
}
/** The hover text of a file's path: both paths of a renamed file, else the path. */
function pathTooltipOf(file: ForgeDiffFile, t: Translate): string {
  return file.status === "renamed" && file.previousPath !== null
    ? t("diff.renamedPath", { from: file.previousPath, path: file.path })
    : file.path;
}
/** The badge after a path: how the file changed, and whether a branch view's file is untracked. */
function badgeOf(file: ForgeDiffFile, data: ChangesData, t: Translate): string {
  const parts: string[] = [];
  if (file.status === "added") parts.push(t("diff.newFile"));
  else if (file.status === "deleted") parts.push(t("diff.deletedFile"));
  else if (file.status === "renamed" && file.previousPath !== null)
    parts.push(t("diff.renamed", { from: renamedFrom(file.previousPath, file.path) }));
  if (file.untracked && data.kind === "local" && data.scope.kind === "branch")
    parts.push(t("diff.badgeUncommitted"));
  return parts.join(" · ");
}
const ChangeHeader = defineComponent(
  (props: {
    readonly url: string;
    readonly entry: ForgePanelChangeRequest | undefined;
    readonly commitMenu: VNodeChild;
    readonly reviewCount: number;
    readonly reviewDisabled: boolean;
    readonly onReview: () => void;
    readonly openLink: (url: string) => void;
    readonly t: Translate;
  }) => {
    const snapshot = computed(() => props.entry?.snapshot ?? null);
    const number = computed(() => numberOf(props.entry ?? { ref: null, url: props.url }));
    const tone = computed(() => toneOf(snapshot.value));
    const href = computed(() => (snapshot.value === null ? props.url : snapshot.value.url));
    return () => {
      const capture0 = snapshot.value;
      const capture1 = number.value;
      const capture2 = tone.value;
      const capture3 = href.value;
      const renderSnapshot = capture0;
      const renderNumber = capture1;
      const renderTone = capture2;
      const renderHref = capture3;
      return h(
        "div",
        {
          class: css.header,
        },
        [
          h(ChangeRequestGlyph, {
            tone: renderTone,
            label: props.t("change.stateAria", { state: props.t(TONE_LABEL[renderTone]) }),
          }),
          h(
            "span",
            {
              class: css.headerTitle,
            },
            [renderSnapshot === null ? props.url : renderSnapshot.title],
          ),
          renderNumber !== null &&
            h(
              "span",
              {
                class: css.headerNumber,
              },
              [props.t("change.number", { number: renderNumber })],
            ),
          h(
            "span",
            {
              class: css.headerEnd,
            },
            [
              props.commitMenu,
              h(
                Button,
                {
                  size: "sm",
                  variant: "outline",
                  className: css.headerAction ?? "",
                  disabled: props.reviewDisabled,
                  onClick: props.onReview,
                },
                {
                  default: () => [
                    props.t("review.submit"),
                    props.reviewCount > 0 ? ` (${props.reviewCount})` : "",
                  ],
                },
              ),
            ],
          ),
          h(
            Tooltip,
            {
              label: props.t("change.view"),
              side: "bottom",
            },
            {
              default: () => [
                h(
                  "button",
                  {
                    type: "button",
                    class: css.tool,
                    "aria-label": props.t("change.view"),
                    onClick: () => {
                      props.openLink(renderHref);
                    },
                  },
                  [
                    h(IconRightUpOutlineRegular, {
                      size: 14,
                    }),
                  ],
                ),
              ],
            },
          ),
        ],
      );
    };
  },
  {
    name: "ChangeHeader",
    props: [
      "url",
      "entry",
      "commitMenu",
      "reviewCount",
      "reviewDisabled",
      "onReview",
      "openLink",
      "t",
    ] as const,
  },
);
const LocalHeader = defineComponent(
  (props: {
    readonly state: ForgePanelState | null;
    readonly commitMenu: VNodeChild;
    readonly scope: ScopeKind;
    readonly base: ForgeBaseBranch | null;
    readonly missing: boolean;
    readonly visible: boolean;
    readonly diffBases: ChangesTabInjected["diffBases"];
    readonly choose: (base: ForgeBaseBranch | null) => void;
    readonly createChangeRequest: () => void;
    readonly t: Translate;
  }) => {
    const creatable = computed(
      () =>
        props.state !== null &&
        props.state.repository !== null &&
        openChangeRequestOf(props.state) === undefined,
    );
    const checkout = computed(() =>
      props.state?.checkout.state === "ready" ? props.state.checkout.checkout : null,
    );
    const head = computed(() => checkout.value?.branch ?? checkout.value?.commit ?? "HEAD");
    return () => {
      const capture4 = creatable.value;
      const capture5 = head.value;
      const renderCreatable = capture4;
      const renderHead = capture5;
      return h(
        "div",
        {
          class: css.header,
        },
        [
          props.scope === "branch"
            ? h(Fragment, null, [
                h(
                  "span",
                  {
                    class: css.headerIcon,
                  },
                  [
                    h(IconBranchOutlineRegular, {
                      size: 15,
                    }),
                  ],
                ),
                h(
                  Tooltip,
                  {
                    label: renderHead,
                    side: "bottom",
                  },
                  {
                    default: () => [
                      h(
                        "span",
                        {
                          class: css.headerHead,
                          tabindex: 0,
                          "data-forge-head": "",
                        },
                        [renderHead],
                      ),
                    ],
                  },
                ),
                h(
                  "span",
                  {
                    class: css.headerArrow,
                    "aria-hidden": "true",
                  },
                  ["\u2192"],
                ),
                h(BaseMenu, {
                  chosen: props.base,
                  label:
                    props.base?.name ?? props.state?.local?.base ?? props.t("diff.base.automatic"),
                  missing: props.missing,
                  visible: props.visible,
                  list: props.diffBases,
                  choose: props.choose,
                  t: props.t,
                }),
                h(
                  "span",
                  {
                    class: clsx(css.headerNote, css.headerSuffix),
                  },
                  [props.t("diff.base.uncommitted")],
                ),
              ])
            : h(Fragment, null, [
                h(
                  "span",
                  {
                    class: css.headerIcon,
                  },
                  [
                    h(IconListPenOutlineRegular, {
                      size: 15,
                    }),
                  ],
                ),
                h(
                  "span",
                  {
                    class: css.headerNote,
                  },
                  [props.t(SCOPE_NOTE[props.scope])],
                ),
              ]),
          (props.scope === "branch" || renderCreatable) &&
            h(
              "span",
              {
                class: css.headerEnd,
              },
              [
                props.scope === "branch" && props.commitMenu,
                renderCreatable &&
                  h(
                    Button,
                    {
                      size: "sm",
                      variant: "outline",
                      className: css.headerAction ?? "",
                      onClick: props.createChangeRequest,
                    },
                    { default: () => [props.t("changes.local.create")] },
                  ),
              ],
            ),
        ],
      );
    };
  },
  {
    name: "LocalHeader",
    props: [
      "state",
      "commitMenu",
      "scope",
      "base",
      "missing",
      "visible",
      "diffBases",
      "choose",
      "createChangeRequest",
      "t",
    ] as const,
  },
);
const ScopeMenu = defineComponent(
  (props: {
    readonly scope: ScopeKind;
    readonly choose: (scope: ScopeKind) => void;
    readonly t: Translate;
  }) => {
    const open = shallowRef(false);
    const items = computed(() => [
      { id: "uncommitted", label: props.t(SCOPE_LABEL.uncommitted) },
      { id: "unstaged", label: props.t(SCOPE_LABEL.unstaged) },
      { id: "staged", label: props.t(SCOPE_LABEL.staged) },
      { type: "separator" as const, id: "separator" },
      { id: "branch", label: props.t(SCOPE_LABEL.branch) },
    ]);
    return () => {
      const capture6 = open.value;
      const capture7 = items.value;
      const renderOpen = capture6;
      const renderItems = capture7;
      return h(
        Menu,
        {
          open: renderOpen,
          portal: true,
          align: "start",
          dense: true,
          autoFocus: true,
          selectedId: props.scope,
          items: renderItems,
          onClose: () => {
            open.value = false;
          },
          onSelect: (id) => {
            open.value = false;
            props.choose(id as ScopeKind);
          },
        },
        {
          anchor: () =>
            h(
              "button",
              {
                type: "button",
                class: css.select,
                "aria-haspopup": "menu",
                "aria-expanded": renderOpen,
                "data-forge-scope": props.scope,
                onClick: () => {
                  open.value = ((value) => !value)(renderOpen);
                },
              },
              [
                props.t(SCOPE_LABEL[props.scope]),
                h(IconChevronDownOutlineRegular, {
                  size: 12,
                }),
              ],
            ),
        },
      );
    };
  },
  { name: "ScopeMenu", props: ["scope", "choose", "t"] as const },
);
const Notice = defineComponent(
  (
    props: {
      readonly action?: VNodeChild;
    },
    { slots },
  ) => {
    return () => {
      return h(
        "div",
        {
          class: css.notice,
          role: "status",
        },
        [
          h(IconInfoOutlineRegular, {
            size: 14,
          }),
          h("span", {}, [slots.default?.()]),
          props.action,
        ],
      );
    };
  },
  { name: "Notice", props: ["action"] as const },
);
const OrphanReviews = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly path: string;
      readonly actions: ReviewActions;
    },
  ) => {
    const state = useFileReview(
      () => props.actions,
      () => props.path,
    );
    return () => {
      const renderState = state.value;
      return h(
        "section",
        {
          class: css.reviewFile,
          "data-forge-review-file": props.path,
        },
        [
          h("h3", {}, [props.path]),
          renderState.threads.map((thread) =>
            h(ReviewThread, {
              key: thread.key,
              thread: thread,
              actions: props.actions,
              locked: renderState.locked,
              outdated: true,
              t: props.t,
            }),
          ),
        ],
      );
    };
  },
  { name: "OrphanReviews", props: ["t", "path", "actions"] as const },
);
export const ChangesTab = defineComponent(
  (props: ChangesTabProps) => {
    const bound0 = props.useTabInfo();
    const tab = computed(() => bound0.value.tab);
    const tabId = tab.value.id;
    const bound2 = computed(() => tab.value);
    const navigation = computed(() => bound2.value.navigation);
    const signal = computed(() => bound2.value.signal);
    const target = computed(() => {
      const capture8 = tab.value;
      const address = parseChangesAddress(capture8.contentId);
      if (address === undefined)
        throw new Error(`forge-panel: not a changes address "${tab.value.contentId}"`);
      return address;
    });
    const source = computed(() => target.value.source);
    const queue = props.reviewQueue(tab.value);
    const queueStatus = useObservableSelector(
      () => queue,
      () => () => queue.getStatus(),
    );
    const reviewState = computed(() => {
      const capture9 = queue;
      queueStatus.value;
      return capture9.getSnapshot();
    });
    const reviewOpen = shallowRef(false);
    const reviewBusy = shallowRef(false);
    onMounted(() => {
      watch(
        () => [tab.value.visible],
        (_next, _previous, _onCleanup) => {
          const capture10 = tab.value;
          const generation0 = capture10.visible;
          if (!generation0) reviewOpen.value = false;
        },
        { immediate: true, flush: "post" },
      );
    });
    const reviewRunning = shallowRef(false);
    const reviewError = shallowRef<string | null>(null);
    const publishReview = async (
      url: string,
      request: ForgeReviewRequest,
      complete: (url: string) => boolean,
    ): Promise<string | undefined> => {
      const capture11 = queue;
      if (reviewRunning.value || !capture11.begin(request)) return props.t("review.saveFailed");
      reviewRunning.value = true;
      reviewBusy.value = true;
      reviewError.value = null;
      try {
        const response = await props.submitReview(url, request);
        if (!response.ok || (!response.value.ok && response.value.code === "unknown")) {
          reviewError.value = props.t("review.unknown");
          return props.t("review.unknown");
        }
        const result = response.value;
        if (!result.ok) {
          capture11.finish(false);
          const message =
            result.code === "stale"
              ? props.t("review.stale")
              : result.code === "unsupported"
                ? props.t("review.unsupported")
                : props.t("review.failed", { message: result.message });
          reviewError.value = message;
          return message;
        }
        if (!complete(result.url)) return props.t("review.unknown");
        props.report(request.kind === "review" ? "review.submitted" : "review.published");
        if (request.kind === "review") reviewOpen.value = false;
        return undefined;
      } catch (_error) {
        reviewError.value = props.t("review.unknown");
        return props.t("review.unknown");
      } finally {
        reviewRunning.value = false;
        reviewBusy.value = false;
      }
    };
    const reviewRevision = shallowRef(0);
    const writing = shallowRef<Promise<unknown>>(Promise.resolve());
    const sendWrite = (url: string, write: ForgeReviewWrite): Promise<WriteRefusal | undefined> => {
      const run = async (): Promise<WriteRefusal | undefined> => {
        const capture12 = reviewRevision.value;
        const response = await props.changeRequestReviewWrite(url, write);
        if (!response.ok) {
          if (response.error.code === "forgePanel/not-bound") {
            return {
              message: props.t("thread.writeFailed", { message: response.error.message }),
              unknown: false,
            };
          }
          reviewRevision.value = ((value) => value + 1)(capture12);
          return { message: props.t("thread.writeUnknown"), unknown: true };
        }
        const result = response.value;
        if (result.ok) {
          reviewRevision.value = ((value) => value + 1)(capture12);
          return undefined;
        }
        switch (result.code) {
          case "unsupported":
            return { message: props.t("thread.writeUnsupported"), unknown: false };
          case "failed":
            reviewRevision.value = ((value) => value + 1)(capture12);
            return {
              message: props.t("thread.writeFailed", { message: result.message }),
              unknown: false,
            };
          case "stale":
            return { message: props.t("thread.writeStale"), unknown: false };
          case "unknown":
            reviewRevision.value = ((value) => value + 1)(capture12);
            return { message: props.t("thread.writeUnknown"), unknown: true };
          default:
            return assertNever(result.code, "ForgeReviewWriteResult.code");
        }
      };
      const next = writing.value.then(run, run);
      writing.value = next;
      return next;
    };
    const writeReview = async (url: string, write: ForgeReviewWrite): Promise<string | undefined> =>
      (await sendWrite(url, write))?.message;
    const choices = props.useStore((store) => store.byTab[tabId]);
    const wanted = shallowRef<Wanted | null>(null);
    const treeState = shallowRef<ChangedFilesState>({ query: "", collapsed: {}, selected: null });
    const treePosition = shallowRef<FileTreePosition>("left");
    const treeWidth = shallowRef(0);
    const treeId = useId();
    const chosen = shallowRef<Readonly<Record<string, boolean>>>({});
    onMounted(() => {
      watch(
        () => [
          choices.value,
          navigation.value.revision,
          navigation.value.params,
          props.actions,
          tab.value.id,
        ],
        (_next, _previous, _onCleanup) => {
          const capture13 = choices.value;
          const capture14 = navigation.value;
          const capture15 = tab.value;
          const capture16 = treeState.value;
          const capture17 = chosen.value;
          const generation0 = capture13;
          const generation1 = capture14.revision;
          const generation2 = capture14.params;
          const generation3 = props.actions;
          const generation4 = capture15.id;
          if (generation0?.navigated === generation1) return;
          generation3.navigated(generation4, generation1);
          const lensParam =
            generation2 !== undefined && "lens" in generation2 ? generation2.lens : undefined;
          if (lensParam !== undefined) generation3.filtered(generation4, lensParam);
          const path =
            generation2 !== undefined && "path" in generation2 ? generation2.path : undefined;
          if (path === undefined) return;
          treeState.value = ((value) => ({ ...value, selected: path }))(capture16);
          chosen.value = ((value) => ({ ...value, [path]: true }))(capture17);
          wanted.value = { path, center: null };
        },
        { immediate: true, flush: "post" },
      );
    });
    onMounted(() => {
      watch(
        () => [signal.value, props.actions, tab.value.id],
        (_next, _previous, onCleanup) => {
          const capture18 = signal.value;
          const capture19 = tab.value;
          const generation0 = capture18;
          const generation1 = props.actions;
          const generation2 = capture19.id;
          const unmounted = new AbortController();
          generation0.addEventListener(
            "abort",
            () => {
              generation1.forget(generation2);
            },
            { once: true, signal: unmounted.signal },
          );
          onCleanup(() => {
            unmounted.abort();
          });
        },
        { immediate: true, flush: "post" },
      );
    });
    const attempt = shallowRef(0);
    onMounted(() => {
      watch(
        () => [tab.value.actions],
        (_next, _previous, onCleanup) => {
          onCleanup(
            tab.value.actions.bindCommands({
              refresh: () => {
                attempt.value += 1;
              },
            }),
          );
        },
        { immediate: true, flush: "post" },
      );
    });
    const snapshot = props.usePanel(computed(() => (tab.value.visible ? "visible" : "inactive")));
    const state = computed(() => snapshot.value?.state ?? null);
    const scope = computed(() => choices.value?.scope ?? "branch");
    const base = computed(() => choices.value?.base ?? null);
    const chosenCommits = computed(() => choices.value?.commits ?? null);
    const lens = computed(() => choices.value?.lens ?? "all");
    const hideTests = computed(() => choices.value?.hideTests ?? false);
    const localScope = computed((): ForgeLocalScope =>
      scope.value === "branch"
        ? { kind: "branch", base: base.value?.ref ?? null, commits: chosenCommits.value }
        : { kind: scope.value },
    );
    const changeCommits = computed(() =>
      source.value.kind === "change" ? chosenCommits.value : null,
    );
    const changeUrlOf = computed(() => (source.value.kind === "change" ? source.value.url : ""));
    const listChangeCommits = (signal: AbortSignal) =>
      props.changeRequestCommits(changeUrlOf.value, signal);
    const baseRef = computed(() => base.value?.ref ?? null);
    const listLocalCommits = (signal: AbortSignal) => props.localCommits(baseRef.value, signal);
    const split = computed(() => choices.value?.split ?? true);
    const wrap = computed(() => choices.value?.wrap ?? true);
    const entry = computed(() => {
      const current = source.value;
      return current.kind === "change"
        ? state.value?.changeRequests.find((item) => item.url === current.url)
        : undefined;
    });
    const pending = computed(
      () => entry.value !== undefined && entry.value.ref !== null && entry.value.update === null,
    );
    const head = computed(() => entry.value?.snapshot?.headSha ?? (pending.value ? null : ""));
    const hostRevision = computed(() => entry.value?.reviewRevision ?? 0);
    const version = computed(() =>
      state.value === null
        ? null
        : source.value.kind === "local"
          ? `${scope.value}\n${JSON.stringify(state.value.local)}`
          : head.value === null
            ? null
            : `${head.value}\n${hostRevision.value}`,
    );
    const headCommit = computed(() =>
      state.value !== null && state.value.checkout.state === "ready"
        ? state.value.checkout.checkout.commit
        : null,
    );
    const commitsVersion = computed(
      () =>
        `${attempt.value}\n${source.value.kind === "local" ? `${baseRef.value ?? ""}\n${headCommit.value ?? ""}\n${JSON.stringify(state.value?.local ?? null)}` : (head.value ?? "")}`,
    );
    const dataKey = computed(() =>
      source.value.kind === "local"
        ? JSON.stringify(localScope.value)
        : `change\n${JSON.stringify(changeCommits.value)}`,
    );
    const loaded = shallowRef<{
      readonly key: string;
      readonly data: ChangesData;
    } | null>(null);
    const failure = shallowRef<{
      readonly key: string;
      readonly code: string;
    } | null>(null);
    const read = computed(
      (
        /** Write to the review threads or the pending review of a change request; never retries a write. */
      ) =>
        version.value === null
          ? null
          : `${dataKey.value}\n${navigation.value.revision}\n${attempt.value}\n${version.value}`,
    );
    const finished = shallowRef<string | null>(null);
    const statusAt = computed(() => entry.value?.update?.fetchedAt ?? null);
    const latestStatusAt = shallowRef(statusAt.value);
    onMounted(() => {
      watch(
        () => [statusAt.value],
        (_next, _previous, _onCleanup) => {
          const capture21 = statusAt.value;
          const generation0 = capture21;
          latestStatusAt.value = generation0;
        },
        { immediate: true, flush: "post" },
      );
    });
    const refused = shallowRef<{
      readonly read: string;
      readonly statusAt: number | null;
    } | null>(null);
    const waiting = computed(
      () =>
        refused.value !== null &&
        refused.value.read === read.value &&
        refused.value.statusAt === statusAt.value,
    );
    onMounted(() => {
      watch(
        () => [
          tab.value.visible,
          read.value,
          refused.value,
          waiting.value,
          source.value,
          localScope.value,
          changeCommits.value,
          head.value,
          dataKey.value,
          props.localDiff,
          props.changeRequestDiff,
          props.changeRequestViewed,
        ],
        (_next, _previous, onCleanup) => {
          const capture22 = tab.value;
          const capture23 = read.value;
          const capture25 = waiting.value;
          const capture26 = source.value;
          const capture27 = localScope.value;
          const capture28 = changeCommits.value;
          const capture29 = head.value;
          const capture30 = dataKey.value;
          const capture31 = finished.value;
          const generation0 = capture22.visible;
          const generation1 = capture23;

          const generation3 = capture25;
          const generation4 = capture26;
          const generation5 = capture27;
          const generation6 = capture28;
          const generation7 = capture29;
          const generation8 = capture30;
          const generation9 = props.localDiff;
          const generation10 = props.changeRequestDiff;
          const generation11 = props.changeRequestViewed;
          if (!generation0 || generation1 === null || generation1 === capture31 || generation3)
            return;
          const controller = new AbortController();
          const readAt = latestStatusAt.value;
          void readChanges(
            generation4,
            generation5,
            generation6,
            generation7,
            {
              localDiff: generation9,
              changeRequestDiff: generation10,
              changeRequestViewed: generation11,
            },
            controller.signal,
          ).then((result) => {
            if (controller.signal.aborted) return;
            if (!result.ok && result.error.code === "forgePanel/stale-head") {
              refused.value = { read: generation1, statusAt: readAt };
              failure.value = null;
              return;
            }
            finished.value = generation1;
            if (result.ok) {
              loaded.value = { key: generation8, data: result.value };
              failure.value = null;
            } else {
              failure.value = { key: generation8, code: result.error.code };
            }
          });
          onCleanup(() => {
            controller.abort();
          });
        },
        { immediate: true, flush: "post" },
      );
    });
    const data = computed(() =>
      loaded.value !== null && loaded.value.key === dataKey.value ? loaded.value.data : null,
    );
    const prHead = computed(() => entry.value?.snapshot?.headSha ?? null);
    const prAuthor = computed(() => entry.value?.snapshot?.author ?? null);
    const threadRead = useThreadRead(() => ({
      visible: tab.value.visible,
      url: source.value.kind === "change" ? source.value.url : null,
      head: prHead.value,
      updatedAt: entry.value?.snapshot?.updatedAt ?? null,
      statusAt: statusAt.value,
      attempt: attempt.value,
      revision: reviewRevision.value + hostRevision.value,
      read: props.changeRequestReview,
    }));
    const review = computed(() =>
      data.value?.kind === "change" &&
      threadRead.value.review !== null &&
      threadRead.value.review.headSha === prHead.value &&
      (data.value.commits !== null || data.value.headSha === prHead.value)
        ? threadRead.value.review
        : null,
    );
    const placed = usePlacedThreads(
      () => review.value,
      () =>
        data.value?.kind === "change"
          ? { head: prHead.value ?? "", end: data.value.headSha, commits: data.value.commits }
          : null,
    );
    const threadList = shallowRef<{
      readonly open: boolean;
      readonly filter: ThreadFilter;
      readonly claim: boolean;
    }>({ open: false, filter: "unresolved", claim: false });
    const threadsToggle = shallowRef<HTMLButtonElement | null>(null);
    const focus = shallowRef<ThreadFocus | null>(null);
    const allFiles = computed(() => filesInTreeOrder(changedFileTree(data.value?.files ?? [])));
    const extensions = props.useExtensions((current) => current.state);
    const descriptions = props.useLenses((current) => current);
    const hostLenses = computed(() => extensions.value?.lenses ?? null);
    const chosenLens = computed(() => choices.value?.filterLens ?? null);
    const activeEntry = computed(() =>
      chosenLens.value === null
        ? null
        : (hostLenses.value?.find((item) => item.id === chosenLens.value) ?? null),
    );
    const activeLens = computed(() => activeEntry.value?.id ?? null);
    const lensSource = computed((): ForgeLensRequest["source"] | null =>
      data.value === null
        ? null
        : data.value.kind === "local"
          ? { kind: "local", scope: data.value.scope }
          : { kind: "change", url: data.value.url, commits: data.value.commits },
    );
    const filesVersion = computed(() =>
      data.value === null ? null : lensVersion(data.value.files),
    );
    const lensAttempt = shallowRef(0);
    const lensRun = useLensRun(() => ({
      visible: tab.value.visible,
      lens: activeEntry.value,
      source: lensSource.value,
      version: filesVersion.value,
      attempt: lensAttempt.value,
      open: props.changesLens,
    }));
    const kept = computed(() =>
      lensRun.value.run.kind === "ready" ? lensRun.value.run.files : null,
    );
    const files = computed(() =>
      allFiles.value.filter((file) => shownBy(file, lens.value, hideTests.value, kept.value)),
    );
    const lensCounts = computed(
      () =>
        Object.fromEntries(
          LENSES.map((item) => [
            item,
            allFiles.value.filter((file) => shownBy(file, item, hideTests.value, kept.value))
              .length,
          ]),
        ) as Record<ChangesLens, number>,
    );
    const lensTitle = (id: string): string => {
      const capture32 = descriptions.value;
      const described = capture32.find((item) => item.id === id);
      return described === undefined
        ? id
        : described.title(
            /**
             * Read the changes a view shows. The whole change request also reads the host's viewed marks at the head of the latest
             * status, beside the diff; marks read at another head refuse the read as the diff refuses a moved head.
             * @param source - local changes or a change request.
             * @param scope - local scope to read.
             * @param commits - chosen commits of a change request, or null for all of it.
             * @param head - head commit of the change request's latest status, or null.
             * @param reads - the Remote reads.
             * @param signal - cancellation of the reads.
             * @returns the changes, or why they could not be read.
             */
          );
    };
    const offered = computed(() => hostLenses.value ?? []);
    const lensChoices = computed(() =>
      [
        ...descriptions.value.flatMap((item) =>
          offered.value.filter((entry) => entry.id === item.id),
        ),
        ...offered.value.filter(
          (entry) => !descriptions.value.some((item) => item.id === entry.id),
        ),
      ].map((entry) => {
        const capture33 = allFiles.value;
        const result = lensRun.value.resultOf(entry);
        const count =
          result === undefined
            ? null
            : capture33.filter((file) => shownBy(file, lens.value, hideTests.value, result)).length;
        return { id: entry.id, title: lensTitle(entry.id), count };
      }),
    );
    const chosenChoice = computed(
      () => lensChoices.value.find((item) => item.id === activeLens.value) ?? null,
    );
    const withdrawn = computed(() =>
      chosenLens.value !== null && hostLenses.value !== null && activeEntry.value === null
        ? chosenLens.value
        : null,
    );
    onMounted(() => {
      watch(
        () => [withdrawn.value, props.actions, tab.value.id, props.report],
        (_next, _previous, _onCleanup) => {
          const capture34 = withdrawn.value;
          const capture35 = tab.value;
          const generation0 = capture34;
          const generation1 = props.actions;
          const generation2 = capture35.id;
          const generation3 = props.report;
          if (generation0 === null) return;
          generation1.filtered(generation2, null);
          generation3("filterLens.removed", { lens: live.value.lensTitle(generation0) });
        },
        { immediate: true, flush: "post" },
      );
    });
    const chooseLens = (next: string | null): void => {
      const capture36 = tab.value;
      props.actions.filtered(capture36.id, next);
    };
    const unfolded = shallowRef<{
      readonly kept: typeof kept.value;
      readonly paths: ReadonlySet<string>;
    }>({ kept: null, paths: new Set() });
    const shownPaths = computed(() =>
      unfolded.value.kept === kept.value ? unfolded.value.paths : NO_PATHS,
    );
    const foldTitle = computed(() => chosenChoice.value?.title ?? "");
    const folds = computed(() => {
      const capture37 = kept.value;
      const capture38 = allFiles.value;
      const capture39 = shownPaths.value;
      const capture40 = foldTitle.value;
      if (capture37 === null) return NO_FOLDS;
      const map = new Map<
        string,
        {
          readonly hunks: ReadonlySet<number>;
          readonly lens: string;
        }
      >();
      for (const file of capture38) {
        const keep = capture37[file.path];
        if (keep === undefined || capture39.has(file.path)) continue;
        const hunks = foldedHunks(file.hunks, keep);
        if (hunks.size > 0) map.set(file.path, { hunks, lens: capture40 });
      }
      return map;
    });
    const selectedAnnotations = props.useAnnotations(computed(() => tab.value.contentId));
    const annotations = computed(() => selectedAnnotations.value ?? NO_ANNOTATIONS);
    const annotationLimit = computed(() => extensions.value?.maxAnnotationsPerFile);
    const shownSource = computed(() => (data.value === null ? null : reviewSourceOf(data.value)));
    const viewedKey = computed(() =>
      shownSource.value === null ? "" : viewedSourceOf(shownSource.value),
    );
    const selectedLocalMarks = useObservableSelector(
      () => ({
        subscribe: props.viewedFiles.subscribe,
        getSnapshot: () => props.viewedFiles.marksOf(viewedKey.value),
      }),
      () => (value) => value,
    );
    const localMarks = computed(
      () => selectedLocalMarks.value ?? props.viewedFiles.marksOf(viewedKey.value),
    );
    const hostOwner = computed(() =>
      data.value?.kind === "change" && data.value.viewed !== null
        ? {
            url: data.value.url,
            headSha: data.value.headSha,
            files: data.value.files,
            viewed: data.value.viewed,
          }
        : null,
    );
    const host = useHostViewed(
      () => hostOwner.value,
      () => props.setFileViewed,
      () => (failure) => {
        if (failure.kind === "stale") props.report("viewed.syncStale");
        else if (failure.kind === "unknown")
          props.report("viewed.syncUnknown", { message: failure.message });
        else props.report("viewed.syncFailed", { message: failure.message });
      },
    );
    const marks = computed(() => host.value?.marks ?? localMarks.value);
    const rereading = computed(
      () => read.value !== null && finished.value !== read.value && data.value !== null,
    );
    const failed = computed(() =>
      failure.value !== null && failure.value.key === dataKey.value ? failure.value.code : null,
    );
    const expansionSource = computed(() =>
      data.value?.kind === "change"
        ? JSON.stringify([
            data.value.url,
            data.value.headSha,
            data.value.commits?.from,
            data.value.commits?.to,
            data.value.files.map((file) => file.digest),
          ])
        : data.value,
    );
    const expansion = shallowRef<Expansion>({ source: null, texts: {}, open: {} });
    const current = computed(() =>
      expansion.value.source === expansionSource.value
        ? expansion.value
        : { source: expansionSource.value, texts: {}, open: {} },
    );
    const latest = shallowRef(expansionSource.value);
    onMounted(() => {
      watch(
        () => [expansionSource.value],
        (_next, _previous, _onCleanup) => {
          const capture41 = expansionSource.value;
          const generation0 = capture41;
          latest.value = generation0;
        },
        { immediate: true, flush: "post" },
      );
    });
    const revealed = shallowRef<ReadonlySet<string>>(new Set());
    let initialFiles: readonly ForgeDiffFile[] | undefined;
    let initialPaths: ReadonlySet<string> = new Set();
    const initial = computed(() => {
      const files = allFiles.value;
      if (files !== initialFiles) {
        initialFiles = files;
        initialPaths = initiallyOpen(files, marks.value);
      }
      return initialPaths;
    });
    const expandedByDefault = (file: ForgeDiffFile): boolean =>
      initial.value.has(file.path) &&
      viewedStateOf(marks.value, file.path, file.digest) !== "viewed";
    const isExpanded = (file: ForgeDiffFile): boolean =>
      chosen.value[file.path] ?? expandedByDefault(file);
    const sections = shallowRef(new Map<string, HTMLElement>());
    const scrollport = shallowRef<HTMLDivElement | null>(null);
    const toolbarRow = shallowRef<HTMLDivElement | null>(null);
    onMounted(() => {
      watch(
        () => [],
        (_next, _previous, onCleanup) => {
          const row = toolbarRow.value;
          if (row === null) return;
          onCleanup(observeToolbarFold(row));
        },
        { immediate: true, flush: "post" },
      );
    });
    const reach = computed(() => new SectionReach());
    const attachScrollport = (incoming: Element | import("vue").ComponentPublicInstance | null) => {
      const element = incoming instanceof HTMLDivElement ? incoming : null;
      const capture42 = reach.value;
      scrollport.value = element;
      capture42.attach(element);
    };
    const jumpPosition = shallowRef<{
      readonly data: ChangesData;
      readonly top: number;
    } | null>(null);
    onMounted(() => {
      watch(
        () => [
          tab.value.visible,
          wanted.value,
          data.value,
          allFiles.value,
          lens.value,
          hideTests.value,
          kept.value,
          props.actions,
          tab.value.id,
        ],
        (_next, _previous, _onCleanup) => {
          const capture43 = tab.value;
          const capture44 = wanted.value;
          const capture45 = data.value;
          const capture46 = allFiles.value;
          const capture47 = lens.value;
          const capture48 = hideTests.value;
          const capture49 = kept.value;
          const generation0 = capture43.visible;
          const generation1 = capture44;
          const generation2 = capture45;
          const generation3 = capture46;
          const generation4 = capture47;
          const generation5 = capture48;
          const generation6 = capture49;
          const generation7 = props.actions;
          const generation8 = capture43.id;
          if (!generation0 || generation1 === null || generation2 === null) return;
          const hidden = generation3.find(
            (file) =>
              file.path === generation1.path &&
              !shownBy(file, generation4, generation5, generation6),
          );
          if (hidden !== undefined) {
            if (generation4 !== "all") generation7.lensed(generation8, "all");
            if (generation5 && hidden.layer === "test") generation7.toggledTests(generation8);
            if (generation6 !== null && !Object.hasOwn(generation6, hidden.path))
              generation7.filtered(generation8, null);
            return;
          }
          const section = sections.value.get(generation1.path);
          section?.scrollIntoView({ block: "start" });
          const { center } = generation1;
          if (center !== null) {
            const card = [
              ...(section?.querySelectorAll<HTMLElement>("[data-forge-thread]") ?? []),
            ].find((element) => element.dataset.forgeThread === center.id);
            card?.scrollIntoView({ block: "center" });
            if (center.focus) card?.focus({ preventScroll: true });
          }
          if (scrollport.value !== null)
            jumpPosition.value = { data: generation2, top: scrollport.value.scrollTop };
          wanted.value = null;
        },
        { immediate: true, flush: "post" },
      );
    });
    const refresh = (): void => {
      const capture50 = attempt.value;
      attempt.value = ((value) => value + 1)(capture50);
    };
    const root = computed(() =>
      state.value !== null && state.value.checkout.state === "ready"
        ? state.value.checkout.checkout.root
        : null,
    );
    const baseFailure = computed(() =>
      baseFailureOf(
        failed.value,
        source.value.kind === "local" && scope.value === "branch" ? base.value : null,
        props.t,
      ),
    );
    const message = computed(() => (failed.value === null ? undefined : FAILURE[failed.value]));
    const failureText = computed(() => baseFailure.value ?? props.t(message.value ?? "diff.error"));
    const changeUrl = computed(() =>
      source.value.kind === "change" ? (entry.value?.snapshot?.url ?? source.value.url) : null,
    );
    const retry = computed(
      () =>
        baseFailure.value === undefined &&
        (message.value === undefined || failed.value === "forgePanel/filter-config-failed"),
    );
    const automaticBase = computed(() =>
      baseFailure.value !== undefined
        ? h(
            Button,
            {
              size: "sm",
              variant: "outline",
              onClick: () => {
                const capture51 = tab.value;
                props.actions.based(capture51.id, null);
              },
            },
            { default: () => [props.t("diff.useAutomaticBase")] },
          )
        : (failed.value === "forgePanel/commits-missing" ||
            failed.value === "forgePanel/commits-not-linear") &&
          h(
            Button,
            {
              size: "sm",
              variant: "outline",
              onClick: () => {
                const capture52 = tab.value;
                props.actions.committed(capture52.id, null);
              },
            },
            { default: () => [props.t("commits.showAll")] },
          ),
    );
    const expand = (owner: ChangesData, file: ForgeDiffFile, index: number): void => {
      const capture55 = current.value;
      const expectedSource = expansionSource.value;
      const update = (change: (value: Expansion) => Expansion): void => {
        const capture54 = expansion.value;
        expansion.value = ((previous) => {
          const capture53 = expectedSource;
          if (latest.value !== capture53) return previous;
          return change(
            previous.source === capture53 ? previous : { source: capture53, texts: {}, open: {} },
          );
        })(capture54);
      };

      const path = file.path;
      update((value) => ({
        ...value,
        open: { ...value.open, [path]: new Set([...(value.open[path] ?? []), index]) },
      }));
      if (capture55.texts[path] !== undefined) return;
      update((value) => ({ ...value, texts: { ...value.texts, [path]: "loading" } }));
      const reading =
        owner.kind === "local"
          ? props.localText(owner.scope, path)
          : props.changeRequestText(owner.url, owner.headSha, path);
      void reading.then((result) => {
        const lines = result.ok ? textLines(result.value) : undefined;
        if (lines !== undefined && matchesHunks(lines, file.hunks)) {
          update((value) => ({ ...value, texts: { ...value.texts, [path]: lines } }));
          return;
        }
        if (result.ok) props.report("toast.expandStale");
        else props.report("toast.expandFailed", { message: result.error.message });
        update((value) => {
          const { [path]: _text, ...texts } = value.texts;
          const { [path]: _open, ...open } = value.open;
          return { ...value, texts, open };
        });
      });
    };
    const fileActions = (owner: ChangesData, file: ForgeDiffFile): DiffFileAction[] => {
      const capture58 = root.value;
      const list: DiffFileAction[] = [
        {
          label: "diff.copyPath",
          run: () => {
            props.copyPath(file.path);
          },
        },
      ];
      if (file.status === "deleted") return list;
      if (owner.kind === "local") {
        if (capture58 !== null) {
          list.push({
            label: "diff.openFileInSidebar",
            run: () => {
              const capture56 = tab.value;
              const capture57 = capture58;
              capture56.actions.openResource(
                fileAddressFor(props.sessionId, undefined, `${capture57}/${file.path}`),
              );
            },
          });
        }
      } else {
        const url = owner.fileUrls[file.path];
        if (url !== undefined)
          list.push({
            label: "diff.openFileInBrowser",
            run: () => {
              props.openLink(url);
            },
          });
      }
      return list;
    };
    const pendingReview = computed(() => review.value?.pendingReview ?? null);
    const ownChangeRequest = computed(
      () =>
        review.value?.viewer != null &&
        prAuthor.value !== null &&
        review.value.viewer.toLowerCase() === prAuthor.value.toLowerCase(),
    );
    const finishWrite = async (
      send: () => Promise<string | undefined>,
      done: ForgePanelKey,
    ): Promise<void> => {
      if (reviewRunning.value) return;
      reviewRunning.value = true;
      reviewBusy.value = true;
      reviewError.value = null;
      try {
        const failure = await send();
        if (failure !== undefined) {
          reviewError.value = failure;
          return;
        }
        props.report(done);
        reviewOpen.value = false;
      } finally {
        reviewRunning.value = false;
        reviewBusy.value = false;
      }
    };
    const reviewForm = computed(() => {
      const owner = data.value;
      const pending = pendingReview.value;
      if (
        !tab.value.visible ||
        owner === null ||
        !reviewOpen.value ||
        owner.kind !== "change" ||
        owner.commits !== null
      )
        return false;
      return h(SubmitReview, {
        queue: queue,
        url: owner.url,
        headSha: owner.headSha,
        pending: pending,
        own: ownChangeRequest.value,
        busy: reviewBusy.value,
        error: reviewError.value,
        close: () => {
          reviewOpen.value = false;
        },
        check: () => {
          const capture60 = owner;
          props.openLink(capture60.url);
        },
        reconcile: () => {
          const capture61 = queue;
          capture61.finish(false);
          reviewError.value = null;
        },
        submit: () => {
          const capture65 = queue;
          const capture66 = pending;
          const capture67 = owner;
          const latest = capture65.getSnapshot();
          if (capture66 === null) {
            void publishReview(
              capture67.url,
              {
                kind: "review",
                headSha: capture67.headSha,
                event: latest.event,
                body: latest.body,
                comments: latest.comments.map((item) => item.comment),
              },
              (url) => capture65.finish(true, url),
            );
            return;
          }
          void finishWrite(async () => {
            const capture62 = capture65;
            const capture63 = capture67;
            const capture64 = capture66;
            if (
              !capture62.begin({
                kind: "review",
                headSha: capture63.headSha,
                event: latest.event,
                body: latest.body,
                comments: [],
              })
            ) {
              return props.t("review.saveFailed");
            }
            const refusal = await sendWrite(capture63.url, {
              kind: "submit-pending",
              headSha: capture63.headSha,
              review: capture64.id,
              event: latest.event,
              body: latest.body,
            });
            if (refusal === undefined) {
              if (!capture62.finish(true)) props.report("review.saveFailed");
              return undefined;
            }
            if (!refusal.unknown) capture62.finish(false);
            return refusal.message;
          }, "review.submitted");
        },
        discard:
          pending === null
            ? undefined
            : () => {
                void finishWrite(
                  () =>
                    writeReview(owner.url, {
                      kind: "discard-pending",
                      headSha: owner.headSha,
                      review: pending.id,
                    }),
                  "review.discarded",
                );
              },
        t: props.t,
      });
    });
    const addPending = (selection: ReviewSelection): Promise<string | undefined> => {
      if (selection.source.kind !== "change") return Promise.resolve(props.t("review.stale"));
      const { path, side, startLine, endLine, body } = selection.comment;
      return writeReview(selection.source.url, {
        kind: "add-pending",
        headSha: selection.source.headSha,
        comment: { path, side, startLine, endLine, body },
      });
    };
    const recordActions = computed(() => ({
      source:
        shownSource.value ??
        (source.value.kind === "local"
          ? {
              kind: "local",
              scope: scope.value,
              base: null,
              baseRef: baseRefOf(localScope.value),
              commits: commitsOf(localScope.value),
            }
          : { kind: "change", url: source.value.url, headSha: "", commits: changeCommits.value }),
      records: queue,
      addToInput: props.addReviewToInput,
      openLink: props.openLink,
    }));
    const absentPaths = computed(() =>
      [
        ...new Set(
          [
            ...reviewState.value.comments,
            ...reviewState.value.records.map((item) => item.selection),
          ]
            .filter((item) => sameReviewSource(item.source, recordActions.value.source))
            .map((item) => item.comment.path),
        ),
      ].filter((path) => !data.value?.files.some((file) => file.path === path)),
    );
    const orphanRecords = computed(() =>
      absentPaths.value.map((path) =>
        h(OrphanReviews, {
          key: path,
          path: path,
          actions: recordActions.value,
          t: props.t,
        }),
      ),
    );
    const url = computed(() => (data.value?.kind === "change" ? data.value.url : null));
    const threadActions = computed((): ThreadActions | null => {
      const currentReview = review.value;
      const currentUrl = url.value;
      if (currentReview === null || currentUrl === null) return null;
      return {
        author: prAuthor.value,
        addToInput: (thread, range) => props.addThreadToInput(thread, currentUrl, range),
        openLink: props.openLink,
        readText: (commit, path) => props.changeRequestText(currentUrl, commit, path),
        inputFailed: () => live.value.report("thread.inputFailed"),
        focused: focus.value,
        writes: {
          write: (write: ThreadWrite) =>
            live.value.writeReview(currentUrl, { ...write, headSha: currentReview.headSha }),
          reviewStarted: currentReview.pendingReview !== null,
          canReview: currentReview.viewerCanReview,
        },
      };
    });
    const fileThreads = computed(() => {
      const actions = threadActions.value;
      return new Map<string, FileThreads>(
        actions === null
          ? []
          : [...placed.value.files].map(([path, group]) => [path, { ...group, actions }]),
      );
    });
    const nextThread = (path: string): void => {
      const capture68 = allFiles.value;
      const order = inFileOrder(
        placed.value.entries.filter(({ thread }) => thread.path === path && !thread.resolved),
        capture68.find((file) => file.path === path),
      );
      const next =
        order[(order.findIndex(({ thread }) => thread.id === focus.value?.id) + 1) % order.length];
      if (next !== undefined) openThread(next, false);
    };
    const closeThreadList = (): void => {
      const capture69 = threadList.value;
      threadList.value = ((value) => ({ ...value, open: false }))(capture69);
      threadsToggle.value?.focus();
    };
    const openThread = ({ thread, place }: PlacedThread, focusCard: boolean): void => {
      const capture70 = tab.value;
      const capture71 = allFiles.value;

      const capture73 = focus.value;
      const capture74 = revealed.value;
      if (place.kind === "elsewhere") props.actions.committed(capture70.id, null);
      else if (!capture71.some((file) => file.path === thread.path)) {
        const url = thread.comments[0]?.url ?? null;
        if (url !== null) props.openLink(url);
        return;
      }
      focus.value = ((value) => ({ id: thread.id, revision: (value?.revision ?? 0) + 1 }))(
        capture73,
      );
      revealed.value = ((value) => new Set([...value, thread.path]))(capture74);
      jump(thread.path, { id: thread.id, focus: focusCard });
    };
    const jump = (path: string, center: Wanted["center"] = null): void => {
      const capture75 = treeState.value;
      const capture76 = chosen.value;
      treeState.value = ((value) => ({ ...value, selected: path }))(capture75);
      chosen.value = ((value) => ({ ...value, [path]: true }))(capture76);
      wanted.value = { path, center };
    };
    const currentIndex = (viewport: HTMLElement): number => {
      const capture77 = data.value;
      const capture78 = files.value;
      const remembered = jumpPosition.value;
      const index =
        remembered !== null &&
        remembered.data === capture77 &&
        remembered.top === viewport.scrollTop
          ? capture78.findIndex((file) => file.path === treeState.value.selected)
          : -1;
      if (index >= 0) return index;
      const top = viewport.getBoundingClientRect().top;
      const reading = capture78.findIndex((file) => {
        const section = sections.value.get(file.path);
        return section !== undefined && section.getBoundingClientRect().bottom > top + 1;
      });
      return reading >= 0 ? reading : Math.max(0, capture78.length - 1);
    };
    const typing = (container: HTMLElement, origin: EventTarget | null): boolean => {
      const selection = window.getSelection();
      return (
        !(origin instanceof HTMLElement) ||
        !container.contains(origin) ||
        origin.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-forge-comment], [role="menu"]',
        ) !== null ||
        (selection !== null && !selection.isCollapsed)
      );
    };
    const navigateFiles = (event: KeyboardEvent): void => {
      const capture79 = tab.value;
      const capture80 = files.value;
      if (
        !capture79.visible ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      )
        return;
      const viewport = event.currentTarget;
      if (!(viewport instanceof HTMLElement)) return;
      if (typing(viewport, event.target)) return;
      const index = currentIndex(viewport);
      event.preventDefault();
      event.stopPropagation();
      const next = capture80[index + (event.key === "ArrowRight" ? 1 : -1)];
      if (next === undefined) return;
      viewport.focus({ preventScroll: true });
      jump(next.path);
    };
    const markViewed = (owner: ChangesData, file: ForgeDiffFile, viewed: boolean): void => {
      const capture81 = viewedKey.value;
      const capture82 = chosen.value;
      if (host.value !== null) {
        if (!host.value.mark(file.path, viewed)) return;
      } else if (!props.viewedFiles.mark(capture81, owner.files, file.path, viewed)) {
        props.report("viewed.saveFailed");
        return;
      }
      const section = sections.value.get(file.path);
      const viewport = scrollport.value;
      if (
        viewed &&
        section !== undefined &&
        viewport !== null &&
        section.getBoundingClientRect().top < viewport.getBoundingClientRect().top
      )
        wanted.value = { path: file.path, center: null };
      chosen.value = (({ [file.path]: _choice, ...value }) =>
        viewed ? value : { ...value, [file.path]: true })(capture82);
    };
    const fileAt = (target: EventTarget | null | undefined): ForgeDiffFile | undefined => {
      const capture83 = files.value;
      const element =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      const path = element?.closest("[data-forge-diff-file]")?.getAttribute("data-forge-diff-file");
      return capture83.find((file) => file.path === path);
    };
    const toggleViewed = (event: KeyboardEvent): void => {
      const capture84 = tab.value;
      const capture85 = data.value;
      const capture86 = files.value;
      const capture87 = marks.value;
      const viewport = scrollport.value;
      if (
        !capture84.visible ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key.toLowerCase() !== "v" ||
        viewport === null ||
        capture85 === null ||
        typing(viewport, event.target)
      )
        return;
      const file =
        fileAt(event.target) ??
        fileAt(window.getSelection()?.anchorNode) ??
        capture86[currentIndex(viewport)];
      if (file === undefined) return;
      event.preventDefault();
      markViewed(capture85, file, viewedStateOf(capture87, file.path, file.digest) !== "viewed");
    };
    const callbacks = computed(() => ({
      data: data.value,
      expandedByDefault,
      expand,
      markViewed,
      fileActions,
      publishReview,
      writeReview,
      addPending,
      report: props.report,
      nextThread,
      lensTitle,
      renderSlot: props.renderSlot,
      kept: kept.value,
      t: props.t,
    }));
    const live = shallowRef(callbacks.value);
    const handlers = computed((): DiffFileHandlers => ({
      toggle: (file) => {
        const capture88 = chosen.value;
        const byDefault = live.value.expandedByDefault(file);
        chosen.value = ((value) => ({ ...value, [file.path]: !(value[file.path] ?? byDefault) }))(
          capture88,
        );
      },
      reveal: (path) => {
        const capture89 = revealed.value;
        revealed.value = ((value) => new Set([...value, path]))(capture89);
      },
      expand: (file, index) => {
        const { data: owner, expand: open } = live.value;
        if (owner !== null) open(owner, file, index);
      },
      view: (file, viewed) => {
        const { data: owner, markViewed: mark } = live.value;
        if (owner !== null) mark(owner, file, viewed);
      },
      actions: (file) => {
        const { data: owner, fileActions: list } = live.value;
        return owner === null ? [] : list(owner, file);
      },
      section: (path, element) => {
        if (element === null) sections.value.delete(path);
        else sections.value.set(path, element);
      },
      nextThread: (path) => {
        live.value.nextThread(path);
      },
      reach: reach.value,
      annotation: (path, item: SourcedAnnotation) =>
        live.value.renderSlot(
          "forge.diff.line.annotation",
          { target: target.value, path, annotation: item.annotation },
          { entryKey: item.source },
        ),
      fileMenu: (file, dismiss) =>
        live.value.renderSlot("forge.changes.file.menu", { target: target.value, file, dismiss }),
      unfold: (path) => {
        const capture90 = unfolded.value;
        const { kept: current } = live.value;
        unfolded.value = ((value) => ({
          kept: current,
          paths: new Set([...(value.kept === current ? value.paths : []), path]),
        }))(capture90);
      },
    }));
    const reviewStarted = computed(() => pendingReview.value !== null);
    const publishingBlocked = computed(() => reviewState.value.uncertain !== null);
    const whole = computed(() => data.value?.kind === "change" && data.value.commits === null);
    const queueable = computed(() => whole.value && review.value?.viewerCanReview === true);
    const single = computed(() => whole.value && pendingReview.value === null);
    const fileReview = computed((): ReviewActions | undefined =>
      shownSource.value === null
        ? undefined
        : {
            source: shownSource.value,
            addToInput: props.addReviewToInput,
            renderActions: (owner) =>
              live.value.renderSlot("forge.diff.comment.actions", {
                target: target.value,
                ...owner,
              }),
            records: queue,
            openLink: props.openLink,
            reviewStarted: reviewStarted.value,
            onQuoted: (selection) => {
              const capture91 = queue;
              if (!capture91.recordAgent(selection)) live.value.report("review.saveFailed");
            },
            publishingBlocked: publishingBlocked.value,
            ...(queueable.value
              ? { queue: (selection: ReviewSelection) => live.value.addPending(selection) }
              : {}),
            ...(single.value
              ? {
                  publish: (selection: ReviewSelection) =>
                    selection.source.kind === "change"
                      ? live.value.publishReview(
                          selection.source.url,
                          {
                            kind: "comment",
                            headSha: selection.source.headSha,
                            comment: selection.comment,
                          },
                          (url) => queue.published(selection, url),
                        )
                      : Promise.resolve(live.value.t("review.stale")),
                }
              : {}),
          },
    );
    const navigator = computed(() => ({
      files: files.value,
      state: treeState.value,
      t: props.t,
      filter: (query: string) => {
        const capture92 = treeState.value;
        treeState.value = ((value) => ({ ...value, query }))(capture92);
      },
      toggle: (path: string) => {
        const capture93 = treeState.value;
        treeState.value = ((value) => ({
          ...value,
          collapsed: { ...value.collapsed, [path]: value.collapsed[path] !== true },
        }))(capture93);
      },
      jump,
      ...(review.value === null ? {} : { threadCounts: placed.value.unresolved }),
    }));
    const anyExpanded = computed(() => files.value.some(isExpanded));
    const expansionLabel = computed(() =>
      props.t(anyExpanded.value ? "diff.collapseAll" : "diff.expandAll"),
    );
    const toggleExpansion = (): void => {
      const capture94 = files.value;
      chosen.value = Object.fromEntries(capture94.map((file) => [file.path, !anyExpanded.value]));
    };
    const toggleSplit = (): void => {
      const capture95 = tab.value;
      props.actions.toggledSplit(capture95.id);
    };
    const toggleWrap = (): void => {
      const capture96 = tab.value;
      props.actions.toggledWrap(capture96.id);
    };
    const toggleTests = (): void => {
      const capture97 = tab.value;
      props.actions.toggledTests(capture97.id);
    };
    const treeAction = computed(() =>
      props.t(
        treePosition.value === "left"
          ? "diff.moveFileTreeRight"
          : treePosition.value === "right"
            ? "diff.hideFileTree"
            : "diff.showFileTreeLeft",
      ),
    );
    const viewedCount = computed(
      () =>
        files.value.filter(
          (file) => viewedStateOf(marks.value, file.path, file.digest) === "viewed",
        ).length,
    );
    const treeShown = computed(() => allFiles.value.length > 0 && treePosition.value !== "hidden");
    const lensProps = computed(() => ({
      lens: lens.value,
      counts: lensCounts.value,
      hideTests: hideTests.value,
      choose: (next: ChangesLens) => {
        const capture98 = tab.value;
        props.actions.lensed(capture98.id, next);
      },
      t: props.t,
    }));
    const commitMenu = computed(() =>
      source.value.kind === "local" && scope.value !== "branch"
        ? null
        : h(CommitMenu, {
            chosen: chosenCommits.value,
            visible: tab.value.visible,
            list: source.value.kind === "local" ? listLocalCommits : listChangeCommits,
            kept: source.value.kind === "local" ? "newest" : "oldest",
            version: commitsVersion.value,
            choose: (next) => {
              const capture99 = tab.value;
              props.actions.committed(capture99.id, next);
            },
            t: props.t,
          }),
    );
    const toolbarStyle = computed(() => ({ "--forge-tree-width": `${treeWidth.value}px` }));
    return () => {
      const capture100 = tab.value;
      const capture101 = target.value;
      const capture102 = source.value;
      const capture103 = queue;
      const capture104 = reviewState.value;
      const capture105 = reviewOpen.value;
      const capture106 = reviewBusy.value;
      const capture107 = reviewError.value;
      const capture108 = wanted.value;
      const capture109 = treePosition.value;
      const capture110 = snapshot.value;
      const capture111 = state.value;
      const capture112 = scope.value;
      const capture113 = base.value;
      const capture114 = hideTests.value;
      const capture115 = changeCommits.value;
      const capture116 = split.value;
      const capture117 = wrap.value;
      const capture118 = entry.value;
      const capture119 = data.value;
      const capture120 = review.value;
      const capture121 = threadList.value;
      const capture122 = allFiles.value;
      const capture123 = activeLens.value;
      const capture124 = lensAttempt.value;
      const capture125 = files.value;
      const capture126 = lensChoices.value;
      const capture127 = chosenChoice.value;
      const capture128 = folds.value;
      const capture129 = annotations.value;
      const capture130 = annotationLimit.value;
      const capture131 = marks.value;
      const capture132 = rereading.value;
      const capture133 = failed.value;
      const capture134 = current.value;
      const capture135 = revealed.value;
      const capture136 = failureText.value;
      const capture137 = changeUrl.value;
      const capture138 = retry.value;
      const capture139 = automaticBase.value;
      const capture140 = pendingReview.value;
      const capture141 = reviewForm.value;
      const capture142 = orphanRecords.value;
      const capture143 = fileThreads.value;
      const capture144 = callbacks.value;
      const capture145 = handlers.value;
      const capture146 = fileReview.value;
      const capture147 = navigator.value;
      const capture148 = anyExpanded.value;
      const capture149 = expansionLabel.value;
      const capture150 = treeAction.value;
      const capture151 = viewedCount.value;
      const capture152 = treeShown.value;
      const capture153 = lensProps.value;
      const capture154 = commitMenu.value;
      const capture155 = toolbarStyle.value;
      const renderTab = capture100;
      const renderTarget = capture101;
      const renderSource = capture102;
      const renderQueue = capture103;
      const renderReviewState = capture104;
      const renderReviewOpen = capture105;
      const renderReviewBusy = capture106;
      const renderReviewError = capture107;
      const renderWanted = capture108;
      const renderTreePosition = capture109;
      const renderSnapshot = capture110;
      const renderState = capture111;
      const renderScope = capture112;
      const renderBase = capture113;
      const renderHideTests = capture114;
      const renderChangeCommits = capture115;
      const renderSplit = capture116;
      const renderWrap = capture117;
      const renderEntry = capture118;
      const renderData = capture119;
      const renderThreadRead = threadRead.value;
      const renderReview = capture120;
      const renderPlaced = placed.value;
      const renderThreadList = capture121;
      const renderAllFiles = capture122;
      const renderActiveLens = capture123;
      const renderLensAttempt = capture124;
      const renderLensRun = lensRun.value;
      const renderRun = renderLensRun.run;
      const renderViewed = renderData?.kind === "change" ? renderData.viewed : null;
      const renderFiles = capture125;
      const renderLensChoices = capture126;
      const renderChosenChoice = capture127;
      const renderFolds = capture128;
      const renderAnnotations = capture129;
      const renderAnnotationLimit = capture130;
      const renderHost = host.value;
      const renderMarks = capture131;
      const renderRereading = capture132;
      const renderFailed = capture133;
      const renderCurrent = capture134;
      const renderRevealed = capture135;
      const renderFailureText = capture136;
      const renderChangeUrl = capture137;
      const renderRetry = capture138;
      const renderAutomaticBase = capture139;
      const renderPendingReview = capture140;
      const renderReviewForm = capture141;
      const renderOrphanRecords = capture142;
      const renderFileThreads = capture143;
      const renderCallbacks = capture144;
      const renderHandlers = capture145;
      const renderFileReview = capture146;
      const renderNavigator = capture147;
      const renderAnyExpanded = capture148;
      const renderExpansionLabel = capture149;
      const renderTreeAction = capture150;
      const renderViewedCount = capture151;
      const renderTreeShown = capture152;
      const renderLensProps = capture153;
      const renderCommitMenu = capture154;
      const renderToolbarStyle = capture155;
      if (renderTarget === undefined)
        throw new Error(`forge-panel: not a changes address "${renderTab.contentId}"`);
      live.value = renderCallbacks;
      let body: VNodeChild;
      if (renderData === null) {
        if (renderState === null && renderSnapshot?.disconnected) {
          body = h(
            "div",
            {
              class: css.centered,
            },
            [
              h("span", {}, [props.t("stream.failed")]),
              h(
                Button,
                {
                  size: "sm",
                  variant: "outline",
                  onClick: props.reconnect,
                },
                { default: () => [props.t("retry")] },
              ),
            ],
          );
        } else if (renderFailed === null) {
          body = h(
            "div",
            {
              class: css.centered,
            },
            [
              h(StateDot, {
                state: "ongoing",
              }),
            ],
          );
        } else {
          body = h(
            "div",
            {
              class: css.centered,
              role: "status",
            },
            [
              h("span", {}, [renderFailureText]),
              (renderRetry || renderChangeUrl !== null || renderAutomaticBase !== false) &&
                h(
                  "div",
                  {
                    class: css.actions,
                  },
                  [
                    renderRetry &&
                      h(
                        Button,
                        {
                          size: "sm",
                          variant: "outline",
                          onClick: refresh,
                        },
                        { default: () => [props.t("retry")] },
                      ),
                    renderAutomaticBase,
                    renderChangeUrl !== null &&
                      h(
                        Button,
                        {
                          size: "sm",
                          variant: "outline",
                          onClick: () => {
                            props.openLink(renderChangeUrl);
                          },
                        },
                        { default: () => [props.t("diff.viewInBrowser")] },
                      ),
                  ],
                ),
            ],
          );
        }
      } else if (renderData.files.length === 0) {
        body = h(
          "div",
          {
            class: css.files,
          },
          [
            renderOrphanRecords,
            h(
              "div",
              {
                class: css.centered,
              },
              [props.t("diff.empty")],
            ),
          ],
        );
      } else if (renderFiles.length === 0) {
        body = h(
          "div",
          {
            class: css.files,
          },
          [
            renderOrphanRecords,
            h(
              "div",
              {
                class: css.centered,
              },
              [props.t("lens.empty")],
            ),
          ],
        );
      } else {
        body = h(
          "div",
          {
            ref: attachScrollport,
            class: css.files,
            "data-forge-changes-scroll": "",
            role: "region",
            "aria-label": props.t("diff.allFiles", { count: renderFiles.length }),
            "aria-keyshortcuts": "ArrowLeft ArrowRight V",
            tabindex: 0,
            onKeydown: navigateFiles,
            onScroll: (event: Event) => {
              if (!(event.currentTarget instanceof HTMLElement)) return;
              if (jumpPosition.value?.top !== event.currentTarget.scrollTop)
                jumpPosition.value = null;
            },
          },
          [
            renderFiles.map((file) => {
              const path = file.path;
              return h(DiffFile, {
                key: path,
                visible: renderTab.visible,
                file: file,
                review: renderFileReview,
                expanded: isExpanded(file),
                large: drawnLines(file) > LARGE_FILE_LINES,
                revealed: renderRevealed.has(path),
                text: renderCurrent.texts[path],
                open: renderCurrent.open[path] ?? NO_GAPS,
                split: renderSplit,
                wrap: renderWrap,
                badge: badgeOf(file, renderData, props.t),
                tooltip: pathTooltipOf(file, props.t),
                threads: renderFileThreads.get(path),
                annotations: renderAnnotations.get(path),
                annotationLimit: renderAnnotationLimit,
                folded: renderFolds.get(path),
                drawNow:
                  renderWanted !== null &&
                  renderWanted.center !== null &&
                  renderWanted.path === path,
                viewed: viewedStateOf(renderMarks, path, file.digest),
                viewedNote:
                  renderHost === null
                    ? props.t("viewed.hint")
                    : renderHost.unavailable
                      ? props.t("viewed.unavailable")
                      : renderHost.saving(path)
                        ? props.t("viewed.saving")
                        : props.t("viewed.hintHost"),
                viewedDisabled:
                  renderHost !== null && (renderHost.unavailable || renderHost.saving(path)),
                handlers: renderHandlers,
                t: props.t,
              });
            }),
            renderOrphanRecords,
          ],
        );
      }
      let additions = 0;
      let deletions = 0;
      for (const file of renderFiles) {
        additions += file.additions;
        deletions += file.deletions;
      }
      return h(
        "div",
        {
          class: css.root,
          "data-forge-changes": renderSource.kind,
          onKeydown: toggleViewed,
        },
        [
          renderSource.kind === "local"
            ? h(LocalHeader, {
                state: renderState,
                scope: renderScope,
                base: renderBase,
                missing: renderFailed === "forgePanel/base-missing",
                visible: renderTab.visible,
                diffBases: props.diffBases,
                choose: (next) => {
                  props.actions.based(renderTab.id, next);
                },
                commitMenu: renderCommitMenu,
                createChangeRequest: props.createChangeRequest,
                t: props.t,
              })
            : h(ChangeHeader, {
                url: renderSource.url,
                entry: renderEntry,
                openLink: props.openLink,
                commitMenu: renderCommitMenu,
                reviewCount:
                  (renderPendingReview?.comments ?? 0) + renderReviewState.comments.length,
                reviewDisabled: renderData === null || renderChangeCommits !== null,
                onReview: () => {
                  reviewOpen.value = true;
                },
                t: props.t,
              }),
          !renderReviewOpen &&
            renderReviewState.error !== null &&
            h(
              Notice,
              {},
              {
                default: () => [
                  props.t(
                    renderReviewState.error === "load" ? "review.loadFailed" : "review.saveFailed",
                  ),
                ],
              },
            ),
          !renderReviewOpen &&
            renderReviewState.uncertain !== null &&
            !renderReviewBusy &&
            renderSource.kind === "change" &&
            h(
              "div",
              {
                class: css.reviewNotice,
                role: "alert",
              },
              [
                h("span", {}, [props.t("review.unknown")]),
                renderReviewState.uncertain.kind === "comment" &&
                  h("blockquote", {}, [renderReviewState.uncertain.comment.body]),
                h(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    onClick: () => {
                      props.openLink(renderSource.url);
                    },
                  },
                  { default: () => [props.t("review.recheck")] },
                ),
                h(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    onClick: () => {
                      renderQueue.finish(false);
                      reviewError.value = null;
                    },
                  },
                  { default: () => [props.t("review.confirmRetry")] },
                ),
              ],
            ),
          !renderReviewOpen &&
            renderReviewError !== null &&
            renderReviewState.uncertain === null &&
            h(Notice, {}, { default: () => [renderReviewError] }),
          h(
            "div",
            {
              class: css.toolbar,
              "data-tree": renderTreeShown ? renderTreePosition : "hidden",
              style: renderToolbarStyle,
            },
            [
              renderTreeShown &&
                h(
                  "div",
                  {
                    class: css.lensCell,
                  },
                  [
                    h(LensControl, {
                      ...renderLensProps,
                    }),
                  ],
                ),
              h(
                "div",
                {
                  ref: toolbarRow,
                  class: css.toolbarMain,
                },
                [
                  renderTab.visible &&
                    renderSource.kind === "local" &&
                    h(ScopeMenu, {
                      scope: renderScope,
                      choose: (next) => {
                        props.actions.scoped(renderTab.id, next);
                      },
                      t: props.t,
                    }),
                  renderTab.visible &&
                    h(
                      "span",
                      {
                        class: css.filesSlot,
                      },
                      [
                        h(ChangedFilesMenu, {
                          ...renderNavigator,
                          visible: true,
                        }),
                      ],
                    ),
                  renderTab.visible &&
                    renderAllFiles.length > 0 &&
                    h(
                      "span",
                      {
                        class: css.lensMenu,
                      },
                      [
                        h(LensMenu, {
                          ...renderLensProps,
                          visible: true,
                        }),
                      ],
                    ),
                  renderAllFiles.length > 0 &&
                    h(
                      "span",
                      {
                        class: css.foldTests,
                      },
                      [
                        h(HideTestsSwitch, {
                          hidden: renderHideTests,
                          toggle: toggleTests,
                          t: props.t,
                        }),
                      ],
                    ),
                  renderTab.visible &&
                    renderAllFiles.length > 0 &&
                    renderLensChoices.length > 0 &&
                    h(
                      "span",
                      {
                        class: renderActiveLens === null ? css.foldTests : css.lensSlot,
                      },
                      [
                        h(LensFilterMenu, {
                          lenses: renderLensChoices,
                          chosen: renderChosenChoice,
                          run: renderRun,
                          choose: chooseLens,
                          visible: true,
                          t: props.t,
                        }),
                      ],
                    ),
                  h("span", {
                    class: css.spacer,
                    "data-fold-spacer": "",
                  }),
                  h(
                    "span",
                    {
                      class: css.foldPlugins,
                    },
                    [
                      props.renderSlot("forge.changes.toolbar", {
                        target: renderTarget,
                        form: "bar",
                        close: noop,
                      }),
                    ],
                  ),
                  renderReview !== null &&
                    (renderReview.threads.length > 0 || renderReview.truncated) &&
                    h(
                      "button",
                      {
                        ref: threadsToggle,
                        type: "button",
                        class: css.threadsToggle,
                        "aria-pressed": renderThreadList.open,
                        "data-forge-threads-toggle": "",
                        "aria-label": props.t("thread.listAria", {
                          count: renderReview.threads.length,
                        }),
                        onClick: () => {
                          threadList.value = ((value) => ({
                            ...value,
                            open: !value.open,
                            claim: !value.open,
                          }))(renderThreadList);
                        },
                      },
                      [
                        props.t("thread.list"),
                        h(
                          "span",
                          {
                            class: css.threadsTotal,
                          },
                          [renderReview.threads.length],
                        ),
                      ],
                    ),
                  h(
                    "span",
                    {
                      class: css.progressSlot,
                    },
                    [
                      h(ViewedProgress, {
                        viewed: renderViewedCount,
                        total: renderFiles.length,
                        t: props.t,
                      }),
                    ],
                  ),
                  renderFiles.length > 0 &&
                    h(
                      "span",
                      {
                        class: clsx(css.totals, css.foldViews),
                      },
                      [
                        h(Counts, {
                          file: { additions, deletions, binary: false },
                          t: props.t,
                        }),
                      ],
                    ),
                  h(
                    "span",
                    {
                      class: css.tools,
                    },
                    [
                      h(
                        Tooltip,
                        {
                          label: props.t("diff.refresh"),
                          side: "bottom",
                        },
                        {
                          default: () => [
                            h(
                              "button",
                              {
                                type: "button",
                                class: clsx(css.tool, css.foldRefresh),
                                "aria-label": props.t("diff.refresh"),
                                onClick: refresh,
                              },
                              [
                                h(RefreshGlyph, {
                                  busy: renderRereading,
                                  size: 16,
                                }),
                              ],
                            ),
                          ],
                        },
                      ),
                      h(
                        Tooltip,
                        {
                          label: renderExpansionLabel,
                          side: "bottom",
                        },
                        {
                          default: () => [
                            h(
                              "button",
                              {
                                type: "button",
                                class: clsx(css.tool, css.foldViews),
                                "data-expanded": renderAnyExpanded ? "" : undefined,
                                "aria-label": renderExpansionLabel,
                                disabled: renderFiles.length === 0,
                                onClick: toggleExpansion,
                              },
                              [h(IconChevronsUpDownOutlineRegular, {})],
                            ),
                          ],
                        },
                      ),
                      h(
                        Tooltip,
                        {
                          label: props.t(renderSplit ? "diff.unified" : "diff.split"),
                          side: "bottom",
                        },
                        {
                          default: () => [
                            h(
                              "button",
                              {
                                type: "button",
                                class: clsx(css.tool, css.foldViews),
                                "aria-pressed": renderSplit,
                                "aria-label": props.t("diff.splitAria"),
                                onClick: toggleSplit,
                              },
                              [
                                h(IconCompareSplitOutlineRegular, {
                                  className: css.compareIcon ?? "",
                                }),
                              ],
                            ),
                          ],
                        },
                      ),
                      h(
                        Tooltip,
                        {
                          label: props.t(renderWrap ? "diff.nowrap" : "diff.wrap"),
                          side: "bottom",
                        },
                        {
                          default: () => [
                            h(
                              "button",
                              {
                                type: "button",
                                class: clsx(css.tool, css.foldViews),
                                "aria-pressed": renderWrap,
                                "aria-label": props.t("diff.wrapAria"),
                                onClick: toggleWrap,
                              },
                              [
                                renderWrap
                                  ? h(IconNowrapFillRegular, {})
                                  : h(IconWrapFillRegular, {}),
                              ],
                            ),
                          ],
                        },
                      ),
                      h(
                        "span",
                        {
                          class: css.treeToggle,
                        },
                        [
                          h(
                            Tooltip,
                            {
                              label: renderTreeAction,
                              side: "bottom",
                            },
                            {
                              default: () => [
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    class: css.tool,
                                    "aria-label": renderTreeAction,
                                    "aria-expanded": renderTreePosition !== "hidden",
                                    "aria-controls": treeId,
                                    disabled: renderAllFiles.length === 0,
                                    onClick: () => {
                                      treePosition.value = ((value) =>
                                        value === "left"
                                          ? "right"
                                          : value === "right"
                                            ? "hidden"
                                            : "left")(renderTreePosition);
                                    },
                                  },
                                  [h(IconWorkspaceTreeOutlineRegular, {})],
                                ),
                              ],
                            },
                          ),
                        ],
                      ),
                      h(ViewOptionsMenu, {
                        visible: renderTab.visible,
                        options: {
                          anyExpanded: renderAnyExpanded,
                          hasFiles: renderFiles.length > 0,
                          toggleExpansion,
                          split: renderSplit,
                          toggleSplit,
                          wrap: renderWrap,
                          toggleWrap,
                          hideTests: renderAllFiles.length > 0 ? renderHideTests : undefined,
                          toggleTests,
                          refresh,
                          lenses:
                            renderAllFiles.length > 0 && renderActiveLens === null
                              ? renderLensChoices
                              : [],
                          chooseLens,
                          plugins: (close) =>
                            props.renderSlot("forge.changes.toolbar", {
                              target: renderTarget,
                              form: "menu",
                              close,
                            }),
                        },
                        t: props.t,
                      }),
                    ],
                  ),
                ],
              ),
            ],
          ),
          renderData !== null &&
            renderFailed !== null &&
            h(
              Notice,
              {
                action: renderRetry
                  ? h(
                      Button,
                      {
                        size: "sm",
                        variant: "outline",
                        className: css.noticeAction ?? "",
                        onClick: refresh,
                      },
                      { default: () => [props.t("retry")] },
                    )
                  : renderAutomaticBase !== false &&
                    h(
                      "span",
                      {
                        class: css.noticeAction,
                      },
                      [renderAutomaticBase],
                    ),
              },
              { default: () => [renderFailureText] },
            ),
          renderData?.kind === "change" &&
            renderData.localAhead !== null &&
            renderData.localAhead > 0 &&
            h(
              Notice,
              {},
              { default: () => [props.t("diff.stale", { count: renderData.localAhead })] },
            ),
          renderData?.kind === "local" &&
            renderData.omitted > 0 &&
            h(
              Notice,
              {},
              { default: () => [props.t("diff.omitted", { count: renderData.omitted })] },
            ),
          renderRun.kind === "failed" &&
            renderChosenChoice !== null &&
            h(
              Notice,
              {
                action: h(
                  "span",
                  {
                    class: css.noticeAction,
                  },
                  [
                    renderRun.code === "forgePanel/lens-stale"
                      ? h(
                          Button,
                          {
                            size: "sm",
                            variant: "outline",
                            onClick: refresh,
                          },
                          { default: () => [props.t("diff.refresh")] },
                        )
                      : h(
                          Button,
                          {
                            size: "sm",
                            variant: "outline",
                            onClick: () => {
                              lensAttempt.value = ((value) => value + 1)(renderLensAttempt);
                            },
                          },
                          { default: () => [props.t("retry")] },
                        ),
                    h(
                      Button,
                      {
                        size: "sm",
                        variant: "outline",
                        onClick: () => {
                          chooseLens(null);
                        },
                      },
                      { default: () => [props.t("filterLens.clear")] },
                    ),
                  ],
                ),
              },
              {
                default: () => [
                  renderRun.code === "forgePanel/lens-stale"
                    ? props.t("filterLens.stale", { lens: renderChosenChoice.title })
                    : renderRun.code === "forgePanel/lens-interrupted"
                      ? props.t("filterLens.interrupted", { lens: renderChosenChoice.title })
                      : props.t("filterLens.failed", {
                          lens: renderChosenChoice.title,
                          message: renderRun.message,
                        }),
                ],
              },
            ),
          renderData?.kind === "change" &&
            renderViewed?.kind === "failed" &&
            h(
              Notice,
              {
                action: h(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    className: css.noticeAction ?? "",
                    onClick: refresh,
                  },
                  { default: () => [props.t("retry")] },
                ),
              },
              {
                default: () => [props.t("viewed.readFailed", { message: renderViewed.message })],
              },
            ),
          renderData?.kind === "change" &&
            renderThreadRead.failure !== null &&
            h(
              Notice,
              {
                action: h(
                  Button,
                  {
                    size: "sm",
                    variant: "outline",
                    className: css.noticeAction ?? "",
                    onClick: refresh,
                  },
                  { default: () => [props.t("retry")] },
                ),
              },
              {
                default: () => [
                  props.t("thread.loadFailed", { message: renderThreadRead.failure }),
                ],
              },
            ),
          renderReviewForm,
          h(
            "div",
            {
              class: css.body,
            },
            [
              body,
              renderAllFiles.length > 0 &&
                h(FileTreePane, {
                  ...renderNavigator,
                  id: treeId,
                  position: renderTreePosition,
                  onWidth: (width: number) => {
                    treeWidth.value = width;
                  },
                }),
              renderReview !== null &&
                renderData?.kind === "change" &&
                renderThreadList.open &&
                h(ThreadList, {
                  entries: renderPlaced.entries,
                  files: renderAllFiles,
                  truncated: renderReview.truncated,
                  url: renderData.url,
                  filter: renderThreadList.filter,
                  choose: (filter) => {
                    threadList.value = ((value) => ({ ...value, filter }))(renderThreadList);
                  },
                  claim: renderThreadList.claim,
                  claimed: () => {
                    threadList.value = ((value) => ({ ...value, claim: false }))(renderThreadList);
                  },
                  open: (entry, covering) => {
                    if (covering)
                      threadList.value = ((value) => ({ ...value, open: false }))(renderThreadList);
                    openThread(entry, covering);
                  },
                  openLink: props.openLink,
                  close: closeThreadList,
                  t: props.t,
                }),
            ],
          ),
        ],
      );
    };
  },
  {
    name: "ChangesTab",
    props: [
      "useTabInfo",
      "sessionId",
      "renderSlot",
      "useStore",
      "actions",
      "reconnect",
      "openLink",
      "copyPath",
      "createChangeRequest",
      "addReviewToInput",
      "reviewQueue",
      "submitReview",
      "changesLens",
      "localDiff",
      "diffBases",
      "localText",
      "localCommits",
      "changeRequestDiff",
      "changeRequestCommits",
      "viewedFiles",
      "changeRequestViewed",
      "setFileViewed",
      "changeRequestText",
      "changeRequestReview",
      "changeRequestReviewWrite",
      "addThreadToInput",
      "report",
      "useLenses",
      "useExtensions",
      "usePanel",
      "useAnnotations",
      "t",
    ] as const,
  },
);
