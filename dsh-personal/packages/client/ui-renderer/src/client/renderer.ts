/** Native Vue application and stylesheet ownership for one presentation destination. */
import { createApp, createSSRApp, h, onMounted, shallowRef, type App } from 'vue'
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SlotRegistry } from './registry.ts'
import { DocumentStyles } from './styles/document-styles.ts'

interface Mount {
  readonly styles: DocumentStyles
  app?: App
  releasing: boolean
}

/** Native Vue mount face using the existing registry and module stylesheet owner. */
export class UiRenderer {
  private current: Mount | undefined
  private disposed = false
  private readonly idPrefix = `dsh-${randomUUID()}`

  /** @param ctx - renderer-owned Cordis context with modules and slots installed. */
  constructor(private readonly ctx: Context & { slots: SlotRegistry }) {}

  /**
   * Mount the slot root after synchronously installing materialized module CSS.
   * @param container - application's destination element.
   * @returns an idempotent disposer scoped to this exact mount.
   */
  mount(container: HTMLElement): () => void {
    if (this.disposed) throw new Error('renderer: cannot mount a disposed renderer')
    if (this.current !== undefined) throw new Error('renderer: application is already mounted')
    const mount: Mount = {
      styles: new DocumentStyles(container.ownerDocument.head, this.ctx.modules),
      releasing: false,
    }
    this.current = mount
    try {
      mount.styles.mount()
      const renderApp = () => this.ctx.slots.renderSlot('root', {})
      const boot = container.querySelector<HTMLElement>(':scope > [data-dsh-boot]')
      const snapshot =
        boot === null ? undefined : { className: boot.className, html: boot.innerHTML }
      const app =
        snapshot === undefined
          ? createApp({ render: renderApp })
          : createSSRApp({
            setup: () => {
              const ready = shallowRef(false)
              onMounted(() => {
                ready.value = true
              })
              return () =>
                ready.value
                  ? renderApp()
                  : h('div', {
                    class: snapshot.className,
                    'data-dsh-boot': '',
                    innerHTML: snapshot.html,
                  })
            },
          })
      app.config.idPrefix = this.idPrefix
      app.config.throwUnhandledErrorInProduction = true
      mount.app = app
      // Let initial setup finish so Vue can release every scope before rethrowing.
      let failure: { error: unknown } | undefined
      app.config.errorHandler = (error) => {
        failure ??= { error }
      }
      try {
        app.mount(container)
      } finally {
        delete app.config.errorHandler
      }
      if (failure !== undefined) throw failure.error
      if (this.current !== mount) {
        app.unmount()
        throw new Error('renderer: disposed during application mount')
      }
    } catch (error) {
      try {
        this.unmount(mount)
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'renderer: mount and cleanup failed', {
          cause: error,
        })
      }
      throw error
    }
    return () => {
      this.unmount(mount)
    }
  }

  /** Release the current application and reject later mount attempts. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.current !== undefined) this.unmount(this.current)
  }

  private unmount(mount: Mount): void {
    if (this.current !== mount || mount.releasing) return
    mount.releasing = true
    const failures: unknown[] = []
    try {
      mount.app?.unmount()
    } catch (error) {
      failures.push(error)
    }
    try {
      mount.styles.dispose()
    } catch (error) {
      failures.push(error)
    } finally {
      this.current = undefined
    }
    if (failures.length > 0) throw new AggregateError(failures, 'renderer: unmount cleanup failed')
  }
}
