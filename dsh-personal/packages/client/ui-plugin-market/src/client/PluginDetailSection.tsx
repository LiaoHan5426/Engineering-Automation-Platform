/** A market entry's long description: the Markdown document the Host reads for one listed version. */
import { computed, defineComponent, h, watchEffect } from "vue";
import {
  DetailDocument,
  detailDocumentState,
  useDetailDocumentLabels,
  type MarkdownPathImages,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import {
  detailKey,
  type DetailFace,
  type DetailFailureKind,
  type DetailRequest,
} from "./market-store.ts";

const FAILURE_KEYS = {
  "too-large": "detailTooLarge",
  network: "detailNetwork",
  denied: "detailDenied",
  "git-unavailable": "detailGitUnavailable",
  invalid: "detailInvalid",
  other: "detailFailed",
} as const satisfies Record<DetailFailureKind, string>;

/** Props of the detail section: the entry version, the dictionary, and the injected detail reads. */
export type PluginDetailSectionProps = {
  readonly request: DetailRequest;
} & PropsLocale<"pluginMarket"> &
  InjectFace<DetailFace>;

/**
 * Read an entry version's document in the active language; resolve relative images beside the Host document.
 * @param props - Entry version, localized copy, and injected detail reads.
 * @returns The native detail component; unavailable documents render nothing.
 */
export const PluginDetailSection = defineComponent(
  (props: PluginDetailSectionProps) => {
    const language = props.useLocale((snapshot) => snapshot.active);
    const details = props.useDetails((value) => value);
    const state = computed(() => details.value[detailKey(props.request, language.value)]);
    watchEffect(() => {
      if (state.value === undefined) props.loadDetail(props.request, language.value);
    });
    const labels = useDetailDocumentLabels(() => ({
      title: props.t("detailTitle"),
      loading: props.t("detailLoading"),
      retry: props.t("retry"),
      copy: props.t("copy"),
      copied: props.t("copied"),
      codeBlock: props.t("codeBlock.title"),
      wrap: props.t("codeBlock.wrap"),
      unwrap: props.t("codeBlock.unwrap"),
      footnotes: props.t("footnotes"),
    }));
    const detail = computed(() =>
      state.value?.status === "ready" ? state.value.detail : undefined,
    );
    const document = computed(() =>
      detail.value?.status === "found" ? detail.value.document : undefined,
    );
    const images = computed<MarkdownPathImages | undefined>(() => {
      const current = document.value;
      return current === undefined
        ? undefined
        : { resolve: (value) => props.detailImage(current, value) };
    });
    return () => {
      const current = state.value;
      const shown = detailDocumentState(
        current?.status === "error"
          ? { status: "error", message: props.t(FAILURE_KEYS[current.failure]) }
          : current === undefined || current.status === "loading"
            ? current
            : {
                status: "ready",
                markdown: detail.value?.status === "found" ? detail.value.markdown : undefined,
              },
      );
      return h(DetailDocument, {
        state: shown,
        labels: labels.value,
        ...(images.value === undefined ? {} : { images: images.value }),
        onRetry: () => {
          props.retryDetail(props.request, language.value);
        },
      });
    };
  },
  {
    inheritAttrs: false,
    props: ["request", "t", "useDetails", "useLocale", "loadDetail", "retryDetail", "detailImage"],
  },
);
