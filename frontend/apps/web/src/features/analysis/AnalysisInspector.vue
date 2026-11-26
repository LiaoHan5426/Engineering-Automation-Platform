<script setup lang="ts">
import { Button, Feedback } from '@eap/ui'
import { computed } from 'vue'
import { CANDIDATE_REWRITE_NOTES, candidateRewrite, rewriteUnavailable } from '../../lib/rewrites'
import { decisionText, modelEnhancementText, severityText } from './analysisLabels'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{
  analysis: AnalysisWorkbench
  /** Name of the page the inspector describes. */
  title: string
  hint: string
  /** The page produces a pipeline trace worth summarising here. */
  pipeline?: boolean
}>()
const {
  inspectorOpen,
  selectedFinding,
  isFindingIgnored,
  copyFindingAdvice,
  toggleFindingIgnored,
  toggleRewrite,
  rewriteOpen,
  inspectorMessage,
  sqlResult,
  decision,
  compression,
} = props.analysis

/** 只有能从语句本身判定的改写才给候选；其余给「为什么没有」，不给一个看起来像改写的 diff。 */
const findingRewrite = computed(() =>
  selectedFinding.value
    ? candidateRewrite(selectedFinding.value.code, sqlResult.value?.sql ?? '')
    : null,
)
const findingRewriteUnavailable = computed(() =>
  selectedFinding.value ? rewriteUnavailable(selectedFinding.value.code) : '',
)
</script>

<template>
  <Button
    variant="backdrop"
    v-if="inspectorOpen"
    class="inspector-backdrop"
    aria-label="关闭上下文详情"
    @click="inspectorOpen = false"
  ></Button>
  <aside id="context-details" class="inspector" :class="{ 'inspector--open': inspectorOpen }">
    <div class="insp-head">
      <h2>上下文详情</h2>
      <span class="chip">{{ title }}</span>
      <Button variant="secondary" @click="inspectorOpen = false" class="inspector-toggle"
        >关闭</Button
      >
    </div>
    <p class="hint">{{ hint }}</p>

    <p v-if="!selectedFinding" class="hint">尚未选择发现：点击上方结果中的任意一条。</p>
    <div v-else class="inspector-card">
      <span class="sev" :class="selectedFinding.severity">{{
        severityText(selectedFinding.severity)
      }}</span>
      <span v-if="isFindingIgnored(selectedFinding.code)" class="ignored-tag">已忽略</span>
      <div class="mono insp-code">{{ selectedFinding.code }}</div>
      <div class="hint">类别：{{ selectedFinding.category }}</div>
      <div class="insp-block"><b>证据</b><br />{{ selectedFinding.evidence }}</div>
      <div class="insp-block"><b>建议（语义保持）</b><br />{{ selectedFinding.suggestion }}</div>
      <div class="insp-block"><b>确定性置信度</b> {{ selectedFinding.confidence }}</div>
      <div class="form-actions insp-actions">
        <Button variant="secondary" @click="copyFindingAdvice(selectedFinding)"> 复制建议 </Button>
        <Button variant="secondary" :disabled="!findingRewrite" @click="toggleRewrite">
          {{ rewriteOpen ? '收起改写' : '查看候选改写' }}
        </Button>
        <Button variant="secondary" @click="toggleFindingIgnored(selectedFinding)">
          {{ isFindingIgnored(selectedFinding.code) ? '取消忽略' : '标记忽略' }}
        </Button>
      </div>
      <Feedback v-if="inspectorMessage">{{ inspectorMessage }}</Feedback>
      <div v-if="rewriteOpen && findingRewrite" class="insp-block rew-box">
        <b>候选改写（未执行）</b>
        <p class="hint">{{ findingRewrite.note }}</p>
        <div class="diff">
          <div class="diff-side">
            <span class="diff-tag del">− 现在</span>
            <pre>{{ findingRewrite.before }}</pre>
          </div>
          <div class="diff-side">
            <span class="diff-tag add">＋ 候选</span>
            <pre>{{ findingRewrite.after }}</pre>
          </div>
        </div>
        <p class="hint">{{ findingRewrite.limitation }}</p>
        <p class="hint">{{ CANDIDATE_REWRITE_NOTES }}</p>
      </div>
      <p v-else class="hint">
        {{
          findingRewrite
            ? '该发现有一条可从语句本身判定的候选改写；点「查看候选改写」对照阅读。'
            : '没有候选改写：' + findingRewriteUnavailable
        }}
      </p>
    </div>

    <template v-if="sqlResult && pipeline">
      <h2>当前任务的流水线走向</h2>
      <div class="pipeline pipeline--stack">
        <div class="stage done">
          <div class="n">1 · 确定性证据</div>
          <div class="t">已运行</div>
          <div class="s">AST 解析 → 规则包判定（{{ sqlResult?.rulePacks?.length ?? 0 }} 个包）</div>
        </div>
        <div class="stage" :class="decision === 'enhance' ? 'model' : 'skip'">
          <div class="n">2 · 决策</div>
          <div class="t">{{ decisionText(decision) }}</div>
          <div class="s">{{ sqlResult?.modelAdvisor?.rationale ?? '尚未运行分析' }}</div>
        </div>
        <div
          class="stage"
          :class="sqlResult?.modelEnhancement === 'unverified-observation' ? 'model' : ''"
        >
          <div class="n">3 · 模型</div>
          <div class="t">{{ modelEnhancementText(sqlResult?.modelEnhancement) }}</div>
          <div class="s" v-if="compression?.compressionRatio != null">
            压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}%
          </div>
          <div class="s" v-else>预算未消耗</div>
        </div>
      </div>
    </template>
  </aside>
</template>
