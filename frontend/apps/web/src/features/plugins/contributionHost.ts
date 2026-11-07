export interface ContributionView {
  id: string
  title: string
  /** Opaque host metadata; Cordis-style, not a Cordis dependency. */
  meta?: Record<string, string>
}

export interface ContributionCommand {
  id: string
  title: string
  handler: () => void | Promise<void>
}

export interface ContributionHost {
  readonly views: ReadonlyMap<string, ContributionView>
  readonly commands: ReadonlyMap<string, ContributionCommand>
  registerView(view: ContributionView): () => void
  registerCommand(command: ContributionCommand): () => void
  dispose(): void
}

type Listener = () => void

/** Minimal contribution host PoC: register/dispose with subscription cleanup. */
export function createContributionHost(): ContributionHost & {
  subscribe(listener: Listener): () => void
} {
  const views = new Map<string, ContributionView>()
  const commands = new Map<string, ContributionCommand>()
  const listeners = new Set<Listener>()

  function notify() {
    for (const listener of [...listeners]) listener()
  }

  function registerView(view: ContributionView): () => void {
    if (views.has(view.id)) {
      throw new Error(`view already registered: ${view.id}`)
    }
    views.set(view.id, view)
    notify()
    return () => {
      views.delete(view.id)
      notify()
    }
  }

  function registerCommand(command: ContributionCommand): () => void {
    if (commands.has(command.id)) {
      throw new Error(`command already registered: ${command.id}`)
    }
    commands.set(command.id, command)
    notify()
    return () => {
      commands.delete(command.id)
      notify()
    }
  }

  function dispose() {
    views.clear()
    commands.clear()
    listeners.clear()
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    views,
    commands,
    registerView,
    registerCommand,
    dispose,
    subscribe,
  }
}
