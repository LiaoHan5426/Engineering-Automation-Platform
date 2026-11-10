<script setup lang="ts">
import { BoardDeliveryDecision } from '@eap/runtime-client'

import { BoardDeliveryErrors, BoardErrors } from '@eap/runtime-client'

import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Dialog, Button, Input, Textarea, ConfirmBox, Collapse, Checkbox } from '@eap/ui'
import {
  runtimeApi,
  proposalRefused,
  type BoardRun,
  type BoardTask,
  type BoardDeliveryPage,
  type BoardAppliedCandidate,
} from '@eap/runtime-client'
import { isRequestError } from '@eap/request'
import {
  readDeliveryRequest,
  writeDeliveryRequest,
  validDeliveryPaths,
  validApplicationRef,
  type PendingDeliveryRequest,
} from './boardDeliveryRequest'
import { apiStorageScope } from '../../lib/runtimeConfig'
import { useI18n } from 'vue-i18n'
import BoardAppliedCandidates from './BoardAppliedCandidates.vue'
const props = defineProps<{ task: BoardTask; run: BoardRun; disabled?: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t } = useI18n()
const page = ref<BoardDeliveryPage | null>(null),
  loading = ref(false),
  note = ref('')
const pathsText = ref(''),
  deliveryNote = ref(''),
  confirming = ref(false),
  sending = ref(false)
const linkApplication = ref(false),
  conversationId = ref(''),
  proposalId = ref('')
const applicationRef = computed(() => ({
  conversationId: conversationId.value,
  proposalId: proposalId.value,
}))
function selectApplication(candidate: BoardAppliedCandidate) {
  if (busy.value || props.disabled || pending.value) return
  linkApplication.value = true
  conversationId.value = candidate.conversationId
  proposalId.value = candidate.proposalId
  pathsText.value = candidate.paths.join('\n')
}
const applicationValid = computed(
  () =>
    !linkApplication.value ||
    (validApplicationRef(applicationRef.value) &&
      paths.value.length >= 1 &&
      paths.value.length <= 8),
)
const pending = ref<PendingDeliveryRequest | null>(null),
  fresh = ref(false)
const criteriaConfirmed = ref(false),
  previewConfirmed = ref(false),
  comment = ref('')
