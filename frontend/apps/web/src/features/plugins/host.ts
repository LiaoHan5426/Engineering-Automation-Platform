import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../lib/i18n'
import {
  browserStore,
  readBuilder,
  readInstallation,
  writeBuilder,
  writeInstallation,
  type BuilderConfig,
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
  services: Ref<Record<string, boolean>>
  activationFailure: Ref<PluginActivationFailure | null>
  boardDependencyCheck: Ref<DependencyCheck>
  checkBoardDependencies(projectId: string): Promise<void>
  cancelBoardDependencyCheck(): void
  runtimeOf(pluginId: PluginId): PluginRuntimeObservation
  setEnabled(pluginId: PluginId, enabled: boolean): void
  setServiceAvailable(serviceId: string, available: boolean): void
  /** Mock/test only: next board enable attempt fails activation and rolls back. */
  armActivationFailure(message: string): void
  refreshFromStore(): void
  readBuilder(instanceId: BuilderConfig['instanceId']): BuilderConfig
  saveBuilder(config: BuilderConfig): void
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
  const activationFailure = ref<PluginActivationFailure | null>(null)
  const pendingActivationFailure = ref<string | null>(null)
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
      activationError:
        activationFailure.value?.pluginId === pluginId ? activationFailure.value.message : null,
    })
    if (pluginId === 'board' && observation.kind === 'ready') {
      const status = boardDependencyCheck.value.status
      if (status !== 'available')
        return {
          ...observation,
          kind:
            status === 'checking'
              ? 'dependency_checking'
              : status === 'failed'
                ? 'dependency_check_failed'
                : 'dependency_unchecked',
          message: boardDependencyCheck.value.reason,
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
        activationFailure.value?.pluginId === 'board' ? activationFailure.value.message : null,
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
    if (contributionVisible('builder', installation.value.enabled.builder, services.value, null)) {
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
      activationFailure.value?.pluginId === 'board' ? activationFailure.value.message : null,
    ),
  )

  return {
    installation,
    entries,
    boardContributionVisible,
    services,
    activationFailure,
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
      services.value = { ...services.value, [serviceId]: available }
    },
    armActivationFailure(message) {
      pendingActivationFailure.value = message
    },
    refreshFromStore() {
      installation.value = readInstallation(store)
    },
    setEnabled(pluginId, enabled) {
      const previous = installation.value
      const next: Installation = { enabled: { ...previous.enabled, [pluginId]: enabled } }
      installation.value = next
      try {
        if (enabled && pluginId === 'board') {
          const missing = pluginRuntimeObservation({
            pluginId: 'board',
            enabled: true,
            services: services.value,
            activationError: null,
          })
          if (missing.kind === 'dependency_missing') {
            installation.value = previous
            activationFailure.value = null
            throw new Error('PLUGIN_DEPENDENCY_MISSING')
          }
          if (pendingActivationFailure.value) {
            const message = pendingActivationFailure.value
            pendingActivationFailure.value = null
            installation.value = previous
            activationFailure.value = { pluginId: 'board', message }
            throw new Error('PLUGIN_ACTIVATION_FAILED')
          }
          activationFailure.value = null
        }
        if (!enabled && pluginId === 'board') activationFailure.value = null
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
    readBuilder: (instanceId) => readBuilder(store, instanceId),
    saveBuilder(config) {
      writeBuilder(store, config)
    },
    describe,
  }
}
