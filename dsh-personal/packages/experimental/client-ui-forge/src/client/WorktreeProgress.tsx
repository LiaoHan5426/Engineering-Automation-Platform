/**
 * Card above the composer while a Session's worktree is created, while a message
 * waits after a failed or stopped attempt, and when its worktree is gone or
 * being restored.
 */
import { defineComponent, h, Fragment, shallowRef, type VNodeChild } from "vue";
import {
  Button,
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
  StateDot,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { HostObservable, InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { assertNever } from "@deepseek-ai/dsh-util-values";
import type {
  ForgeMissingWorktree,
  ForgePanelWorktree,
  ForgeSessionWorktree,
  ForgeWorktreeRestoration,
} from "../types.ts";
import type { ForgePanelKey, NS } from "./locales.ts";
import type { PanelSnapshot } from "./source.ts";
import css from "./WorktreeProgress.module.css";
/** Business face of the card. */
export interface WorktreeProgressInjected {
  /** Panel snapshot of the Session; the renderer binds it as `usePanel`. */
  readonly hooks: {
    readonly panel: HostObservable<PanelSnapshot>;
  };
  /** Stop the running attempt a message waits for; the message keeps waiting. */
  readonly stop: () => void;
  /** Make another attempt at the worktree a message waits for. */
  readonly retry: () => void;
  /** Withdraw the worktree request, so the waiting message goes on without a worktree. */
  readonly withdraw: () => void;
  /**
   * Check out the removed worktree again.
   * @returns the failure text, or undefined once it is restored.
   */
  readonly restore: () => Promise<string | undefined>;
  /** Move the Session back to the source checkout of its removed worktree. */
  readonly leave: () => void;
}
/** Full props of the card. */
export type WorktreeProgressProps = InjectFace<WorktreeProgressInjected> & PropsLocale<typeof NS>;
type Translate = WorktreeProgressProps["t"];
type StepState = "done" | "running" | "waiting" | "failed";
type Phase = "prepare" | "checkout";
type StepList = readonly {
  readonly phase: Phase;
  readonly label: ForgePanelKey;
}[];
const CREATION_STEPS: StepList = [
  { phase: "prepare", label: "creation.prepare" },
  { phase: "checkout", label: "creation.checkout" },
];
const RESTORATION_STEPS: StepList = [
  { phase: "prepare", label: "restoration.prepare" },
  { phase: "checkout", label: "creation.checkout" },
];
function stepState(
  current: "prepare" | "checkout",
  failed: boolean,
  phase: "prepare" | "checkout",
): StepState {
  if (phase === current) return failed ? "failed" : "running";
  return phase === "prepare" ? "done" : "waiting";
}
function Steps({
  steps,
  phase,
  failed,
  t,
}: {
  readonly steps: StepList;
  readonly phase: Phase;
  readonly failed: boolean;
  readonly t: Translate;
}): VNodeChild {
  return h("ul", { class: css.steps }, [
    steps.map((step) =>
      h(
        "li",
        { key: step.phase, class: css.step, "data-state": stepState(phase, failed, step.phase) },
        [
          h(StepIcon, { state: stepState(phase, failed, step.phase) }, undefined),
          h("span", undefined, [t(step.label)]),
        ],
      ),
    ),
  ]);
}
function StepIcon({ state }: { readonly state: StepState }): VNodeChild {
  switch (state) {
    case "done":
      return h(IconCheckOutlineRegular, { size: 14, className: css.done ?? "" }, undefined);
    case "running":
      return h(StateDot, { state: "ongoing", size: 14 }, undefined);
    case "failed":
      return h(IconCloseOutlineRegular, { size: 14, className: css.failed ?? "" }, undefined);
    case "waiting":
      return h("span", { class: css.waiting, "aria-hidden": "true" }, undefined);
    /* v8 ignore next -- closed StepState union exhaustiveness guard */
    default:
      return assertNever(state, "StepState");
  }
}
/** One creation as the card shows it: the running attempt, or the failed or stopped one a message waits after. */
interface CreationView {
  readonly state: "running" | "failed" | "stopped";
  readonly phase: "prepare" | "checkout";
  readonly branch: string | null;
  readonly from: string | null;
  /** Failure text, or null unless the attempt failed. */
  readonly message: string | null;
  /** Whether a message waits for the running attempt, which can then be stopped. */
  readonly held: boolean;
}
/** The running attempt, else the failed or stopped one a message waits after, or undefined without either. */
function creationOf(worktree: ForgePanelWorktree): CreationView | undefined {
  const { creation, failure, waiting } = worktree;
  if (creation !== null) return { ...creation, state: "running", message: null };
  if (waiting !== "creation") return undefined;
  if (failure !== null) return { ...failure, state: "failed", held: false };
  return {
    state: "stopped",
    phase: "prepare",
    branch: null,
    from: worktree.request?.from ?? null,
    message: null,
    held: false,
  };
}
function Details({
  creation,
  t,
}: {
  readonly creation: CreationView;
  readonly t: Translate;
}): VNodeChild {
  return h("dl", { class: css.details }, [
    creation.branch !== null &&
      h(Fragment, undefined, [
        h("dt", undefined, [t("creation.branch")]),
        h("dd", { class: css.code }, [creation.branch]),
      ]),
    h("dt", undefined, [t("creation.base")]),
    h("dd", { class: css.code }, [creation.from ?? t("creation.head")]),
    creation.message !== null &&
      h(Fragment, undefined, [
        h("dt", undefined, [t("creation.error")]),
        h("dd", { class: css.message }, [creation.message]),
      ]),
  ]);
}
const CREATION_TITLE: Record<CreationView["state"], ForgePanelKey> = {
  running: "creation.title",
  failed: "creation.failed",
  stopped: "creation.stopped",
};
const CreationCard = defineComponent(
  (props: {
    readonly creation: CreationView;
    readonly stop: WorktreeProgressInjected["stop"];
    readonly retry: WorktreeProgressInjected["retry"];
    readonly withdraw: WorktreeProgressInjected["withdraw"];
    readonly t: Translate;
  }) => {
    const open = shallowRef(false);
    return () => {
      const { creation, stop, retry, withdraw, t } = props;
      const running = creation.state === "running";
      const failed = creation.state === "failed";
      const title = t(CREATION_TITLE[creation.state]);
      return h(
        "div",
        { class: css.dock, "data-forge-creation": running ? creation.phase : creation.state },
        [
          h("section", { class: css.card, "aria-label": title, "aria-busy": running }, [
            h("div", { class: css.header }, [
              h(IconBranchOutlineRegular, { size: 14, className: css.glyph ?? "" }, undefined),
              h("span", { class: css.title }, [title]),
              creation.branch !== null && h("span", { class: css.branch }, [creation.branch]),
            ]),
            creation.state !== "stopped" &&
              h(
                Steps,
                { steps: CREATION_STEPS, phase: creation.phase, failed: failed, t: t },
                undefined,
              ),
            (open.value || failed) && h(Details, { creation: creation, t: t }, undefined),
            !running && h("p", { class: css.note }, [t("creation.waiting")]),
            h("div", { class: css.footer }, [
              running &&
                h(
                  "button",
                  {
                    type: "button",
                    class: css.disclosure,
                    "aria-expanded": open.value,
                    onClick: () => {
                      open.value = !open.value;
                    },
                  },
                  [
                    h(
                      IconChevronRightOutlineRegular,
                      { size: 12, className: (open.value ? css.chevronOpen : css.chevron) ?? "" },
                      undefined,
                    ),
                    t("creation.details"),
                  ],
                ),
              !running &&
                h("span", { class: css.actions }, [
                  h(
                    Button,
                    { size: "sm", variant: "primary", onClick: retry },
                    { default: () => [t("creation.retry")] },
                  ),
                  h(
                    Button,
                    { size: "sm", variant: "ghost", onClick: withdraw },
                    { default: () => [t("creation.skip")] },
                  ),
                ]),
              creation.held &&
                h("span", { class: css.actions }, [
                  h(
                    Button,
                    { size: "sm", variant: "ghost", onClick: stop },
                    {
                      icon: () => h(IconCloseOutlineRegular, { size: 14 }),
                      default: () => [t("creation.cancel")],
                    },
                  ),
                ]),
            ]),
          ]),
        ],
      );
    };
  },
  { props: ["creation", "stop", "retry", "withdraw", "t"], inheritAttrs: false },
);
const MissingCard = defineComponent(
  (props: {
    readonly created: ForgeSessionWorktree;
    readonly missing: ForgeMissingWorktree;
    /** The running restoration, from whichever surface started it. */
    readonly restoration: ForgeWorktreeRestoration | null;
    /** Whether a message waits for the worktree to be restored or left. */
    readonly waiting: boolean;
    readonly restore: WorktreeProgressInjected["restore"];
    readonly leave: WorktreeProgressInjected["leave"];
    readonly t: Translate;
  }) => {
    const restoring = shallowRef(false);
    const error = shallowRef<string | null>(null);
    return () => {
      const { created, missing, restoration, waiting, restore, leave, t } = props;
      const start = (): void => {
        if (restoring.value || restoration !== null) return;
        restoring.value = true;
        error.value = null;
        void restore().then(
          (failure) => {
            restoring.value = false;
            error.value = failure ?? null;
          },
          (failure: unknown) => {
            restoring.value = false;
            error.value = failure instanceof Error ? failure.message : String(failure);
          },
        );
      };
      // The restore this card asked for runs before the Host names its first step.
      const phase = restoration?.phase ?? (restoring.value ? "prepare" : null);
      if (phase !== null) {
        return h(
          "div",
          { class: css.dock, "data-forge-missing": "", "data-forge-restoration": phase },
          [
            h(
              "section",
              { class: css.card, "aria-label": t("restoration.title"), "aria-busy": true },
              [
                h("div", { class: css.header }, [
                  h(IconBranchOutlineRegular, { size: 14, className: css.glyph ?? "" }, undefined),
                  h("span", { class: css.title }, [t("restoration.title")]),
                  h("span", { class: css.branch }, [created.branch]),
                ]),
                h(
                  Steps,
                  { steps: RESTORATION_STEPS, phase: phase, failed: false, t: t },
                  undefined,
                ),
              ],
            ),
          ],
        );
      }
      return h("div", { class: css.dock, "data-forge-missing": "" }, [
        h("section", { class: css.card, "aria-label": t("missing.title") }, [
          h("div", { class: css.header }, [
            h(IconBranchOutlineRegular, { size: 14, className: css.warning ?? "" }, undefined),
            h("span", { class: css.title }, [t("missing.title")]),
            h("span", { class: css.branch }, [created.branch]),
          ]),
          h("p", { class: css.note }, [
            t(
              missing.branchExists === null
                ? "missing.unknown"
                : missing.branchExists
                  ? "missing.kept"
                  : "missing.recreated",
              { branch: created.branch },
            ),
          ]),
          waiting && h("p", { class: css.note }, [t("missing.waiting")]),
          error.value !== null && h("p", { class: css.error }, [error.value]),
          h("div", { class: css.footer }, [
            h("span", { class: css.actions }, [
              h(
                Button,
                { size: "sm", variant: "primary", onClick: start },
                { default: () => [t("missing.restore")] },
              ),
              h(
                Button,
                { size: "sm", variant: "ghost", onClick: leave },
                { default: () => [t("missing.leave")] },
              ),
            ]),
          ]),
        ]),
      ]);
    };
  },
  {
    props: ["created", "missing", "restoration", "waiting", "restore", "leave", "t"],
    inheritAttrs: false,
  },
);
/**
 * Render the worktree card of a Session: the running attempt at its
 * requested worktree, which can be stopped while a message waits for it; the
 * failed or stopped attempt a message waits after, with another attempt or
 * withdrawing the request so the message goes on without a worktree; or the
 * removal of the worktree the Session works in, with restoring it, whose
 * steps the card follows, and returning to the source checkout, after which
 * a waiting message goes on.
 * @param props - panel hook, actions, and copy.
 * @returns the card, or nothing while no attempt runs, no message waits, and the worktree exists.
 */
export const WorktreeProgress = defineComponent(
  (props: WorktreeProgressProps) => {
    const worktree = props.usePanel((snapshot) => snapshot.state?.worktree ?? null);
    return () => {
      const { stop, retry, withdraw, restore, leave, t } = props;
      if (worktree.value === null) return null;
      const creation = creationOf(worktree.value);
      if (creation !== undefined)
        return h(
          CreationCard,
          { creation: creation, stop: stop, retry: retry, withdraw: withdraw, t: t },
          undefined,
        );
      if (worktree.value.missing === null || worktree.value.created === null) return null;
      return h(
        MissingCard,
        {
          created: worktree.value.created,
          missing: worktree.value.missing,
          restoration: worktree.value.restoration,
          waiting: worktree.value.waiting === "restoration",
          restore: restore,
          leave: leave,
          t: t,
        },
        undefined,
      );
    };
  },
  {
    props: ["usePanel", "stop", "retry", "withdraw", "restore", "leave", "t"],
    inheritAttrs: false,
  },
);
