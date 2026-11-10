<script setup lang="ts">
import { Badge } from '@eap/ui'

defineProps<{
  total: number
  changed: number
  added: number
  status: string
  labels: Record<string, string>
}>()
</script>

<template>
  <div data-testid="evidence-summary" class="evidence-summary">
    <Badge>{{ status }}</Badge>
    <dl>
      <div>
        <dt>{{ labels.total }}</dt>
        <dd data-testid="evidence-total">{{ total }}</dd>
      </div>
      <div>
        <dt>{{ labels.changed }}</dt>
        <dd data-testid="evidence-changed">{{ changed }}</dd>
      </div>
      <div>
        <dt>{{ labels.added }}</dt>
        <dd data-testid="evidence-added">{{ added }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.evidence-summary,
dl,
dl > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2, 0.5rem);
  align-items: center;
}

.evidence-summary,
dl {
  gap: var(--spacing-4, 1rem);
}

dl,
dd {
  margin: 0;
}
</style>
