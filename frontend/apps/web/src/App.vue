<script setup lang="ts">
import { defineAsyncComponent, computed, onMounted, onUnmounted, ref, watch } from 'vue'

// Management pages are not part of the first paint (the default view is chat).
// Keep them out of the entry chunk; each loads only when its view is activated.
const CapabilityManager = defineAsyncComponent(
  () => import('./features/capability/CapabilityManager.vue'),
)
const ExpertManager = defineAsyncComponent(() => import('./features/expert/ExpertManager.vue'))
const KnowledgeManager = defineAsyncComponent(
  () => import('./features/knowledge/KnowledgeManager.vue'),
)
const DatabaseManager = defineAsyncComponent(
  () => import('./features/database/DatabaseManager.vue'),
)
const RuleManager = defineAsyncComponent(() => import('./features/rule/RuleManager.vue'))
const ModelSettings = defineAsyncComponent(() => import('./features/settings/ModelSettings.vue'))
const InteractionPatterns = defineAsyncComponent(
  () => import('./features/shell/InteractionPatterns.vue'),
)
const SkillManager = defineAsyncComponent(() => import('./features/settings/SkillManager.vue'))
const AppearanceSettings = defineAsyncComponent(
  () => import('./features/settings/AppearanceSettings.vue'),
)
const WorkspaceOverview = defineAsyncComponent(() => import('./features/shell/WorkspaceOverview.vue'))
const PluginCenter = defineAsyncComponent(() => import('./features/plugins/PluginCenter.vue'))
const ScenarioWorkspace = defineAsyncComponent(() => import('./features/ScenarioWorkspace.vue'))
const ProjectBoard = defineAsyncComponent(() => import('./features/shell/ProjectBoard.vue'))
import DesktopNavigation from './features/DesktopNavigation.vue'
import { isSettingsView, settingsGroups } from './features/settings/catalog'
import {
  chatBinding,
  projectLabel,
  rememberPanel,
  sessionProjectId,
  workbench,
} from './features/shell/workbench'
import ChatWorkspace from './features/chat/ChatWorkspace.vue'
import WorkDocumentWorkspace from './features/work/WorkDocumentWorkspace.vue'
import SceneDesigner from './features/work/SceneDesigner.vue'
import PluginSlot from './features/plugins/PluginSlot.vue'
import { createPluginHost } from './features/plugins/host'
import { isKnownHash, resolveAreaView } from './features/plugins/model'
import { INSPECTOR_PAGES, shellPages } from './features/shell/shellPages'
import AnalysisWorkspaceMenu from './features/analysis/AnalysisWorkspaceMenu.vue'
import AnalysisTopbarActions from './features/analysis/AnalysisTopbarActions.vue'
import AnalysisWorkbench from './features/analysis/AnalysisWorkbench.vue'
import AnalysisInspector from './features/analysis/AnalysisInspector.vue'
import AnalysisStatusbar from './features/analysis/AnalysisStatusbar.vue'
import { createAnalysisWorkbench } from './features/analysis/analysisWorkbench'
import { WorkbenchFrame } from '@eap/layout'
import SidebarRightToggle from './components/SidebarRightToggle.vue'
import { SIDEBAR_RIGHT_ID, useSidebarRight } from './components/sidebarRight'
import NotifyHost from './components/NotifyHost.vue'
import { i18n } from './lib/i18n'
import { configureNotifyFocus } from './lib/notifyBus'
import { startNotifyClient } from './lib/notifyClient'
import { subscribeRuntimeLiveness } from './lib/runtimeLiveness'
import { Button, Feedback, Input, NativeDialog } from '@eap/ui'

