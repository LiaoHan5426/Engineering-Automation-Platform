import { defineComponent, h } from "vue";

/**
 * The session permission, fork switch, and per-plugin endpoint selection shared by the create form
 * and the stored-share editor.
 *
 * @module @deepseek-ai/dsh-experimental-liveshare/src/client/SharePermissionFields
 */
import { SegmentedControl, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { NS } from "./locales.ts";
import { ShareCapabilitiesPicker, type PluginAccess } from "./ShareCapabilitiesPicker.tsx";
import { sessionModeOptions } from "./share-options.ts";
import type { OfferedPlugin, ViewerPluginPolicy } from "./share-types.ts";
import type { ViewerSessionMode } from "./viewer-capabilities.ts";
import css from "./ShareDialog.module.css";
/** Values and callbacks one shared permission field renders. */
export interface SharePermissionFieldsProps extends PropsLocale<typeof NS> {
  /** Session permission on hand; absent when the Host cannot place the stored tier. */
  readonly sessionMode: ViewerSessionMode | undefined;
  /** Whether no supported session permission exists, stated instead of an empty control. */
  readonly modeUnsupported?: boolean;
  /** The share's own fork switch. */
  readonly allowsFork: boolean;
  /** Plugin endpoints the mounted plugins offer. */
  readonly offered: readonly OfferedPlugin[];
  /** Global switch over every installed plugin's methods. */
  readonly pluginAccess: PluginAccess;
  /** Endpoints this share currently selects. */
  readonly capabilities: readonly ViewerPluginPolicy[];
  /** Whether every control is unavailable. */
  readonly disabled: boolean;
  /** Base id the session permission tabs derive from. */
  readonly sessionModeControlId: string;
  /** Base id the per-plugin endpoint controls derive from. */
  readonly capabilityControlId: string;
  /** Record a session permission pick. */
  readonly onSessionMode: (mode: ViewerSessionMode) => void;
  /** Record a fork-switch pick. */
  readonly onAllowsFork: (value: boolean) => void;
  /** Record the global plugin switch. */
  readonly onPluginAccess: (access: PluginAccess) => void;
  /** Record an endpoint selection. */
  readonly onCapabilities: (capabilities: readonly ViewerPluginPolicy[]) => void;
}
/**
 * Render the fields both creating and editing a share present.
 * @param props - Values, callbacks, control ids, and localized copy.
 * @returns The shared permission rows.
 */
export const SharePermissionFields = defineComponent(
  (componentProps: SharePermissionFieldsProps) => {
    return () => {
      return h("div", { class: css.permissionSections }, [
        h("div", { class: css.permissionBlock }, [
          h("div", { class: css.row }, [
            h("span", { class: css.rowLabel }, [componentProps.t("dialog.sessionMode")]),
            componentProps.sessionMode === undefined
              ? h("span", { class: css.testWarn }, [
                  componentProps.t("dialog.permissions.modeUnsupported"),
                ])
              : h(SegmentedControl<ViewerSessionMode>, {
                  id: componentProps.sessionModeControlId,
                  label: componentProps.t("dialog.sessionMode"),
                  value: componentProps.sessionMode,
                  disabled: componentProps.disabled,
                  options: sessionModeOptions(componentProps.t),
                  onChange: componentProps.onSessionMode,
                }),
          ]),
          (componentProps.modeUnsupported ?? false) || componentProps.sessionMode === undefined
            ? null
            : h("p", { class: css.hint }, [
                componentProps.t(`dialog.sessionMode.hint.${componentProps.sessionMode}` as const),
              ]),
          h("p", { class: css.warning, role: "note" }, [
            componentProps.t("dialog.ptcSandboxWarning"),
          ]),
        ]),
        h("div", { class: css.permissionBlock }, [
          h("div", { class: css.row }, [
            h("span", { class: css.rowLabel }, [componentProps.t("dialog.allowsFork")]),
            h(Switch, {
              checked: componentProps.allowsFork,
              disabled: componentProps.disabled,
              label: componentProps.t("dialog.allowsFork"),
              onChange: componentProps.onAllowsFork,
            }),
          ]),
          h("p", { class: css.hint }, [componentProps.t("dialog.allowsForkHint")]),
        ]),
        h("div", { class: css.permissionBlock }, [
          componentProps.offered.length === 0
            ? h("p", { class: css.hint }, [componentProps.t("dialog.capabilities.empty")])
            : h(ShareCapabilitiesPicker, {
                offered: componentProps.offered,
                access: componentProps.pluginAccess,
                selection: componentProps.capabilities,
                disabled: componentProps.disabled,
                controlId: componentProps.capabilityControlId,
                onAccessChange: componentProps.onPluginAccess,
                onChange: componentProps.onCapabilities,
                t: componentProps.t,
              }),
        ]),
      ]);
    };
  },
  {
    inheritAttrs: false,
    props: [
      "sessionMode",
      "modeUnsupported",
      "allowsFork",
      "offered",
      "pluginAccess",
      "capabilities",
      "disabled",
      "sessionModeControlId",
      "capabilityControlId",
      "onSessionMode",
      "onAllowsFork",
      "onPluginAccess",
      "onCapabilities",
      "t",
    ],
  },
);
