<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { pagePreviewMessageKey, resolvePagePreview, type PagePreview } from "./pagePreview";
import { formatVerificationConfig, runtimeIdentity } from "./runtimeIdentity";
import { useMockServices } from "../../lib/serviceConfig";

const props = defineProps<{
  recorded?: string;
  brief?: boolean;
  checks?: Array<{ name: string; exitCode: number | null; summary: string }>;
  /** Optional override for tests; defaults to window.location.origin. */
  origin?: string;
  mock?: boolean;
}>();
const { t } = useI18n();
const preview = computed((): PagePreview =>
  resolvePagePreview({
    mock: props.mock ?? useMockServices,
    origin: props.origin ?? (typeof window !== "undefined" ? window.location.origin : ""),
  }),
);
const previewLabel = computed(() =>
  preview.value.ready
    ? t(pagePreviewMessageKey(preview.value), { url: preview.value.url })
    : t(pagePreviewMessageKey(preview.value)),
);
/** Live local-service config; never invents that typecheck/test/build already ran. */
const configLine = computed(() =>
  formatVerificationConfig(runtimeIdentity.value, (key, values) => t(key, values ?? {})),
);
</script>

<template>
  <p v-if="brief" data-testid="verification-checks">{{ recorded && recorded !== "not_requested" ? t("desktop.verificationRecorded", { value: recorded }) : t("desktop.checksIdle") }}</p>
  <ul v-else data-testid="verification-checks">
    <template v-if="checks?.length">
      <li data-testid="live-verification-config">{{ configLine }}</li>
      <li v-for="item in checks" :key="item.name">
        {{ item.name }}：{{ item.exitCode == null ? t("desktop.checkNoExit") : t("desktop.checkExit", { code: item.exitCode }) }}
        <span v-if="item.summary" class="hint"> · {{ item.summary.slice(0, 80) }}{{ item.summary.length > 80 ? "…" : "" }}</span>
      </li>
      <li>{{ recorded && recorded !== "not_requested" ? t("desktop.verificationRecorded", { value: recorded }) : t("desktop.verificationOpen") }}</li>
    </template>
    <template v-else>
      <li data-testid="live-verification-config">{{ configLine }}</li>
      <li>{{ t("desktop.checkType") }}</li>
      <li>{{ t("desktop.checkTest") }}</li>
      <li>{{ t("desktop.checkBuild") }}</li>
      <li data-testid="delivery-preview">{{ previewLabel }}</li>
      <li v-if="preview.ready"><a :href="preview.url" data-testid="delivery-preview-link">{{ preview.url }}</a></li>
      <li>{{ t("desktop.acceptanceStillOpen") }}</li>
      <li>{{ recorded && recorded !== "not_requested" ? t("desktop.verificationRecorded", { value: recorded }) : t("desktop.verificationOpen") }}</li>
    </template>
  </ul>
</template>