const pluginHost = createPluginHost()
/** 落地页：打开就是能干活的地方。壳页面保持固定；插件入口由注册表按启停追加。 */
const DEFAULT_VIEW = 'chat'
const pages = computed(() => [
  ...shellPages.filter((page) => page.group === '工作'),
  ...pluginHost.entries.value,
  ...shellPages.filter((page) => page.group === '设置'),
])
const rawHashView = typeof location !== 'undefined' ? location.hash.slice(1).split('?')[0]! : ''
const hashView = resolveAreaView(rawHashView)
const activeView = ref(isKnownHash(rawHashView) ? hashView : DEFAULT_VIEW)
let acceptedHash = typeof location !== 'undefined' ? location.hash : ''
const modelSettings = ref<{ guardLeave: (onDiscard?: () => void) => boolean } | null>(null)
const projectBoard = ref<{ guardLeave: (onDiscard?: () => void) => boolean } | null>(null)
function guardWorkspaceLeave(view: string, onDiscard: () => void) {
  const target =
    view === 'model-settings' ? modelSettings.value : view === 'board' ? projectBoard.value : null
  return target?.guardLeave?.(onDiscard) ?? true
}
if (rawHashView === 'expert-catalog' && typeof window !== 'undefined') {
  window.history.replaceState(null, '', '#experts')
  acceptedHash = '#experts'
}
if (activeView.value === 'work') {
  workbench.workMode = 'work'
  activeView.value = 'chat'
} else if (activeView.value === 'settings') {
  activeView.value = 'model-settings'
} else if (hashView === 'chat') workbench.workMode = 'code'
/** Workspace under the settings dialog. A settings hash never replaces it. */
const surfaceView = ref(isSettingsView(activeView.value) ? 'chat' : activeView.value)
const settingsOpen = computed(() => isSettingsView(activeView.value))
const workspaceView = computed(() => (settingsOpen.value ? surfaceView.value : activeView.value))
const settingsDialog = ref<InstanceType<typeof NativeDialog> | null>(null)
const settingsQuery = ref('')
const settingsDialogGroups = computed(() => {
  const needle = settingsQuery.value.trim().toLowerCase()
  return settingsGroups
    .map((group) => ({
      id: group.id,
      label: i18n.global.t(group.labelKey),
      items: pages.value.filter(
        (page) =>
          (group.ids as readonly string[]).includes(page.id) &&
          (!needle || page.name.toLowerCase().includes(needle) || page.id.includes(needle)),
      ),
    }))
    .filter((group) => group.items.length > 0)
})
function syncSettingsDialog() {
  settingsDialog.value?.setOpen(settingsOpen.value)
}
function closeSettings() {
  if (!settingsOpen.value) return
  activeView.value = surfaceView.value
}
const narrow = ref(false)
const shellTitle = computed(() => {
  const view = workspaceView.value
  if (view === 'chat') {
    const binding = chatBinding.value
    return binding?.activeId
      ? binding.history.find((item) => item.id === binding.activeId)?.title ||
          i18n.global.t('desktop.freeChat')
      : i18n.global.t('desktop.newChat')
  }
  if (view === 'board') return i18n.global.t('desktop.board')
  if (view === 'patterns') return i18n.global.t('patterns.title')
  if (view === 'expert-catalog') return i18n.global.t('expertWorkspace.roles')
  if (view === 'experts') return i18n.global.t('desktop.experts')
  if (view === 'scenes') return i18n.global.t('desktop.scenes')
  return pages.value.find((item) => item.id === view)?.name ?? pluginHost.describe(view).name
})
const chatContextLabel = computed(() => {
  if (workspaceView.value !== 'chat') return ''
  const id = chatBinding.value?.activeId
  return (
    projectLabel(id ? sessionProjectId(id) : workbench.selectedProjectId) ||
    i18n.global.t('desktop.unbound')
  )
})
const currentView = computed(
  () =>
    pages.value.find((view) => view.id === activeView.value) ??
    pluginHost.describe(activeView.value),
)
/** Prototype top bar: a title plus a breadcrumb that says where the surface sits. */
const shellBreadcrumb = computed(() => {
  const view = workspaceView.value
  if (view === 'chat') return chatContextLabel.value
  const name = pages.value.find((item) => item.id === view)?.name ?? pluginHost.describe(view).name
  if (['scenes', 'builder-alpha', 'builder-beta'].includes(view))
    return `EAP / ${i18n.global.t('desktop.scenes')} / ${name}`
  if (['experts', 'expert-catalog'].includes(view))
    return `EAP / ${i18n.global.t('desktop.experts')} / ${name}`
  if (view === 'board') return `EAP / ${i18n.global.t('desktop.board')}`
  if (view === 'patterns') return i18n.global.t('patterns.breadcrumb')
  if (view === 'sql') return name
  return `EAP / ${i18n.global.t('desktop.settings')} / ${name}`
})

