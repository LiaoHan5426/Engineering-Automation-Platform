<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Button, Checkbox, Feedback, Badge } from '@eap/ui';
import { runtimeApi, type CodeProposal, type CodeProposalState, type CodeApplied } from '@eap/runtime-client';
import { useI18n } from 'vue-i18n';
const props = defineProps<{ proposal: CodeProposal; readOnly: boolean }>();
const emit = defineEmits<{ applied: [result: CodeApplied] }>();
const { t } = useI18n();
const state = ref<CodeProposalState | null>(null), loading = ref(false), writing = ref(false), confirmed = ref(false), note = ref('');
let generation = 0;
async function read() {
  const token = generation;
  loading.value = true; confirmed.value = false; state.value = null;
  try {
    const record = await runtimeApi.codeProposal(props.proposal.conversationId, props.proposal.id);
    if (token !== generation) return;
    if (record.proposal.id !== props.proposal.id || record.proposal.conversationId !== props.proposal.conversationId) throw new Error('Identity mismatch');
    if (!['PROPOSED', 'APPLYING', 'APPLIED', 'FAILED', 'UNKNOWN'].includes(record.status)
      || (record.status === 'APPLIED') !== (record.result != null)
      || (record.result && (record.result.id !== record.proposal.id || !Array.isArray(record.result.written)
        || record.result.written.length !== record.proposal.files.length
        || record.result.written.some((path, index) => path !== record.proposal.files[index]?.path)))) throw new Error('Inconsistent application record');
    state.value = record; note.value = '';
    if (record.status === 'APPLIED' && record.result) emit('applied', record.result);
  } catch { if (token === generation) note.value = t('application.readFailed'); }
  finally { if (token === generation) loading.value = false; }
}
async function apply() {
  if (loading.value || writing.value || !confirmed.value || props.readOnly || !state.value?.proposal.writeAllowed || state.value.status !== 'PROPOSED') return;
  const token = generation; writing.value = true; confirmed.value = false; note.value = '';
  try { await runtimeApi.applyCodeProposal(props.proposal.conversationId, props.proposal.id); }
  catch { if (token === generation) note.value = t('application.uncertain'); }
  finally {
    if (token === generation) {
      await read();
      if (token === generation) writing.value = false;
    }
  }
}
watch(() => [props.proposal.id, props.proposal.conversationId], () => {
  generation++; state.value = null; confirmed.value = false; writing.value = false; note.value = ''; void read();
}, { immediate: true });
watch(() => props.readOnly, () => { confirmed.value = false; });
onBeforeUnmount(() => { generation++; });
</script>
<template>
  <section class="proposal-application" data-testid="proposal-application">
    <div class="proposal-application__bar">
      <Badge v-if="state" data-testid="proposal-status">{{ t('application.status.' + state.status) }}</Badge>
      <Button size="sm" :disabled="loading || writing" data-testid="proposal-refresh" @click="read">{{ t('application.refresh') }}</Button>
    </div>
    <p v-if="loading" role="status">{{ t('application.loading') }}</p>
    <Feedback v-if="note" tone="warning">{{ note }}</Feedback>
    <p v-if="state?.reason"><code>{{ state.reason }}</code></p>
    <p v-if="state?.status === 'APPLIED' && state.result?.afterHash">SHA-256：<code>{{ state.result.afterHash }}</code></p>
    <p v-if="state?.status === 'APPLIED'" data-testid="application-identities">{{ t('boardDelivery.conversationId') }}：<code>{{ proposal.conversationId }}</code><br>{{ t('boardDelivery.proposalId') }}：<code>{{ proposal.id }}</code></p>
    <template v-if="state?.status === 'PROPOSED'">
      <label><Checkbox v-model="confirmed" :disabled="readOnly || loading || writing || !state.proposal.writeAllowed" /> {{ t('task.confirmWrite') }}</label>
      <Button variant="primary" data-testid="proposal-apply" :disabled="!confirmed || readOnly || loading || writing || !state.proposal.writeAllowed" @click="apply">{{ t('task.apply') }}</Button>
    </template>
    <p>{{ t('application.boundary') }}</p>
  </section>
</template>
<style scoped>
.proposal-application{display:grid;gap:8px;min-width:0}.proposal-application__bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.proposal-application p,.proposal-application code{overflow-wrap:anywhere}.proposal-application label{display:flex;align-items:flex-start;gap:6px}
</style>
