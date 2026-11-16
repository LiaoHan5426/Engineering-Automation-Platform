import { h, Fragment, defineComponent, computed, shallowRef } from "vue";
/** Rename dialog shared by Session menus, shortcuts, and title double-clicks. */
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  SessionRenameDialogInjected,
  SessionRenameDialogProps,
  SessionRenameTarget,
} from "../contract/slots.ts";
import css from "../rows/WorkspaceBrowser.module.css";
/**
 * The `shell.overlay` entry: nothing while no rename is requested, otherwise
 * one dialog per request (keyed by the Session, so a new request starts a
 * fresh draft). Sessions have no client-side name-conflict rule (the host
 * normalizes), and unlike Workspace rename an unchanged title is NOT
 * blocked. An unnamed Session starts with an empty draft and requires a name.
 * @param props - the request hook, its settlement, the rename hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export const SessionRenameDialog = defineComponent(
  (props: SessionRenameDialogProps) => {
    const request = props.useRenameRequest((pending) => pending);
    return () => {
      if (request.value === null) return null;
      return h(RenameForm, {
        key: request.value.sessionId,
        request: request.value,
        renameSession: props.renameSession,
        onSettle: props.settleSessionRename,
        t: props.t,
      });
    };
  },
  {
    props: [
      "useRemoteAccess",
      "useSessions",
      "useSessionRetainInfo",
      "useSessionAccess",
      "usePanelInfo",
      "useContextMenu",
      "useSessionStatus",
      "useWorkspaces",
      "settleSessionRename",
      "renameSession",
      "useRenameRequest",
      "t",
    ],
  },
);
const RenameForm = defineComponent(
  (props: {
    request: SessionRenameTarget;
    renameSession: SessionRenameDialogInjected["renameSession"];
    onSettle: () => void;
    t: SessionRenameDialogProps["t"];
  }) => {
    const draft = shallowRef(props.request.currentTitle);
    const renaming = shallowRef(false);
    const error = shallowRef<string | null>(null);
    const composingRef = shallowRef(false);
    const trimmed = computed(() => draft.value.trim());
    const blocked = computed(() => renaming.value || trimmed.value === "");
    const close = () => {
      if (renaming.value) return;
      props.onSettle();
    };
    const confirm = () => {
      if (blocked.value) return;
      renaming.value = true;
      error.value = null;
      props
        .renameSession(props.request.sessionId, trimmed.value)
        .then(() => {
          renaming.value = false;
          props.onSettle();
        })
        .catch((reason: unknown) => {
          renaming.value = false;
          error.value = reason instanceof Error ? reason.message : String(reason);
        });
    };
    return () => {
      return h(
        Modal,
        {
          open: true,
          onClose: close,
          closeLabel: props.t("close"),
          title: props.t("rename.session.title"),
        },
        {
          footer: () =>
            h(Fragment, {}, [
              h(
                Button,
                { variant: "outline", disabled: renaming.value, onClick: close },
                { default: () => [props.t("cancel")] },
              ),
              h(
                Button,
                { variant: "primary", disabled: blocked.value, onClick: confirm },
                { default: () => [props.t("rename")] },
              ),
            ]),
          default: () => [
            h("input", {
              class: css.renameInput,
              value: draft.value,
              "aria-label": props.t("field.sessionName"),
              "data-modal-autofocus": true,
              disabled: renaming.value,
              onFocus: (e) => {
                (e.currentTarget as HTMLInputElement).select();
              },
              onInput: (e) => {
                draft.value = (e.currentTarget as HTMLInputElement).value;
                error.value = null;
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
                  confirm();
                }
              },
            }),
            error.value !== null &&
              h("div", { class: css.renameError, role: "alert" }, [error.value]),
          ],
        },
      );
    };
  },
  { props: ["request", "renameSession", "onSettle", "t"] },
);
