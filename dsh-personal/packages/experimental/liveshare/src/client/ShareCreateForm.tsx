import { computed, defineComponent, h, shallowRef, useId } from "vue";

/**
 * The share dialog's create form: the session permission, fork switch, and lifetime, plus the one
 * create action that publishes the Session through the host.
 *
 * @module @deepseek-ai/dsh-experimental-liveshare/src/client/ShareCreateForm
 */
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { CreatedShare } from "../share-api-types.ts";
import type { NS } from "./locales.ts";
import type { OwnerShares } from "./owner-shares.ts";
import { mayCreateShare, type OwnerIdentityStatus } from "./owner-identity.ts";
import type { RelayConnectivity, RelayPermission } from "./share-relay-address.ts";
import { selectionForOffered, type PluginAccess } from "./ShareCapabilitiesPicker.tsx";
import { SharePermissionFields } from "./SharePermissionFields.tsx";
import type { OfferedPlugin, ViewerPluginPolicy } from "./share-types.ts";
import { readSessionMode, type ViewerSessionMode } from "./viewer-capabilities.ts";
import css from "./ShareDialog.module.css";
/** What the Host reported about the values the create request carried. */
export interface CreatedShareInfo {
  /** Session permission the Host stored, read through this build's vocabulary. */
  readonly reportedMode: ViewerSessionMode | undefined;
  /** Session permission the owner asked for. */
  readonly requestedMode: ViewerSessionMode;
  /** Whether the create request carried the fork switch. */
  readonly allowsFork: boolean;
}
/** Inputs the dialog supplies to its create form. */
export interface ShareCreateFormOptions {
  /** Owner share management the create action calls. */
  readonly shares: OwnerShares;
  /** Session the share exposes. */
  readonly sessionId: SessionId;
  /** Human-facing Session title sent with the share. */
  readonly sessionTitle: string;
  /** What the connectivity step established for the address in force. */
  readonly connectivity: RelayConnectivity;
  /** What the permission step established for this host at that address. */
  readonly permission: RelayPermission;
  /** The identity status the host reported for the address in force. */
  readonly ownerIdentity: OwnerIdentityStatus;
  /** Plugin endpoints the mounted plugins currently offer; none hides the endpoint control. */
  readonly offered: readonly OfferedPlugin[];
  /** Ask whether the address in force answers at all. */
  readonly testConnectivity: () => Promise<boolean>;
  /** Ask whether this host may publish a share at the address in force. */
  readonly testPermission: () => Promise<boolean>;
  /** State why the create action could not run, or clear the dialog's error with an empty line. */
  readonly onError: (message: string) => void;
  /** Adopt the record the host created, before its own listing confirms it. */
  readonly onCreated: (created: CreatedShare, info: CreatedShareInfo) => Promise<void>;
  /** The line the identity's own state states when it refuses creation. */
  readonly identityStateLine: () => string;
  /** Localized copy. */
  readonly t: PropsLocale<typeof NS>["t"];
}
/** Create-form state and the one create action the dialog's footer runs. */
export interface ShareCreateFormState {
  /** Whether the create request is in flight. */
  readonly busy: boolean;
  /** Session permission the share this dialog creates carries. */
  readonly sessionMode: ViewerSessionMode;
  /** The share's own fork switch. */
  readonly allowsFork: boolean;
  /** Global switch over every installed plugin's methods. */
  readonly pluginAccess: PluginAccess;
  /** Plugin endpoints the share this dialog creates exposes; closed until the owner selects one. */
  readonly capabilities: readonly ViewerPluginPolicy[];
  /** Plugin endpoints the mounted plugins currently offer. */
  readonly offered: readonly OfferedPlugin[];
  /** What the Host reported about the fork opt-in, stated when it cannot store it. */
  readonly modeOutcome: "granted" | "notGranted" | undefined;
  /** Base id the create form's session permission tabs derive from. */
  readonly sessionModeControlId: string;
  /** Base id the create form's plugin-endpoint tabs derive from. */
  readonly capabilityControlId: string;
  /** Pick the session permission the share this dialog creates carries. */
  readonly setSessionMode: (mode: ViewerSessionMode) => void;
  /** Set the share's own fork switch. */
  readonly setAllowsFork: (value: boolean) => void;
  /** Record the global plugin switch. */
  readonly setPluginAccess: (access: PluginAccess) => void;
  /** Record the plugin endpoints the share this dialog creates exposes. */
  readonly setCapabilities: (capabilities: readonly ViewerPluginPolicy[]) => void;
  /** Publish the Session through the host and adopt the created record. */
  readonly create: () => Promise<void>;
  /** Whether a create request is running, readable from the close handler's closure. */
  readonly isCreating: () => boolean;
}
/**
 * Own the create form's values and the one create action.
 * @param options - Owner share management, the Session, the checks, and the adoption hooks.
 * @returns The form's values, ids, and create action.
 */