const deciding = ref<BoardDeliveryDecision | null>(null)
const linkedProposalStatus = ref<string | null>(null)
async function loadLinkedProposalStatus(conversation: string, proposal: string) {
  try {
    const state = await runtimeApi.codeProposal(conversation, proposal)
    linkedProposalStatus.value = state.status
  } catch {
    linkedProposalStatus.value = null
  }
}
const store = (() => {
  try {
    return sessionStorage
  } catch {
    return null
  }
})()
const record = computed(() => page.value?.record)
watch(
  () => {
    const evidence = record.value?.applicationEvidence
    if (evidence) return [evidence.conversationId, evidence.proposalId] as const
    if (linkApplication.value && validApplicationRef(applicationRef.value))
      return [conversationId.value, proposalId.value] as const
    return null
  },
  (ids) => {
    if (!ids) {
      linkedProposalStatus.value = null
      return
    }
    void loadLinkedProposalStatus(ids[0], ids[1])
  },
  { immediate: true },
)
const paths = computed(() => pathsText.value.split(/\r?\n/).filter((path) => path !== ''))
const validPaths = computed(() => validDeliveryPaths(paths.value))
const busy = computed(() => loading.value || sending.value)
const canSubmit = computed(
  () =>
    fresh.value &&
    !pending.value &&
    !busy.value &&
    !props.disabled &&
    !props.task.executionActive &&
    page.value?.prepareAllowed &&
    !record.value &&
    validPaths.value &&
    applicationValid.value,
)
const canDecide = computed(
  () =>
    fresh.value &&
    !pending.value &&
    !busy.value &&
    !props.disabled &&
    !props.task.executionActive &&
    props.task.column === 'acceptance' &&
    !!record.value &&
    !record.value.decision,
)
const canAccept = computed(
  () =>
    canDecide.value &&
    props.task.revision === record.value?.submittedRevision &&
    criteriaConfirmed.value &&
    previewConfirmed.value,
)
const canReject = computed(() => canDecide.value && !!comment.value.trim())
let generation = 0
async function load(manual = false, confirmedRequestId?: string) {
  const current = generation
  loading.value = true
  fresh.value = false
  try {
    const data = await runtimeApi.boardDelivery(
      props.task.id,
      props.run.execution.id,
      props.task.projectId,
    )
    if (current !== generation) return false
    page.value = data
    fresh.value = true
    const savedRequestId =
      pending.value && 'decisionRequest' in pending.value
        ? data.record?.decision?.requestId
        : data.record?.requestId
    // GET identity alone cannot establish payload equality (notes/comments are redacted).
    if (
      pending.value &&
      !pending.value.rejectionCode &&
      confirmedRequestId === pending.value.requestId &&
      savedRequestId === confirmedRequestId
    ) {
      writeDeliveryRequest(store, props.task.id, props.run.execution.id, apiStorageScope, null)
      pending.value = null
      note.value = t('boardDelivery.recovered')
      emit('changed')
    } else if (manual) emit('changed')
    return true
  } catch (error) {
    if (current === generation) {
      const missing = isRequestError(error) && error.response?.status === 404
      note.value = missing
        ? t('boardDelivery.blocked') +
          ' · ' +
          String(error.response?.data?.code ?? BoardErrors.BOARD_RUN_NOT_FOUND)
        : t('boardDelivery.loadFailed')
    }
  } finally {
    if (current === generation) loading.value = false
  }
}
async function submit() {
  confirming.value = false
  if (!canSubmit.value) return
  const request = {
    projectId: props.task.projectId,
    revision: props.task.revision,
    workspacePath: props.run.execution.workspacePath,
    requestId: crypto.randomUUID(),
    paths: paths.value,
    note: deliveryNote.value,
    ...(linkApplication.value ? { applicationRef: { ...applicationRef.value } } : {}),
  }
  if (
    !writeDeliveryRequest(store, props.task.id, props.run.execution.id, apiStorageScope, request)
  ) {
    note.value = t('boardDelivery.storageFailed')
    return
  }
  pending.value = request
  await sendPending()
}
async function decide() {
  const decision = deciding.value
  deciding.value = null
  if (
    !record.value ||
    (decision === BoardDeliveryDecision.ACCEPT ? !canAccept.value : !canReject.value) ||
    !decision
  )
    return
  const requestId = crypto.randomUUID()
  const request: PendingDeliveryRequest = {
    projectId: props.task.projectId,
    revision: props.task.revision,
    workspacePath: props.run.execution.workspacePath,
    requestId,
    decisionRequest: {
      projectId: props.task.projectId,
      revision: props.task.revision,
      requestId,
      deliveryId: record.value.id,
      decision,
      criteriaConfirmed: criteriaConfirmed.value,
      previewConfirmed: previewConfirmed.value,
      comment: comment.value,
    },
  }
  if (
    !writeDeliveryRequest(store, props.task.id, props.run.execution.id, apiStorageScope, request)
  ) {
    note.value = t('boardDelivery.storageFailed')
    return
  }
  pending.value = request
  await sendPending()
}
async function sendPending() {
  if (!pending.value || pending.value.rejectionCode) return
  const request = pending.value
  const current = generation
  sending.value = true
  note.value = t('boardDelivery.uncertain')
  let rejected = false,
    confirmedRequestId: string | undefined
  try {
    if ('decisionRequest' in request)
      await runtimeApi.decideBoardDelivery(props.task.id, props.run.execution.id, {
        ...request.decisionRequest,
      })
    else
      await runtimeApi.submitBoardDelivery(props.task.id, props.run.execution.id, {
        projectId: request.projectId,
        revision: request.revision,
        workspacePath: request.workspacePath,
        requestId: request.requestId,
        paths: [...request.paths],
        note: request.note,
        ...(request.applicationRef ? { applicationRef: { ...request.applicationRef } } : {}),
      })
    confirmedRequestId = request.requestId
  } catch (error) {
    if (current !== generation) return
    rejected =
      isRequestError(error) &&
      !!error.response &&
      error.response.status >= 400 &&
      error.response.status < 500
    if (rejected && isRequestError(error)) {
      const code = String(error.response?.data?.code ?? '')
      note.value = t('boardDelivery.rejected') + ' · ' + code
      if (code === BoardDeliveryErrors.BOARD_DELIVERY_REQUEST_CONFLICT) {
        pending.value = { ...request, rejectionCode: code }
        writeDeliveryRequest(
          store,
          props.task.id,
          props.run.execution.id,
          apiStorageScope,
          pending.value,
        )
      }
    }
  } finally {
    if (current === generation) {
      const loaded = await load(false, confirmedRequestId)
      if (current === generation) {
        if (loaded && rejected && pending.value && !pending.value.rejectionCode) {
          criteriaConfirmed.value = false
          previewConfirmed.value = false
          writeDeliveryRequest(store, props.task.id, props.run.execution.id, apiStorageScope, null)
          pending.value = null
          emit('changed')
        }
        sending.value = false
      }
    }
  }
}
async function retry() {
  if (busy.value || !pending.value || pending.value.rejectionCode || props.disabled) return
  const current = generation
  if ((await load()) && current === generation && pending.value) await sendPending()
}
watch(
  [
    () => props.task.id,
    () => props.task.projectId,
    () => props.run.execution.id,
    () => props.task.revision,
  ],
  (identity, previous) => {
    const sameEntity = identity.slice(0, 3).every((value, index) => value === previous?.[index])
    generation++
    page.value = null
    loading.value = false
    sending.value = false
    confirming.value = false
    deciding.value = null
    if (!sameEntity) {
      pending.value = readDeliveryRequest(
        store,
        props.task.id,
        props.run.execution.id,
        props.task.projectId,
        apiStorageScope,
      )
      pathsText.value =
        pending.value && 'paths' in pending.value ? pending.value.paths.join('\n') : ''
      deliveryNote.value = pending.value && 'paths' in pending.value ? pending.value.note : ''
      const savedRef =
        pending.value && 'paths' in pending.value ? pending.value.applicationRef : null
      linkApplication.value = !!savedRef
      conversationId.value = savedRef?.conversationId ?? ''
      proposalId.value = savedRef?.proposalId ?? ''
      const pendingDecision =
        pending.value && 'decisionRequest' in pending.value ? pending.value.decisionRequest : null
      comment.value = pendingDecision?.comment ?? ''
      criteriaConfirmed.value = pendingDecision?.criteriaConfirmed ?? false
      previewConfirmed.value = pendingDecision?.previewConfirmed ?? false
    } else {
      // A revision refresh invalidates consent, not the user's text or the immutable pending payload.
      criteriaConfirmed.value = false
      previewConfirmed.value = false
    }
    note.value = pending.value ? t('boardDelivery.uncertain') : ''
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
</script>
<template>
  <Dialog
    :title="t('boardDelivery.title')"
    :close-label="t('preview.close')"
    :busy="sending"
    size="lg"
    data-testid="board-delivery-dialog"
    @close="emit('close')"
  >
    <div class="delivery">
      <p>
        <code>{{ run.execution.id }}</code> · {{ run.execution.workspacePath }}
      </p>
      <p>
        {{
          t(
            record?.source === 'CHAT_APPLIED_PREBOUND'
              ? 'boardDelivery.preboundHint'
              : record?.source === 'CHAT_APPLIED_POST_HOC'
                ? 'boardDelivery.postHocHint'
                : !record && linkApplication
                  ? 'boardDelivery.linkHint'
                  : 'boardDelivery.hint',
          )
        }}
      </p>
      <p>{{ t('boardDelivery.boundary') }}</p>
      <p v-if="pending?.rejectionCode" role="alert">
        {{ t('boardDelivery.contentConflict') }} · {{ pending.rejectionCode }}
      </p>
      <p v-else-if="note" role="status">{{ note }}</p>
      <p v-if="page && !page.prepareAllowed && !record" role="status">
        {{ t('boardDelivery.blocked') }} · {{ page.reason }}
      </p>
      <Button :disabled="busy" data-testid="delivery-refresh" @click="load(true)">{{
        t('boardDelivery.refresh')
      }}</Button>
      <Button
        v-if="pending"
        :disabled="busy || disabled || !!pending.rejectionCode"
        data-testid="delivery-retry"
        @click="retry"
        >{{ t('boardDelivery.retry') }}</Button
      >
      <section v-if="!record" class="delivery">
        <BoardAppliedCandidates
          :task="task"
          :run="run"
          :disabled="busy || !!disabled || !!pending"
          @select="selectApplication"
        />
        <label
          ><Checkbox
            v-model="linkApplication"
            :disabled="busy || disabled || !!pending"
            data-testid="delivery-link-application"
          />{{ t('boardDelivery.linkApplication') }}</label
        >
        <template v-if="linkApplication">
          <label
            >{{ t('boardDelivery.conversationId')
            }}<Input
              v-model="conversationId"
              :disabled="busy || disabled || !!pending"
              data-testid="delivery-conversation-id"
          /></label>
          <label
            >{{ t('boardDelivery.proposalId')
            }}<Input
              v-model="proposalId"
              :disabled="busy || disabled || !!pending"
              data-testid="delivery-proposal-id"
          /></label>
          <p v-if="!applicationValid">{{ t('boardDelivery.applicationInvalid') }}</p>
        </template>
        <label
          >{{ t('boardDelivery.paths')
          }}<Textarea
            v-model="pathsText"
            :disabled="busy || disabled || !!pending"
            data-testid="delivery-paths"
        /></label>
        <p v-if="pathsText && !validPaths" role="status">{{ t('boardDelivery.invalidPaths') }}</p>
        <label
          >{{ t('boardDelivery.note')
          }}<Textarea
            v-model="deliveryNote"
            :disabled="busy || disabled || !!pending"
            data-testid="delivery-note-input"
        /></label>
        <Button :disabled="!canSubmit" data-testid="delivery-submit" @click="confirming = true">{{
          t('boardDelivery.submit')
        }}</Button>
      </section>
      <section v-if="record" class="delivery" data-testid="delivery-record">
        <p>
          {{ record.source }} · <code>{{ record.id }}</code> · {{ record.createdAt }}
        </p>
        <Collapse v-if="record.applicationEvidence" data-testid="delivery-application-evidence">
          <template #summary>{{ t('boardDelivery.applicationEvidence') }}</template>
          <p>
            {{
              t(
                record.applicationEvidence.association === 'PREBOUND'
                  ? 'boardDelivery.preboundHint'
                  : 'boardDelivery.postHocHint',
              )
            }}
          </p>
          <p v-if="record.applicationEvidence.taskBinding" data-testid="delivery-task-binding">
            {{ t('generation.taskBinding') }}：{{
              record.applicationEvidence.taskBinding.projectId
            }}
            · {{ record.applicationEvidence.taskBinding.taskId }} · r{{
              record.applicationEvidence.taskBinding.revision
            }}
          </p>
          <p>
            {{ t('boardDelivery.conversationId') }}：<code>{{
              record.applicationEvidence.conversationId
            }}</code
            ><br />{{ t('boardDelivery.proposalId') }}：<code>{{
              record.applicationEvidence.proposalId
            }}</code>
          </p>
          <p
            v-if="linkedProposalStatus"
            data-testid="delivery-proposal-status"
            :data-refused="proposalRefused(linkedProposalStatus)"
          >
            {{ t('application.status.' + linkedProposalStatus) }}
          </p>
          <p>
            {{ record.applicationEvidence.targetPath }} ·
            {{ record.applicationEvidence.generationId }}
          </p>
          <p>
            {{ t('boardDelivery.generationBaseline') }}：<code>{{
              record.applicationEvidence.generationBaseHash
            }}</code
            ><br />{{ t('boardDelivery.appliedHash') }}：<code>{{
              record.applicationEvidence.appliedAfterHash
            }}</code>
          </p>
          <p>
            {{ record.applicationEvidence.operator }} ·
            {{ record.applicationEvidence.associatedAt }}
          </p>
        </Collapse>
        <p>
          {{ t('boardDelivery.verification') }}：<code>{{ record.verificationId }}</code>
        </p>
        <p>
          HEAD：<code>{{ record.baseCommit }}</code
          ><br />SHA-256：<code>{{ record.sourceHash }}</code>
        </p>
        <p>{{ record.goal }}</p>
        <p>{{ record.acceptanceCriteria }}</p>
        <p>{{ record.note }}</p>
        <Collapse v-for="file in record.files" :key="file.path" :open="true">
          <template #summary>{{ file.path }}</template>
          <div class="delivery__comparison">
            <section>
              <h3>{{ t('boardDelivery.before') }}</h3>
              <code>{{ file.beforeHash }}</code>
              <pre>{{ file.before }}</pre>
            </section>
            <section>
              <h3>{{ t('boardDelivery.after') }}</h3>
              <code>{{ file.afterHash }}</code>
              <pre>{{ file.after }}</pre>
            </section>
          </div>
        </Collapse>
      </section>
      <section v-if="record && !record.decision" class="delivery">
        <p>{{ t('boardDelivery.humanStatement') }}</p>
        <label
          ><Checkbox
            v-model="criteriaConfirmed"
            :disabled="!canDecide"
            data-testid="delivery-criteria"
          />{{ t('boardDelivery.criteria') }}</label
        >
        <label
          ><Checkbox
            v-model="previewConfirmed"
            :disabled="!canDecide"
            data-testid="delivery-preview"
          />{{ t('boardDelivery.preview') }}</label
        >
        <label
          >{{ t('boardDelivery.comment')
          }}<Textarea v-model="comment" :disabled="!canDecide" data-testid="delivery-comment"
        /></label>
        <div class="delivery__actions">
          <Button
            :disabled="!canAccept"
            data-testid="delivery-accept"
            @click="deciding = 'ACCEPT'"
            >{{ t('boardDelivery.accept') }}</Button
          ><Button
            :disabled="!canReject"
            data-testid="delivery-reject"
            @click="deciding = 'REJECT'"
            >{{ t('boardDelivery.reject') }}</Button
          >
        </div>
      </section>
      <section v-if="record?.decision" data-testid="delivery-decision">
        <h3>{{ t('boardDelivery.decision.' + record.decision.decision) }}</h3>
        <code>{{ record.decision.id }}</code>
        <p>{{ record.decision.operator }} · {{ record.decision.createdAt }}</p>
        <p>{{ record.decision.comment }}</p>
      </section>
      <ConfirmBox
        v-if="deciding"
        :title="
          t(deciding === 'ACCEPT' ? 'boardDelivery.confirmAccept' : 'boardDelivery.confirmReject')
        "
        :impact="[
          record?.id ?? '',
          record?.acceptanceCriteria ?? '',
          comment,
          t('boardDelivery.humanStatement'),
          t(deciding === 'ACCEPT' ? 'boardDelivery.acceptImpact' : 'boardDelivery.rejectImpact'),
        ]"
        :confirm-label="t(deciding === 'ACCEPT' ? 'boardDelivery.accept' : 'boardDelivery.reject')"
        :refusal="
          (deciding === 'ACCEPT' ? canAccept : canReject) ? undefined : t('boardDelivery.blocked')
        "
        @confirm="decide"
        @cancel="deciding = null"
      />
      <ConfirmBox
        v-if="confirming"
        :title="t('boardDelivery.confirmSubmit')"
        :impact="[
          run.execution.workspacePath,
          ...paths,
          deliveryNote,
          ...(linkApplication
            ? [conversationId, proposalId, t('boardDelivery.linkHint')]
            : [t('boardDelivery.hint')]),
        ]"
        :confirm-label="t('boardDelivery.submit')"
        :refusal="canSubmit ? undefined : t('boardDelivery.blocked')"
        @confirm="submit"
        @cancel="confirming = false"
      />
    </div>
  </Dialog>
</template>
<style scoped>
.delivery {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.delivery label {
  display: grid;
  gap: 6px;
}
.delivery p,
.delivery code {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.delivery code {
  font-size: 11px;
}
.delivery h3 {
  font-size: 13px;
}
.delivery__comparison {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.delivery__comparison section {
  min-width: 0;
}
.delivery pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
  background: var(--eap-code-bg);
  color: var(--eap-code-text);
  padding: 12px;
  font-size: 11px;
}
</style>
