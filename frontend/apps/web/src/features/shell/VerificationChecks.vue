<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { pagePreviewMessageKey, resolvePagePreview, type PagePreview } from './pagePreview'
import { formatVerificationConfig, runtimeIdentity } from './runtimeIdentity'
import { Collapse } from '@eap/ui'

const props = defineProps<{
  recorded?: string
  brief?: boolean
  checks?: Array<{ name: string; exitCode: number | null; summary: string }>
  previewUrl?: string
}>()
const { t } = useI18n()
const preview = computed((): PagePreview =>
  resolvePagePreview({
    url: props.previewUrl,
  }),
)
const previewLabel = computed(() =>
  preview.value.ready
    ? t(pagePreviewMessageKey(preview.value), { url: preview.value.url })
    : t(pagePreviewMessageKey(preview.value)),
)
/** Live local-service config; never invents that typecheck/test/build already ran. */
const configLine = computed(() =>
  formatVerificationConfig(runtimeIdentity.value, (key, values) => t(key, values ?? {})),
)
const resultLabel = computed(() => {
  const state = props.recorded?.toLowerCase()
  if (
    state === 'failed' ||
    props.checks?.some((check) => check.exitCode != null && check.exitCode !== 0)
  )
    return t('desktop.verificationFailed')
  if (
    state === 'passed' &&
    props.checks?.length &&
    props.checks.every((check) => check.exitCode === 0)
  )
    return t('desktop.verificationPassed')
  if (state === 'unknown') return t('desktop.verificationUnknown')
  if (state && !['not_requested', 'unverified'].includes(state))
    return t('desktop.verificationRecorded', { value: props.recorded })
  return t('desktop.checksIdle')
})
</script>

<template>
  <p v-if="brief" data-testid="verification-checks">
    {{ resultLabel }}
  </p>
  <ul v-else data-testid="verification-checks">
    <li data-testid="verification-result">{{ resultLabel }}</li>
    <template v-if="checks?.length">
      <li v-for="item in checks" :key="item.name">
        {{ item.name }}：{{
          item.exitCode == null
            ? t('desktop.checkNoExit')
            : t('desktop.checkExit', { code: item.exitCode })
        }}
        <span v-if="item.summary" class="hint">
          · {{ item.summary.slice(0, 80) }}{{ item.summary.length > 80 ? '…' : '' }}</span
        >
      </li>
    </template>
    <li data-testid="delivery-preview">
      <a
        v-if="preview.ready"
        :href="preview.url"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="delivery-preview-link"
        >{{ t('desktop.openPagePreview') }}</a
      >
      <span v-else>{{ previewLabel }}</span>
    </li>
    <li>{{ t('desktop.acceptanceStillOpen') }}</li>
    <li>
      <Collapse data-testid="verification-details">
        <template #summary>{{ t('desktop.verificationDetails') }}</template>
        <p data-testid="live-verification-config">{{ configLine }}</p>
        <p v-if="recorded">
          <code>{{ recorded }}</code>
        </p>
      </Collapse>
    </li>
  </ul>
</template>
