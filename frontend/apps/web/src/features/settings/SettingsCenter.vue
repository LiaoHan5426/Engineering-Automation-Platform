<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  EmptyState,
  Feedback,
  IconBriefcase,
  IconCode,
  IconLayers,
  IconPlus,
  IconSettings,
  IconUsers,
} from '@eap/ui'
import { runtimeApi } from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'
import { MANIFESTS, browserStore, readInstallation } from '../plugins/model'
import {
  appearance,
  appearanceDefaults,
  setAppearance,
  type AppearancePreferences,
} from './appearance'

type CategoryId =
  | 'models'
  | 'knowledge'
  | 'rules'
  | 'databases'
  | 'skills'
  | 'capabilities'
  | 'plugins'
  | 'appearance'
type StatusTone = 'ok' | 'warn' | 'neutral'
type SettingRecord = {
  id: string
  title: string
  meta: string
  status: string
  tone: StatusTone
}

const emit = defineEmits<{ navigate: [id: string] }>()
const { t } = useI18n()

const categories = [
  { id: 'models', group: 'workspace', detail: 'model-settings' },
  { id: 'knowledge', group: 'workspace', detail: 'knowledge' },
  { id: 'rules', group: 'workspace', detail: 'rules' },
  { id: 'databases', group: 'workspace', detail: 'databases' },
  { id: 'skills', group: 'workspace', detail: 'skills' },
  { id: 'capabilities', group: 'workspace', detail: 'capabilities' },
  { id: 'plugins', group: 'workspace', detail: 'plugins' },
  { id: 'appearance', group: 'preference', detail: 'appearance' },
] as const satisfies ReadonlyArray<{
  id: CategoryId
  group: 'workspace' | 'preference'
  detail: string
}>

const railAreas = [
  { key: 'code', view: 'chat', label: 'desktop.code', icon: IconCode },
  { key: 'work', view: 'workdoc', label: 'desktop.work', icon: IconBriefcase },
  { key: 'scenes', view: 'scenedesigner', label: 'desktop.scenes', icon: IconLayers },
  { key: 'experts', view: 'experts', label: 'desktop.experts', icon: IconUsers },
  { key: 'settings', view: 'settings', label: 'desktop.settings', icon: IconSettings },
] as const

const category = ref<CategoryId>('models')
const records = ref<SettingRecord[]>([])
const error = ref('')
const loading = ref(false)
const notice = ref('')
const sidebarOpen = ref(false)
let requestId = 0

const current = computed(() => categories.find((item) => item.id === category.value)!)
const headingKey = computed(() => {
  const keys: Record<CategoryId, string> = {
    models: 'settingsCenter.connections',
    knowledge: 'settingsCenter.collections',
    rules: 'settingsCenter.rulePacks',
    databases: 'settingsCenter.dataSources',
    skills: 'settingsCenter.registeredSkills',
    capabilities: 'settingsCenter.availableCapabilities',
    plugins: 'settingsCenter.installedPlugins',
    appearance: 'settingsCenter.appearancePreferences',
  }
  return keys[category.value]
})
const actionKey = computed(() => {
  const keys: Record<CategoryId, string> = {
    models: 'settingsCenter.addConnection',
    knowledge: 'settingsCenter.newCollection',
    rules: 'settingsCenter.newRulePack',
    databases: 'settingsCenter.newDataSource',
    skills: 'settingsCenter.registerSkill',
    capabilities: 'settingsCenter.redetect',
    plugins: 'settingsCenter.browsePlugins',
    appearance: 'settingsCenter.restoreDefaults',
  }
  return keys[category.value]
})
const groupedCategories = computed(() =>
  ['workspace', 'preference'].map((group) => ({
    group,
    items: categories.filter((item) => item.group === group),
  })),
)

function status(
  ok: boolean,
  okLabel: string,
  badLabel: string,
  tone: StatusTone = 'ok',
): Pick<SettingRecord, 'status' | 'tone'> {
  return ok ? { status: okLabel, tone } : { status: badLabel, tone: tone === 'ok' ? 'warn' : tone }
}

