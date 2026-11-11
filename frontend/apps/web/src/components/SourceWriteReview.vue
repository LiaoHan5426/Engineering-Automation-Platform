<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Button, Checkbox, Collapse, ConfirmBox, Dialog, Feedback, Textarea } from '@eap/ui'
import {
  CodeProposalStatus,
  runtimeApi,
  type SourceWriteReviewDetail,
  type SourceWriteReviewItem,
} from '@eap/runtime-client'
import { errorMessage } from '../lib/presentation'

const props = defineProps<{ proposalId?: string; scopeKey?: string }>()
const emit = defineEmits<{ closed: [] }>()
const { t, d } = useI18n()
const tr = (key: string) => t('application.review.' + key)
const items = ref<SourceWriteReviewItem[]>([])
const listBusy = ref(false)
const listError = ref('')
const selected = ref('')
const detail = ref<SourceWriteReviewDetail>()
const reading = ref(false)
const saving = ref(false)
const error = ref('')
const note = ref('')
const checked = ref(false)
const confirm = ref(false)
let generation = 0
let listGeneration = 0

async function refreshList() {
  const token = ++listGeneration
  listBusy.value = true
  listError.value = ''
  try {
    const records = await runtimeApi.sourceWriteReviews()
    if (token === listGeneration) items.value = records
  } catch (failure) {
    if (token === listGeneration) listError.value = errorMessage(failure)
  } finally {
    if (token === listGeneration) listBusy.value = false
  }
}

function dismiss() {
  generation++
  selected.value = ''
  detail.value = undefined
  reading.value = false
  saving.value = false
  confirm.value = false
  note.value = ''
  checked.value = false
}

async function inspect(id: string) {
  const token = ++generation
  selected.value = id
  detail.value = undefined
  checked.value = false
  error.value = ''
  reading.value = true
  try {
    const record = await runtimeApi.sourceWriteReview(id)
    if (token === generation) detail.value = record
  } catch (failure) {
    if (token === generation) error.value = errorMessage(failure)
  } finally {
    if (token === generation) reading.value = false
  }
}

function recorded(record: SourceWriteReviewDetail) {
  detail.value = record
  error.value = ''
  note.value = ''
  emit('closed')
  if (!props.proposalId) void refreshList()
}

async function closeReview() {
  const record = detail.value
  if (!record || record.resolution || saving.value || !checked.value || !note.value.trim()) return
  const token = generation
  const id = selected.value
  saving.value = true
  try {
    const saved = await runtimeApi.closeSourceWriteReview(id, {
      requestId: crypto.randomUUID(),
      digest: record.observation.digest,
      note: note.value.trim(),
      confirmed: true,
    })
    if (token === generation) recorded(saved)
  } catch (failure) {
    if (token !== generation) return
    // A missing response is ambiguous. Read the original record before accepting another decision.
    detail.value = undefined
    try {
      const latest = await runtimeApi.sourceWriteReview(id)
      if (token !== generation) return
      if (latest.resolution) recorded(latest)
      else {
        error.value = errorMessage(failure)
        detail.value = latest
      }
    } catch {
      if (token === generation) error.value = tr('readAgain')
    }
  } finally {
    if (token === generation) {
      checked.value = false
      confirm.value = false
      saving.value = false
    }
  }
}

watch(
  () => [props.proposalId, props.scopeKey],
  () => {
    dismiss()
    if (!props.proposalId) void refreshList()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  listGeneration++
})
onDeactivated(dismiss)
</script>

