import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";

/**
 * Owner identity and Relay sign-in state for the share dialog.
 *
 * The owner host is the authority: it verifies the login, holds the credential, renews it while the
 * authorization lasts, and refuses a share it cannot attribute to a verified identity. This hook only
 * states what the host reported, and states nothing it did not report — an unreadable or absent answer
 * is `unknown`, never a guess from a display name.
 *
 * @module @deepseek-ai/dsh-experimental-liveshare/src/client/owner-identity-login
 */
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { identitySubjectLabel } from "../owner-identity.ts";
import type { NS } from "./locales.ts";
import {
  readOwnerIdentity,
  UNKNOWN_OWNER_IDENTITY,
  type OwnerIdentityStatus,
} from "./owner-identity.ts";
import {
  beginOwnerLogin,
  hostOwnerLogin,
  type OwnerLoginFailure,
  type OwnerLoginPhase,
} from "./owner-login.ts";
import type { OwnerShares } from "./owner-shares.ts";
/** One sign-in attempt's state, or nothing while no attempt was started. */
export interface OwnerLoginAttempt {
  readonly phase: OwnerLoginPhase;
  readonly failure?: OwnerLoginFailure;
}
/** Inputs the share dialog supplies to its owner identity state. */
export interface OwnerIdentityLoginOptions {
  /** Owner share management the dialog addresses. */
  readonly shares: OwnerShares;
  /** Address in force, as the host named it; the identity status is keyed on this address. */
  readonly relay: string | undefined;
  /** Localized copy. */
  readonly t: PropsLocale<typeof NS>["t"];
  /** Clear the states a finished sign-in replaced, before the status is re-read. */
  readonly onVerified: () => void;
}
/** Owner identity and sign-in state the dialog's address row and status line present. */
export interface OwnerIdentityLogin {
  /** The status the host reported for the address in force. */
  readonly status: OwnerIdentityStatus;
  /** The one attempt this dialog started, or nothing while none was started. */
  readonly login: OwnerLoginAttempt | undefined;
  /** Whether a started attempt is still in flight. */
  readonly busy: boolean;
  /** Whether the host reported an identity this page must verify before it may create a share. */
  readonly needsVerification: boolean;
  /** Re-read the identity status for the address in force. */
  readonly refresh: () => void;
  /** Start the one sign-in attempt this dialog runs, at the address in force. */
  readonly begin: () => void;
  /**
   * Name the verified identity row shows: the host's name, or a label derived from the subject.
   * @returns The name, or an empty string when the host reported a subject-less identity.
   */
  readonly name: () => string;
  /** What an identity row that is not verified states instead of a name, and what to do about it. */
  readonly stateLine: () => string;
  /**
   * Credential detail a verified row keeps as a tooltip rather than a stacked line.
   * @returns The expiry line, with the renewal note when the host reported one.
   */
  readonly tooltip: () => string | undefined;
  /**
   * Copy for the phase of the attempt in flight, and the reason a failed one states.
   * @param phase - Phase the attempt reported.
   * @param failure - Reason it ended without a verified identity, when it stated one.
   * @returns The line the status area states for that attempt.
   */
  readonly line: (phase: OwnerLoginPhase, failure: OwnerLoginFailure | undefined) => string;
}
/**
 * Read the owner identity the host reports and drive its one Relay sign-in attempt.
 * @param options - Owner share management, the address in force, localized copy, and the verified hook.
 * @returns The identity status, the attempt, and the copy its row states.
 */