async function loadModels(): Promise<SettingRecord[]> {
  const result = await runtimeApi.modelConnections()
  return result.items.map((item) => ({
    id: item.id,
    title: item.name,
    meta: [
      item.defaultModel || t('modelUi.pending'),
      t('settingsCenter.allowedModels', { count: item.allowedModels.length }),
      item.secretPresent ? t('settingsCenter.localSecret') : t('settingsCenter.noSecret'),
    ].join(' · '),
    ...status(
      item.enabled && !item.discoveryError.trim(),
      t('settingsCenter.verified'),
      item.enabled ? t('settingsCenter.unverified') : t('settingsCenter.disabled'),
    ),
  }))
}

async function loadKnowledge(): Promise<SettingRecord[]> {
  const result = await runtimeApi.knowledgeBases()
  return result.items.map((item) => ({
    id: item.id,
    title: item.name,
    meta: [t('settingsCenter.documents', { count: item.documents }), item.description]
      .filter(Boolean)
      .join(' · '),
    status: t('settingsCenter.available'),
    tone: 'neutral',
  }))
}

async function loadRules(): Promise<SettingRecord[]> {
  const result = await runtimeApi.rulePacks()
  return result.items.map((item) => ({
    id: item.id,
    title: item.name,
    meta: [
      t('settingsCenter.ruleCount', { count: item.ruleCount }),
      item.shipped ? t('settingsCenter.builtIn') : t('settingsCenter.custom'),
      item.description,
    ]
      .filter(Boolean)
      .join(' · '),
    ...status(item.enabled, t('settingsCenter.enabled'), t('settingsCenter.disabled')),
  }))
}

async function loadDatabases(): Promise<SettingRecord[]> {
  const result = await runtimeApi.databases()
  return result.items.map((item) => ({
    id: item.id,
    title: item.label,
    meta: [
      item.engine,
      item.environment,
      item.credentialsExposed
        ? t('settingsCenter.credentialsExposed')
        : t('settingsCenter.credentialsSafe'),
    ].join(' · '),
    status: t('settingsCenter.available'),
    tone: 'neutral',
  }))
}

async function loadSkills(): Promise<SettingRecord[]> {
  const result = await runtimeApi.skills()
  return result.items.map((item) => ({
    id: item.id,
    title: `${item.id} · ${item.version}`,
    meta: [
      item.sourceLabel,
      t('settingsCenter.dependencies', { count: item.dependencies.length }),
      `r${item.stateRevision}`,
    ].join(' · '),
    ...status(item.enabled, t('settingsCenter.enabled'), t('settingsCenter.disabled')),
  }))
}

async function loadCapabilities(): Promise<SettingRecord[]> {
  const [catalog, servers] = await Promise.all([runtimeApi.capabilities(), runtimeApi.mcpServers()])
  const capabilityRecords = catalog.items.slice(0, 7).map((item) => ({
    id: `cap-${item.name}`,
    title: `${item.title} · ${item.kindLabel}`,
    meta: item.summary,
    ...status(
      item.enabled && item.globallyRunnable,
      t('settingsCenter.available'),
      item.disabled ? t('settingsCenter.disabled') : t('settingsCenter.unavailable'),
      'neutral',
    ),
  }))
  const serverRecords = servers.items.map((item) => ({
    id: `mcp-${item.id}`,
    title: `${item.name} · MCP`,
    meta: [t('settingsCenter.tools', { count: item.tools.length }), item.transport, item.endpoint]
      .filter(Boolean)
      .join(' · '),
    ...status(
      item.usable,
      t('settingsCenter.connected'),
      t('settingsCenter.unavailable'),
      'neutral',
    ),
  }))
  return [...capabilityRecords, ...serverRecords]
}

