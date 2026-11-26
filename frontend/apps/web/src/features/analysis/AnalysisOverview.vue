<script setup lang="ts">
import { Collapse, Feedback, MetricCard } from '@eap/ui'
import { i18n } from '../../lib/i18n'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const {
  capabilityItems,
  capabilities,
  expertCount,
  kindSummary,
  disabledCapabilityCount,
  enabledExpertCount,
  stats,
  statsError,
  modelShareText,
  deterministicCoverageText,
  windowDistribution,
} = props.analysis
</script>

<template>
  <Collapse class="status-strip work-overview"
    ><template #summary
      >{{ i18n.global.t('workUi.overview') }}
      <span
        >{{ capabilityItems.length || capabilities.length }}
        {{ i18n.global.t('workUi.capabilities') }} · {{ expertCount }}
        {{ i18n.global.t('workUi.experts') }}</span
      ></template
    >
    <div class="metrics">
      <MetricCard
        label="已注册能力"
        :value="capabilityItems.length || capabilities.length"
        :detail="kindSummary"
        :source="
          disabledCapabilityCount
            ? `出处：/api/capabilities · ${disabledCapabilityCount} 已停用`
            : '出处：/api/capabilities'
        "
      />
      <MetricCard
        label="专家定义"
        :value="expertCount"
        :detail="`${enabledExpertCount} 已启用 · 内置 + 自定义`"
        source="出处：/api/experts"
      />
      <MetricCard
        :label="`近 ${stats?.windowDays ?? 7} 日任务`"
        :value="stats ? stats.tasksInWindow : '—'"
        :detail="
          stats
            ? `共 ${stats.tasksTotal} 条记录 · ${stats.observationsInWindow} 条工具观测`
            : '统计接口不可用'
        "
        source="出处：/api/stats，由 eap.task 实时聚合"
      />
      <MetricCard
        label="模型调用占比"
        :value="modelShareText"
        :detail="
          stats && stats.model.recordedRuns
            ? `${stats.model.calls} / ${stats.model.recordedRuns} 次执行真的调用了模型`
            : '还没有记录了模型走向的执行'
        "
        source="出处：/api/stats · 分母只含记录了模型走向的执行"
      />
    </div>
    <Feedback v-if="statsError" tone="error">这几个数字取不到：{{ statsError }}</Feedback>
    <p v-else-if="stats" class="metric-note">{{ stats.note }}</p>
    <Collapse class="status-more">
      <template #summary>这些数字从哪来</template>
      <Collapse class="why">
        <template #summary>为什么这四个数字可以不写死</template>
        <p>
          已注册能力与专家定义分别读能力清单与专家清单：停用一个能力、新增一个专家，这两个数字跟着变，
          所以它们不可能和「能力目录」「专家定义」里的数字不一致。
        </p>
        <p>
          近 {{ stats?.windowDays ?? 7 }} 日任务与模型调用占比读运行时的统计接口，而它是对
          <code class="mono">eap.task</code>
          的实时聚合：每次执行都会把「有没有真正调用模型」写进任务记录，
          所以这两个数字是算出来的，不是样本。
        </p>
        <p>
          状态栏的「确定性覆盖」与这里的值是同一个（<b>{{ deterministicCoverageText }}</b>）——
          同一个数字有两处标签，就是它开始漂移的地方。还没有记录了模型走向的执行时显示「尚无记录」而不是
          0%：那两句话不是同一个断言。
        </p>
      </Collapse>
      <article class="eap-panel panel-block">
        <h2>确定性优先</h2>
        <p class="hint">
          平台先运行本地确定性能力并生成结构化证据；只有当确定性证据不足或操作者显式请求时，
          才会把压缩后的证据提交给模型。模型输出始终是与确定性发现分开展示的待验证观察。
        </p>
        <p v-if="windowDistribution" class="hint">
          近 {{ stats?.windowDays ?? 7 }} 日实际发生：{{ windowDistribution }}。
          这是运行时真的做了什么，而不是设计意图。
        </p>
      </article>
    </Collapse>
  </Collapse>
</template>
