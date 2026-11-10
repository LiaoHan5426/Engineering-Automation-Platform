import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { runtimeApi, type ScenarioWorkflowDependencies } from '@eap/runtime-client'
import { i18n } from '../../lib/i18n'
import {
  browserStore,
  readInstallation,
  writeInstallation,
  type Installation,
  type KeyValueStore,
  type PluginId,
} from './model'
import {
  contributionVisible,
  PLUGIN_SERVICE_DEPENDENCIES,
  pluginRuntimeObservation,
  type PluginRuntimeObservation,
  type DependencyCheck,
} from './pluginRuntimeView'

export interface NavItem {
  id: string
  name: string
  icon: string
  group: '工作' | '设置'
  hint: string
}

export type PluginActivationFailure = {
  pluginId: PluginId
  message: string
}

export interface PluginHost {
  installation: Ref<Installation>
  entries: ComputedRef<NavItem[]>
  boardContributionVisible: ComputedRef<boolean>
  builderContributionVisible: ComputedRef<boolean>
  builderDependencyCheck: Ref<{
    status: 'unchecked' | 'checking' | 'available' | 'failed'
    reason: string
    snapshot?: ScenarioWorkflowDependencies
  }>
  checkBuilderDependencies(): Promise<void>
  cancelBuilderDependencyCheck(): void
  registerBuilderInstance(id: string, prepareDisable: () => boolean): () => void
  services: Ref<Record<string, boolean>>
  activationFailures: Ref<Partial<Record<PluginId, string>>>
  boardDependencyCheck: Ref<DependencyCheck>
  checkBoardDependencies(projectId: string): Promise<void>
  cancelBoardDependencyCheck(): void
  runtimeOf(pluginId: PluginId): PluginRuntimeObservation
  setEnabled(pluginId: PluginId, enabled: boolean): void
  setServiceAvailable(serviceId: string, available: boolean): void
  /** Test seam: the selected contribution's next enable attempt fails and rolls back. */
  armActivationFailure(message: string, pluginId?: 'board' | 'builder'): void
  refreshFromStore(): void
  describe(id: string): NavItem
}

function defaultServices(): Record<string, boolean> {
  // Legacy contribution availability assumptions, NOT verified service observations.
  const services: Record<string, boolean> = {}
  for (const deps of Object.values(PLUGIN_SERVICE_DEPENDENCIES)) {
    for (const dep of deps) services[dep.id] = true
  }
  return services
}

