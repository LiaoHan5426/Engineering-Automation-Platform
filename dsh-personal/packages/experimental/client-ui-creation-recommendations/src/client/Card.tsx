import { h, Fragment, useId, defineComponent, computed, shallowRef } from "vue";
import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-renderer/client";
import { z } from "zod";
import {
  Button,
  IconChevronDownOutlineRegular,
  IconWarningTriangleOutlineRegular,
  Menu,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { ActionCardBodyProps } from "@deepseek-ai/dsh-client-ui-action-cards/client";
import type {
  CreationSlot,
  PageData,
  PageDetails,
  PageVerb,
} from "@deepseek-ai/dsh-creation-recommendations/types";
import type { RecommendationKey } from "./locales.ts";
import css from "./Card.module.css";
/** Body props: the frame's card props plus this browser's cost-notice preference. */
export type PageCardProps = ActionCardBodyProps<"creationRecommendations"> & {
  readonly infoDismissed: SnapshotStore<boolean>;
};
type LocationChoice = CreationSlot | "custom";
type CardVerb = PageVerb | "dismiss";
const slotSchema = z.enum(["sidebar-right", "page", "sidebar-left"]);
const detailsSchema = z.object({
  slot: slotSchema,
  initialContent: z.string().optional(),
}) satisfies z.ZodType<PageDetails>;
const dataSchema = z.object({
  slot: slotSchema,
  customLocation: z.string().optional(),
  bundleName: z.string().optional(),
  application: z
    .enum(["applied", "restart-required", "overridden", "failed", "cancelled"])
    .optional(),
}) satisfies z.ZodType<PageData>;
/** Phases with their own status copy. */
const PHASE_KEYS: readonly RecommendationKey[] = [
  "dismissed",
  "replaced",
  "creating",
  "installing",
  "cancelled",
  "installed",
  "kept",
  "removed",
  "failed",
  "interrupted",
  "unconfirmed",
];
/** Refusal reasons with their own copy; any other reason reads as unavailable. */
const REASON_KEYS: readonly RecommendationKey[] = [
  "unknown",
  "access-denied",
  "not-live-root",
  "closing",
  "unavailable",
  "invalid-location",
  "read-only",
  "source-missing",
];
/** Application outcomes have their own copy; the phase copy of failed and cancelled describes creation instead. */
const APPLICATION_KEYS: Readonly<
  Record<Exclude<NonNullable<PageData["application"]>, "applied">, RecommendationKey>
> = {
  "restart-required": "restart-required",
  overridden: "overridden",
  failed: "applicationFailed",
  cancelled: "applicationCancelled",
};
function keyOf(keys: readonly RecommendationKey[], value: string): RecommendationKey | undefined {
  return keys.find((key) => key === value);
}
const LocationPicker = defineComponent(
  (
    props: {
      value: LocationChoice;
      disabled: boolean;
      onChange: (value: LocationChoice) => void;
    } & PropsLocale<"creationRecommendations">,
  ) => {
    const open = shallowRef(false);
    return () => {
      return h(
        Menu,
        {
          open: open.value && !props.disabled,
          portal: true,
          autoFocus: true,
          compact: true,
          listClassName: css.locationMenu!,
          selectedId: props.value,
          onClose: () => {
            open.value = false;
          },
          onSelect: (id) => {
            props.onChange(id as LocationChoice);
            open.value = false;
          },
          items: (["sidebar-right", "page", "sidebar-left", "custom"] as const).map((id) => ({
            id,
            label: h("span", { class: css.locationOption }, [
              h("span", {}, [props.t(id)]),
              h("span", {}, [props.t(`${id}Hint`)]),
            ]),
          })),
        },
        {
          anchor: () =>
            h(
              Button,
              {
                variant: "outline",
                size: "sm",
                disabled: props.disabled,
                className: css.locationButton!,
                "aria-label": `${props.t("location")}: ${props.t(props.value)}`,
                "aria-haspopup": "menu",
                "aria-expanded": open.value && !props.disabled,
                onClick: () => {
                  open.value = ((current) => !current)(open.value);
                },
              },
              {
                default: () => [
                  props.t(props.value),
                  h(IconChevronDownOutlineRegular, { size: 14 }),
                ],
              },
            ),
        },
      );
    };
  },
  { props: ["value", "disabled", "onChange", "t"] },
);
/**
 * Display creation, persistent installation, reversible removal and restoration below the frame's summary.
 * @param props - card, state, actions, folded-text component and notice preference.
 * @returns the card body.
 */
export const PageCardBody = defineComponent(
  (props: PageCardProps) => {
    const details = computed(() => detailsSchema.safeParse(props.proposal.details));
    const parsed = computed(() =>
      props.decision === undefined ? undefined : dataSchema.safeParse(props.decision.data),
    );
    const data = computed(() => (parsed.value?.success === true ? parsed.value.data : undefined));
    const phase = computed(() =>
      props.decision === undefined ? undefined : keyOf(PHASE_KEYS, props.decision.phase),
    );
    const selected = shallowRef<LocationChoice>();
    const custom = shallowRef<string>();
    const info = shallowRef<boolean>();
    const noticeDismissed = useObservableSelector(
      () => props.infoDismissed,
      () => (value) => value,
    );
    const infoId = useId();
    const customId = useId();
    const pending = shallowRef<CardVerb>();
    const error = shallowRef<RecommendationKey>();
    const busy = computed(() => pending.value !== undefined);
    const slot = computed(() =>
      selected.value !== undefined && selected.value !== "custom"
        ? selected.value
        : (data.value?.slot ?? details.value.data!.slot),
    );
    const location = computed(
      () => selected.value ?? (data.value?.customLocation === undefined ? slot.value : "custom"),
    );
    const customLocation = computed(() => custom.value ?? data.value?.customLocation ?? "");
    const offer = computed(
      () =>
        props.decision === undefined ||
        phase.value === "cancelled" ||
        phase.value === "failed" ||
        phase.value === "interrupted" ||
        phase.value === "unconfirmed",
    );
    const infoOpen = computed(() => info.value ?? (offer.value && !noticeDismissed.value));
    const installed = computed(() => phase.value === "installed" || phase.value === "kept");
    const run = async (verb: CardVerb) => {
      pending.value = verb;
      error.value = undefined;
      if (verb === "create" || verb === "dismiss") {
        props.infoDismissed.set(true);
        info.value = false;
      }
      const placement = {
        slot: slot.value,
        ...(location.value === "custom" ? { customLocation: customLocation.value.trim() } : {}),
      };
      try {
        const result = await props.act(
          verb,
          verb === "create" || verb === "dismiss" ? placement : undefined,
        );
        if (result === undefined) error.value = "transport";
        else if (result.status === "refused" || result.status === "unconfirmed")
          error.value = keyOf(REASON_KEYS, result.reason) ?? "unavailable";
      } catch {
        // A lost reply does not prove failure; replay supplies the durable decision.
        error.value = "transport";
      } finally {
        pending.value = undefined;
      }
    };
    return () => {
      if (!details.value.success) return h("div", { class: css.body }, [props.summary]);
      return h(Fragment, {}, [
        h("header", { class: css.header }, [
          h("span", { class: css.heading }, [
            props.t("heading"),
            h(
              Tooltip,
              {
                label: props.t("creationInfo"),
                side: "top",
                portal: true,
                disabled: infoOpen.value,
              },
              {
                default: () => [
                  h(
                    Button,
                    {
                      variant: "ghost",
                      size: "sm",
                      className: css.infoButton!,
                      "aria-label": props.t("creationInfo"),
                      "aria-expanded": infoOpen.value,
                      "aria-controls": infoId,
                      onClick: () => {
                        const wasOpen = infoOpen.value;
                        info.value = !wasOpen;
                        if (wasOpen) props.infoDismissed.set(true);
                      },
                    },
                    { default: () => [h(IconWarningTriangleOutlineRegular, { size: 14 })] },
                  ),
                ],
              },
            ),
          ]),
          phase.value !== undefined &&
            h("span", { role: "status", class: css.phase, "data-phase": phase.value }, [
              props.t(phase.value),
            ]),
        ]),
        infoOpen.value &&
          h("div", { id: infoId, role: "note", class: css.info }, [
            h("p", {}, [props.t("creationMethod")]),
            h("p", {}, [h("strong", {}, [props.t("creationCost")])]),
            h("p", {}, [props.t("creationBackground")]),
            data.value?.bundleName !== undefined && h("p", {}, [props.t("sourceRetained")]),
          ]),
        h("div", { class: css.body }, [
          props.summary,
          details.value.data.initialContent !== undefined &&
            h("div", { class: css.content }, [
              h("span", { class: css.contentLabel }, [props.t("initialContent")]),
              h(props.Folded, {
                text: details.value.data.initialContent,
                expandLabel: props.t("expandContent"),
                collapseLabel: props.t("collapseContent"),
              }),
            ]),
          data.value?.application !== undefined &&
            data.value.application !== "applied" &&
            phase.value !== "failed" &&
            h("p", { role: "status", class: css.status }, [
              props.t(APPLICATION_KEYS[data.value.application]),
            ]),
          error.value !== undefined &&
            h("p", { role: "alert", class: css.status }, [props.t(error.value)]),
          offer.value
            ? h("div", { class: css.controls }, [
                h("div", { class: css.locationRow }, [
                  h("span", { class: css.locationLabel }, [props.t("location")]),
                  h(LocationPicker, {
                    value: location.value,
                    disabled: busy.value,
                    onChange: (value: LocationChoice) => {
                      selected.value = value;
                    },
                    t: props.t,
                  }),
                ]),
                location.value === "custom" &&
                  h("div", { class: css.customLocation }, [
                    h("label", { for: customId, class: css.locationLabel }, [
                      props.t("customLabel"),
                    ]),
                    h("textarea", {
                      id: customId,
                      value: customLocation.value,
                      rows: 2,
                      maxLength: 1000,
                      disabled: busy.value,
                      placeholder: props.t("customPlaceholder"),
                      onInput: (event) => {
                        custom.value = (event.currentTarget as HTMLTextAreaElement).value;
                      },
                    }),
                  ]),
                h("footer", { class: css.footer }, [
                  h("div", { class: css.actions }, [
                    h(
                      Button,
                      {
                        variant: "ghost",
                        size: "sm",
                        disabled: busy.value,
                        onClick: () => {
                          void run("dismiss");
                        },
                      },
                      { default: () => [props.t("dismiss")] },
                    ),
                    h(
                      Button,
                      {
                        variant: "primary",
                        size: "sm",
                        disabled:
                          busy.value ||
                          (location.value === "custom" && customLocation.value.trim() === ""),
                        onClick: () => {
                          void run("create");
                        },
                      },
                      {
                        default: () => [
                          props.t(
                            pending.value === "create"
                              ? "starting"
                              : props.decision === undefined
                                ? "create"
                                : "retry",
                          ),
                        ],
                      },
                    ),
                  ]),
                ]),
              ])
            : h("div", { class: css.placement }, [
                h("p", { class: css.description }, [
                  props.t("location"),
                  " · ",
                  data.value?.customLocation ??
                    props.t(data.value?.slot ?? details.value.data!.slot),
                ]),
                phase.value === "creating" &&
                  h(
                    Button,
                    {
                      variant: "ghost",
                      size: "sm",
                      disabled: busy.value,
                      onClick: () => {
                        void run("cancel");
                      },
                    },
                    {
                      default: () => [
                        props.t(pending.value === "cancel" ? "cancelling" : "cancel"),
                      ],
                    },
                  ),
                installed.value &&
                  h(
                    Button,
                    {
                      variant: "ghost",
                      size: "sm",
                      disabled: busy.value,
                      onClick: () => {
                        void run("undo");
                      },
                    },
                    { default: () => [props.t("undo")] },
                  ),
                phase.value === "removed" &&
                  h(
                    Button,
                    {
                      variant: "primary",
                      size: "sm",
                      disabled: busy.value,
                      onClick: () => {
                        void run("restore");
                      },
                    },
                    {
                      default: () => [
                        props.t(pending.value === "restore" ? "restoring" : "restore"),
                      ],
                    },
                  ),
              ]),
        ]),
      ]);
    };
  },
  {
    props: ["proposal", "decision", "sessionId", "summary", "Folded", "act", "t", "infoDismissed"],
  },
);
