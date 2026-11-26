<script setup lang="ts">
import { useMessages } from '@eap/message'
import { Table, type TableColumn } from '@eap/plugin-table'
import { Badge, Button, Collapse, EmptyState, Feedback, Textarea } from '@eap/ui'
import { computed } from 'vue'
import { statusLabel } from '../../lib/presentation'
import { decisionText, modelEnhancementText, severityText } from './analysisLabels'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const {
  sqlResult,
  findings,
  decision,
  decisionOpen,
  compression,
  decisionExplanation,
  selectedFinding,
  isFindingIgnored,
  selectFinding,
  rulePackRequirements,
  blockedRules,
  supplement,
  supplementMessage,
  sqlBusy,
  applySupplement,
  copyResult,
} = props.analysis

const { message } = useMessages()

async function copyAdvice() {
  const copied = await copyResult()
  if (copied === undefined) return
  message(
    copied ? { text: '建议已复制' } : { text: '复制失败，请手动选择建议文本复制', tone: 'error' },
  )
}

const factEntries = computed(() =>
  Object.entries(sqlResult.value?.deterministicAnalysis?.facts ?? {}),
)
const factColumns: TableColumn[] = [
  { key: 'key', title: '事实', mono: true },
  { key: 'value', title: '值' },
]
const factRows = computed(() =>
  factEntries.value.map(([key, value]) => ({ key, value: factText(value) })),
)
function factText(value: unknown) {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value === null || value === undefined) return '—'
  return String(value)
}
</script>