const inspector = computed<{ hint: string; pipeline?: boolean }>(
  () => INSPECTOR_PAGES[activeView.value] ?? { hint: currentView.value.hint },
)
const taskViews = new Set(['chat', 'sql', 'board'])
watch(activeView, (value, previous) => {
  if (
    previous !== value &&
    !guardWorkspaceLeave(previous, () => {
      activeView.value = value
    })
  ) {
    activeView.value = previous
    return
  }
  if (previous !== value && !(pluginSlot.value?.guardLeave(previous) ?? true)) {
    activeView.value = previous
    return
  }
  if (
    previous === 'experts' &&
    value !== 'experts' &&
    expertManager.value &&
    !expertManager.value.guardLeave()
  ) {
    activeView.value = 'experts'
    return
  }
  if (value === 'work') {
    workbench.workMode = 'work'
    activeView.value = 'chat'
    return
  }
  if (value === 'settings') {
    activeView.value = 'model-settings'
    return
  }
  if (!isSettingsView(value)) surfaceView.value = value
  inspectorOpen.value = false
  if (
    previous &&
    taskViews.has(previous) &&
    !taskViews.has(value) &&
    !isSettingsView(value) &&
    value !== 'experts'
  )
    workbench.origin = previous === 'chat' && workbench.workMode === 'work' ? 'work' : previous
  if (!isSettingsView(value) && !taskViews.has(value)) workbench.panel = null
  if (
    typeof location !== 'undefined' &&
    !(value === 'experts' && location.hash.startsWith('#experts?')) &&
    !(value === 'board' && location.hash.startsWith('#board?'))
  )
    location.hash = value === 'chat' && workbench.workMode === 'work' ? 'work' : value
  if (typeof location !== 'undefined') acceptedHash = location.hash
  syncSettingsDialog()
})
function hashChange() {
  const requestedHash = location.hash
  const id = resolveAreaView(requestedHash.slice(1).split('?')[0]!)
  if (
    id !== activeView.value &&
    !guardWorkspaceLeave(activeView.value, () => {
      location.hash = requestedHash
    })
  ) {
    window.history.replaceState(null, '', acceptedHash || '#' + activeView.value)
    return
  }
  if (id !== activeView.value && !(pluginSlot.value?.guardLeave(activeView.value) ?? true)) {
    window.history.replaceState(null, '', '#' + activeView.value)
    return
  }
  if (
    activeView.value === 'experts' &&
    id !== 'experts' &&
    expertManager.value &&
    !expertManager.value.guardLeave()
  ) {
    window.history.replaceState(null, '', '#' + expertManager.value.currentHash())
    return
  }
  if (id === 'chat') workbench.workMode = 'code'
  if (id === 'work') {
    workbench.workMode = 'work'
    activeView.value = 'chat'
    acceptedHash = requestedHash
    return
  }
  if (isKnownHash(id)) {
    activeView.value = id
    if (requestedHash.slice(1).split('?')[0] === 'expert-catalog') {
      window.history.replaceState(null, '', '#experts')
      acceptedHash = '#experts'
      return
    }
    acceptedHash = requestedHash
  }
}
function onShellKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && narrow.value) workbench.sidebarOpen = false
  if (event.key === 'Escape' && workbench.panel)
    rememberPanel(chatBinding.value?.activeId ?? null, null)
}
watch(
  () => workbench.workMode,
  (mode) => {
    if (activeView.value === 'chat' && typeof location !== 'undefined')
      location.hash = mode === 'work' ? 'work' : 'chat'
  },
)

