<script setup lang="ts">
import { Button, Checkbox, Collapse, Feedback, Input, Select, Textarea } from '@eap/ui'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const {
  sqlError,
  goal,
  sqlBusy,
  selectedExpert,
  registeredExperts,
  needsPattern,
  searchPattern,
  sql,
  selectedDatabase,
  allowedDatabases,
  explainText,
  enhanceModel,
  clearComposer,
  taskBusy,
  submitTask,
  canAnalyze,
  primaryAction,
} = props.analysis
</script>

<template>
  <div class="composer" id="composer">
    <Feedback tone="error" v-if="sqlError" role="alert">{{ sqlError }}</Feedback>
    <label class="field-label" for="composer-goal">业务问题 / 目标</label>
    <Textarea
      id="composer-goal"
      :ref="analysis.composerGoal"
      v-model="goal"
      rows="2"
      :disabled="sqlBusy"
      placeholder="例如：订单列表查询在数据量增长后明显变慢，想确认是否缺索引或存在可改写点"
    />
    <Collapse class="composer-more">
      <template #summary>完整输入：执行专家、待分析 SQL、数据库资料与模型</template>
      <label class="field-label" for="expert-selector">执行专家</label>
      <Select id="expert-selector" v-model="selectedExpert" :disabled="sqlBusy">
        <option v-for="expert in registeredExperts" :key="expert.id" :value="expert.id">
          {{ expert.name }}
        </option>
      </Select>
      <label v-if="needsPattern" class="field-label">
        本地检索目标
        <Input v-model="searchPattern" :disabled="sqlBusy" placeholder="例如 TODO 或具体符号名" />
      </label>
      <label class="field-label" for="sql-code">待分析 SQL</label>
      <Textarea
        id="sql-code"
        v-model="sql"
        class="code-input"
        rows="9"
        :disabled="sqlBusy"
        spellcheck="false"
        placeholder="SELECT …（仅检索知识时可留空）"
      />
      <label class="field-label" for="database-selector">已授权资料</label>
      <Select id="database-selector" v-model="selectedDatabase" :disabled="sqlBusy">
        <option value="">不使用数据库资料</option>
        <option v-for="profile in allowedDatabases" :key="profile.id" :value="profile.id">
          {{ profile.label }}
        </option>
      </Select>
      <p v-if="!allowedDatabases.length" class="hint">
        当前专家没有已配置的数据库资料，请在专家定义中选择资料后重新启用并授权。
      </p>
      <label class="field-label" for="explain-input">EXPLAIN JSON 快照</label>
      <Textarea
        id="explain-input"
        v-model="explainText"
        class="code-input"
        rows="4"
        :disabled="sqlBusy"
        placeholder="粘贴自行取得的 EXPLAIN JSON，平台不会自动执行 SQL"
      />
    </Collapse>
    <div class="composer-bar">
      <label class="row composer-model">
        <Checkbox v-model="enhanceModel" :disabled="sqlBusy" />
        显式请求模型增强（输出仍为待验证观察）
      </label>
      <span class="hint">默认不连接数据库、不执行 SQL；不要粘贴密码、连接串或业务数据。</span>
      <Button variant="secondary" type="button" :disabled="sqlBusy" @click="clearComposer">
        清空
      </Button>
      <Button
        variant="secondary"
        type="button"
        :disabled="taskBusy || !goal.trim()"
        @click="submitTask"
      >
        {{ taskBusy ? '执行中…' : '交给本地能力' }}
      </Button>
      <Button
        variant="primary"
        type="button"
        :disabled="sqlBusy || !canAnalyze"
        @click="primaryAction"
      >
        {{ sqlBusy ? '正在分析…' : '开始分析' }}
      </Button>
    </div>
  </div>
</template>
