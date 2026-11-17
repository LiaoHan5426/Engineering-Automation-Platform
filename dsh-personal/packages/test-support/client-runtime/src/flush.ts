/** Node test-carrier scheduling; no production source depends on this module. */
import { MessageChannel } from 'node:worker_threads'
import { nextTick } from 'vue'

/** Drain queued finite Promise chains, then commit their native render updates. */
export async function flushPendingClientWork(): Promise<void> {
  // A task boundary lets RPC/controller chains finish without guessing depth.
  // Close both ports before resolving; fake timers must not block this drain.
  await new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.once('message', () => {
      port1.close()
      port2.close()
      resolve()
    })
    port2.postMessage(undefined)
  })
  await nextTick()
}