const pluginSlot = ref<{ guardLeave: (id: string) => boolean }>()
const expertEditing = ref(false)
const editorSurface = computed(
  () =>
    (workspaceView.value === 'experts' && expertEditing.value) ||
    (['builder-alpha', 'builder-beta'].includes(workspaceView.value) &&
      pluginHost.builderContributionVisible.value),
)
const capabilityManager = ref<{ refresh: () => Promise<void> } | null>(null)
const sidebarRight = useSidebarRight()
const {
  seated: sidebarRightSeated,
  collapsed: sidebarRightCollapsed,
  setCollapsed: setSidebarRightCollapsed,
} = sidebarRight
const expertManager = ref<{
  refresh: () => Promise<void>
  guardLeave: () => boolean
  currentHash: () => string
} | null>(null)
const knowledgeManager = ref<{ refresh: () => Promise<void> } | null>(null)
const databaseManager = ref<{ refresh: () => Promise<void> } | null>(null)
const ruleManager = ref<{ refresh: () => Promise<void> } | null>(null)

const analysis = createAnalysisWorkbench({
  openWorkbench: () => {
    activeView.value = 'sql'
  },
  reloadActive: async () => {
    if (activeView.value === 'experts') await expertManager.value?.refresh()
    if (activeView.value === 'knowledge') await knowledgeManager.value?.refresh()
    if (activeView.value === 'databases') await databaseManager.value?.refresh()
    if (activeView.value === 'rules') await ruleManager.value?.refresh()
    if (activeView.value === 'capabilities') await capabilityManager.value?.refresh()
  },
})
const { runtimeStatus, errors, workspaceMessage, selectedExpert, inspectorOpen, refresh } = analysis

let stopRuntimeLiveness: (() => void) | undefined
let stopNotify: (() => void) | undefined
onMounted(() => {
  syncSettingsDialog()
  window.addEventListener('hashchange', hashChange)
  const query = window.matchMedia('(max-width: 760px)')
  const apply = () => {
    narrow.value = query.matches
    if (query.matches) workbench.sidebarOpen = false
  }
  apply()
  query.addEventListener('change', apply)
  void refresh()
  configureNotifyFocus(() => chatBinding.value?.activeId ?? undefined)
  stopNotify = startNotifyClient()
  stopRuntimeLiveness = subscribeRuntimeLiveness((event) => {
    runtimeStatus.value = event.online ? '已连接' : '未连接'
    if (event.recovered) void refresh()
  })
})
onUnmounted(() => {
  stopNotify?.()
  stopRuntimeLiveness?.()
  window.removeEventListener('hashchange', hashChange)
})
</script>