export function useShareCreateForm(options: ShareCreateFormOptions): ShareCreateFormState {
  const busyRef = shallowRef(false);
  const setBusy = (
    value: typeof busyRef.value | ((previous: typeof busyRef.value) => typeof busyRef.value),
  ): void => {
    busyRef.value = typeof value === "function" ? value(busyRef.value) : value;
  };
  const pluginAccessRef = shallowRef<PluginAccess>("none");
  const setPluginAccess = (
    value:
      | typeof pluginAccessRef.value
      | ((previous: typeof pluginAccessRef.value) => typeof pluginAccessRef.value),
  ): void => {
    pluginAccessRef.value = typeof value === "function" ? value(pluginAccessRef.value) : value;
  };
  const capabilitiesRef = shallowRef<readonly ViewerPluginPolicy[]>([]);
  const setCapabilities = (
    value:
      | typeof capabilitiesRef.value
      | ((previous: typeof capabilitiesRef.value) => typeof capabilitiesRef.value),
  ): void => {
    capabilitiesRef.value = typeof value === "function" ? value(capabilitiesRef.value) : value;
  };
  const sessionModeRef = shallowRef<ViewerSessionMode>("view");
  const setSessionMode = (
    value:
      | typeof sessionModeRef.value
      | ((previous: typeof sessionModeRef.value) => typeof sessionModeRef.value),
  ): void => {
    sessionModeRef.value = typeof value === "function" ? value(sessionModeRef.value) : value;
  };
  const allowsForkRef = shallowRef(false);
  const setAllowsFork = (
    value:
      | typeof allowsForkRef.value
      | ((previous: typeof allowsForkRef.value) => typeof allowsForkRef.value),
  ): void => {
    allowsForkRef.value = typeof value === "function" ? value(allowsForkRef.value) : value;
  };
  const modeOutcomeRef = shallowRef<"granted" | "notGranted" | undefined>();
  const setModeOutcome = (
    value:
      | typeof modeOutcomeRef.value
      | ((previous: typeof modeOutcomeRef.value) => typeof modeOutcomeRef.value),
  ): void => {
    modeOutcomeRef.value = typeof value === "function" ? value(modeOutcomeRef.value) : value;
  };
  const creating = shallowRef(false);
  const sessionModeControlId = useId();
  const capabilityControlId = useId();
  const create = async (): Promise<void> => {
    if (creating.value) return;
    /* v8 ignore next 4 -- the create control is disabled in every state this check refuses. */
    if (!mayCreateShare(options.ownerIdentity)) {
      options.onError(options.identityStateLine());
      return;
    }
    creating.value = true;
    try {
      setBusy(true);
      options.onError("");
      // The flow is ordered and each step is confirmed here rather than trusted from an earlier
      // click: an address that does not answer cannot be verified, and a registration the Relay will
      // refuse cannot be created.
      if (options.connectivity !== "ok" && !(await options.testConnectivity())) return;
      if (
        options.permission !== "ok" &&
        options.permission !== "warn" &&
        !(await options.testPermission())
      )
        return;
      const created = await options.shares.create({
        sessionId: options.sessionId,
        sessionTitle: options.sessionTitle,
        // The tier and the fork switch travel with the share they belong to, and the tier travels even
        // at the narrowest one: a Host that cannot store the field states so in its answer rather than
        // dropping it, and the page never assumes more than the Host reported.
        sessionMode: sessionModeRef.value,
        allowsFork: allowsForkRef.value,
      });
      // A Host whose share state another running process holds refuses the write; that is the owner's
      // to act on in the process holding it, not an unreachable share service.
      if (!created.ok) {
        options.onError(
          created.error.code === "liveshareShares/owner-state-held"
            ? options.t("dialog.ownerStateHeld")
            : options.t("dialog.hostUnavailable"),
        );
        return;
      }
      const data = created.value;
      // The Host's own record is the only statement of what it stored. Its answer carries the stored
      // tier, read through this build's vocabulary, so a Host that still names the withdrawn
      // `fork-readonly` tier is read as the view tier it now is rather than as a mismatch.
      const reported = readSessionMode(data.sessionMode);
      setModeOutcome(reported === sessionModeRef.value ? "granted" : "notGranted");
      // Plugin endpoints are a second host write with their own validation; a failure leaves the
      // created share usable and names the endpoint save the owner can retry in Share permissions.
      const selected = selectionForOffered(options.offered, capabilitiesRef.value);
      /* v8 ignore start -- the create dialog has no offered plugin in product fixtures; edit tests cover this write. */
      if (options.offered.length > 0 && pluginAccessRef.value !== "none") {
        try {
          const endpoints = await options.shares.setCapabilities({
            shareId: data.shareId,
            viewerPluginAccess: pluginAccessRef.value,
            viewerPlugins: selected,
          });
          if (!endpoints.ok) options.onError(options.t("dialog.capabilities.createFailed"));
        } catch {
          // The share exists; only the endpoint write failed, so its link still reaches the owner.
          options.onError(options.t("dialog.capabilities.createFailed"));
        }
      }
      /* v8 ignore stop */
      await options.onCreated(data, {
        reportedMode: reported,
        requestedMode: sessionModeRef.value,
        allowsFork: allowsForkRef.value,
      });
    } catch {
      options.onError(options.t("dialog.hostUnavailable"));
    } finally {
      creating.value = false;
      setBusy(false);
    }
  };
  return {
    get busy() {
      return busyRef.value;
    },
    get sessionMode() {
      return sessionModeRef.value;
    },
    get allowsFork() {
      return allowsForkRef.value;
    },
    get pluginAccess() {
      return pluginAccessRef.value;
    },
    get capabilities() {
      return capabilitiesRef.value;
    },
    get offered() {
      return options.offered;
    },
    get modeOutcome() {
      return modeOutcomeRef.value;
    },
    get sessionModeControlId() {
      return sessionModeControlId;
    },
    get capabilityControlId() {
      return capabilityControlId;
    },
    get setSessionMode() {
      return setSessionMode;
    },
    get setAllowsFork() {
      return setAllowsFork;
    },
    get setPluginAccess() {
      return setPluginAccess;
    },
    get setCapabilities() {
      return setCapabilities;
    },
    get create() {
      return create;
    },
    get isCreating() {
      return () => creating.value;
    },
  };
}
/** Props for the create form fields the dialog renders before the share exists. */
export interface ShareCreateFormProps extends PropsLocale<typeof NS> {
  /** The form's values and setters, as `useShareCreateForm` owns them. */
  readonly form: ShareCreateFormState;
  /** Whether a prerequisite (an owner sign-in) still makes every field unavailable. */
  readonly disabled?: boolean;
}
/**
 * Render the create form's session permission, fork switch, and lifetime fields.
 * @param props - The form state and localized copy.
 * @returns The fields shown while no share exists yet.
 */
