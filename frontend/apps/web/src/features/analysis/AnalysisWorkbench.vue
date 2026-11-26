<script setup lang="ts">
import { Badge, Button, Collapse, EmptyState, Feedback, Select } from '@eap/ui'
import { i18n } from '../../lib/i18n'
import { statusLabel } from '../../lib/presentation'
import AnalysisComposer from './AnalysisComposer.vue'
import AnalysisOverview from './AnalysisOverview.vue'
import AnalysisReport from './AnalysisReport.vue'
import { modelEnhancementText } from './analysisLabels'
import { TASK_STATUS_FILTERS, type AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const {
  sqlEvidence,
  focusComposer,
  taskStatusFilter,
  filteredHistory,
  history,
  task,
  taskBusy,
  taskError,
  selectHistory,
  streamMode,
  sqlResult,
  sqlBusy,
  rerunBusy,
  rerunTask,
} = props.analysis
</script>

<template>
  <section class="view work-page analysis-workspace" data-testid="sql-workbench">
    <div class="page-head">
      <p class="eyebrow">WORKBENCH</p>
      <h1>分析工作台</h1>
      <p class="sql-scope" data-testid="sql-scope" role="status">
        {{ i18n.global.t('workUi.sqlScope') }}
      </p>
      <aside class="sql-evidence" data-testid="sql-evidence" role="status">
        <p class="sql-evidence-scope">{{ i18n.global.t('workUi.sqlEvidenceScope') }}</p>
        <p v-if="sqlEvidence.mode === 'empty'" data-testid="sql-evidence-empty">
          {{ i18n.global.t('workUi.sqlEvidenceEmpty') }}
        </p>
        <template v-else>
          <p data-testid="sql-evidence-task">
            {{
              i18n.global.t('workUi.sqlEvidenceTask', {
                id: sqlEvidence.id,
                status: sqlEvidence.status,
              })
            }}
          </p>
          <p v-if="sqlEvidence.findings != null" data-testid="sql-evidence-findings">
            {{ i18n.global.t('workUi.sqlEvidenceFindings', { count: sqlEvidence.findings }) }}
          </p>
          <p v-else-if="sqlEvidence.observations != null" data-testid="sql-evidence-observations">
            {{
              i18n.global.t('workUi.sqlEvidenceObservations', {
                count: sqlEvidence.observations,
              })
            }}
          </p>
          <p v-else data-testid="sql-evidence-no-findings">
            {{ i18n.global.t('workUi.sqlEvidenceNoFindings') }}
          </p>
          <p data-testid="sql-evidence-model">
            {{ i18n.global.t('workUi.sqlEvidenceModel', { model: sqlEvidence.model }) }}
          </p>
        </template>
      </aside>
      <p class="sql-intro">{{ i18n.global.t('workUi.sqlIntro') }}</p>
      <Collapse class="why sql-boundary">
        <template #summary>{{ i18n.global.t('workUi.sqlBoundary') }}</template>
        <p>
          平台不连接业务数据库、也不执行你输入的 SQL。执行计划快照由你自行取得后粘贴——这样
          <b>没有凭据需要保管，也不存在误在上游库执行改写的可能</b>。代价是要你多贴一次，
          换来的是这条边界永远成立。
        </p>
        <p>
          左侧是本工作空间的分析任务：点一条任务，中间回放它的请求、执行过程与逐条发现；
          底部的输入框直接开始一次新的分析。模型输出单独标为待验证观察，不会并入确定性发现。
        </p>
      </Collapse>
    </div>

    <AnalysisOverview :analysis="analysis" />

    <!--
      2026-10-15 使用界面重构：任务不再是独立页面。
      左侧 = 本工作空间的**分析任务**（一次执行一条），中间 = 选中任务的任务流
      （请求置顶 → 执行过程 → 逐条发现），底部 = 直接开始新分析的输入区。
      这是使用界面而不是管理后台：第一眼看到的是正在做的事和下一步的输入框。
    -->
    <div class="studio">
      <aside class="studio-tasks" aria-label="分析任务列表">
        <div class="studio-side-head">
          <div>
            <b>分析任务</b>
            <span class="hint">本工作空间 · 点一条回看全过程</span>
          </div>
          <Button variant="secondary" @click="focusComposer">＋ 新的分析</Button>
        </div>
        <Select v-model="taskStatusFilter" aria-label="按状态筛选任务">
          <option value="">全部状态</option>
          <option v-for="option in TASK_STATUS_FILTERS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </Select>
        <div class="task-list">
          <Button
            variant="navigation"
            v-for="entry in filteredHistory"
            :key="entry.id"
            type="button"
            class="task-item"
            :class="{ 'sel-row': task?.id === entry.id }"
            :disabled="taskBusy"
            @click="selectHistory(entry)"
          >
            <span class="task-item-main">
              <b>{{ entry.goal }}</b>
              <span class="hint mono">{{ entry.id }} · {{ statusLabel(entry.decision) }}</span>
            </span>
            <Badge
              tone="neutral"
              :class="entry.status === 'completed' ? 'eap-badge--success' : 'eap-badge--warning'"
              >{{ statusLabel(entry.status) }}</Badge
            >
          </Button>
        </div>
        <EmptyState v-if="!filteredHistory.length">
          {{
            history.length
              ? '当前工作空间没有本机标注过的执行。切换到其它工作空间，或在下面开始一次新的分析。'
              : '还没有分析记录。在下面的输入框描述要分析的问题，或粘贴一段 SQL。'
          }}
        </EmptyState>
        <Feedback tone="error" v-if="taskError" role="alert">{{ taskError }}</Feedback>
      </aside>

      <div class="studio-main">
        <div class="studio-stream">
          <div v-if="streamMode === 'empty'" class="stream-empty">
            <p class="stream-empty-title">尚未选择分析任务</p>
            <p class="hint">
              左侧点一条任务，回看它的请求、执行过程与发现；或在下面的输入框描述要分析的问题，
              直接开始一次新的分析。
            </p>
          </div>
          <template v-else>
            <div class="req-card">
              <div class="row stream-head">
                <div>
                  <b>{{ streamMode === 'report' ? sqlResult?.id : task?.id }}</b>
                  <p class="hint mono">
                    {{
                      streamMode === 'report'
                        ? `专家流程 · 模型：${modelEnhancementText(sqlResult?.modelEnhancement)}`
                        : `本地能力任务 · 模型：${modelEnhancementText(task?.modelEnhancement)}`
                    }}
                  </p>
                </div>
                <Badge
                  tone="neutral"
                  :class="
                    (streamMode === 'report' ? sqlResult?.status : task?.status) === 'completed'
                      ? 'eap-badge--success'
                      : 'eap-badge--warning'
                  "
                  >{{
                    statusLabel(
                      streamMode === 'report' ? (sqlResult?.status ?? '') : (task?.status ?? ''),
                    )
                  }}</Badge
                >
              </div>
              <p v-if="streamMode === 'task'" class="hint">{{ task?.goal }}</p>
              <div class="form-actions" v-if="streamMode === 'task' && task">
                <Button variant="secondary" :disabled="rerunBusy" @click="rerunTask(task)">
                  {{ rerunBusy ? '重新提交中…' : '重新运行' }}
                </Button>
                <span class="hint">重新运行会新增一条执行记录，旧记录与它的证据保持原样。</span>
              </div>
            </div>

            <template v-if="streamMode === 'task' && task">
              <div class="row stream-head">
                <h2>执行过程</h2>
              </div>
              <Feedback tone="warning" v-if="task.status === 'needs-planning'">
                尚无可靠的本地能力处理此需求，没有执行无关工具。请补充具体操作目标，或在下面的输入框贴上
                SQL。
              </Feedback>
              <Feedback tone="warning" v-if="!task.observations">
                历史接口当前只返回任务摘要，未返回工具输出。
              </Feedback>
              <div class="timeline">
                <div v-for="(item, index) in task.observations ?? []" :key="index" class="tl-item">
                  <div class="tl-rail">
                    <i :class="item.success ? 'ok' : 'warn'" /><span class="line" />
                  </div>
                  <div class="tl-body">
                    <div class="t">
                      {{ item.capability }} · {{ item.success ? '成功' : '失败' }}
                    </div>
                    <div class="meta">退出码 {{ item.exitCode }}</div>
                    <pre v-if="item.stdout">{{ item.stdout }}</pre>
                    <pre v-if="item.stderr" class="err">{{ item.stderr }}</pre>
                  </div>
                </div>
                <EmptyState v-if="!(task.observations ?? []).length">
                  这一次执行没有返回工具输出。
                </EmptyState>
              </div>
            </template>

            <Feedback tone="info" v-if="sqlBusy" role="status">正在分析并检索知识…</Feedback>

            <AnalysisReport v-if="streamMode === 'report' && sqlResult" :analysis="analysis" />
          </template>
        </div>

        <AnalysisComposer :analysis="analysis" />
      </div>
    </div>

    <Collapse class="why">
      <template #summary>为什么模型不是第一步</template>
      <p>
        平台先跑本地确定性能力：解析 SQL、抽取结构事实、按规则包判定。只有当确定性证据不足、
        或操作者显式请求时，才把<b>压缩后</b>的证据提交给模型。上面的决策阶段会说明这一次为什么
        调用了模型、为什么没有、或者为什么根本没走到这一步。
      </p>
      <p>
        模型输出永远单独显示在「模型观察（未验证）」下，不会并入确定性发现，也不会被当作已完成的结论；
        它既不修改发现，也不自动完成任何任务。候选改写也一样：可以对照阅读，但不会被执行，
        也不会替换你输入的 SQL。
      </p>
    </Collapse>
  </section>
</template>