function loadPlugins(): SettingRecord[] {
  const installation = readInstallation(browserStore())
  return MANIFESTS.map((manifest) => ({
    id: `plugin-${manifest.id}`,
    title: `${manifest.id.toUpperCase()} · ${t('settingsCenter.builtIn')}`,
    meta: `v${manifest.version} · ${t('settingsCenter.dependencies', { count: manifest.requests.length })}`,
    ...status(
      installation.enabled[manifest.id],
      t('settingsCenter.enabled'),
      t('settingsCenter.disabled'),
    ),
  }))
}

function appearanceRecord(
  id: string,
  title: string,
  value: string,
  preferences: AppearancePreferences,
): SettingRecord {
  return {
    id,
    title,
    meta: t('settingsCenter.current', { value }),
    status:
      id === 'appearance-layout'
        ? `${preferences.sidebarWidth} / ${preferences.contentMaxWidth}px`
        : value,
    tone: 'neutral',
  }
}

function loadAppearance(): SettingRecord[] {
  const value = appearance.value
  return [
    appearanceRecord(
      'appearance-theme',
      t('settingsCenter.themeMode'),
      t(`settingsCenter.${value.theme}`),
      value,
    ),
    appearanceRecord(
      'appearance-density',
      t('settingsCenter.density'),
      t(`settingsCenter.${value.density}`),
      value,
    ),
    appearanceRecord(
      'appearance-layout',
      t('appearance.preview'),
      `${value.sidebarWidth} / ${value.railWidth} / ${value.contentMaxWidth}`,
      value,
    ),
  ]
}