export const ShareCreateForm = defineComponent(
  (componentProps: ShareCreateFormProps) => {
    const busyRef = computed(() => componentProps.form.busy);
    const sessionModeRef = computed(() => componentProps.form.sessionMode);
    const allowsForkRef = computed(() => componentProps.form.allowsFork);
    const pluginAccessRef = computed(() => componentProps.form.pluginAccess);
    const capabilitiesRef = computed(() => componentProps.form.capabilities);
    const offeredRef = computed(() => componentProps.form.offered);
    const sessionModeControlIdRef = computed(() => componentProps.form.sessionModeControlId);
    const capabilityControlIdRef = computed(() => componentProps.form.capabilityControlId);
    const unavailableRef = computed(() => (componentProps.disabled ?? false) || busyRef.value);
    return () => {
      return h("div", { class: css.permissions }, [
        h(SharePermissionFields, {
          sessionMode: sessionModeRef.value,
          allowsFork: allowsForkRef.value,
          offered: offeredRef.value,
          pluginAccess: pluginAccessRef.value,
          capabilities: capabilitiesRef.value,
          disabled: unavailableRef.value,
          sessionModeControlId: sessionModeControlIdRef.value,
          capabilityControlId: capabilityControlIdRef.value,
          onSessionMode: (mode) => {
            componentProps.form.setSessionMode(mode);
          },
          onAllowsFork: (value) => {
            componentProps.form.setAllowsFork(value);
          },
          onPluginAccess: (next) => {
            componentProps.form.setPluginAccess(next);
          },
          onCapabilities: (next) => {
            componentProps.form.setCapabilities(next);
          },
          t: componentProps.t,
        }),
        h("div", { class: css.row }, [
          h("span", { class: css.rowLabel }, [componentProps.t("dialog.expiry")]),
          h("span", { class: css.description }, [componentProps.t("dialog.expiry.never")]),
        ]),
      ]);
    };
  },
  { inheritAttrs: false, props: ["form", "disabled", "t"] },
);
