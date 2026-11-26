<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { MessageHost, useMessages, type MessageContent } from '@eap/message'
import { useI18n } from 'vue-i18n'
import { Button, ConfirmBox, Feedback } from '@eap/ui'
import type { NotifyEvent } from '@eap/runtime-client'
import { NotifyKind, NotifySurface } from '@eap/runtime-client'
import { chatBinding } from '../features/shell/workbench'
import { clearSessionAttention, subscribeNotify } from '../lib/notifyBus'

const { message } = useMessages()
const { t } = useI18n()
const banner = ref<NotifyEvent | null>(null)
const dialog = ref<NotifyEvent | null>(null)
let stop: (() => void) | undefined

function toneFor(event: NotifyEvent): NonNullable<MessageContent['tone']> {
  if (event.severity === 'error') return 'error'
  if (event.severity === 'warning') return 'warning'
  return 'info'
}

function onEvent(event: NotifyEvent) {
  const focused =
    event.kind === NotifyKind.SESSION &&
    event.target?.conversationId &&
    event.target.conversationId === chatBinding.value?.activeId
  if (focused) {
    clearSessionAttention(event.target!.conversationId!)
    return
  }
  if (event.surfaces.includes(NotifySurface.TOAST))
    message({ title: event.title, text: event.text, tone: toneFor(event) })
  if (event.surfaces.includes(NotifySurface.BANNER)) banner.value = event
  if (event.surfaces.includes(NotifySurface.DIALOG)) dialog.value = event
}

function dismissBanner() {
  banner.value = null
}

function dismissDialog() {
  dialog.value = null
}

onMounted(() => {
  stop = subscribeNotify(onEvent)
})
onUnmounted(() => {
  stop?.()
})
</script>

<template>
  <div class="notify-host" data-testid="notify-host">
    <div v-if="banner" class="notify-banner" data-testid="notify-banner" role="status">
      <Feedback :tone="toneFor(banner)" :message="banner.title + ' — ' + banner.text" />
      <Button
        size="sm"
        variant="icon"
        type="button"
        class="notify-banner__dismiss"
        :aria-label="t('composerUi.close')"
        @click="dismissBanner"
        >×</Button
      >
    </div>
    <MessageHost :dismiss-label="t('composerUi.close')" />
    <ConfirmBox
      v-if="dialog"
      :title="dialog.title"
      :impact="[dialog.text]"
      confirm-label="OK"
      data-testid="notify-dialog"
      @confirm="dismissDialog"
      @cancel="dismissDialog"
    />
  </div>
</template>

<style scoped>
.notify-host {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 40;
}
.notify-banner {
  pointer-events: auto;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 8px 12px 0;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.notify-banner__dismiss {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
</style>