export function createPluginHost(store: KeyValueStore = browserStore()): PluginHost {
  const installation = ref(readInstallation(store))
  const services = ref(defaultServices())
  const activationFailures = ref<Partial<Record<PluginId, string>>>({})
  function clearActivationFailure(id: PluginId) {
    const next = { ...activationFailures.value }
    delete next[id]
    activationFailures.value = next
  }
  const pendingActivationFailure = ref<PluginActivationFailure | null>(null)
  const builderInstances = new Map<string, () => boolean>()
  const builderDependencyCheck = ref<{
    status: 'unchecked' | 'checking' | 'available' | 'failed'
    reason: string
    snapshot?: ScenarioWorkflowDependencies
  }>({ status: 'unchecked', reason: '' })
  let builderCheckGeneration = 0
  let builderCheckController: AbortController | undefined
  function prepareBuilders() {
    for (const prepare of builderInstances.values()) {
      if (!prepare()) throw new Error('DESIGNER_SUSPEND_BLOCKED')
    }
  }
  const boardDependencyCheck = ref<DependencyCheck>({
    status: 'unchecked',
    source: '',
    observedAt: null,
    reason: '',
  })
  const t = i18n.global.t
  let checkGeneration = 0
  let checkController: AbortController | undefined

  function runtimeOf(pluginId: PluginId): PluginRuntimeObservation {
    const observation = pluginRuntimeObservation({
      pluginId,
      enabled: installation.value.enabled[pluginId],
      services: services.value,
      activationError: activationFailures.value[pluginId] ?? null,
    })
    if ((pluginId === 'board' || pluginId === 'builder') && observation.kind === 'ready') {
      const check = pluginId === 'board' ? boardDependencyCheck.value : builderDependencyCheck.value
      const status = check.status
      if (status !== 'available')
        return {
          ...observation,
          kind:
            status === 'checking'
              ? 'dependency_checking'
              : status === 'failed'
                ? 'dependency_check_failed'
                : 'dependency_unchecked',
          message: check.reason,
        }
    }
    return observation
  }

  const entries = computed(() => {
    const items: NavItem[] = []
    if (contributionVisible('chat', installation.value.enabled.chat, services.value, null)) {
      items.push({
        id: 'chat',
        name: t('plugin.chat'),
        icon: '✉',
        group: '工作',
        hint: t('plugin.chatHint'),
      })
    }
    if (
      contributionVisible(
        'board',
        installation.value.enabled.board,
        services.value,
        activationFailures.value.board ?? null,
      )
    ) {
      items.push({
        id: 'board',
        name: t('desktop.board'),
        icon: '▤',
        group: '工作',
        hint: t('plugin.boardHint'),
      })
    }
    if (builderContributionVisible.value) {
      items.push(
        {
          id: 'builder-alpha',
          name: t('plugin.builderAlpha'),
          icon: '◻',
          group: '工作',
          hint: t('plugin.builderHint'),
        },
        {
          id: 'builder-beta',
          name: t('plugin.builderBeta'),
          icon: '◻',
          group: '工作',
          hint: t('plugin.builderHint'),
        },
      )
    }
    return items
  })

  function describe(id: string): NavItem {
    const visible = entries.value.find((item) => item.id === id)
    if (visible) return visible
    if (id === 'builder-beta') {
      return {
        id,
        name: t('plugin.builderBeta'),
        icon: '◻',
        group: '工作',
        hint: t('plugin.hiddenBody'),
      }
    }
    if (id === 'builder-alpha') {
      return {
        id,
        name: t('plugin.builderAlpha'),
        icon: '◻',
        group: '工作',
        hint: t('plugin.hiddenBody'),
      }
    }
    return { id, name: t('plugin.chat'), icon: '✉', group: '工作', hint: t('plugin.hiddenBody') }
  }

  const boardContributionVisible = computed(() =>
    contributionVisible(
      'board',
      installation.value.enabled.board,
      services.value,
      activationFailures.value.board ?? null,
    ),
  )
  const builderContributionVisible = computed(() =>
    contributionVisible(
      'builder',
      installation.value.enabled.builder,
      services.value,
      activationFailures.value.builder ?? null,
    ),
  )

  return {
    installation,
    entries,
    boardContributionVisible,
    builderContributionVisible,
    builderDependencyCheck,
    registerBuilderInstance(id, prepareDisable) {
      if (builderInstances.has(id)) throw new Error('DESIGNER_INSTANCE_ALREADY_REGISTERED')
      builderInstances.set(id, prepareDisable)
      return () => {
        if (builderInstances.get(id) === prepareDisable) builderInstances.delete(id)
      }
    },
    async checkBuilderDependencies() {
      if (builderDependencyCheck.value.status === 'checking') return
      const generation = ++builderCheckGeneration
      builderCheckController = new AbortController()
      const previous = builderDependencyCheck.value.snapshot
      builderDependencyCheck.value = { status: 'checking', reason: '', snapshot: previous }
      try {
        const snapshot = await runtimeApi.scenarioWorkflowDependencies(
          builderCheckController.signal,
        )
        if (generation === builderCheckGeneration)
          builderDependencyCheck.value = { status: 'available', reason: '', snapshot }
      } catch (error) {
        if (generation === builderCheckGeneration)
          builderDependencyCheck.value = {
            status: 'failed',
            reason: error instanceof Error ? error.message : 'DEPENDENCY_CHECK_FAILED',
            snapshot: previous,
          }
      } finally {
        if (generation === builderCheckGeneration) builderCheckController = undefined
      }
    },
    cancelBuilderDependencyCheck() {
      ++builderCheckGeneration
      builderCheckController?.abort()
      builderCheckController = undefined
      if (builderDependencyCheck.value.status === 'checking')
        builderDependencyCheck.value = { ...builderDependencyCheck.value, status: 'unchecked' }
    },
    services,
    activationFailures,
    boardDependencyCheck,
    async checkBoardDependencies(projectId) {
      if (
        boardDependencyCheck.value.status === 'checking' ||
        !projectId.trim() ||
        projectId.length > 120
      )
        return
      const generation = ++checkGeneration
      const source = 'GET /api/board/runtime?projectId=' + encodeURIComponent(projectId)
      const previous = boardDependencyCheck.value.snapshot
      checkController = new AbortController()
      boardDependencyCheck.value = {
        status: 'checking',
        source,
        observedAt: null,
        reason: '',
        snapshot: previous,
      }
      try {
        const snapshot = await runtimeApi.boardRuntime(projectId, checkController.signal)
        if (!snapshot || snapshot.projectId !== projectId || !Array.isArray(snapshot.items))
          throw new Error('INVALID_BOARD_RUNTIME_RESPONSE')
        if (generation !== checkGeneration) return
        boardDependencyCheck.value = {
          status: 'available',
          source,
          observedAt: snapshot.observedAt,
          reason: '',
          snapshot,
        }
      } catch (error) {
        if (generation !== checkGeneration) return
        boardDependencyCheck.value = {
          status: 'failed',
          source,
          observedAt: new Date().toISOString(),
          reason: error instanceof Error ? error.message : 'DEPENDENCY_CHECK_FAILED',
          snapshot: previous,
        }
      } finally {
        if (generation === checkGeneration) checkController = undefined
      }
    },
    runtimeOf,
    cancelBoardDependencyCheck() {
      ++checkGeneration
      checkController?.abort()
      checkController = undefined
      if (boardDependencyCheck.value.status === 'checking') {
        boardDependencyCheck.value = {
          status: 'unchecked',
          source: '',
          observedAt: null,
          reason: '',
          snapshot: boardDependencyCheck.value.snapshot,
        }
      }
    },
    setServiceAvailable(serviceId, available) {
      if (serviceId === 'runtime.prototype-api' && !available) prepareBuilders()
      services.value = { ...services.value, [serviceId]: available }
    },
    armActivationFailure(message, pluginId = 'board') {
      pendingActivationFailure.value = { pluginId, message }
    },
    refreshFromStore() {
      const next = readInstallation(store)
      if (!next.enabled.builder && installation.value.enabled.builder) prepareBuilders()
      installation.value = next
    },
    setEnabled(pluginId, enabled) {
      if (pluginId === 'builder' && !enabled) prepareBuilders()
      const previous = installation.value
      const next: Installation = { enabled: { ...previous.enabled, [pluginId]: enabled } }
      installation.value = next
      try {
        if (enabled && (pluginId === 'board' || pluginId === 'builder')) {
          const missing = pluginRuntimeObservation({
            pluginId,
            enabled: true,
            services: services.value,
            activationError: null,
          })
          if (missing.kind === 'dependency_missing') {
            installation.value = previous
            clearActivationFailure(pluginId)
            throw new Error('PLUGIN_DEPENDENCY_MISSING')
          }
          if (pendingActivationFailure.value?.pluginId === pluginId) {
            const message = pendingActivationFailure.value.message
            pendingActivationFailure.value = null
            installation.value = previous
            activationFailures.value = { ...activationFailures.value, [pluginId]: message }
            throw new Error('PLUGIN_ACTIVATION_FAILED')
          }
          clearActivationFailure(pluginId)
        }
        if (!enabled) clearActivationFailure(pluginId)
        writeInstallation(store, installation.value)
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === 'PLUGIN_DEPENDENCY_MISSING' ||
            error.message === 'PLUGIN_ACTIVATION_FAILED')
        ) {
          throw error
        }
        installation.value = previous
        throw new Error('PLUGIN_INSTALLATION_PERSIST_FAILED')
      }
    },
    describe,
  }
}
