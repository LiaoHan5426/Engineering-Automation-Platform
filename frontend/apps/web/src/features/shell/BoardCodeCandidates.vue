<script setup lang="ts">
import { isCodeProposalStatus } from '@eap/runtime-client'

import { CodeProposalStatus } from '@eap/runtime-client'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Badge, Button, ConfirmBox, Feedback } from '@eap/ui'
import {
  runtimeApi,
  type BoardTask,
  type BoardCodeCandidates,
  type CodeProposalState,
} from '@eap/runtime-client'
import { useI18n } from 'vue-i18n'
import GenerationBaseline from '../../components/GenerationBaseline.vue'
import ProposalApplication from '../../components/ProposalApplication.vue'
import ProposalDiffView from '../../components/ProposalDiffView.vue'
import DeliveryEvidencePanel from '../../components/DeliveryEvidencePanel.vue'
const props = defineProps<{ task: BoardTask; disabled?: boolean }>()
const emit = defineEmits<{ pending: [value: boolean]; changed: []; runs: [] }>()
const { t } = useI18n()
const page = ref<BoardCodeCandidates | null>(null),
  opened = ref<CodeProposalState | null>(null)
const loading = ref(false),
  opening = ref(false),
  writing = ref(false),
  refusing = ref(false),
  confirmRefuse = ref(false)
const fresh = ref(false),
  failed = ref(false),
  detailFailed = ref(false),
  actionNote = ref('')
