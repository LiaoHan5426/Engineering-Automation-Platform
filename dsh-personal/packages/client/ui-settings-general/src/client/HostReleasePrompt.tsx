/** Confirmation shown when this page reconnects to a Host running another release. */
import { h, Fragment, defineComponent } from "vue";
import clsx from "clsx";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ClientReleaseChange, WebBootRelease } from "@deepseek-ai/dsh-client-modules/client";
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry).
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import css from "./HostReleasePrompt.module.css";
/** Registrant-private face: the page's release change and its two decisions. */
export type HostReleasePromptInjected = {
  /** Keep this page at its boot release and stop asking about the connected Host's release. */
  dismissRelease: () => void;
  /** Reload the page from the Host. */
  reloadPage: () => void;
  hooks: {
    /** Host release change owned by the page's module system. */
    releaseChange: HostObservable<ClientReleaseChange | undefined>;
  };
};
/** Overlay props: the root overlay owner share, the `settings` copy, and the injected face. */
export type HostReleasePromptProps = PropsRuntime<"shell.overlay"> &
  PropsLocale<"settings"> &
  InjectFace<HostReleasePromptInjected>;
/**
 * Name both ends of one release transition: their versions when those differ, otherwise their commits.
 * @param from - release the transition starts at.
 * @param to - release the transition ends at.
 * @param unknown - text for a release or field the Host did not publish.
 * @returns the start and end text.
 */
function transitionText(
  from: WebBootRelease | undefined,
  to: WebBootRelease | undefined,
  unknown: string,
): [string, string] {
  const field = from?.version !== to?.version ? "version" : "commit";
  return [from?.[field] ?? unknown, to?.[field] ?? unknown];
}
/**
 * One labelled transition line. A completed transition fades its start; a pending one fades its end.
 * @param props - row label, both ends, and completion.
 * @returns the row's cells for the shared transition grid.
 */
function Transition({
  label,
  from,
  to,
  done,
}: {
  label: string;
  from: string;
  to: string;
  done: boolean;
}) {
  return h(Fragment, null, [
    h("span", { class: css.label }, [label]),
    h("span", { class: clsx(css.release, done ? css.faded : css.solid) }, [from]),
    h("span", { "aria-hidden": "true", class: clsx(css.line, done ? css.done : css.pending) }),
    h("span", { class: clsx(css.release, done ? css.solid : css.faded) }, [to]),
  ]);
}
/**
 * Ask whether to reload after the Host changed releases; closing the dialog keeps the page.
 * The service line shows the Host's completed switch from its previous release; the page line shows the
 * switch from the page's boot release that only a reload completes.
 * @param props - the release change, both decisions, and localized copy.
 * @returns the dialog while a change is announced; otherwise nothing.
 */
export const HostReleasePrompt = defineComponent(
  (props: HostReleasePromptProps) => {
    const change = props.useReleaseChange((value) => value);
    return () => {
      const current = change.value;
      if (current === undefined) return null;
      const unknown = props.t("hostRelease.unknown");
      const [serviceFrom, serviceTo] = transitionText(current.previous, current.host, unknown);
      const [pageFrom, pageTo] = transitionText(current.page, current.host, unknown);
      return h(
        Modal,
        {
          open: true,
          title: props.t("hostRelease.title"),
          description: props.t("hostRelease.description"),
          closeLabel: props.t("hostRelease.later"),
          onClose: props.dismissRelease,
          className: clsx(css.dialog),
        },
        {
          footer: () => [
            h(
              Button,
              { variant: "outline", "data-modal-autofocus": "", onClick: props.dismissRelease },
              { default: () => props.t("hostRelease.later") },
            ),
            h(
              Button,
              { variant: "primary", onClick: props.reloadPage },
              { default: () => props.t("hostRelease.reload") },
            ),
          ],
          default: () =>
            h("div", { class: css.transitions }, [
              Transition({
                label: props.t("hostRelease.service"),
                from: serviceFrom,
                to: serviceTo,
                done: true,
              }),
              Transition({
                label: props.t("hostRelease.page"),
                from: pageFrom,
                to: pageTo,
                done: false,
              }),
            ]),
        },
      );
    };
  },
  { inheritAttrs: false, props: ["useReleaseChange", "dismissRelease", "reloadPage", "t"] },
);
