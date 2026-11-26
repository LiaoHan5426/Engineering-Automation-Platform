<script setup lang="ts">
import { LayoutFooter } from '@eap/layout'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const { runtimeStatus, workspace, lastRefresh, deterministicCoverageText, stats, modelShareText } =
  props.analysis
</script>

<template>
  <LayoutFooter class="statusbar">
    <span>状态：<b>{{ runtimeStatus }}</b></span>
    <span>工作空间：<b>{{ workspace }}</b></span>
    <span>最近刷新：<b>{{ lastRefresh || '—' }}</b></span>
    <span>确定性覆盖：<b>{{ deterministicCoverageText }}</b></span>
    <span>模型调用（近 {{ stats?.windowDays ?? 7 }} 日）：<b>{{ modelShareText }}</b></span>
    <span class="spacer" />
    <span>Apache-2.0</span>
  </LayoutFooter>
</template>