const reviewVersion = ref(0)
let generation = 0
const pending = computed(() => writing.value || refusing.value)
const blocked = computed(
  () => !!props.disabled || pending.value || !fresh.value || detailFailed.value || opening.value,
)
const stale = computed(
  () => opened.value?.proposal.generation?.taskBinding?.revision !== props.task.revision,
)
const scopeKey = computed(() =>
  [props.task.projectId, props.task.id, props.task.revision].join(':'),
)
function checkDetail(state: CodeProposalState, proposalId: string) {
  const proposal = state.proposal,
    binding = proposal?.generation?.taskBinding
  if (
    !page.value ||
    proposal.id !== proposalId ||
    binding?.taskId !== props.task.id ||
    binding.projectId !== props.task.projectId ||
    proposal.workspace !== page.value.workspacePath ||
    !page.value.items.some(
      (item) =>
        item.id === proposalId &&
        item.conversationId === proposal.conversationId &&
        item.generationId === proposal.generation?.id &&
        item.fileCount === proposal.files.length &&
        item.taskRevision === binding.revision,
    ) ||
    !isCodeProposalStatus(state.status) ||
    proposal.files.length < 1 ||
    proposal.files.length > 8 ||
    !Array.isArray(proposal.generation?.companionFiles) ||
    proposal.files.length !== 1 + proposal.generation.companionFiles.length ||
    proposal.files.some((file, index) => {
      const baseline =
        index === 0
          ? { path: proposal.generation!.targetPath, baseHash: proposal.generation!.baseHash }
          : proposal.generation!.companionFiles[index - 1]
      return file.path !== baseline?.path || file.baseHash !== baseline?.baseHash
    })
  )
    throw new Error('BOARD_CODE_IDENTITY_MISMATCH')
  return state
}
async function readDetail(id: string) {
  const token = generation
  const state = await runtimeApi.boardCodeCandidate(props.task.id, id, props.task.projectId)
  if (token !== generation) throw new Error('BOARD_CODE_SCOPE_CHANGED')
  return checkDetail(state, id)
}
function observe(state: CodeProposalState) {
  opened.value = state
  const item = page.value?.items.find((item) => item.id === state.proposal.id)
  if (item) item.status = state.status
  return state
}
async function load() {
  if (loading.value || pending.value) return
  const token = generation
  loading.value = true
  fresh.value = false
  failed.value = false
  try {
    const data = await runtimeApi.boardCodeCandidates(props.task.id, props.task.projectId)
    if (token !== generation) return
    if (
      data.taskId !== props.task.id ||
      data.projectId !== props.task.projectId ||
      data.currentRevision !== props.task.revision ||
      !data.workspacePath ||
      !Array.isArray(data.items) ||
      data.items.length > 20 ||
      typeof data.truncated !== 'boolean' ||
      data.items.some(
        (item) =>
          !item.id ||
          !item.conversationId ||
          !item.generationId ||
          !Number.isSafeInteger(item.taskRevision) ||
          item.taskRevision < 1 ||
          !Number.isSafeInteger(item.fileCount) ||
          item.fileCount < 1 ||
          item.fileCount > 8 ||
          !isCodeProposalStatus(item.status),
      )
    )
      throw new Error('BOARD_CODE_SCOPE_CHANGED')
    page.value = data
    fresh.value = true
    if (opened.value) {
      observe(await readDetail(opened.value.proposal.id))
      detailFailed.value = false
    }
  } catch {
    if (token === generation) {
      failed.value = true
      fresh.value = false
    }
  } finally {
    if (token === generation) loading.value = false
  }
}
async function open(id: string) {
  if (!fresh.value || pending.value || opening.value) return
  const token = generation
  opened.value = null
  opening.value = true
  detailFailed.value = false
  actionNote.value = ''
  try {
    const state = await readDetail(id)
    if (token === generation) observe(state)
  } catch {
    if (token === generation) detailFailed.value = true
  } finally {
    if (token === generation) opening.value = false
  }
}
const operations = {
  read: async () => {
    if (!opened.value || !fresh.value) throw new Error('BOARD_CODE_READ_REQUIRED')
    const state = await readDetail(opened.value.proposal.id)
    return observe(state)
  },
  apply: async () => {
    if (
      props.disabled ||
      refusing.value ||
      !fresh.value ||
      detailFailed.value ||
      stale.value ||
      !opened.value
    )
      throw new Error('BOARD_CODE_REVIEW_REQUIRED')
    return runtimeApi.applyBoardCodeCandidate(props.task.id, opened.value.proposal.id, {
      projectId: props.task.projectId,
      revision: props.task.revision,
      confirmed: true,
    })
  },
}
async function refuse() {
  confirmRefuse.value = false
  if (blocked.value || !opened.value || opened.value.status !== CodeProposalStatus.PROPOSED) return
  const token = generation,
    id = opened.value.proposal.id
  refusing.value = true
  actionNote.value = ''
  try {
    await runtimeApi.refuseBoardCodeCandidate(props.task.id, id, {
      projectId: props.task.projectId,
      revision: props.task.revision,
      confirmed: true,
    })
  } catch {
    if (token === generation) actionNote.value = t('boardCode.uncertain')
  } finally {
    if (token === generation) {
      try {
        observe(await readDetail(id))
        reviewVersion.value++
        detailFailed.value = false
      } catch {
        detailFailed.value = true
      }
      refusing.value = false
    }
  }
}
watch(pending, (value) => emit('pending', value), { flush: 'sync' })
watch(scopeKey, () => {
  generation++
  page.value = null
  opened.value = null
  fresh.value = false
  failed.value = false
  detailFailed.value = false
  loading.value = false
  opening.value = false
  writing.value = false
  refusing.value = false
  confirmRefuse.value = false
})
onBeforeUnmount(() => {
  generation++
  emit('pending', false)
})
</script>
<template>
  <section class="board-code" data-testid="board-code-candidates">
    <p>{{ t('boardCode.hint') }}</p>
    <Button :disabled="loading || pending" data-testid="board-code-refresh" @click="load">{{
      t('boardCode.refresh')
    }}</Button>
    <Feedback v-if="failed || detailFailed" tone="warning">{{
      t('boardCode.readFailed')
    }}</Feedback>
    <p v-if="page && !page.items.length">{{ t('boardCode.empty') }}</p>
    <p v-if="page?.truncated">{{ t('boardCode.truncated') }}</p>
    <ul v-if="page">
      <li v-for="item in page.items" :key="item.id">
        <code>{{ item.targetPath }}</code> · r{{ item.taskRevision }} ·
        <Badge>{{ t('application.status.' + item.status) }}</Badge>
        <span v-if="item.taskRevision !== task.revision">{{ t('boardCode.stale') }}</span>
        <Button
          :disabled="!fresh || pending || opening"
          data-testid="board-code-open"
          @click="open(item.id)"
          >{{ t('boardCode.open') }}</Button
        >
      </li>
    </ul>
    <section v-if="opened" class="board-code" data-testid="board-code-review">
      <DeliveryEvidencePanel
        :files="opened.proposal.files"
        :status="t('application.status.' + opened.status)"
        :labels="{
          filter: t('boardCode.fileFilter'),
          title: t('boardCode.evidenceTitle'),
          empty: t('boardCode.noMatchingFiles'),
          total: t('boardCode.total'),
          changed: t('boardCode.changed'),
          added: t('boardCode.added'),
          details: t('boardCode.details'),
          bytes: t('boardCode.bytes'),
          baseline: t('boardCode.baseline'),
          boundary: t('boardCode.evidenceBoundary'),
        }"
      />
      <GenerationBaseline :generation="opened.proposal.generation" />
      <p v-if="stale">{{ t('boardCode.stale') }}</p>
      <ProposalDiffView
        v-for="file in opened.proposal.files"
        :key="file.path"
        :path="file.path"
        :before="file.before"
        :after="file.content"
      />
      <ProposalApplication
        :key="opened.proposal.id + ':' + reviewVersion"
        :proposal="opened.proposal"
        :scope-key="scopeKey"
        :read-only="blocked || stale || task.executionActive"
        :operations="operations"
        @pending="writing = $event"
        @applied="emit('changed')"
        @continue="emit('runs')"
      />
      <p v-if="actionNote" role="status">{{ actionNote }}</p>
      <Button
        v-if="opened.status === CodeProposalStatus.PROPOSED"
        :disabled="blocked"
        data-testid="board-code-refuse"
        @click="confirmRefuse = true"
        >{{ t('boardCode.refuse') }}</Button
      >
    </section>
    <ConfirmBox
      v-if="confirmRefuse"
      :title="t('boardCode.refuse')"
      :impact="[opened?.proposal.id ?? '', t('boardCode.refuseImpact')]"
      :confirm-label="t('boardCode.refuse')"
      @confirm="refuse"
      @cancel="confirmRefuse = false"
    />
  </section>
</template>
<style scoped>
.board-code {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}

.board-code li {
  display: grid;
  gap: 6px;
  margin-block: 8px;
}

.board-code code {
  overflow-wrap: anywhere;
}
</style>
