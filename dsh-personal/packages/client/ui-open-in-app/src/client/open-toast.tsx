import { h, defineComponent } from "vue";
/** Native-open feedback that survives the initiating panel: mobile success and all failures. */
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  IconWarningOutlineRegular,
  isMobileDevice,
  Toast,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { NS } from "./locales.ts";
import type { OpenInAppOutcome } from "./outcome.ts";
/** One announced gesture; `seq` keys the banner so a repeat restarts it. */
export type OpenInAppToastState = Exclude<
  OpenInAppOutcome,
  {
    kind: "skipped";
  }
> & {
  readonly seq: number;
};
/** Store every contribution reports into and the overlay entry reads. */
export interface OpenInAppToastSource {
  /** Current notice for the overlay entry, or null while none shows. */
  readonly hooks: {
    readonly toast: HostObservable<OpenInAppToastState | null>;
  };
  /**
   * Announce failures on every device and acknowledged opens or reveals on mobile.
   * Desktop successes and skipped gestures leave the current notice unchanged.
   * @param outcome - settled native-open result.
   */
  readonly report: (outcome: OpenInAppOutcome) => void;
  /** Clear the shown notice. */
  readonly dismiss: () => void;
}
/**
 * Create the one outcome store the overlay entry shows.
 * @returns the observable notice with its report and dismiss actions.
 */
export function createOpenInAppToastSource(): OpenInAppToastSource {
  const store = createSnapshotStore<OpenInAppToastState | null>(null);
  let seq = 0;
  return {
    hooks: { toast: store },
    report: (outcome) => {
      if (outcome.kind === "skipped") return;
      if (outcome.kind !== "failed" && !isMobileDevice()) return;
      seq += 1;
      store.set({ ...outcome, seq });
    },
    dismiss: () => {
      store.set(null);
    },
  };
}
/** Props of the `shell.overlay` entry: the notice store, its dismissal, and localized copy. */
export type OpenInAppToastProps = PropsRuntime<"shell.overlay"> &
  PropsLocale<typeof NS> &
  InjectFace<Omit<OpenInAppToastSource, "report">>;
/**
 * Render a mobile handoff confirmation or a native-open failure.
 * @param props - the notice hook, its dismissal, and the locale seat.
 * @returns the banner on display, or null.
 */
export const OpenInAppToast = defineComponent(
  (props: OpenInAppToastProps) => {
    const current = props.useToast((value) => value);
    return () => {
      const toast = current.value;
      const { dismiss, t } = props;
      if (toast === null) return null;
      const key = `open-in-app-${String(toast.seq)}`;
      if (toast.kind === "failed") {
        return h(
          Toast,
          {
            key: key,
            text: t(toast.failure === "revealError" ? "path.revealError" : "path.openError"),
            icon: h(IconWarningOutlineRegular, undefined, undefined),
            onDone: dismiss,
          },
          undefined,
        );
      }
      return h(
        Toast,
        {
          key: key,
          text: t(toast.kind === "opened" ? "path.opened" : "path.revealed"),
          tone: "success",
          onDone: dismiss,
        },
        undefined,
      );
    };
  },
  { name: "OpenInAppToast", inheritAttrs: false, props: ["useToast", "dismiss", "t"] },
);
