<script setup lang="ts">
import { Collapse } from '@eap/ui';
import type { CodeGenerationSnapshot } from '@eap/runtime-client';
import { useI18n } from 'vue-i18n';
defineProps<{ generation?: CodeGenerationSnapshot | null }>();
const { t } = useI18n();
</script>
<template>
  <Collapse v-if="generation" data-testid="generation-record">
    <template #summary>{{ t('generation.title') }} · {{ generation.targetPath }}</template>
    <div class="generation-baseline">
      <code>{{ generation.id }}</code>
      <p>{{ t('generation.target') }}：{{ generation.targetPath }}</p>
      <p v-if="generation.baseHash === 'absent'">{{ t('generation.absent') }}</p>
      <p v-else>SHA-256：<code>{{ generation.baseHash }}</code></p>
      <p>{{ t('generation.captured') }}：{{ generation.capturedAt }}</p>
      <p v-if="generation.taskBinding">{{ t('generation.taskBinding') }}：{{ generation.taskBinding.projectId }} · {{ generation.taskBinding.taskId }} · r{{ generation.taskBinding.revision }}</p>
      <p v-if="generation.prototypeVersionId">{{ t('generation.prototype') }}：<code>{{ generation.prototypeVersionId }} · {{ generation.prototypeContentHash }}</code></p>
      <p>{{ t('generation.boundary') }}</p>
    </div>
  </Collapse>
  <p v-else class="hint" data-testid="generation-missing">{{ t('generation.missing') }}</p>
</template>
<style scoped>
.generation-baseline{display:grid;gap:8px;min-width:0}.generation-baseline p,.generation-baseline code{overflow-wrap:anywhere}.generation-baseline code{font-size:11px}
</style>
