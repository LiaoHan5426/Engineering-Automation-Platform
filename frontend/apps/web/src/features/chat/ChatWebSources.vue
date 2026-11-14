<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Collapse } from '@eap/ui'
import type { WebSource } from '@eap/runtime-client'
defineProps<{ sources: readonly WebSource[] }>()
const { t } = useI18n()
function safeLink(raw: string): string | undefined {
  if (raw.length > 2048) return
  try {
    const url = new URL(raw)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password)
      return url.href
  } catch {
    /* Unsafe or incomplete URLs remain plain text. */
  }
}
</script>
<template>
  <section
    v-if="sources.length"
    class="chat-web-sources"
    data-testid="web-source-citations"
    :aria-label="t('richText.references')"
  >
    <h3>{{ t('richText.references') }}</h3>
    <article v-for="(source, index) in sources.slice(0, 8)" :key="source.id">
      <a
        v-if="safeLink(source.url)"
        :href="safeLink(source.url)"
        target="_blank"
        rel="noopener noreferrer"
        >[{{ index + 1 }}] {{ source.title.slice(0, 240) || source.url.slice(0, 240) }}</a
      >
      <span v-else>[{{ index + 1 }}] {{ source.title.slice(0, 240) }}</span>
      <p>{{ source.text.slice(0, 400) }}</p>
      <Collapse v-if="source.text.length > 400"
        ><template #summary>{{ t('richText.referenceText') }}</template>
        <pre>{{ source.text.slice(0, 8000) }}</pre>
      </Collapse>
    </article>
  </section>
</template>
<style scoped>
.chat-web-sources {
  margin-block: 1rem;
}
.chat-web-sources article {
  margin-block: 0.75rem;
  overflow-wrap: anywhere;
}
.chat-web-sources pre {
  white-space: pre-wrap;
  max-height: 20rem;
  overflow: auto;
}
</style>
