<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Input, Button, Panel } from '@eap/ui'
import DeliveryEvidenceSummary from './DeliveryEvidenceSummary.vue'
import { evidenceRows, type EvidenceFile } from './deliveryEvidenceModel'

const props = defineProps<{
  files: EvidenceFile[]
  status: string
  labels: Record<string, string>
}>()
const query = ref('')
const selectedPath = ref<string | null>(null)
const rows = computed(() => evidenceRows(props.files, query.value))
const changed = computed(
  () => props.files.filter((file) => file.before !== null && file.before !== file.content).length,
)
const added = computed(() => props.files.filter((file) => file.before === null).length)
const selected = computed(
  () => rows.value.find((file) => file.path === selectedPath.value) ?? rows.value[0] ?? null,
)
const byteCount = computed(() =>
  selected.value ? new TextEncoder().encode(selected.value.content).byteLength : 0,
)

watch(
  rows,
  (visible) => {
    if (!visible.some((file) => file.path === selectedPath.value)) {
      selectedPath.value = visible[0]?.path ?? null
    }
  },
  { immediate: true, flush: 'sync' },
)
</script>

<template>
  <Panel data-testid="evidence-panel" class="evidence-panel">
    <h2>{{ labels.title }}</h2>
    <DeliveryEvidenceSummary
      :total="files.length"
      :changed="changed"
      :added="added"
      :status="status"
      :labels="labels"
    />
    <Input
      v-model="query"
      data-testid="evidence-filter"
      :aria-label="labels.filter"
      :placeholder="labels.filter"
    />
    <div v-if="rows.length" class="evidence-layout">
      <ul class="evidence-files">
        <li v-for="file in rows" :key="file.path">
          <Button
            type="button"
            data-testid="evidence-file"
            class="evidence-file"
            :aria-pressed="selected?.path === file.path"
            @click="selectedPath = file.path"
            >{{ file.path }}</Button
          >
        </li>
      </ul>
      <section
        v-if="selected"
        data-testid="evidence-detail"
        class="evidence-detail"
        :aria-label="labels.details"
      >
        <h3>{{ labels.details }}</h3>
        <p class="evidence-path">{{ selected.path }}</p>
        <dl>
          <div>
            <dt>{{ labels.baseline }}</dt>
            <dd>
              <code>{{ selected.baseHash }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ labels.bytes }}</dt>
            <dd>{{ byteCount }}</dd>
          </div>
        </dl>
        <pre><code>{{ selected.content }}</code></pre>
      </section>
    </div>
    <p v-else>{{ labels.empty }}</p>
    <p class="evidence-boundary">{{ labels.boundary }}</p>
  </Panel>
</template>

<style scoped>
.evidence-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4, 1rem);
  min-width: 0;
}

.evidence-layout {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-4, 1rem);
  align-items: flex-start;
}

.evidence-files {
  display: flex;
  flex: 1 1 14rem;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  min-width: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.evidence-file {
  max-width: 100%;
  text-align: start;
  overflow-wrap: anywhere;
  white-space: normal;
}

.evidence-detail {
  flex: 3 1 24rem;
  min-width: 0;
  max-width: 100%;
}

.evidence-path,
dd,
.evidence-boundary {
  overflow-wrap: anywhere;
}

dl {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-4, 1rem);
}

dd {
  margin: 0;
}

pre {
  max-width: 100%;
  padding: var(--spacing-3, 0.75rem);
  overflow: auto;
  background: var(--surface-secondary, transparent);
  border-radius: var(--radius-md, 0.375rem);
}
</style>
