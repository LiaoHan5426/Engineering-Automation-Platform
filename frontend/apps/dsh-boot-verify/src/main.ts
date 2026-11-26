import { createApp, h } from 'vue'
import type { WebBootGraph } from '@eap/dsh-boot'

declare global {
  interface Window {
    __DSH_BOOT__?: WebBootGraph
    __DSH_BOOT_READY__?: {
      promise: Promise<void>
      resolve: () => void
      reject: (reason?: unknown) => void
    }
  }
}

function statusView(boot: WebBootGraph | undefined) {
  const entryCount = boot?.entries.length ?? 0
  const batchCount = boot?.batches.length ?? 0
  const rev = boot?.rev ?? '(missing)'
  return h(
    'main',
    { style: 'font-family: system-ui, sans-serif; padding: 1.5rem; max-width: 40rem' },
    [
      h('h1', 'Slice B boot verify'),
      h('p', 'Fixture assembly proof: index.html received Host-style boot injections.'),
      h('ul', [
        h('li', `__DSH_BOOT__.rev: ${rev}`),
        h('li', `entries: ${String(entryCount)}`),
        h('li', `batches: ${String(batchCount)}`),
      ]),
    ],
  )
}

async function mount(): Promise<void> {
  await window.__DSH_BOOT_READY__?.promise
  createApp(() => statusView(window.__DSH_BOOT__)).mount('#root')
}

void mount()
