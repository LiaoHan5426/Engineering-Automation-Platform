import { h, Fragment, defineComponent, computed, shallowRef, onBeforeUnmount } from "vue";
import clsx from "clsx";
import {
  Button,
  fileSizeText,
  IconChevronDownOutlineRegular,
  IconFolderCloseRegular,
  IconUploadOutlineMedium,
  IconUploadOutlineRegular,
  Modal,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HocShare,
  InjectFace,
  PropsLocale,
  PropsRenderFactories,
  PropsRuntime,
  SlotMap,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {} from "@deepseek-ai/dsh-api-remote-access/client";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace/types";
import type { DeepseekChatImportFailureReason, DeepseekChatImportResult } from "../types.ts";
import type { UploadProgress } from "./upload.ts";
import css from "./ImportSessions.module.css";
/** Outcome of one import request, already reduced for display. */
export type DeepseekChatImportOutcome =
  | {
      readonly ok: true;
      readonly result: DeepseekChatImportResult;
    }
  | {
      readonly ok: false;
      readonly reason: DeepseekChatImportFailureReason | "upload-failed" | "unknown";
      readonly message: string;
      /** Byte limit, present when the browser's own size pre-check rejected the file. */
      readonly limit?: number;
    };
/** Callbacks injected by the plugin apply closure. */
export interface DeepseekChatImportInjected {
  /**
   * Upload one archive into a Workspace, then refresh the Session list however the attempt ends.
   * @param file - archive chosen in the browser.
   * @param workspaceId - Workspace receiving the Sessions.
   * @param onProgress - upload progress, the reading phase, then Sessions written.
   * @param signal - aborted when the dialog closes.
   * @returns the summary, or the failure category and diagnostic.
   */
  readonly importArchive: (
    file: File,
    workspaceId: WorkspaceId,
    onProgress: (progress: UploadProgress) => void,
    signal: AbortSignal,
  ) => Promise<DeepseekChatImportOutcome>;
}
/** Props composed by the `sidebar.session.action` slot, including the New-session row content it wraps. */
export type ImportSessionsActionProps = PropsRuntime<"sidebar.session.action"> &
  HocShare<SlotMap["sidebar.session.action"]> &
  PropsRenderFactories &
  InjectFace<DeepseekChatImportInjected> &
  PropsLocale<"deepseekChatImport">;
type Translate = ImportSessionsActionProps["t"];
/**
 * Wrap the New-session row content with the import trigger after it and, while
 * open, its dialog.
 * @param props - the row content, column width, global hooks, the import callback, and the locale seat.
 * @returns the row content with the trigger and dialog, or only the row content when the Peer may not import.
 */
export const ImportSessionsAction = defineComponent(
  (props: ImportSessionsActionProps) => {
    const allowed = props.useRemoteAccess("deepseekChatImport/limits");
    const open = shallowRef(false);
    return () => {
      // A Peer that may not import still gets the New-session button: the layer adds nothing to it.
      if (!allowed.value) return props.children;
      return h(Fragment, {}, [
        props.children,
        h(
          Tooltip,
          { label: props.t("action.label"), delayMs: 500, side: props.wide ? "bottom" : "right" },
          {
            default: () => [
              h(
                "button",
                {
                  type: "button",
                  class: clsx(css.trigger, props.wide && css.wide),
                  "aria-label": props.t("action.label"),
                  onClick: () => {
                    open.value = true;
                  },
                },
                [
                  props.wide
                    ? h(IconUploadOutlineMedium, { size: 14 })
                    : h(IconUploadOutlineRegular, { size: 18 }),
                ],
              ),
            ],
          },
        ),
        open.value &&
          h(ImportDialog, {
            ...props,
            onClose: () => {
              open.value = false;
            },
          }),
      ]);
    };
  },
  {
    props: [
      "wide",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useSessionStatus",
      "useWorkspaces",
      "useWorkspaceAccess",
      "children",
      "renderFactorySlot",
      "importArchive",
      "t",
    ],
  },
);
type DialogState =
  | {
      readonly phase: "editing";
      readonly error: string | null;
    }
  | {
      readonly phase: "running";
      readonly progress: UploadProgress;
    }
  | {
      readonly phase: "done";
      readonly result: DeepseekChatImportResult;
      readonly workspace: string;
    };
const ImportDialog = defineComponent(
  (
    props: ImportSessionsActionProps & {
      onClose: () => void;
    },
  ) => {
    const workspaces = props.useWorkspaces((state) => state.items);
    const currentSessionId = props.useSessions(
      (state) =>
        Object.values(state.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id,
    );
    const file = shallowRef<File | null>(null);
    const workspaceId = shallowRef<WorkspaceId | undefined>(
      (() =>
        workspaces.value.find(
          (workspace) =>
            currentSessionId.value !== undefined &&
            workspace.sessionIds.includes(currentSessionId.value),
        )?.workspaceId)(),
    );
    const pickerOpen = shallowRef(false);
    const state = shallowRef<DialogState>({ phase: "editing", error: null });
    const fileInput = shallowRef<HTMLInputElement | null>(null);
    const workspaceButton = shallowRef<HTMLButtonElement | null>(null);
    const request = shallowRef<AbortController | null>(null);
    onBeforeUnmount(() => {
      request.value?.abort();
    });
    const workspace = computed(() =>
      workspaces.value.find((item) => item.workspaceId === workspaceId.value),
    );
    const running = computed(() => state.value.phase === "running");
    const close = () => {
      request.value?.abort();
      props.onClose();
    };
    const submit = (chosen: File, target: (typeof workspaces.value)[number]) => {
      const controller = new AbortController();
      request.value = controller;
      state.value = { phase: "running", progress: { phase: "uploading", fraction: 0 } };
      void props
        .importArchive(
          chosen,
          target.workspaceId,
          (progress) => {
            if (!controller.signal.aborted) state.value = { phase: "running", progress };
          },
          controller.signal,
        )
        .then(
          (outcome) => {
            if (controller.signal.aborted) return;
            state.value = outcome.ok
              ? { phase: "done", result: outcome.result, workspace: target.title }
              : { phase: "editing", error: failureText(outcome, props.t) };
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            state.value = {
              phase: "editing",
              error: props.t("error.unknown", {
                message: error instanceof Error ? error.message : String(error),
              }),
            };
          },
        );
    };
    const progressText = computed(() =>
      state.value.phase === "running"
        ? runningText(state.value.progress, props.t)
        : props.t("dialog.import"),
    );
    return () => {
      if (state.value.phase === "done") {
        const { result, workspace: importedWorkspace } = state.value;
        return h(
          Modal,
          {
            open: true,
            onClose: close,
            closeLabel: props.t("dialog.close"),
            title: props.t("dialog.title"),
          },
          {
            default: () => [
              h("div", { class: css.summary, role: "status" }, [
                h("p", {}, [
                  props.t(plural("result.imported", result.sessionIds.length), {
                    count: String(result.sessionIds.length),
                    name: importedWorkspace,
                  }),
                ]),
                result.omittedByLimit > 0 &&
                  h("p", {}, [
                    props.t(plural("result.omitted", result.omittedByLimit), {
                      count: String(result.omittedByLimit),
                    }),
                  ]),
                result.skipped.length > 0 &&
                  h("p", {}, [
                    props.t(plural("result.skipped", result.skipped.length), {
                      count: String(result.skipped.length),
                    }),
                  ]),
              ]),
            ],
            footer: () =>
              h(
                Button,
                { variant: "primary", onClick: close },
                { default: () => [props.t("dialog.done")] },
              ),
          },
        );
      }
      return h(
        Modal,
        {
          open: true,
          onClose: close,
          closeLabel: props.t("dialog.close"),
          title: props.t("dialog.title"),
          description: props.t("dialog.description"),
        },
        {
          default: () => [
            h("div", { class: css.fields }, [
              h("div", { class: css.field }, [
                h("span", { class: css.label }, [props.t("dialog.file")]),
                h("div", { class: css.value }, [
                  file.value !== null &&
                    h("span", { class: css.fileName, title: file.value.name }, [file.value.name]),
                  file.value !== null &&
                    h("span", { class: css.fileSize }, [fileSizeText(file.value.size)]),
                  h(
                    Button,
                    {
                      className: css.fileButton!,
                      variant: "outline",
                      size: "sm",
                      disabled: running.value,
                      "data-modal-autofocus": true,
                      onClick: () => {
                        fileInput.value?.click();
                      },
                    },
                    {
                      default: () => [
                        file.value === null
                          ? props.t("dialog.chooseFile")
                          : props.t("dialog.changeFile"),
                      ],
                    },
                  ),
                  h("input", {
                    ref: fileInput,
                    class: css.hiddenInput,
                    type: "file",
                    accept: ".zip,application/zip",
                    "aria-label": props.t("dialog.file"),
                    tabindex: -1,
                    onChange: (
                      event: Event & {
                        currentTarget: HTMLInputElement;
                      },
                    ) => {
                      const chosen = event.currentTarget.files?.[0];
                      if (chosen !== undefined) {
                        file.value = chosen;
                        state.value = { phase: "editing", error: null };
                      }
                      event.currentTarget.value = "";
                    },
                  }),
                ]),
              ]),
              h("div", { class: css.field }, [
                h("span", { class: css.label }, [props.t("dialog.workspace")]),
                h("div", { class: css.value }, [
                  h(
                    "button",
                    {
                      ref: workspaceButton,
                      type: "button",
                      class: css.workspaceButton,
                      disabled: running.value,
                      "aria-haspopup": "menu",
                      "aria-expanded": pickerOpen.value,
                      title: workspace.value?.path,
                      onClick: () => {
                        pickerOpen.value = ((open) => !open)(pickerOpen.value);
                      },
                    },
                    [
                      h(IconFolderCloseRegular, { size: 16 }),
                      h("span", { class: css.workspaceTitle }, [
                        workspace.value?.title ?? props.t("dialog.chooseWorkspace"),
                      ]),
                      h(IconChevronDownOutlineRegular, { size: 14 }),
                    ],
                  ),
                  props.renderFactorySlot("workspace.picker", {
                    open: pickerOpen.value,
                    anchorRef: workspaceButton,
                    selectedId: workspaceId.value,
                    onPick: (id) => {
                      workspaceId.value = id;
                      pickerOpen.value = false;
                      state.value = { phase: "editing", error: null };
                    },
                    onClose: () => {
                      pickerOpen.value = false;
                    },
                  }),
                ]),
              ]),
            ]),
            state.value.phase === "running" &&
              h(ProgressBar, { progress: state.value.progress, label: progressText.value }),
            state.value.phase === "editing" &&
              state.value.error !== null &&
              h("div", { class: css.error, role: "alert" }, [state.value.error]),
          ],
          footer: () =>
            h(Fragment, {}, [
              h(
                Button,
                { variant: "outline", onClick: close },
                { default: () => [props.t("dialog.cancel")] },
              ),
              h(
                Button,
                {
                  variant: "primary",
                  disabled: running.value || file.value === null || workspace.value === undefined,
                  onClick:
                    !running.value && file.value !== null && workspace.value !== undefined
                      ? () => {
                          submit(file.value!, workspace.value!);
                        }
                      : undefined,
                },
                { default: () => [progressText.value] },
              ),
            ]),
        },
      );
    };
  },
  {
    props: [
      "wide",
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useSessionStatus",
      "useWorkspaces",
      "useWorkspaceAccess",
      "children",
      "renderFactorySlot",
      "importArchive",
      "onClose",
      "t",
    ],
  },
);
/** Pick the `.one` or `.other` form of a summary line. */
function plural<K extends "result.imported" | "result.omitted" | "result.skipped">(
  key: K,
  count: number,
): `${K}.one` | `${K}.other` {
  return count === 1 ? `${key}.one` : `${key}.other`;
}
function runningText(progress: UploadProgress, t: Translate): string {
  switch (progress.phase) {
    case "uploading":
      return t("dialog.uploading", { percent: String(Math.floor(progress.fraction * 100)) });
    case "reading":
      return t("dialog.importing");
    case "importing":
      return t("dialog.importingCount", {
        done: String(progress.done),
        total: String(progress.total),
      });
  }
}
/** Upload fraction, an indeterminate bar while the Host reads the archive, then Sessions written of the target. */
function ProgressBar({ progress, label }: { progress: UploadProgress; label: string }) {
  const value =
    progress.phase === "uploading"
      ? { value: progress.fraction, max: 1 }
      : progress.phase === "importing"
        ? { value: progress.done, max: progress.total }
        : {};
  return h("progress", { class: css.progress, "aria-label": label, ...value });
}
function failureText(
  outcome: Extract<
    DeepseekChatImportOutcome,
    {
      ok: false;
    }
  >,
  t: Translate,
): string {
  switch (outcome.reason) {
    case "too-large":
      return outcome.limit === undefined
        ? // The Host names the exact limit it rejected, which is not the pre-check one.
          outcome.message
        : t("error.too-large", { limit: fileSizeText(outcome.limit) });
    case "unreadable-archive":
      return t("error.unreadable-archive");
    case "missing-manifest":
      return t("error.missing-manifest");
    case "missing-index":
      return t("error.missing-index");
    case "unsupported-version":
      return t("error.unsupported-version");
    case "no-conversations":
      return t("error.no-conversations");
    case "workspace-not-found":
      return t("error.workspace-not-found");
    case "busy":
      return t("error.busy");
    case "upload-failed":
      return t("error.upload-failed", { message: outcome.message });
    case "unknown":
      return t("error.unknown", { message: outcome.message });
  }
}
