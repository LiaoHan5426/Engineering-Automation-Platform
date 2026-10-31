<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Badge, Collapse, Dialog, ConfirmBox } from '@eap/ui';
import { runtimeApi, type BoardRun, type BoardReviewPage } from '@eap/runtime-client';
const props = defineProps<{ taskId: string; projectId: string; run: BoardRun }>();
const emit = defineEmits<{ close: [] }>();
const { t, te } = useI18n();
const page = ref<BoardReviewPage | null>(null), loading = ref(false), saving = ref(false), confirming = ref(false), note = ref('');
const snapshot = computed(() => page.value?.evidence?.snapshot);
const blockedReason = computed(() => { const key = 'boardReview.reason.' + page.value?.reason; return te(key) ? t(key) : t('boardReview.reason.UNAVAILABLE'); });
let ticket = 0, generation = 0;
async function load() {
  const current = ++ticket; loading.value = true;
  try { const data = await runtimeApi.boardReview(props.taskId, props.run.execution.id, props.projectId); if (current === ticket) page.value = data; }
  catch { if (current === ticket) note.value = t('boardReview.loadFailed'); }
  finally { if (current === ticket) loading.value = false; }
}
async function capture() {
  confirming.value = false;
  if (saving.value || loading.value || !page.value?.captureAllowed || page.value.evidence) return;
  saving.value = true; note.value = ''; const current = generation;
  try {
    const evidence = await runtimeApi.captureBoardReview(props.taskId, props.run.execution.id, { projectId: props.projectId, workspacePath: props.run.execution.workspacePath });
    if (current === generation) page.value = { evidence, captureAllowed: false, reason: '' };
  } catch {
    if (current === generation) {
      note.value = t('boardReview.uncertain'); await load();
      if (current === generation && page.value?.evidence) note.value = t('boardReview.recovered');
    }
  } finally { if (current === generation) saving.value = false; }
}
watch(() => [props.taskId, props.projectId, props.run.execution.id], () => { generation++; saving.value = false; page.value = null; confirming.value = false; note.value = ''; void load(); }, { immediate: true });
onBeforeUnmount(() => { ticket++; generation++; });
</script>
<template>
  <Dialog :title="t('boardReview.title')" :close-label="t('preview.close')" :busy="saving" size="lg" data-testid="board-review-dialog" @close="emit('close')">
    <p><code>{{ run.execution.id }}</code></p>
    <p>{{ t('boardReview.hint') }}</p>
    <p class="review-path">{{ run.execution.workspacePath }}</p>
    <p v-if="loading" role="status">{{ t('boardReview.loading') }}</p>
    <p v-if="note" role="status" data-testid="board-review-note">{{ note }}</p>
    <div class="review-actions">
      <Button v-if="page && !page.evidence" size="sm" :disabled="!page.captureAllowed || loading || saving" data-testid="board-review-capture" @click="confirming = true">{{ t('boardReview.capture') }}</Button>
      <Button size="sm" :disabled="loading || saving" data-testid="board-review-refresh" @click="note = ''; load()">{{ t('boardReview.refresh') }}</Button>
    </div>
    <p v-if="page && !page.evidence && !page.captureAllowed" role="status">{{ t('boardReview.blocked') }} · {{ blockedReason }}</p>
    <p v-if="saving" role="status">{{ t('boardReview.saving') }}</p>
    <section v-if="snapshot" class="review-evidence" data-testid="board-review-evidence">
      <Badge>{{ t('boardReview.status.' + snapshot.status) }}</Badge>
      <p>{{ t('boardReview.capturedAt') }}：{{ snapshot.startedAt }} → {{ snapshot.finishedAt }}</p>
      <p>{{ t('boardReview.base') }}：<code>{{ snapshot.baseCommit || '—' }}</code><br>{{ t('boardReview.headAfter') }}：<code>{{ snapshot.headAfter || '—' }}</code></p>
      <p>{{ t('boardReview.hash') }}：<code>{{ page?.evidence?.contentHash }}</code></p>
      <ul v-if="snapshot.issues.length" role="status"><li v-for="issue in snapshot.issues" :key="issue">{{ t('boardReview.issue.' + issue) }}</li></ul>
      <p>{{ t('boardReview.scope') }}</p>
      <Collapse :open="true"><template #summary>{{ t('boardReview.diff') }}</template><pre data-testid="board-review-diff">{{ snapshot.diff || t('boardReview.noDiff') }}</pre></Collapse>
      <Collapse><template #summary>{{ t('boardReview.repositoryStatus') }}</template><pre>{{ snapshot.repositoryStatus || '—' }}</pre></Collapse>
      <h3>{{ t('boardReview.checkTitle') }}</h3>
      <p data-testid="board-review-check">{{ t('boardReview.check.' + snapshot.check.status) }} · {{ t('boardRun.exitCode') }}：{{ snapshot.check.exitCode ?? '—' }}</p>
      <pre v-if="snapshot.check.output">{{ snapshot.check.output }}</pre>
      <p>{{ t('boardReview.notAccepted') }}</p>
      <Collapse><template #summary>{{ t('boardReview.steps') }}</template><ol><li v-for="step in snapshot.steps" :key="step.name"><code>{{ step.command.join(' ') }}</code><p>{{ step.processStatus }} · {{ step.exitCode }} <span v-if="step.truncated">· {{ t('boardReview.issue.OUTPUT_TRUNCATED') }}</span></p><pre v-if="step.stderr">{{ step.stderr }}</pre></li></ol></Collapse>
    </section>
    <ConfirmBox v-if="confirming" :title="t('boardReview.confirm')" :impact="[run.execution.workspacePath, t('boardReview.confirmScope'), t('boardReview.once')]" :confirm-label="t('boardReview.capture')" :danger="false" @confirm="capture" @cancel="confirming = false" />
  </Dialog>
</template>
<style scoped>
.review-actions{display:flex;gap:8px;flex-wrap:wrap}.review-evidence{display:grid;gap:10px;min-width:0}.review-path,code{overflow-wrap:anywhere}code{font-size:11px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;background:var(--eap-code-bg);color:var(--eap-code-text);padding:12px;border-radius:8px;font-size:11px}h3{font-size:14px;margin:0}
</style>
