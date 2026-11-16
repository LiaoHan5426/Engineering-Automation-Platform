import { h, Fragment, useId, defineComponent, computed, shallowRef, watch } from "vue";
import { useObservableSelector } from "@deepseek-ai/dsh-client-ui-renderer/client";
import { z } from "zod";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { LocalizedText } from "@deepseek-ai/dsh-package-manifest";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { ToolCallId } from "@deepseek-ai/dsh-llm/types";
import type { ActionCardBodyProps } from "@deepseek-ai/dsh-client-ui-action-cards/client";
import type {
  PluginDetails,
  RecommendationDetails,
} from "@deepseek-ai/dsh-plugin-recommendations/types";
import type { RecommendationKey } from "./locales.ts";
import css from "./Card.module.css";
/** Catalog text the Host returned for an available plugin. */
export type CatalogDetails = Extract<
  RecommendationDetails,
  {
    readonly status: "available";
  }
>;
/** Plugin-lifetime services the body uses besides the frame's props. */
export interface PluginCardServices {
  /** Catalog text by plugin name, kept for this plugin's lifetime so later cards of the same plugin render it at once. */
  readonly catalog: SnapshotStore<Readonly<Record<string, CatalogDetails>>>;
  /**
   * Read the current catalog text of a card's plugin.
   * @param sessionId - the displayed Session.
   * @param callId - the card's call id.
   * @returns the Host's answer, or undefined when the reply was lost.
   */
  readonly describe: (
    sessionId: SessionId,
    callId: ToolCallId,
  ) => Promise<RecommendationDetails | undefined>;
  /** Open the plugin's details page without enabling it. */
  readonly openDetails: (packageName: string) => void;
  /** Pick the interface language's text. */
  readonly resolveText: (text: LocalizedText) => string;
}
/** Body props: the frame's card props plus the plugin-lifetime services. */
export type PluginCardProps = ActionCardBodyProps<"pluginRecommendations"> & PluginCardServices;
type CardVerb = "enable" | "dismiss";
const detailsSchema = z.object({ name: z.string() }) satisfies z.ZodType<PluginDetails>;
/** Recorded decision data the body reads; see `PluginData` for its meaning. */
const dataSchema = z.object({
  application: z.literal("restart-required").optional(),
  errorCode: z.string().optional(),
});
type CardData = z.infer<typeof dataSchema>;
/** Phases that still offer Enable and Not now; any other recorded phase is settled. */
const OPEN_PHASES: readonly string[] = ["failed", "unconfirmed"];
/** Refusal reasons with their own copy; any other reason reads as unavailable. */
const REASON_KEYS: readonly RecommendationKey[] = [
  "unknown",
  "unavailable",
  "access-denied",
  "not-live-root",
  "closing",
];
function reasonKey(reason: string): RecommendationKey {
  return REASON_KEYS.find((key) => key === reason) ?? "unavailable";
}
/** Status copy of a recorded phase; `restart-required` refines enabled. */
function statusKey(phase: string, data: CardData): RecommendationKey | undefined {
  switch (phase) {
    case "dismissed":
    case "replaced":
    case "already-enabled":
    case "failed":
    case "unconfirmed":
      return phase;
    case "enabled":
      return data.application === "restart-required" ? "restart-required" : "enabled";
    default:
      return undefined;
  }
}
/**
 * Display one plugin card: its current catalog title and description, the user's choice and its outcome.
 * Until the plugin's first catalog lookup returns, a placeholder line and the disabled actions hold the final layout.
 * A refused or lost lookup leaves Not now and a retry of the lookup, but not Enable.
 * @param props - card, state, actions and plugin-lifetime services.
 * @returns the card body.
 */
