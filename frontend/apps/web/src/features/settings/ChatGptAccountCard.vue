<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatGptLoginAttempt } from '@eap/runtime-client';
import { modelApi as runtimeApi } from '../chat/chatService';
import { useMockServices } from '../../lib/serviceConfig';
import { Button, Feedback } from '@eap/ui';
import { errorMessage } from '../../lib/presentation';
const emit = defineEmits<{ connected: [id: string]; changed: [] }>();
const { t } = useI18n();
const attempt = ref<ChatGptLoginAttempt | null>(null);
const busy = ref(false), note = ref('');
const mockConsent = ref(false);
const pendingConnectionId = ref<string | undefined>();
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const storageKey = (useMockServices ? 'mock.' : '') + 'eap.chatgpt.pending-login';
function remember(value: ChatGptLoginAttempt | null) {
  attempt.value = value;
  try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Current attempt remains usable. */ }
}
function schedule() { clearTimeout(timer); if (!disposed && attempt.value) timer = setTimeout(() => void poll(), 1500); }
async function poll() {
  const current = attempt.value; if (!current) return;
  try {
    const state = await runtimeApi.chatGptLoginState(current.loginId);
    if (disposed || current.loginId !== attempt.value?.loginId) return;
    if (state.state === 'waiting' || state.state === 'exchanging') { schedule(); return; }
    remember(null); emit('changed');
    if (state.state === 'connected' && state.connectionId) { note.value = t('authUi.connected'); emit('connected', state.connectionId); }
    else note.value = t(state.state === 'permission_required' ? 'authUi.permissionRequired' : state.state === 'cancelled' ? 'authUi.cancelled' : 'authUi.failed') + (state.error ? ' · ' + state.error : '');
  } catch (error) {
    if (disposed) return;
    note.value = errorMessage(error);
    if (Date.parse(current.expiresAt) > Date.now()) schedule(); else remember(null);
  }
}
async function start(connectionId?: string, confirmed = false) {
  if (useMockServices && !confirmed) { pendingConnectionId.value = connectionId; mockConsent.value = true; return; }
  if (busy.value || attempt.value) return;
  busy.value = true; note.value = '';
  try {
    const started = await runtimeApi.startChatGptLogin(connectionId);
    if (disposed) return;
    remember(started);
    if (useMockServices) { mockConsent.value = false; await poll(); return; }
    schedule();
    // Keep a visible link if the browser blocks a popup after the async request.
    window.open(started.authorizationUrl, '_blank', 'noopener,noreferrer');
  } catch (error) { note.value = errorMessage(error); }
  finally { busy.value = false; }
}
async function cancel() {
  if (!attempt.value || busy.value) return;
  busy.value = true;
  try { await runtimeApi.cancelChatGptLogin(attempt.value.loginId); clearTimeout(timer); remember(null); note.value = t('authUi.cancelled'); }
  catch (error) { note.value = errorMessage(error); }
  finally { busy.value = false; }
}
onMounted(() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (saved && typeof saved.loginId === 'string' && typeof saved.authorizationUrl === 'string' && Number.isFinite(Date.parse(saved.expiresAt))) {
      const url = new URL(saved.authorizationUrl);
      if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/api/accounts/authorize') { remember(null); return; }
      // A completed callback can be waiting while this view is closed, even after the browser-link expiry.
      attempt.value = saved;
      void poll();
    }
  } catch { /* Ignore invalid local UI state, never credential state. */ }
});
onUnmounted(() => { disposed = true; clearTimeout(timer); });
defineExpose({ start });
</script>
<template>
  <section class="chatgpt-account-card" data-testid="chatgpt-account">
    <h2>{{ t('authUi.title') }}</h2>
    <p>{{ t('authUi.description') }}</p>
    <Button type="button" :disabled="busy || !!attempt" @click="start()">Continue with ChatGPT</Button>
    <div v-if="mockConsent" class="authorization-pending" data-testid="mock-login-consent">
      <p>{{ t('preview.loginConsent') }}</p>
      <Button type="button" :disabled="busy" @click="start(pendingConnectionId, true)">{{ t('preview.loginConfirm') }}</Button>
      <Button type="button" @click="mockConsent = false">{{ t('composerUi.close') }}</Button>
    </div>
    <div v-if="attempt" class="authorization-pending">
      <p>{{ t('authUi.waiting') }}</p>
      <a :href="attempt.authorizationUrl" target="_blank" rel="noopener noreferrer">{{ t('authUi.openBrowser') }}</a>
      <Button type="button" :disabled="busy" @click="cancel">{{ t('authUi.cancel') }}</Button>
    </div>
    <Feedback v-if="note" tone="info">{{ note }}</Feedback>
  </section>
</template>
<style scoped>
.chatgpt-account-card{padding:22px;border:1px solid var(--border);border-radius:14px;background:var(--surface);margin-bottom:24px}.chatgpt-account-card h2{font-size:18px;margin-bottom:8px}.chatgpt-account-card p{font-size:13px;line-height:1.7;margin-bottom:14px;color:var(--text-soft)}.authorization-pending{margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}.authorization-pending p{flex-basis:100%;margin:0}.authorization-pending a{color:var(--accent);font-size:13px}
</style>