export function useOwnerIdentityLogin(options: OwnerIdentityLoginOptions): OwnerIdentityLogin {
  const ownerIdentityRef = shallowRef<OwnerIdentityStatus>(UNKNOWN_OWNER_IDENTITY);
  const setOwnerIdentity = (
    value:
      | typeof ownerIdentityRef.value
      | ((previous: typeof ownerIdentityRef.value) => typeof ownerIdentityRef.value),
  ): void => {
    ownerIdentityRef.value = typeof value === "function" ? value(ownerIdentityRef.value) : value;
  };
  const identityReadRef = shallowRef(0);
  const setIdentityRead = (
    value:
      | typeof identityReadRef.value
      | ((previous: typeof identityReadRef.value) => typeof identityReadRef.value),
  ): void => {
    identityReadRef.value = typeof value === "function" ? value(identityReadRef.value) : value;
  };
  const loginRef = shallowRef<OwnerLoginAttempt>();
  const setLogin = (
    value: typeof loginRef.value | ((previous: typeof loginRef.value) => typeof loginRef.value),
  ): void => {
    loginRef.value = typeof value === "function" ? value(loginRef.value) : value;
  };
  const loginAttempt = shallowRef<{
    cancel(): void;
  }>();
  const mounted = shallowRef(true);
  onMounted(() => {
    const dispose = (() => () => {
      mounted.value = false;
      loginAttempt.value?.cancel();
    })();
    if (typeof dispose === "function") onBeforeUnmount(dispose);
  });
  onMounted(() => {
    watch(
      () => [options.relay, identityReadRef.value, options.shares],
      (_values, _old, onCleanup) => {
        const dispose = (() => {
          const relay = options.relay;
          if (relay === undefined) return;
          let cancelled = false;
          // The status on hand describes whichever address it was read for. Naming the new address here
          // keeps a switched Relay from presenting the previous address's verified identity while the new
          // read is in flight, while a re-read of the same address keeps what it already stated.
          setOwnerIdentity((current) =>
            current.relay === relay ? current : { state: "unknown", relay: relay },
          );
          const load = async (): Promise<void> => {
            try {
              const reported = await options.shares.identity({ relay: relay });
              if (!cancelled)
                setOwnerIdentity(
                  readOwnerIdentity(reported.ok ? reported.value : undefined, relay),
                );
            } catch {
              if (!cancelled) setOwnerIdentity({ state: "unknown", relay: relay });
            }
          };
          void load();
          // The verify call to action leaves this page; whatever the Relay hands back on return, the host's
          // own answer is the fact this row states, so coming back re-reads it instead of trusting a guess.
          const refresh = (): void => {
            if (!document.hidden) setIdentityRead((count) => count + 1);
          };
          window.addEventListener("focus", refresh);
          document.addEventListener("visibilitychange", refresh);
          return () => {
            cancelled = true;
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
          };
        })();
        if (typeof dispose === "function") onCleanup(dispose);
      },
      { immediate: true, flush: "post" },
    );
  });
  const begin = (): void => {
    /* v8 ignore next -- both sign-in controls are disabled until the Host named an address. */
    if (options.relay === undefined || options.relay === "") return;
    loginAttempt.value?.cancel();
    setLogin({ phase: "opening" });
    loginAttempt.value = beginOwnerLogin({
      host: hostOwnerLogin(options.relay),
      page: window,
      report: (phase, failure) => {
        if (!mounted.value) return;
        setLogin({ phase, ...(failure === undefined ? {} : { failure }) });
        // The host's own answer is the fact this row states, so a finished attempt reads it again.
        // The permission result belonged to the credential that attempt replaced, so it is re-asked.
        if (phase === "verified") {
          options.onVerified();
          setIdentityRead((count) => count + 1);
        }
      },
    });
  };
  const refresh = (): void => {
    setIdentityRead((count) => count + 1);
  };
  const needsVerificationRef = computed(
    () =>
      ownerIdentityRef.value.state === "expired" ||
      ownerIdentityRef.value.state === "unverified" ||
      ownerIdentityRef.value.state === "relay-changed",
  );
  const name = (): string => {
    if (ownerIdentityRef.value.displayName !== undefined) return ownerIdentityRef.value.displayName;
    return ownerIdentityRef.value.subjectId === undefined
      ? ""
      : identitySubjectLabel(ownerIdentityRef.value.subjectId);
  };
  const stateLine = (): string => {
    if (ownerIdentityRef.value.state === "expired") return options.t("dialog.identity.expired");
    if (ownerIdentityRef.value.state === "relay-changed")
      return options.t("dialog.identity.relayChanged");
    if (ownerIdentityRef.value.state === "relay-unsupported")
      return options.t("dialog.identity.relayUnsupported");
    if (ownerIdentityRef.value.state === "unverified")
      return options.t("dialog.identity.unverified");
    return options.t("dialog.identity.unknown");
  };
  const tooltip = (): string | undefined => {
    if (
      ownerIdentityRef.value.state !== "verified" ||
      ownerIdentityRef.value.expiresAt === undefined
    )
      return undefined;
    const expiry = options.t("dialog.identity.expires", {
      time: new Date(ownerIdentityRef.value.expiresAt).toLocaleString(),
    });
    return ownerIdentityRef.value.renewed === true
      ? `${expiry} · ${options.t("dialog.identity.renewed")}`
      : expiry;
  };
  const line = (phase: OwnerLoginPhase, failure: OwnerLoginFailure | undefined): string => {
    if (phase === "opening") return options.t("dialog.identity.loginOpening");
    if (phase === "waiting") return options.t("dialog.identity.loginWaiting");
    if (phase === "verifying") return options.t("dialog.identity.loginVerifying");
    if (failure === "cancelled") return options.t("dialog.identity.loginCancelled");
    if (failure === "expired") return options.t("dialog.identity.loginExpired");
    if (failure === "mismatch") return options.t("dialog.identity.loginMismatch");
    if (failure === "replayed") return options.t("dialog.identity.loginReplayed");
    if (failure === "unavailable") return options.t("dialog.identity.loginUnavailable");
    if (failure === "blocked") return options.t("dialog.identity.loginBlocked");
    return options.t("dialog.identity.loginFailed");
  };
  return {
    get status() {
      return ownerIdentityRef.value;
    },
    get login() {
      return loginRef.value;
    },
    get busy() {
      return (
        loginRef.value !== undefined &&
        loginRef.value.phase !== "failed" &&
        loginRef.value.phase !== "verified"
      );
    },
    get needsVerification() {
      return needsVerificationRef.value;
    },
    get refresh() {
      return refresh;
    },
    get begin() {
      return begin;
    },
    get name() {
      return name;
    },
    get stateLine() {
      return stateLine;
    },
    get tooltip() {
      return tooltip;
    },
    get line() {
      return line;
    },
  };
}