<template>
  <article class="eap-panel" id="resultCard" v-if="sqlResult">
    <header class="panel-head">
      <div>
        <h2>分析结果</h2>
        <p>建议、证据与模型走向分开展示</p>
      </div>
      <Badge tone="success">{{ statusLabel(sqlResult.status) }}</Badge>
    </header>
    <div class="result">
      <div class="pipeline">
        <div class="stage done">
          <div class="n">1 · 确定性</div>
          <div class="t">已运行</div>
          <div class="s">
            {{ findings.length }} 条发现 · 置信度
            {{ sqlResult.deterministicAnalysis?.deterministicConfidence ?? '—' }}
          </div>
        </div>
        <Button
          variant="card"
          type="button"
          class="stage stage--clickable"
          :class="decision === 'enhance' ? 'model' : 'skip'"
          :aria-expanded="decisionOpen"
          @click="decisionOpen = !decisionOpen"
        >
          <div class="n">2 · 决策</div>
          <div class="t">{{ decisionText(decision) }}</div>
          <div class="s">
            {{ sqlResult.modelAdvisor?.rationale ?? '点开看为什么没有到决策阶段' }}
            <span class="link">{{ decisionOpen ? '收起' : '为什么？' }}</span>
          </div>
        </Button>
        <div
          class="stage"
          :class="sqlResult.modelEnhancement === 'unverified-observation' ? 'model' : ''"
        >
          <div class="n">3 · 模型</div>
          <div class="t">
            {{ modelEnhancementText(sqlResult.modelEnhancement) }}
          </div>
          <div class="s" v-if="compression?.compressionRatio != null">
            压缩比 {{ Math.round((compression.compressionRatio ?? 0) * 100) }}% · 预计
            {{ compression.estimatedTokens }} tokens
          </div>
          <div class="s" v-else>确定性完成，无需模型</div>
        </div>
      </div>
      <div v-if="decisionOpen" class="decision-panel">
        <h4>{{ decisionExplanation.title }}</h4>
        <ul class="advice-list">
          <li v-for="(line, index) in decisionExplanation.lines" :key="index">
            {{ line }}
          </li>
        </ul>
        <p class="hint">
          是否调用模型由运行时按规则决定，控制台改不了这个判断。若要显式请求一次模型复核，
          请勾选左上方的「显式请求模型增强」并重新分析——那是一次新的执行。
        </p>
      </div>

      <h3>发现（{{ findings.length }}）</h3>
      <div class="findings">
        <Button
          variant="card"
          v-for="finding in findings"
          :key="finding.code"
          class="finding"
          :class="{
            sel: selectedFinding?.code === finding.code,
            ignored: isFindingIgnored(finding.code),
          }"
          @click="selectFinding(finding)"
        >
          <span class="sev" :class="finding.severity">{{ severityText(finding.severity) }}</span>
          <span>
            <span class="code mono">{{ finding.code }}</span>
            <span v-if="isFindingIgnored(finding.code)" class="ignored-tag">已忽略</span>
            <p class="evidence">{{ finding.evidence }}</p>
            <span class="cat">类别：{{ finding.category }}</span>
          </span>
        </Button>
        <EmptyState v-if="!findings.length">
          未触发确定性规则。这不代表 SQL 已通过优化检查，请补充表结构与执行计划。
        </EmptyState>
      </div>

      <h3>适用规则包（{{ sqlResult.rulePacks?.length ?? 0 }}）</h3>
      <div class="chips">
        <Badge tone="neutral" v-for="pack in sqlResult.rulePacks ?? []" :key="pack.id">
          {{ pack.name }} · {{ pack.ruleCount }} 条规则
          <template v-if="pack.requires?.length"> · 需要 {{ pack.requires.join('、') }}</template>
        </Badge>
        <span v-if="!sqlResult.rulePacks?.length" class="hint">
          该专家未声明规则包，本次仅做解析与事实抽取。
        </span>
      </div>

      <template v-if="rulePackRequirements.length">
        <h3>规则包能力需求</h3>
        <p class="hint">
          规则读取事实，事实由能力产出。下面列出每个规则包需要的能力，以及本次流程是否真的执行了它们。
        </p>
        <div class="choice-list">
          <div v-for="check in rulePackRequirements" :key="check.id" class="requirement">
            <code class="mono">{{ check.id }}</code>
            <Badge tone="neutral" :class="check.met ? 'eap-badge--success' : 'eap-badge--warning'">
              {{ check.met ? '能力齐备' : '缺少 ' + check.missing.join('、') }}
            </Badge>
            <span class="hint">需要：{{ check.required.join('、') }}</span>
          </div>
        </div>
      </template>

      <template v-if="blockedRules.length">
        <h3>未判定的规则（{{ blockedRules.length }}）</h3>
        <Feedback tone="info">
          下列规则依赖的能力本次没有执行，因此它们的证据缺失。这
          <b>不等于</b> 没有发现问题。
        </Feedback>
        <ul class="advice-list">
          <li v-for="item in blockedRules" :key="item.rule">
            <code class="mono">{{ item.rule }}</code> · 缺少能力
            {{ item.missingCapabilities.join('、') }} · 相关事实
            {{ item.missingFacts.join('、') }}
          </li>
        </ul>
      </template>

      <section class="supplement">
        <h3>补充上下文</h3>
        <p class="hint">
          运行时没有「补充」这个资源：补充上下文等于把新上下文并入目标后<b>再执行一次</b> （<code
            class="mono"
            >POST /api/experts/{id}/execute</code
          >）。上一条记录与它的证据不会被改写，
          所以「补了什么、结果怎么变」在历史里可以对照。不要粘贴密码或连接串。
        </p>
        <Textarea
          v-model="supplement"
          rows="3"
          :disabled="sqlBusy"
          placeholder="例如：orders.customer_id 已有单列索引；订单表约 2000 万行，慢在分页"
        />
        <div class="form-actions">
          <Button
            variant="secondary"
            type="button"
            :disabled="sqlBusy || !supplement.trim()"
            @click="applySupplement"
          >
            {{ sqlBusy ? '执行中…' : '补入并重新分析' }}
          </Button>
          <span class="hint" role="status">{{ supplementMessage }}</span>
        </div>
      </section>

      <Collapse v-if="factEntries.length">
        <template #summary>命中事实（{{ factEntries.length }}）</template>
        <p class="hint">发现来自这些结构事实；规则包只能引用词表中已声明的事实。</p>
        <Table :columns="factColumns" :rows="factRows" row-key="key" />
      </Collapse>

      <h3>优化建议（确定性，语义保持）</h3>
      <ol v-if="sqlResult.advice?.length" class="advice-list">
        <li v-for="item in sqlResult.advice" :key="item">{{ item }}</li>
      </ol>
      <EmptyState v-else>本次没有返回可验证建议，请补充上下文。</EmptyState>

      <section v-if="sqlResult.expertAdvice">
        <h3>模型观察（未验证）</h3>
        <p class="preserve-text">{{ sqlResult.expertAdvice }}</p>
      </section>

      <Collapse :open="!!sqlResult.knowledgeEvidence?.length">
        <template #summary>知识依据（{{ sqlResult.knowledgeEvidence?.length ?? 0 }}）</template>
        <div v-for="(item, index) in sqlResult.knowledgeEvidence" :key="index" class="kb">
          <b>{{ item.knowledgeBase }} / {{ item.source }}</b>
          <p>{{ item.excerpt }}</p>
        </div>
        <p v-if="!sqlResult.knowledgeEvidence?.length" class="hint">
          没有返回匹配知识，可在知识库录入相关业务说明或验证案例。
        </p>
      </Collapse>

      <Collapse v-if="sqlResult.nodes?.length">
        <template #summary>流程执行记录</template>
        <ol class="execution-list">
          <li v-for="node in sqlResult.nodes" :key="node.id">
            <div class="result-heading">
              <strong>{{ node.label }}</strong>
              <Badge
                tone="neutral"
                :class="node.state === 'succeeded' ? 'eap-badge--success' : 'eap-badge--warning'"
              >
                {{ statusLabel(node.state) }}
              </Badge>
            </div>
            <small class="mono">{{ node.capability }}</small>
            <p>{{ node.message }}</p>
          </li>
        </ol>
      </Collapse>

      <Collapse v-if="sqlResult.safety?.length">
        <template #summary>安全与执行说明</template>
        <ul>
          <li v-for="item in sqlResult.safety" :key="item">{{ item }}</li>
        </ul>
      </Collapse>

      <div class="form-actions">
        <Button
          variant="secondary"
          :disabled="!sqlResult.advice?.length && !sqlResult.expertAdvice"
          @click="copyAdvice"
        >
          复制建议
        </Button>
      </div>
    </div>
  </article>
</template>
