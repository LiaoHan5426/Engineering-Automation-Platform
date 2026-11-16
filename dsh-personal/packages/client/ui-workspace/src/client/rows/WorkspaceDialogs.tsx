import { h, Fragment, defineComponent, computed, shallowRef, watch } from "vue";
/** Workspace rename and removal dialogs, keyed by their captured request. */
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { WorkspaceId, WorkspaceView } from "@deepseek-ai/dsh-api-workspace-controller/client";
import type { WorkspaceActionRequest, WorkspaceBrowserProps } from "../contract/slots.ts";
import css from "./WorkspaceBrowser.module.css";
type Props = Pick<
  WorkspaceBrowserProps,
  "renameWorkspace" | "deleteWorkspace" | "settleWorkspaceAction" | "t"
> & {
  request: WorkspaceActionRequest;
  workspaces: readonly WorkspaceView[];
};
/** @param props - captured request, current Workspace list, and existing mutations. @returns the active dialog. */
export const WorkspaceDialogs = defineComponent(
  (props: Props) => {
    const composingRef = shallowRef(false);
    const renameTarget = computed(() => (props.request.action === "rename" ? props.request : null));
    const renameDraft = shallowRef(props.request.displayTitle);
    const renaming = shallowRef(false);
    const renameError = shallowRef<string | null>(null);
    const renameTrimmed = computed(() => renameDraft.value.trim());
    // Self is excluded by identity, not by title: the draft is seeded with the
    // localized label, which for an automatically titled Workspace equals its
    // own displayed title without being a conflict with itself.
    const renameDuplicate = computed(
      () =>
        renameTarget.value !== null &&
        renameTrimmed.value !== "" &&
        props.workspaces.some(
          (w) =>
            w.workspaceId !== renameTarget.value?.workspaceId && w.title === renameTrimmed.value,
        ),
    );
    const renameBlocked = computed(
      () =>
        renaming.value ||
        renameTrimmed.value === "" ||
        renameTarget.value === null ||
        renameTrimmed.value === renameTarget.value.storedTitle ||
        renameDuplicate.value,
    );
    const closeRename = () => {
      if (renaming.value) return;
      props.settleWorkspaceAction();
      renameError.value = null;
    };
    const confirmRename = () => {
      if (renameBlocked.value || renameTarget.value === null) return;
      renaming.value = true;
      renameError.value = null;
      props
        .renameWorkspace(renameTarget.value.workspaceId, renameTrimmed.value)
        .then(() => {
          renaming.value = false;
          props.settleWorkspaceAction();
        })
        .catch((reason: unknown) => {
          renaming.value = false;
          renameError.value = reason instanceof Error ? reason.message : String(reason);
        });
    };
    const deleteTarget = computed(() => (props.request.action === "delete" ? props.request : null));
    const deleting = shallowRef(false);
    const deleteCommittedId = shallowRef<WorkspaceId | null>(null);
    const deleteError = shallowRef<string | null>(null);
    watch(
      [() => deleteCommittedId.value, () => props.workspaces, () => props.settleWorkspaceAction],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (
            deleteCommittedId.value === null ||
            props.workspaces.some((workspace) => workspace.workspaceId === deleteCommittedId.value)
          )
            return;
          deleting.value = false;
          deleteCommittedId.value = null;
          props.settleWorkspaceAction();
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const closeDelete = () => {
      if (deleting.value) return;
      props.settleWorkspaceAction();
      deleteError.value = null;
    };
    const confirmDelete = () => {
      /* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
      if (deleting.value || deleteTarget.value === null) return;
      const workspaceId = deleteTarget.value.workspaceId;
      deleting.value = true;
      deleteCommittedId.value = null;
      deleteError.value = null;
      props
        .deleteWorkspace(workspaceId)
        .then(() => {
          // Keep the confirmation pending until this component has rendered the
          // committed list projection without the deleted id. Closing earlier
          // exposes one stale frame to the next Create Workspace gesture.
          deleteCommittedId.value = workspaceId;
        })
        .catch((reason: unknown) => {
          deleting.value = false;
          deleteError.value = reason instanceof Error ? reason.message : String(reason);
        });
    };
    return () => {
      return h(Fragment, {}, [
        h(
          Modal,
          {
            open: renameTarget.value !== null,
            onClose: closeRename,
            closeLabel: props.t("close"),
            title: props.t("rename.workspace.title"),
          },
          {
            footer: () =>
              h(Fragment, {}, [
                h(
                  Button,
                  { variant: "outline", disabled: renaming.value, onClick: closeRename },
                  { default: () => [props.t("cancel")] },
                ),
                h(
                  Button,
                  { variant: "primary", disabled: renameBlocked.value, onClick: confirmRename },
                  { default: () => [props.t("rename")] },
                ),
              ]),
            default: () => [
              h("input", {
                class: css.renameInput,
                value: renameDraft.value,
                "aria-label": props.t("field.workspaceName"),
                "data-modal-autofocus": true,
                disabled: renaming.value,
                onFocus: (e) => {
                  (e.currentTarget as HTMLInputElement).select();
                },
                onInput: (e) => {
                  renameDraft.value = (e.currentTarget as HTMLInputElement).value;
                  renameError.value = null;
                },
                onCompositionstart: () => {
                  composingRef.value = true;
                },
                onCompositionend: () => {
                  composingRef.value = false;
                },
                onKeydown: (e) => {
                  if (e.key === "Enter" && !composingRef.value) {
                    e.preventDefault();
                    confirmRename();
                  }
                },
              }),
              renameDuplicate.value &&
                h("div", { class: css.renameError, role: "alert" }, [
                  props.t("conflict.named", { name: renameTrimmed.value }),
                ]),
              renameError.value !== null &&
                h("div", { class: css.renameError, role: "alert" }, [renameError.value]),
            ],
          },
        ),
        h(
          Modal,
          {
            open: deleteTarget.value !== null,
            onClose: closeDelete,
            closeLabel: props.t("close"),
            title: props.t("delete.workspace"),
            ...(deleteTarget.value === null
              ? {}
              : { description: props.t("delete.desc", { name: deleteTarget.value.displayTitle }) }),
          },
          {
            footer: () =>
              h(Fragment, {}, [
                h(
                  Button,
                  { variant: "outline", disabled: deleting.value, onClick: closeDelete },
                  { default: () => [props.t("cancel")] },
                ),
                h(
                  Button,
                  {
                    variant: "outline",
                    className: css.deleteAction!,
                    disabled: deleting.value,
                    onClick: confirmDelete,
                  },
                  { default: () => [props.t("delete.workspace")] },
                ),
              ]),
            default: () => [
              deleting.value &&
                h("div", { class: css.deleteStatus, role: "status" }, [props.t("delete.pending")]),
              deleteError.value !== null &&
                h("div", { class: css.renameError, role: "alert" }, [deleteError.value]),
            ],
          },
        ),
      ]);
    };
  },
  {
    props: [
      "settleWorkspaceAction",
      "renameWorkspace",
      "deleteWorkspace",
      "t",
      "request",
      "workspaces",
    ],
  },
);
