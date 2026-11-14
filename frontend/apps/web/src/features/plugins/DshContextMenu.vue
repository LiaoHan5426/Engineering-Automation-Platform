<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mountContextMenu, type MessageTarget } from '@eap/dsh-adapter'
import '@eap/dsh-adapter/style.css'
const props = defineProps<{ active: boolean }>()
const { locale, t } = useI18n()
const container = ref<HTMLElement>()
let instance: Awaited<ReturnType<typeof mountContextMenu>> | undefined
let generation = 0
const error = ref('')
let pending = Promise.resolve()
function schedule() {
  const current = ++generation
  pending = pending.then(() => reconcile(current))
}
async function reconcile(current: number) {
  const previous = instance
  instance = undefined
  await previous?.dispose()
  if (!props.active || !container.value || current !== generation) return
  try {
    const mounted = await mountContextMenu(container.value, {
      locale: locale.value,
      copyLabel: t('chat.copyMessage'),
      failureLabel: t('chat.copyFailed'),
      copyText: (text) => navigator.clipboard.writeText(text),
    })
    if (current !== generation) await mounted.dispose()
    else instance = mounted
  } catch {
    error.value = t('chat.copyFailed')
  }
}
function open(event: Event) {
  const { event: gesture, target } = (
    event as CustomEvent<{ event: MouseEvent; target: MessageTarget }>
  ).detail
  if (instance?.open(gesture, target)) event.preventDefault()
}
watch(() => [props.active, container.value], schedule, { flush: 'post' })
watch(locale, schedule)
if (typeof document !== 'undefined') document.addEventListener('eap:message-context', open)
onBeforeUnmount(() => {
  generation++
  if (typeof document !== 'undefined') document.removeEventListener('eap:message-context', open)
  void pending.then(() => instance?.dispose())
})
</script>
<template>
  <div ref="container" data-testid="dsh-context-menu-host" />
  <p v-if="error" role="status">{{ error }}</p>
</template>
