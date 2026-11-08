import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  runtimeApi,
  type ExpertAgentDetail,
  type ExpertAgentInput,
  type ExpertAgentSummary,
} from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'
import { useMockServices } from '../../lib/serviceConfig'

export function useExpertAgentRuns(
  autoSelect = true,
  scope: () => 'list' | 'detail' | 'form' = () => 'list',
) {
  const runs = ref<ExpertAgentSummary[]>([])
  const selected = ref<{ id: string; expertId: string } | null>(null)
  const detail = ref<ExpertAgentDetail | null>(null)
  const automatic = ref(false)
  const busy = ref(false)
  const loading = ref(false)
  const checking = ref(true)
  const readError = ref('')
  const actionError = ref('')
  const now = ref(Date.now())
  let disposed = false,
    detailVersion = 0,
    refreshing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingSubmission: { signature: string; id: string } | null = null
  const preview = useMockServices
  const canReview = computed(() => {
    const d = detail.value
    return (
      !busy.value &&
      !loading.value &&
      !readError.value &&
      d?.run.state === 'awaiting-approval' &&
      d.candidate?.status === 'PROPOSED' &&
      d.candidate.proposal.files.length === 1 &&
      d.candidate.proposal.id === d.approval.proposal_id &&
      !!d.approval.approval_digest &&
      Date.parse(d.approval.approval_expires_at ?? '') > now.value &&
      Date.parse(d.run.expiresAt) > now.value
    )
  })
  async function loadDetail(background = false) {
    if (!selected.value || disposed || preview) return
    const selection = { ...selected.value },
      version = ++detailVersion
    if (!background) loading.value = true
    try {
      const result = await runtimeApi.expertAgentRun(selection.expertId, selection.id)
      if (!disposed && version === detailVersion) {
        if (JSON.stringify(detail.value) !== JSON.stringify(result)) detail.value = result
        readError.value = ''
      }
    } catch (error) {
      if (!disposed && version === detailVersion) readError.value = errorMessage(error)
    } finally {
      if (!disposed && version === detailVersion) loading.value = false
    }
  }
  async function select(run: { id: string; expertId: string }) {
    if (busy.value) return
    ++detailVersion
    selected.value = { ...run }
    detail.value = null
    readError.value = ''
    actionError.value = ''
    await loadDetail()
  }
  async function refresh(background = false) {
    if (preview || disposed || refreshing || busy.value) return
    refreshing = true
    const version = detailVersion
    try {
      if (scope() === 'detail' && selected.value) {
        await loadDetail(background)
        return
      }
      const result = await runtimeApi.expertAgentRuns()
      if (disposed || busy.value || version !== detailVersion) return
      runs.value = result.items
      automatic.value = result.automaticScheduling
      readError.value = ''
      if (autoSelect && !selected.value && result.items[0]) selected.value = result.items[0]
      if (autoSelect || scope() === 'detail') await loadDetail(background)
    } catch (error) {
      if (!disposed && !busy.value && version === detailVersion) {
        readError.value = errorMessage(error)
        automatic.value = false
      }
    } finally {
      refreshing = false
      checking.value = false
    }
  }
  async function submit(expert: string, input: ExpertAgentInput) {
    if (preview || busy.value || !automatic.value) return
    busy.value = true
    actionError.value = ''
    ++detailVersion
    const signature = JSON.stringify({ expert, input })
    if (pendingSubmission?.signature !== signature)
      pendingSubmission = { signature, id: crypto.randomUUID() }
    const id = pendingSubmission.id
    try {
      await runtimeApi.queueExpertAgent(expert, id, input)
      if (disposed) return
      pendingSubmission = null
      selected.value = { id, expertId: expert }
      detail.value = null
    } catch (error) {
      if (!disposed) actionError.value = errorMessage(error)
    } finally {
      busy.value = false
      loading.value = false
    }
    await refresh()
  }
  async function review(approve: boolean, captured: ExpertAgentDetail) {
    if (
      !canReview.value ||
      captured.run.id !== detail.value?.run.id ||
      captured.approval.approval_digest !== detail.value.approval.approval_digest
    )
      return
    const { proposal_id, approval_digest } = captured.approval
    if (!proposal_id || !approval_digest) return
    busy.value = true
    actionError.value = ''
    ++detailVersion
    try {
      const result = await runtimeApi.reviewExpertAgent(
        captured.run.snapshot.manifest.id,
        captured.run.id,
        { proposalId: proposal_id, digest: approval_digest, approve },
      )
      if (!disposed) detail.value = result
    } catch (error) {
      if (!disposed) actionError.value = errorMessage(error)
    } finally {
      busy.value = false
      loading.value = false
    }
    await refresh()
  }
  async function cancel() {
    const run = detail.value?.run
    if (!run || busy.value || preview) return
    busy.value = true
    actionError.value = ''
    ++detailVersion
    try {
      await runtimeApi.cancelExpertAgent(run.snapshot.manifest.id, run.id)
    } catch (error) {
      if (!disposed) actionError.value = errorMessage(error)
    } finally {
      busy.value = false
      loading.value = false
    }
    await refresh()
  }
  const activeStates = new Set([
    'queued',
    'running',
    'interrupted',
    'awaiting-approval',
    'applying',
  ])
  function shouldPoll() {
    return scope() !== 'detail' || !detail.value || activeStates.has(detail.value.run.state)
  }
  function schedule() {
    if (timer) clearTimeout(timer)
    if (!disposed && !preview && shouldPoll()) timer = setTimeout(poll, 2000)
  }
  async function poll() {
    now.value = Date.now()
    if (shouldPoll()) await refresh(true)
    schedule()
  }
  watch(() => [scope(), selected.value?.id, detail.value?.run.state], schedule)
  onMounted(async () => {
    await refresh()
    schedule()
  })
  onBeforeUnmount(() => {
    disposed = true
    ++detailVersion
    if (timer) clearTimeout(timer)
  })
  return {
    runs,
    selected,
    detail,
    automatic,
    busy,
    loading,
    checking,
    readError,
    actionError,
    now,
    preview,
    canReview,
    select,
    refresh,
    submit,
    review,
    cancel,
  }
}
