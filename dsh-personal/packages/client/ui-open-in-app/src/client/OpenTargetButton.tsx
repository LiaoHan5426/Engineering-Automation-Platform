/** Shared file and directory opener: one default action, application menu, and one reported outcome per gesture. */
import { h, defineComponent, shallowRef, shallowReadonly, type ShallowRef } from "vue";
import {
  IconChevronDownOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconRightUpOutlineRegular,
  Menu,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { ShortcutCatalogEntry } from "@deepseek-ai/dsh-client-shortcuts/client";
import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import type { OpenInAppOutcome } from "./outcome.ts";
import type { NS } from "./locales.ts";
import css from "./OpenTargetButton.module.css";
/** Application metadata supplied by either the directory catalog or a file association query. */
export interface OpenTargetApplication {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
}
/** Opening intent; default selection remains owned by the target's adapter. */
export type OpenTargetOperation =
  | {
      readonly kind: "default";
    }
  | {
      readonly kind: "application";
      readonly id: string;
    }
  | {
      readonly kind: "reveal";
    };
/** Seat a contribution sends one settled gesture to for app-wide announcement. */
export interface OpenTargetReporter {
  /** Report the settled outcome; `{ kind: 'skipped' }` announces nothing. */
  readonly report: (outcome: OpenInAppOutcome) => void;
}
/** Inputs shared by both target adapters and the file empty-state action. */
export interface OpenTargetButtonProps extends OpenTargetReporter {
  readonly shortcut?: Pick<ShortcutCatalogEntry, "keys" | "aria"> | undefined;
  readonly kind: "file" | "directory";
  readonly applications: readonly OpenTargetApplication[];
  readonly defaultId: string | undefined;
  readonly failed: boolean;
  readonly busy?: boolean;
  readonly loading?: boolean;
  readonly prominent?: boolean;
  readonly t: TranslateNS<typeof NS>;
  /** Resolve every gesture to an outcome, including Host and transport failures; never reject. */
  readonly execute: (operation: OpenTargetOperation) => Promise<OpenInAppOutcome>;
  readonly refresh?: () => void;
}
/**
 * Serialize gestures and report the outcome each one settles on to the app-wide
 * announcer, which outlives this control and the panel holding it.
 * @param execute - getter for the current target adapter, which settles without rejecting.
 * @param report - getter for the announcement seat captured when each gesture starts.
 * @returns the pending state and the guarded action callback.
 */
export function useOpenTargetGesture(
  execute: () => OpenTargetButtonProps["execute"],
  report: () => OpenTargetButtonProps["report"],
): {
  pending: Readonly<ShallowRef<boolean>>;
  act: (operation: OpenTargetOperation) => void;
} {
  const pending = shallowRef(false);
  return {
    pending: shallowReadonly(pending),
    act: (operation) => {
      if (pending.value) return;
      pending.value = true;
      const announce = report();
      void execute()(operation)
        .then(announce)
        .finally(() => {
          pending.value = false;
        });
    },
  };
}
/** One application image with a per-image fallback, shared by main and menu buttons. */
const ApplicationIcon = defineComponent(
  (props: { source: string | null; size?: number }) => {
    const failed = shallowRef(false);
    return () => {
      const { source, size = 14 } = props;
      return source === null || failed.value
        ? h(IconRightUpOutlineRegular, { size: size }, undefined)
        : h(
            "img",
            {
              src: source,
              width: size,
              height: size,
              class: css.appIcon,
              alt: "",
              draggable: false,
              onError: () => {
                failed.value = true;
              },
            },
            undefined,
          );
    };
  },
  { name: "ApplicationIcon", inheritAttrs: false, props: ["source", "size"] },
);
/**
 * Render identical split buttons for files and directories. File reveal always
 * stays last; it is the default only when no application is registered.
 * @param props - target applications, default selection, and operations.
 * @returns the control alone: its settled outcomes are announced by the seat it reports to.
 */
export const OpenTargetButton = defineComponent(
  (props: OpenTargetButtonProps) => {
    const menuOpen = shallowRef(false);
    const { pending, act } = useOpenTargetGesture(
      () => props.execute,
      () => props.report,
    );
    return () => {
      const { applications, defaultId, kind, t } = props;
      // Files open through an application whenever one is registered: the OS-marked
      // default when the Host reported one, else the first entry in the Shell's
      // preference order. Reveal is only promoted with no registered application, so
      // a missing default marker never hides the applications behind it.
      const preferred =
        kind === "file"
          ? (applications.find((app) => app.id === defaultId) ?? applications[0])
          : applications.find((app) => app.id === defaultId);
      const disabled = pending.value || props.busy === true || props.loading === true;
      const hasMenu =
        props.loading === true ||
        props.failed ||
        applications.length + (kind === "file" ? 1 : 0) > 1;
      const revealDefault = kind === "file" && preferred === undefined && props.loading !== true;
      const primaryLabel =
        preferred === undefined ? t("path.reveal") : t("open.title", { app: preferred.name });
      const run = (operation: OpenTargetOperation): void => {
        menuOpen.value = false;
        act(operation);
      };
      const primary = (): void => {
        if (revealDefault) {
          run({ kind: "reveal" });
          return;
        }
        // The Host's default marker is best effort. With none, request the application
        // this control names instead of letting the OS resolve the association again.
        if (preferred !== undefined && preferred.id !== defaultId) {
          run({ kind: "application", id: preferred.id });
          return;
        }
        run({ kind: "default" });
      };
      const icon =
        props.loading === true && preferred === undefined
          ? h(
              "span",
              {
                class: css.skeleton,
                "data-open-target-skeleton": true,
                "aria-hidden": "true",
                style: {
                  width: props.prominent ? "18px" : "13px",
                  height: props.prominent ? "18px" : "13px",
                },
              },
              undefined,
            )
          : revealDefault
            ? h(IconFolderOpenOutlineRegular, { size: props.prominent ? 18 : 13 }, undefined)
            : h(
                ApplicationIcon,
                {
                  ...(preferred?.icon == null ? {} : { key: preferred.icon }),
                  source: preferred?.icon ?? null,
                  size: props.prominent ? 18 : 13,
                },
                undefined,
              );
      return h(
        Menu,
        {
          className: css.menuAnchor ?? "",
          open: menuOpen.value && !disabled && hasMenu,
          autoFocus: true,
          portal: true,
          dense: true,
          align: "end",
          onClose: () => {
            menuOpen.value = false;
          },
          items: [
            ...applications.map((app) => ({
              id: `app:${app.id}`,
              icon: h(
                ApplicationIcon,
                { ...(app.icon === null ? {} : { key: app.icon }), source: app.icon },
                undefined,
              ),
              label: app.id === preferred?.id ? t("path.appDefault", { app: app.name }) : app.name,
            })),
            ...(props.failed
              ? [{ id: "unavailable", label: t("path.appsError"), disabled: true }]
              : []),
          ],
          footer:
            kind === "file"
              ? [
                  {
                    id: "reveal",
                    icon: h(IconFolderOpenOutlineRegular, undefined, undefined),
                    label: revealDefault
                      ? t("path.appDefault", { app: t("path.reveal") })
                      : t("path.reveal"),
                  },
                ]
              : [],
          onSelect: (id) => {
            run(id === "reveal" ? { kind: "reveal" } : { kind: "application", id: id.slice(4) });
          },
        },
        {
          anchor: () =>
            h(
              "div",
              {
                class: css.split,
                "data-open-target": kind,
                "data-size": props.prominent ? "large" : "compact",
                "data-open-path": kind === "file" && !props.prominent ? "" : undefined,
                "data-state": disabled ? "busy" : "idle",
              },
              [
                h(
                  Tooltip,
                  {
                    portal: true,
                    label: primaryLabel,
                    ...(props.shortcut === undefined ? {} : { shortcutKeys: props.shortcut.keys }),
                    side: "bottom",
                    delayMs: 500,
                  },
                  {
                    default: () => [
                      h(
                        "button",
                        {
                          type: "button",
                          class: css.main,
                          disabled: disabled,
                          "aria-label": props.prominent ? undefined : primaryLabel,
                          "aria-keyshortcuts": props.shortcut?.aria,
                          "data-open-path-open":
                            kind === "file" && !props.prominent ? "" : undefined,
                          "data-open-path-unpreviewable": props.prominent ? "" : undefined,
                          onClick: primary,
                        },
                        [
                          icon,
                          props.prominent && (revealDefault ? t("path.reveal") : t("path.open")),
                        ],
                      ),
                    ],
                  },
                ),
                hasMenu &&
                  h(
                    "button",
                    {
                      type: "button",
                      class: css.chevron,
                      disabled: disabled,
                      "aria-haspopup": "menu",
                      "aria-expanded": menuOpen.value && !disabled,
                      "aria-label": t("path.more"),
                      "data-open-path-more": kind === "file" && !props.prominent ? "" : undefined,
                      onClick: () => {
                        if (!menuOpen.value) props.refresh?.();
                        menuOpen.value = !menuOpen.value;
                      },
                    },
                    [
                      h(
                        IconChevronDownOutlineRegular,
                        { size: props.prominent ? 14 : 10 },
                        undefined,
                      ),
                    ],
                  ),
              ],
            ),
        },
      );
    };
  },
  {
    name: "OpenTargetButton",
    inheritAttrs: false,
    props: [
      "shortcut",
      "kind",
      "applications",
      "defaultId",
      "failed",
      "busy",
      "loading",
      "prominent",
      "t",
      "execute",
      "report",
      "refresh",
    ],
  },
);
