<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { Dialog, Button, Badge, Collapse, ConfirmBox } from '@eap/ui';
import { runtimeApi, type BoardRun, type BoardVerificationPage, type BoardVerificationPlan } from '@eap/runtime-client';
import { useI18n } from 'vue-i18n';
import { isAxiosError } from 'axios';
const props = defineProps<{ taskId: string; projectId: string; run: BoardRun }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { t, te } = useI18n();
const page = ref<BoardVerificationPage | null>(null), plan = ref<BoardVerificationPlan | null>(null);
const loading = ref(false), preparing = ref(false), starting = ref(false), confirming = ref(false), note = ref('');
const record = computed(() => page.value?.record);
const shownPlan = computed(() => record.value?.plan ?? plan.value);
const busy = computed(() => loading.value || preparing.value || starting.value);
let generation = 0, attempts = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; }
function poll() {
  stopPolling();
  if (!record.value || !['QUEUED', 'RUNNING'].includes(record.value.status)) return;
  if (++attempts <= 60) timer = setTimeout(() => void load(), 3000);
  else note.value = t('boardVerification.pollPaused');
}
function reasonText(reason: string) { const key = 'boardVerification.reason.' + reason; return te(key) ? t(key) : t('boardVerification.reason.UNAVAILABLE'); }
async function load(manual = false) {
  if (loading.value) return;
  if (manual) attempts = 0;
  stopPolling();
  const current = generation; loading.value = true;
  try {
    const data = await runtimeApi.boardVerification(props.taskId, props.run.execution.id, props.projectId);
    if (current === generation) {
      const previousStatus = record.value?.status;
      page.value = data;
      // The parent re-reads task activity; verification status does not determine it locally.
      if (previousStatus && previousStatus !== data.record?.status) emit('changed');
    }
  }
  catch { if (current === generation) note.value = t('boardVerification.loadFailed'); }
  finally { if (current === generation) { loading.value = false; poll(); } }
}
async function prepare() {
  if (busy.value || !page.value?.prepareAllowed || record.value) return;
  const current = generation; preparing.value = true; plan.value = null; note.value = '';
  try {
    const data = await runtimeApi.planBoardVerification(props.taskId, props.run.execution.id, { projectId: props.projectId, workspacePath: props.run.execution.workspacePath });
    if (current === generation) plan.value = data;
  } catch {
    if (current === generation) {
      note.value = t('boardVerification.planFailed');
      // A failed preflight can still own an unconfirmed process and a durable UNKNOWN identity.
      await load();
      if (current === generation && record.value) { note.value = t('boardVerification.recovered'); emit('changed'); }
    }
  }
  finally { if (current === generation) preparing.value = false; }
}
async function start() {
  confirming.value = false;
  if (busy.value || !plan.value || record.value || !page.value?.prepareAllowed) return;
  const current = generation; starting.value = true; note.value = '';
  try {
    const saved = await runtimeApi.startBoardVerification(props.taskId, props.run.execution.id, { projectId: props.projectId, workspacePath: plan.value.workspacePath, planHash: plan.value.planHash });
    if (current === generation) { page.value = { record: saved, prepareAllowed: false, reason: '' }; plan.value = null; attempts = 0; poll(); emit('changed'); }
  } catch (error) {
    if (current === generation) {
      const code = isAxiosError(error) ? String(error.response?.data?.detail ?? '') : '';
      const rejected = isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500;
      if (rejected) plan.value = null;
      note.value = rejected ? (code === 'BOARD_VERIFICATION_PLAN_STALE' ? t('boardVerification.stale') : reasonText(code)) : t('boardVerification.uncertain'); await load();
      if (current === generation && record.value) { plan.value = null; note.value = t('boardVerification.recovered'); emit('changed'); }
    }
  }
  finally { if (current === generation) starting.value = false; }
}
watch(() => [props.taskId, props.projectId, props.run.execution.id], () => {
  generation++; stopPolling(); attempts = 0; page.value = null; plan.value = null; loading.value = false; preparing.value = false; starting.value = false; confirming.value = false; note.value = ''; void load();
}, { immediate: true });
onBeforeUnmount(() => { generation++; stopPolling(); });
</script>
<template>
  <Dialog :title="t('boardVerification.title')" :close-label="t('preview.close')" :busy="preparing || starting" size="lg" data-testid="board-verification-dialog" @close="emit('close')">
    <div class="verification">
      <p><code>{{ run.execution.id }}</code> · {{ run.execution.workspacePath }}</p>
      <p>{{ t('boardVerification.hint') }}</p>
      <p v-if="loading" role="status">{{ t('boardVerification.loading') }}</p>
      <p v-if="preparing" role="status">{{ t('boardVerification.preparing') }}</p>
      <p v-if="note" role="status" data-testid="verification-note">{{ note }}</p>
      <div class="verification__actions">
        <Button v-if="page && !record" :disabled="busy || !page.prepareAllowed" data-testid="verification-prepare" @click="prepare">{{ t('boardVerification.prepare') }}</Button>
        <Button :disabled="busy" data-testid="verification-refresh" @click="note = ''; load(true)">{{ t('boardVerification.refresh') }}</Button>
      </div>
      <p v-if="page && !record && !page.prepareAllowed">{{ t('boardVerification.blocked') }} · {{ reasonText(page.reason) }}</p>
      <section v-if="shownPlan" class="verification__section" data-testid="verification-plan">
        <p>{{ t('boardVerification.scope') }}：{{ shownPlan.source.scope }} · {{ t('boardVerification.files') }}：{{ shownPlan.source.files.length }}</p>
        <p>HEAD：<code>{{ shownPlan.baseCommit }}</code><br>{{ t('boardVerification.sourceHash') }}：<code>{{ shownPlan.source.contentHash }}</code><br>{{ t('boardVerification.planHash') }}：<code>{{ shownPlan.planHash }}</code></p>
        <h3>{{ t('boardVerification.commands') }}</h3>
        <ol><li v-for="command in shownPlan.commands" :key="command.id"><code>{{ command.command.join(' ') }}</code><p>{{ command.workingDirectory }} · {{ t('boardVerification.timeout') }}：{{ command.timeoutSeconds }}</p></li></ol>
        <Collapse><template #summary>{{ t('boardVerification.fileList') }}</template><ul><li v-for="file in shownPlan.source.files" :key="file.path"><code>{{ file.path }} · {{ file.bytes }} B · {{ file.contentHash }}</code></li></ul></Collapse>
        <Collapse><template #summary>{{ t('boardVerification.exclusions') }}</template><ul><li v-for="exclusion in shownPlan.source.exclusions" :key="exclusion">{{ exclusion }}</li></ul></Collapse>
        <p>{{ t('boardVerification.boundary') }}</p>
        <p>{{ t('boardVerification.risk') }}</p>
        <Button v-if="!record" :disabled="busy || !page?.prepareAllowed" data-testid="verification-start" @click="confirming = true">{{ t('boardVerification.start') }}</Button>
      </section>
      <section v-if="record" class="verification__section" data-testid="verification-record">
        <Badge>{{ t('boardVerification.status.' + record.status) }}</Badge><code>{{ record.id }}</code>
        <p>{{ record.startedAt }} → {{ record.finishedAt || '—' }}</p>
        <p v-if="record.reason" role="status">{{ reasonText(record.reason) }} <code>{{ record.reason }}</code></p>
        <p>{{ t('boardVerification.background') }}</p>
        <h3>{{ t('boardVerification.checks') }}</h3>
        <article v-for="check in record.checks" :key="check.id" class="verification__check">
          <strong>{{ check.id }} · {{ t('boardVerification.status.' + check.status) }}</strong>
          <code>{{ check.command.join(' ') }}</code><p>{{ check.workingDirectory }}</p>
          <p>{{ t('boardRun.exitCode') }}：{{ check.exitCode ?? '—' }} · {{ t('boardVerification.cleanup') }}：{{ t(check.processTreeCleanup ? 'boardVerification.yes' : 'boardVerification.no') }}</p>
          <p v-if="check.truncated" role="alert">{{ t('boardVerification.truncated') }}</p>
          <Collapse><template #summary>{{ t('boardRun.output') }}</template><pre>{{ check.stdout || '—' }}</pre><pre v-if="check.stderr">{{ check.stderr }}</pre></Collapse>
        </article>
        <p v-if="record.sourceAfter">{{ t('boardVerification.after') }}：<code>{{ record.sourceAfter.contentHash }}</code></p>
      </section>
      <p>{{ t('boardVerification.once') }}</p><p>{{ t('boardVerification.notAccepted') }}</p>
    </div>
    <ConfirmBox v-if="confirming && plan" :title="t('boardVerification.confirm')" :impact="[plan.workspacePath, ...plan.commands.map(item => item.command.join(' ')), t('boardVerification.risk'), t('boardVerification.once')]" :confirm-label="t('boardVerification.start')" @confirm="start" @cancel="confirming = false" />
  </Dialog>
</template>
<style scoped>
.verification,.verification__section{display:grid;gap:12px;min-width:0}.verification__actions{display:flex;gap:8px;flex-wrap:wrap}.verification p,.verification code,.verification li{overflow-wrap:anywhere}.verification code{font-size:11px}.verification h3{font-size:14px;margin:0}.verification__check{display:grid;gap:8px;border-top:1px solid var(--border);padding-top:12px}.verification pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;background:var(--eap-code-bg);color:var(--eap-code-text);padding:12px;border-radius:8px;font-size:11px}
</style>