export const PluginCardBody = defineComponent(
  (props: PluginCardProps) => {
    const details = computed(() => detailsSchema.safeParse(props.proposal.details));
    const name = computed(() => (details.value.success ? details.value.data.name : undefined));
    const cached = useObservableSelector(
      () => props.catalog,
      () => (entries) =>
        name.value !== undefined && Object.hasOwn(entries, name.value)
          ? entries[name.value]
          : undefined,
    );
    // This card's latest lookup: undefined while loading, null when the reply was lost.
    const lookup = shallowRef<RecommendationDetails | null>();
    const attempt = shallowRef(0);
    const pending = shallowRef<CardVerb>();
    const error = shallowRef<RecommendationKey>();
    const descriptionId = useId();
    const phase = computed(() => props.decision?.phase);
    watch(
      [
        () => props.catalog,
        () => props.describe,
        () => props.sessionId,
        () => props.proposal.callId,
        () => name.value,
        () => phase.value,
        () => attempt.value,
      ],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (name.value === undefined) return undefined;
          let current = true;
          props.describe(props.sessionId, props.proposal.callId).then(
            (value) => {
              if (!current) return;
              if (value?.status === "available")
                props.catalog.set({ ...props.catalog.getSnapshot(), [name.value!]: value });
              lookup.value = value ?? null;
            },
            () => {
              if (current) lookup.value = null;
            },
          );
          return () => {
            current = false;
          };
        })();
        if (typeof cleanup === "function") onCleanup(cleanup);
      },
      { immediate: true, flush: "post" },
    );
    const current = computed(() =>
      lookup.value === null || lookup.value?.status === "refused"
        ? lookup.value
        : (cached.value ?? lookup.value),
    );
    const loading = computed(() => current.value === undefined);
    const available = computed(() =>
      current.value?.status === "available" ? current.value : undefined,
    );
    const parsed = computed(() => dataSchema.safeParse(props.decision?.data ?? {}));
    const data = computed<CardData>(() => (parsed.value.success ? parsed.value.data : {}));
    const settled = computed(() => phase.value !== undefined && !OPEN_PHASES.includes(phase.value));
    const status = computed(() =>
      phase.value === undefined
        ? available.value?.enabled
          ? "already-enabled"
          : undefined
        : statusKey(phase.value, data.value),
    );
    // A settled card keeps its recorded outcome; a later catalog change does not reopen or relabel it.
    const offered = computed(() => !settled.value && available.value?.enabled !== true);
    const enable = computed(
      () => offered.value && (available.value !== undefined || loading.value),
    );
    const lookupProblem = computed(() =>
      settled.value || current.value === undefined || current.value?.status === "available"
        ? undefined
        : current.value === null
          ? "lookup-failed"
          : current.value.reason,
    );
    const failure = computed(() =>
      phase.value === "failed" && data.value.errorCode !== undefined
        ? data.value.errorCode === "incompatible-version"
          ? "version-error"
          : "management-error"
        : undefined,
    );
    const title = computed(() =>
      available.value === undefined
        ? props.proposal.title
        : props.resolveText(available.value.title),
    );
    const run = async (verb: CardVerb) => {
      pending.value = verb;
      error.value = undefined;
      try {
        const result = await props.act(verb);
        if (result === undefined) error.value = "transport";
        else if (result.status === "refused" || result.status === "unconfirmed")
          error.value = reasonKey(result.reason);
      } catch {
        // The Host operation may have committed before a connection loss; retry is idempotent.
        error.value = "transport";
      } finally {
        pending.value = undefined;
      }
    };
    const busy = computed(() => pending.value !== undefined);
    return () => {
      if (name.value === undefined) return h("div", { class: css.body }, [props.summary]);
      return h(Fragment, {}, [
        h("header", { class: css.header }, [
          h("span", {}, [props.t("heading")]),
          h("span", { class: css.badge }, [props.t("official")]),
        ]),
        h("div", { class: css.body, "aria-busy": loading.value || undefined }, [
          h(
            "button",
            {
              type: "button",
              class: css.details,
              onClick: () => {
                props.openDetails(name.value!);
              },
              "aria-label": props.t("detailsFor", { title: title.value }),
              "aria-describedby": available.value === undefined ? undefined : descriptionId,
            },
            [
              h("strong", { class: css.title }, [title.value]),
              (loading.value || available.value !== undefined) &&
                h("span", { id: descriptionId, class: css.description }, [
                  available.value === undefined
                    ? h("span", { class: css.placeholder })
                    : props.resolveText(available.value.description),
                ]),
            ],
          ),
          status.value !== undefined &&
            h("p", { role: "status", class: css.status }, [props.t(status.value)]),
          failure.value !== undefined &&
            h("p", { role: "alert", class: css.status }, [props.t(failure.value)]),
          lookupProblem.value !== undefined &&
            h("p", { role: "alert", class: css.status }, [props.t(lookupProblem.value)]),
          offered.value &&
            error.value !== undefined &&
            h("p", { role: "alert", class: css.status }, [props.t(error.value)]),
          offered.value &&
            h("footer", { class: css.footer }, [
              h("span", { class: css.scope }, [props.t("scope")]),
              h("div", { class: css.actions }, [
                lookupProblem.value !== undefined &&
                  h(
                    Button,
                    {
                      variant: "ghost",
                      size: "sm",
                      disabled: busy.value,
                      onClick: () => {
                        lookup.value = undefined;
                        attempt.value = ((value) => value + 1)(attempt.value);
                      },
                    },
                    { default: () => [props.t("retryLookup")] },
                  ),
                h(
                  Button,
                  {
                    variant: "ghost",
                    size: "sm",
                    disabled: busy.value || loading.value,
                    onClick: () => {
                      void run("dismiss");
                    },
                  },
                  { default: () => [props.t(pending.value === "dismiss" ? "working" : "dismiss")] },
                ),
                enable.value &&
                  h(
                    Button,
                    {
                      variant: "primary",
                      size: "sm",
                      disabled: busy.value || loading.value,
                      onClick: () => {
                        void run("enable");
                      },
                    },
                    {
                      default: () => [
                        props.t(
                          pending.value === "enable"
                            ? "working"
                            : phase.value === undefined
                              ? "enable"
                              : "retry",
                        ),
                      ],
                    },
                  ),
              ]),
            ]),
        ]),
      ]);
    };
  },
  {
    props: [
      "proposal",
      "decision",
      "sessionId",
      "summary",
      "Folded",
      "act",
      "t",
      "catalog",
      "describe",
      "openDetails",
      "resolveText",
    ],
  },
);