async function load() {
  const currentRequest = ++requestId
  loading.value = true
  error.value = ''
  records.value = []
  notice.value = ''
  try {
    const loaded =
      category.value === 'models'
        ? await loadModels()
        : category.value === 'knowledge'
          ? await loadKnowledge()
          : category.value === 'rules'
            ? await loadRules()
            : category.value === 'databases'
              ? await loadDatabases()
              : category.value === 'skills'
                ? await loadSkills()
                : category.value === 'capabilities'
                  ? await loadCapabilities()
                  : category.value === 'plugins'
                    ? loadPlugins()
                    : loadAppearance()
    if (currentRequest === requestId) records.value = loaded
  } catch (cause) {
    if (currentRequest === requestId) error.value = errorMessage(cause)
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function select(id: CategoryId) {
  if (category.value === id) return
  category.value = id
  sidebarOpen.value = false
}

function primaryAction() {
  if (category.value === 'appearance') {
    setAppearance(appearanceDefaults)
    notice.value = t('settingsCenter.resetNote')
    void load()
    return
  }
  emit('navigate', current.value.detail)
}

function openDetail() {
  emit('navigate', current.value.detail)
}

function navigateArea(view: string) {
  if (view !== 'settings') emit('navigate', view)
}

watch(category, () => void load())
onMounted(() => void load())
</script>

<template>
  <div class="settings-center" data-testid="settings-center">
    <nav class="sc-rail" data-testid="settings-center-rail" :aria-label="t('desktop.navigation')">
      <span class="sc-brand" aria-hidden="true">E</span>
      <Button
        v-for="area in railAreas"
        :key="area.key"
        variant="activity"
        class="sc-rail-entry"
        :class="{ 'sc-rail-entry--active': area.key === 'settings' }"
        :active="area.key === 'settings'"
        :aria-label="t(area.label)"
        :title="t(area.label)"
        @click="navigateArea(area.view)"
      >
        <component :is="area.icon" :size="22" />
      </Button>
      <span class="sc-avatar" aria-hidden="true">YL</span>
    </nav>

    <aside
      class="sc-sidebar"
      :class="{ 'sc-sidebar--open': sidebarOpen }"
      data-testid="settings-center-sidebar"
    >
      <header class="sc-sidebar-head">
        <i aria-hidden="true"></i>
        <strong>{{ t('settingsCenter.title') }}</strong>
      </header>
      <div v-for="group in groupedCategories" :key="group.group" class="sc-group">
        <p>
          {{
            t(
              group.group === 'workspace'
                ? 'settingsCenter.workspaceGroup'
                : 'settingsCenter.preferenceGroup',
            )
          }}
        </p>
        <Button
          v-for="item in group.items"
          :key="item.id"
          variant="navigation"
          class="sc-category"
          :active="category === item.id"
          :aria-current="category === item.id ? 'page' : undefined"
          :data-testid="'settings-center-category-' + item.id"
          @click="select(item.id)"
          >{{ t(`settingsCenter.${item.id}`) }}</Button
        >
      </div>
      <div class="sc-group">
        <p>{{ t('settingsCenter.referenceGroup') }}</p>
        <Button
          variant="navigation"
          class="sc-category"
          data-testid="settings-center-patterns"
          @click="emit('navigate', 'patterns')"
          >{{ t('settingsCenter.patterns') }}</Button
        >
      </div>
    </aside>

    <Button
      v-if="sidebarOpen"
      variant="backdrop"
      class="sc-backdrop"
      :aria-label="t('settingsCenter.closeSidebar')"
      @click="sidebarOpen = false"
    ></Button>

    <section class="sc-main">
      <header class="sc-topbar" data-testid="settings-center-topbar">
        <Button
          variant="icon"
          class="sc-menu"
          :aria-label="t('settingsCenter.openSidebar')"
          @click="sidebarOpen = !sidebarOpen"
          >☰</Button
        >
        <div>
          <strong>{{ t(`settingsCenter.${category}`) }}</strong>
          <small
            >{{ t('settingsCenter.breadcrumb') }} / {{ t(`settingsCenter.${category}`) }}</small
          >
        </div>
        <Button variant="secondary" data-testid="settings-center-detail" @click="openDetail">{{
          t('settingsCenter.detail')
        }}</Button>
      </header>

      <div class="sc-content eap-scrollbar">
        <header class="sc-page-head">
          <h1 data-testid="settings-center-title">{{ t(`settingsCenter.${category}`) }}</h1>
          <p>{{ t(`settingsCenter.${category}Desc`) }}</p>
        </header>

        <div class="sc-list-head">
          <h2>
            {{ t(headingKey) }} <span v-if="!loading">{{ records.length }}</span>
          </h2>
          <Button variant="primary" :disabled="loading" @click="primaryAction"
            ><IconPlus />{{ t(actionKey) }}</Button
          >
        </div>
        <p class="sc-source">{{ t('settingsCenter.sourceNote') }}</p>
        <Feedback v-if="notice" tone="info" role="status">{{ notice }}</Feedback>
        <Feedback v-if="error" tone="error" role="alert" data-testid="settings-center-error">{{
          error
        }}</Feedback>
        <Feedback v-if="loading" tone="info" role="status">{{
          t('settingsCenter.loading')
        }}</Feedback>

        <div class="sc-records">
          <article
            v-for="record in records"
            :key="record.id"
            class="sc-record"
            :data-testid="'settings-center-record-' + record.id"
          >
            <span class="sc-record-icon" aria-hidden="true">{{
              record.title.slice(0, 2).toUpperCase()
            }}</span>
            <div>
              <strong>{{ record.title }}</strong>
              <p>{{ record.meta }}</p>
            </div>
            <span class="sc-status" :class="'sc-status--' + record.tone">{{ record.status }}</span>
          </article>
          <EmptyState v-if="!loading && !records.length" data-testid="settings-center-empty">{{
            t('settingsCenter.empty')
          }}</EmptyState>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-center {
  display: grid;
  grid-template-columns: var(--eap-layout-activity-width, 72px) 288px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
}

.sc-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 10px 0 14px;
  background: var(--bg);
  border-right: 1px solid var(--border);
}

.sc-brand,
.sc-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  font-size: 16px;
  font-weight: 700;
  color: var(--eap-color-on-primary, var(--text));
  background: var(--eap-color-primary, var(--accent));
  border-radius: 10px;
}

