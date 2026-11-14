<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi, type ModelHistoryUsage } from '@eap/runtime-client'
import { Button, ConfirmBox, Dialog, Feedback, Textarea } from '@eap/ui'
import { errorMessage } from '../../lib/presentation'

const props = defineProps<{ conversationId: string }>()
const emit = defineEmits<{ close: []; adopt: [text: string] }>()
const { t } = useI18n()
const usage = ref<ModelHistoryUsage>()
const refreshControl = ref<InstanceType<typeof Button>>()
const summary = ref(''),
  adoptedText = ref(''),
  confirmingSummary = ref(false),
  discarding = ref(false),
  generating = ref(false)
function close() {
  if (busy.value) return
  if (summary.value.trim() && summary.value !== adoptedText.value) discarding.value = true
  else emit('close')
}
async function summarize() {
  confirmingSummary.value = false
  if (busy.value) return
  const ticket = ++revision
  const conversationId = props.conversationId
  const operationId = crypto.randomUUID()
  activeSummary = { conversationId, operationId }
  busy.value = true
  generating.value = true
  error.value = ''
  try {
    const result = await runtimeApi.summarizeModelHistory(conversationId, operationId)
    if (ticket === revision) {
      summary.value = result.text
      adoptedText.value = ''
    }
  } catch (failure) {
    if (ticket === revision) error.value = errorMessage(failure)
  } finally {
    if (ticket === revision) {
      busy.value = false
      generating.value = false
      activeSummary = undefined
      await nextTick()
      refreshControl.value?.$el.focus()
    }
  }
}
let activeSummary: { conversationId: string; operationId: string } | undefined
async function cancelSummary() {
  const target = activeSummary
  const ticket = revision
  if (!target) return
  try {
    await runtimeApi.cancelModelHistorySummary(target.conversationId, target.operationId)
  } catch (failure) {
    if (ticket === revision && activeSummary === target) error.value = errorMessage(failure)
  }
}
function adoptSummary() {
  if (!summary.value.trim() || busy.value) return
  emit('adopt', summary.value)
  adoptedText.value = summary.value
}
const busy = ref(false),
  confirming = ref(false),
  error = ref(''),
  cleared = ref(false)
let revision = 0
async function load() {
  const ticket = ++revision
  busy.value = true
  error.value = ''
  cleared.value = false
  try {
    const result = await runtimeApi.modelHistory(props.conversationId)
    if (ticket === revision) usage.value = result
  } catch (failure) {
    if (ticket === revision) error.value = errorMessage(failure)
  } finally {
    if (ticket === revision) busy.value = false
  }
}
async function clear() {
  confirming.value = false
  if (busy.value) return
  const ticket = ++revision,
    id = props.conversationId
  busy.value = true
  error.value = ''
  let failure: unknown
  try {
    await runtimeApi.clearModelHistory(id)
  } catch (problem) {
    failure = problem
  }
  // Read authority even if DELETE's response was lost; never repeat DELETE automatically.
  try {
    const result = await runtimeApi.modelHistory(id)
    if (ticket !== revision) return
    usage.value = result
    cleared.value = result.messages === 0
    if (!cleared.value)
      error.value = failure ? errorMessage(failure) : t('contextBudget.historyChanged')
  } catch (problem) {
    if (ticket === revision) {
      usage.value = undefined
      error.value = errorMessage(problem)
    }
  } finally {
    if (ticket === revision) {
      busy.value = false
      await nextTick()
      refreshControl.value?.$el.focus()
    }
  }
}
watch(
  () => props.conversationId,
  () => {
    activeSummary = undefined
    generating.value = false
    usage.value = undefined
    summary.value = ''
    adoptedText.value = ''
    cleared.value = false
    confirming.value = false
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  revision++
})
</script>
<template>
  <Dialog
    :title="t('contextBudget.historyTitle')"
    :close-label="t('preview.close')"
    :busy="busy"
    @close="close"
  >
    <div class="model-history" data-testid="model-history-dialog">
      <p>{{ t('contextBudget.historyBoundary') }}</p>
      <Feedback v-if="error" tone="error">{{ error }}</Feedback>
      <Feedback v-if="cleared" tone="success">{{ t('contextBudget.historyCleared') }}</Feedback>
      <p v-if="usage" data-testid="model-history-usage">
        {{ t('contextBudget.historyUsage', usage) }}
      </p>
      <Button ref="refreshControl" :disabled="busy" @click="load">{{
        t('contextBudget.historyRefresh')
      }}</Button>
      <Button
        :disabled="busy || !usage?.messages"
        data-testid="model-history-summarize"
        @click="confirmingSummary = true"
        >{{ t('contextBudget.summaryGenerate') }}</Button
      >
      <Button v-if="generating" @click="cancelSummary">{{
        t('contextBudget.summaryCancel')
      }}</Button>
      <section v-if="summary" class="model-history">
        <label
          >{{ t('contextBudget.summaryReview')
          }}<Textarea
            v-model="summary"
            rows="8"
            maxlength="8000"
            :disabled="busy"
            data-testid="model-history-summary"
        /></label>
        <p>{{ t('contextBudget.summaryBoundary') }}</p>
        <Button
          :disabled="busy || !summary.trim() || summary === adoptedText"
          data-testid="model-history-summary-adopt"
          @click="adoptSummary"
          >{{ t('contextBudget.summaryAdopt') }}</Button
        >
      </section>
      <Button
        variant="danger"
        :disabled="busy || !usage?.messages"
        data-testid="model-history-clear"
        @click="confirming = true"
        >{{ t('contextBudget.historyClear') }}</Button
      >
    </div>
  </Dialog>
  <ConfirmBox
    v-if="confirmingSummary"
    :title="t('contextBudget.summaryGenerate')"
    :impact="[t('contextBudget.summaryImpact')]"
    :confirm-label="t('contextBudget.summaryGenerate')"
    @confirm="summarize"
    @cancel="confirmingSummary = false"
  />
  <ConfirmBox
    v-if="discarding"
    :title="t('contextBudget.summaryDiscard')"
    :impact="[t('contextBudget.summaryDiscardImpact')]"
    :confirm-label="t('preview.close')"
    @confirm="emit('close')"
    @cancel="discarding = false"
  />
  <ConfirmBox
    v-if="confirming"
    :title="t('contextBudget.historyClear')"
    :impact="[t('contextBudget.historyImpact')]"
    :confirm-label="t('contextBudget.historyClear')"
    @confirm="clear"
    @cancel="confirming = false"
  />
</template>
<style scoped>
.model-history {
  display: grid;
  gap: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
