<script setup lang="ts">
import { Button } from '@eap/ui'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const { inspectorOpen, refreshing, sqlBusy } = props.analysis
</script>

<template>
  <Button
    variant="secondary"
    :aria-expanded="inspectorOpen"
    aria-controls="context-details"
    @click="inspectorOpen = !inspectorOpen"
    class="inspector-toggle sql-top-secondary"
  >
    查看详情
  </Button>
  <Button
    variant="secondary"
    class="sql-top-secondary"
    :disabled="refreshing"
    @click="analysis.refresh()"
  >
    {{ refreshing ? '刷新中…' : '刷新' }}
  </Button>
  <Button
    variant="primary"
    class="sql-top-primary"
    :disabled="sqlBusy"
    @click="analysis.primaryAction"
  >
    {{ sqlBusy ? '分析中…' : '运行分析' }}
  </Button>
</template>