<template>
  <Button
    v-if="proposalId"
    size="sm"
    data-testid="source-write-review-open"
    @click="inspect(proposalId)"
    >{{ tr('open') }}</Button
  >
  <article v-else class="eap-panel review-panel" data-testid="source-write-reviews">
    <header class="review-bar">
      <h2>{{ tr('title') }}</h2>
      <Button size="sm" :disabled="listBusy" @click="refreshList">{{ tr('refresh') }}</Button>
    </header>
    <p>{{ tr('intro') }}</p>
    <Feedback v-if="listError" tone="error">{{ listError }}</Feedback>
    <p v-else-if="listBusy" role="status">{{ tr('loading') }}</p>
    <p v-else-if="!items.length">{{ tr('empty') }}</p>
    <ul v-else class="review-list">
      <li v-for="item in items" :key="item.id" class="review-bar">
        <div>
          <Badge :tone="item.status === CodeProposalStatus.CLOSED_UNKNOWN ? 'neutral' : 'warning'">
            {{ t('application.status.' + item.status) }}
          </Badge>
          <p>
            {{ d(new Date(item.startedAt)) }} · <code>{{ item.id }}</code>
          </p>
        </div>
        <Button
          v-if="item.status !== CodeProposalStatus.APPLYING"
          size="sm"
          data-testid="source-write-review-open"
          @click="inspect(item.id)"
          >{{ tr('open') }}</Button
        >
      </li>
    </ul>
  </article>

  <Dialog
    v-if="selected"
    :title="tr('title')"
    :close-label="tr('dismiss')"
    size="lg"
    :busy="saving"
    @close="dismiss"
  >
    <p v-if="reading" role="status">{{ tr('loading') }}</p>
    <Feedback v-if="error" tone="error">{{ error }}</Feedback>
    <div v-if="detail" class="review-content" data-testid="source-write-observation">
      <p>{{ detail.workspace }}</p>
      <Feedback v-if="detail.resolution" tone="info" data-testid="source-write-audit">
        <strong>{{ tr('closed') }}</strong>
        <p>{{ detail.resolution.operator }} · {{ d(new Date(detail.resolution.closedAt)) }}</p>
        <p class="review-note">{{ detail.resolution.note }}</p>
      </Feedback>
      <p v-else>{{ tr('snapshot') }}</p>
      <ul class="review-list">
        <li
          v-for="file in detail.observation.files"
          :key="file.path"
          data-testid="source-write-file"
        >
          <Collapse>
            <template #summary>
              <code>{{ file.path }}</code>
              <Badge :tone="file.match === 'DIFFERENT' ? 'warning' : 'neutral'">
                {{ tr('match.' + file.match) }}
              </Badge>
            </template>
            <dl class="review-hashes">
              <dt>{{ tr('baseline') }}</dt>
              <dd>
                <code>{{ file.baselineHash }}</code>
              </dd>
              <dt>{{ tr('candidate') }}</dt>
              <dd>
                <code>{{ file.candidateHash }}</code>
              </dd>
              <dt>{{ tr('current') }}</dt>
              <dd>
                <code>{{ file.currentHash }}</code>
              </dd>
            </dl>
          </Collapse>
        </li>
      </ul>
      <template v-if="!detail.resolution">
        <label class="review-content">
          {{ tr('note') }}
          <Textarea
            v-model="note"
            :maxlength="2000"
            :disabled="saving"
            data-testid="source-write-note"
          />
        </label>
        <label class="review-check">
          <Checkbox v-model="checked" :disabled="saving" data-testid="source-write-checked" />
          {{ tr('checked') }}
        </label>
      </template>
    </div>
    <template #footer>
      <Button
        v-if="!detail?.resolution"
        size="sm"
        :disabled="reading || saving"
        data-testid="source-write-refresh"
        @click="inspect(selected)"
        >{{ tr('refresh') }}</Button
      >
      <Button
        v-if="detail && !detail.resolution"
        size="sm"
        variant="primary"
        :disabled="!checked || !note.trim() || saving"
        data-testid="source-write-confirm"
        @click="confirm = true"
        >{{ tr('close') }}</Button
      >
    </template>
  </Dialog>
  <ConfirmBox
    v-if="confirm"
    :title="tr('close')"
    :impact="[tr('impact'), tr('noEvidence')]"
    :confirm-label="tr('save')"
    :busy="saving"
    @confirm="closeReview"
    @cancel="confirm = false"
  />
</template>

<style scoped>
.review-panel,
.review-content,
.review-list {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.review-panel {
  padding: 16px;
}

.review-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.review-list {
  padding: 0;
  list-style: none;
}

.review-list li {
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.review-content,
.review-bar {
  overflow-wrap: anywhere;
}

.review-list code {
  margin-inline-end: 8px;
}

.review-hashes {
  margin: 8px 0 0 16px;
}

.review-hashes dd {
  margin: 0 0 6px;
}

.review-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.review-note {
  white-space: pre-wrap;
}
</style>