<template>
  <WorkbenchFrame
    :full-surface="['workdoc', 'scenedesigner'].includes(workspaceView)"
    :editor="editorSurface"
    :body-class="{ 'body--chat': workspaceView === 'chat', 'body--sql': workspaceView === 'sql' }"
    :right-id="SIDEBAR_RIGHT_ID"
    :right-seated="sidebarRightSeated"
    :right-collapsed="sidebarRightCollapsed"
    :right-label="i18n.global.t('desktop.rightSidebar')"
    :close-right-label="i18n.global.t('desktop.closeRightSidebar')"
    :right-attrs="{
      class: 'eap-dsh-rightbar',
      'data-dsh-region': 'sidebar-right',
      'data-testid': 'cordis-sidebar-right-column',
    }"
    outlets-class="eap-dsh-regions"
    :escape-suspended="settingsOpen"
    @close-right="setSidebarRightCollapsed(true)"
    @escape="onShellKey"
    :class="{
      'app--analysis': workspaceView === 'sql',
      'drawer-open': narrow && workbench.sidebarOpen,
    }"
  >
    <template #overlays>
      <NotifyHost />
    </template>
    <template #topbar="{ rightNarrow }">
      <Button
        size="sm"
        variant="ghost"
        type="button"
        class="sidebar-toggle"
        data-testid="open-sidebar"
        :aria-expanded="workbench.sidebarOpen"
        @click="workbench.sidebarOpen = !workbench.sidebarOpen"
        >{{
          workbench.sidebarOpen
            ? i18n.global.t('desktop.closeSidebar')
            : i18n.global.t('desktop.openSidebar')
        }}</Button
      >
      <AnalysisWorkspaceMenu v-if="workspaceView === 'sql'" :analysis="analysis" />
      <div class="desktop-page-title">
        <strong>{{ shellTitle }}</strong>
        <small v-if="shellBreadcrumb">{{ shellBreadcrumb }}</small>
      </div>
      <div class="spacer" />
      <span
        class="eap-chip"
        :class="runtimeStatus === '已连接' ? 'ok' : 'warn'"
        data-testid="runtime-chip"
      >
        <i class="dot" />{{ `运行时${runtimeStatus}` }}
      </span>
      <SidebarRightToggle
        v-if="sidebarRightSeated && (workspaceView !== 'chat' || rightNarrow)"
        :collapsed="sidebarRightCollapsed"
        @toggle="setSidebarRightCollapsed"
      />
      <AnalysisTopbarActions v-if="workspaceView === 'sql'" :analysis="analysis" />
    </template>
    <template #notice>
      <p
        v-if="chatBinding?.sending"
        class="send-in-flight"
        role="status"
        data-testid="send-in-flight"
      >
        {{ i18n.global.t('desktop.sendingAway') }}
      </p>
      <p v-if="workspaceMessage" class="shell-message" role="status">{{ workspaceMessage }}</p>
    </template>

    <template #surface>
      <WorkDocumentWorkspace
        v-if="workspaceView === 'workdoc'"
        class="workdoc-surface"
        @navigate="activeView = $event"
      />
      <SceneDesigner
        v-else-if="workspaceView === 'scenedesigner'"
        class="workdoc-surface"
        @navigate="activeView = $event"
      />
    </template>
    <template #navigation="{ inert }">
      <DesktopNavigation
        :inert="inert"
        v-show="!editorSurface"
        :can-navigate="
          () => activeView !== 'experts' || !expertManager || expertManager.guardLeave()
        "
        :active-view="activeView"
        :pages="pages"
        :board-enabled="pluginHost.boardContributionVisible.value"
        @navigate="activeView = $event"
      />
    </template>
    <template #before-main>
      <Button
        variant="backdrop"
        v-if="narrow && workbench.sidebarOpen"
        type="button"
        class="sidebar-backdrop"
        data-testid="sidebar-backdrop"
        :aria-label="i18n.global.t('desktop.closeSidebar')"
        @click="workbench.sidebarOpen = false"
      ></Button>
    </template>

    <template #default>
      <Feedback
        tone="error"
        v-if="
          errors.health &&
          ![
            'chat',
            'board',
            'scenes',
            'expert-catalog',
            'experts',
            'settings',
            'model-settings',
            'appearance',
          ].includes(activeView)
        "
        role="alert"
      >
        {{ errors.health }}
      </Feedback>

      <!--
          分析工作台：使用界面，不是管理后台。
          2026-10-15 任务不再是独立页面——一次分析的输入与它的过程/结论，本来就是同一件事的两半。
        -->
      <ScenarioWorkspace
        v-if="workspaceView === 'scenes'"
        :plugin-host="pluginHost"
        @navigate="activeView = $event"
      />
      <ProjectBoard
        ref="projectBoard"
        v-else-if="workspaceView === 'board' && pluginHost.boardContributionVisible.value"
      />
      <section
        v-else-if="workspaceView === 'board' && !pluginHost.boardContributionVisible.value"
        class="view"
        data-testid="board-contribution-disabled"
      >
        <div class="page-head">
          <h1>{{ i18n.global.t('plugin.hiddenTitle') }}</h1>
          <p>{{ i18n.global.t('plugin.hiddenBody') }}</p>
        </div>
      </section>
      <WorkspaceOverview
        v-else-if="workspaceView === 'overview'"
        :board-enabled="pluginHost.boardContributionVisible.value"
      />
      <AnalysisWorkbench v-else-if="workspaceView === 'sql'" :analysis="analysis" />

      <KeepAlive>
        <ExpertManager
          ref="expertManager"
          @editing="expertEditing = $event"
          v-if="workspaceView === 'experts'"
          @saved="refresh(false)"
          @run="
            ($event) => {
              selectedExpert = $event
              activeView = 'sql'
            }
          "
        />
      </KeepAlive>
      <PluginSlot
        ref="pluginSlot"
        :view-id="workspaceView"
        :host="pluginHost"
        :chat-view="ChatWorkspace"
      />
    </template>

    <!-- Layout outlets. Empty hosts add no box; v-show keeps the tree mounted. -->
    <template #outlets>
      <div id="eap-dsh-region-shell" data-dsh-region="shell" />
      <div id="eap-dsh-region-sidebar-leading" data-dsh-region="sidebar-leading" />
      <div
        id="eap-dsh-region-conversation"
        data-dsh-region="conversation"
        v-show="workspaceView === 'chat'"
      />
      <NativeDialog
        ref="settingsDialog"
        class="settings-dialog"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
        @cancel.prevent="closeSettings"
      >
        <div class="settings-dialog__bar">
          <h1 id="settings-dialog-title">{{ i18n.global.t('desktop.settings') }}</h1>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            autofocus
            data-testid="settings-dialog-close"
            @click="closeSettings"
          >
            {{ i18n.global.t('composerUi.close') }}
          </Button>
        </div>
        <div class="settings-dialog__body">
          <nav class="settings-dialog__nav" :aria-label="i18n.global.t('desktop.settings')">
            <Input
              v-model="settingsQuery"
              class="settings-search"
              type="search"
              :aria-label="i18n.global.t('desktop.settingsSearch')"
              :placeholder="i18n.global.t('desktop.settingsSearch')"
            />
            <div v-for="group in settingsDialogGroups" :key="group.id" class="settings-group">
              <p class="settings-group__label">{{ group.label }}</p>
              <Button
                v-for="item in group.items"
                :key="item.id"
                variant="navigation"
                type="button"
                class="nav"
                :active="activeView === item.id"
                :aria-current="activeView === item.id ? 'page' : undefined"
                @click="activeView = item.id"
                >{{ item.name }}</Button
              >
            </div>
          </nav>
          <div class="settings-dialog__page">
            <AppearanceSettings v-if="activeView === 'appearance'" />
            <ModelSettings ref="modelSettings" v-else-if="activeView === 'model-settings'" />
            <PluginCenter
              v-else-if="activeView === 'plugins'"
              :host="pluginHost"
            />
            <KeepAlive>
              <SkillManager v-if="activeView === 'skills'" />
              <KnowledgeManager
                ref="knowledgeManager"
                v-else-if="activeView === 'knowledge'"
                @saved="refresh(false)"
              />
              <DatabaseManager
                ref="databaseManager"
                v-else-if="activeView === 'databases'"
                @saved="refresh(false)"
              />
              <RuleManager
                ref="ruleManager"
                v-else-if="activeView === 'rules'"
                @saved="refresh(false)"
              />
              <CapabilityManager
                ref="capabilityManager"
                v-else-if="activeView === 'capabilities'"
                @saved="refresh(false)"
              />
            </KeepAlive>
            <InteractionPatterns
              v-if="activeView === 'patterns'"
              class="patterns-surface"
              @navigate="activeView = $event"
            />
            <div
              v-show="activeView === 'plugins'"
              id="eap-dsh-region-settings"
              data-dsh-region="settings"
            />
          </div>
        </div>
      </NativeDialog>
    </template>

    <template v-if="workspaceView === 'sql'" #inspector>
      <AnalysisInspector
        :analysis="analysis"
        :title="currentView.name"
        :hint="inspector.hint"
        :pipeline="inspector.pipeline"
      />
    </template>

    <template v-if="workspaceView === 'sql'" #status>
      <AnalysisStatusbar :analysis="analysis" />
    </template>
  </WorkbenchFrame>
</template>