.sc-brand {
  margin-bottom: 10px;
}

.sc-avatar {
  margin-top: auto;
  font-size: 11px;
  color: var(--text-soft);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 50%;
}

.sc-rail-entry {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
}

.sc-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 0 12px 16px;
  overflow: auto;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
}

.sc-sidebar-head {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 56px;
  padding: 0 12px;
  margin: 0 -12px;
  border-bottom: 1px solid var(--border);
}

.sc-sidebar-head i {
  width: 8px;
  height: 8px;
  background: var(--eap-color-primary, var(--accent));
  border-radius: 50%;
}

.sc-sidebar-head strong {
  font-size: 14px;
  font-weight: 650;
}

.sc-group {
  display: grid;
  gap: 2px;
}

.sc-group p {
  padding: 0 10px;
  margin: 4px 0 2px;
  font-size: 10px;
  font-weight: 650;
  color: var(--text-mute);
  letter-spacing: 0.04em;
}

.sc-category {
  justify-content: flex-start;
  width: 100%;
  height: 36px;
}

.sc-main {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}

.sc-topbar {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
}

.sc-topbar > div {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.sc-topbar strong {
  font-size: 14px;
  font-weight: 650;
}

.sc-topbar small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-mute);
  white-space: nowrap;
}

.sc-menu {
  display: none;
}

.sc-content {
  min-width: 0;
  padding: 28px 32px 40px;
  overflow: auto;
}

.sc-page-head {
  margin-bottom: 24px;
}

.sc-page-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.sc-page-head p {
  max-width: 76ch;
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
}

.sc-list-head {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
}

.sc-list-head h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
}

.sc-list-head h2 span {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-soft);
}

.sc-source {
  margin: 8px 0 14px;
  font-size: 11px;
  color: var(--text-mute);
}

.sc-records {
  display: grid;
  gap: 10px;
  max-width: 920px;
}

.sc-record {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 76px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.sc-record-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text);
  background: var(--surface-3);
  border-radius: 10px;
}

.sc-record > div {
  min-width: 0;
}

.sc-record strong {
  display: block;
  font-size: 13px;
  font-weight: 650;
}

.sc-record p {
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-soft);
  overflow-wrap: anywhere;
}

.sc-status {
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  border-radius: 999px;
}

.sc-status--ok {
  color: var(--eap-color-success-text, var(--text));
  background: var(--eap-color-success-bg, var(--surface-3));
}

.sc-status--warn {
  color: var(--eap-color-warning-text, var(--text));
  background: var(--eap-color-warning-bg, var(--surface-3));
}

.sc-status--neutral {
  color: var(--text-soft);
  background: var(--surface-3);
}

.sc-backdrop {
  display: none;
}

@media (width <= 760px) {
  .sc-topbar {
    gap: 6px;
    padding: 0 10px;
  }

  .sc-topbar .eap-button {
    min-height: 28px;
    padding: 0 8px;
    font-size: 11px;
    white-space: nowrap;
  }

  .settings-center {
    grid-template-columns: var(--eap-layout-activity-width, 72px) minmax(0, 1fr);
  }

  .sc-sidebar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--eap-layout-activity-width, 72px);
    z-index: 40;
    width: 288px;
    transform: translateX(calc(-100% - var(--eap-layout-activity-width, 72px)));
    transition: transform 0.18s ease;
  }

  .sc-sidebar--open {
    transform: translateX(0);
  }

  .sc-backdrop {
    position: absolute;
    inset: 0 0 0 var(--eap-layout-activity-width, 72px);
    z-index: 35;
    display: block;
  }

  .sc-menu {
    display: inline-grid;
  }

  .sc-content {
    padding: 20px 16px 32px;
  }

  .sc-record {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .sc-record-icon {
    width: 36px;
    height: 36px;
  }

  .sc-status {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
