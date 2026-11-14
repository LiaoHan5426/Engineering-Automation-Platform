<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi } from '@eap/runtime-client'
import { ActionCard, Button, EmptyState, Feedback, Input, Tabs } from '@eap/ui'
import ExpertEditor from './ExpertEditor.vue'
import ExpertAgentPanel from './ExpertAgentPanel.vue'
import { expertHash, readExpertRoute, type ExpertRoute } from './expertNavigation'
import { errorMessage } from '../../lib/presentation'

type Definition = {
  id: string
  name: string
  apiVersion?: string
  behavior?: { id: string; version: number }
  agent?: { goal: string; tools: string[] }
  knowledgeBases?: string[]
  databaseProfiles?: string[]
  rulePacks?: string[]
  steps?: unknown[]
}
const emit = defineEmits<{ saved: []; run: [id: string]; editing: [value: boolean] }>()
const { t } = useI18n()
const route = ref(readExpertRoute(typeof location === 'undefined' ? '' : location.hash))
const items = ref<Definition[]>([])
const states = ref<Record<string, { enabled: boolean; builtin: boolean; revision: number }>>({})
const filter = ref('')
const error = ref('')
const loading = ref(true)
const active = ref(true)
const root = ref<HTMLElement>()
const editor = ref<{ guardLeave: () => boolean }>()
const agentPanel = ref<{ guardLeave: () => boolean }>()
const scrolls = new Map<string, number>()
const selected = computed(() => items.value.find((item) => item.id === route.value.expertId))
const visible = computed(() =>
  items.value.filter((item) =>
    (item.name + item.id).toLowerCase().includes(filter.value.toLowerCase()),
  ),
)
const agent = computed(() => selected.value?.apiVersion === 'eap/v2')
const runnable = computed(
  () =>
    !!selected.value &&
    states.value[selected.value.id]?.enabled &&
    (!agent.value ||
      (selected.value.behavior?.id === 'sql-readonly-agent' &&
        selected.value.behavior.version === 1)),
)
const editingPage = computed(() => ['config', 'new'].includes(route.value.page))
watch([editingPage, active], ([editing, visible]) => emit('editing', editing && visible), {
  immediate: true,
})
onUnmounted(() => emit('editing', false))
const taskPage = computed(() => ['tasks', 'start', 'task', 'review'].includes(route.value.page))
const tabs = computed(() => [
  { id: 'overview', label: t('expertWorkspace.overview') },
  ...(agent.value ? [{ id: 'tasks', label: t('expertWorkspace.tasks') }] : []),
])
const subtitle = computed(() =>
  t(
    'expertWorkspace.' +
      (route.value.page === 'tasks' && !route.value.expertId ? 'allTasks' : route.value.page),
  ),
)
function guardLeave() {
  return (editor.value?.guardLeave() ?? true) && (agentPanel.value?.guardLeave() ?? true)
}
function scrollHost() {
  let element = root.value?.parentElement
  while (element) {
    if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) return element
    element = element.parentElement
  }
  return document.scrollingElement
}
async function acceptRoute(next: ExpertRoute) {
  if (expertHash(next) === expertHash(route.value)) return
  if (!guardLeave()) {
    history.replaceState(null, '', '#' + expertHash(route.value))
    return
  }
  scrolls.set(expertHash(route.value), scrollHost()?.scrollTop ?? 0)
  route.value = next
  await nextTick()
  const host = scrollHost()
  if (host) host.scrollTop = scrolls.get(expertHash(next)) ?? 0
  root.value?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
}
function navigate(next: ExpertRoute) {
  if (!guardLeave()) return
  location.hash = expertHash(next)
}
function hashChanged() {
  if (active.value && location.hash.split('?')[0] === '#experts')
    void acceptRoute(readExpertRoute(location.hash))
}
function back() {
  const r = route.value
  if (r.page === 'review') navigate({ ...r, page: 'task' })
  else if (r.page === 'task')
    navigate({ page: 'tasks', expertId: r.from === 'all' ? undefined : r.expertId })
  else if (r.expertId && r.page !== 'overview') navigate({ page: 'overview', expertId: r.expertId })
  else navigate({ page: 'list' })
}
async function refresh() {
  try {
    const result = await runtimeApi.experts()
    items.value = result.items.map((text) => JSON.parse(text) as Definition)
    states.value = result.states ?? {}
    error.value = ''
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}
async function saved(id: string) {
  await refresh()
  emit('saved')
  if (route.value.page === 'new' || route.value.expertId !== id)
    navigate({ page: 'config', expertId: id })
}
function start() {
  if (!runnable.value || !selected.value) return
  if (agent.value) navigate({ page: 'start', expertId: selected.value.id })
  else emit('run', selected.value.id)
}
defineExpose({ refresh, guardLeave, currentHash: () => expertHash(route.value) })
onMounted(() => {
  void refresh()
  window.addEventListener('hashchange', hashChanged)
})
onUnmounted(() => window.removeEventListener('hashchange', hashChanged))
onActivated(() => {
  active.value = true
  hashChanged()
})
onDeactivated(() => {
  active.value = false
})
</script>

<template>
  <section
    ref="root"
    class="expert-workspace"
    :class="{ 'expert-workspace--editing': editingPage }"
    data-testid="expert-workspace"
  >
    <header v-if="!editingPage" class="manager-toolbar">
      <div>
        <Button
          v-if="route.page !== 'list'"
          variant="link"
          data-testid="expert-back"
          @click="back"
          >{{ t('expertWorkspace.back') }}</Button
        >
        <h1 tabindex="-1">
          {{ ['task', 'review'].includes(route.page) ? subtitle : selected?.name || subtitle }}
        </h1>
        <p v-if="selected && !['task', 'review'].includes(route.page)">
          {{ agent ? t('expertWorkspace.agent') : t('expertWorkspace.workflow') }} ·
          {{
            t(states[selected.id]?.enabled ? 'expertWorkspace.enabled' : 'expertWorkspace.disabled')
          }}
        </p>
      </div>
      <div class="expert-actions">
        <template v-if="route.page === 'list'">
          <Button data-testid="expert-all-tasks" @click="navigate({ page: 'tasks' })">{{
            t('expertWorkspace.allTasks')
          }}</Button>
          <Button
            data-testid="expert-new-workflow"
            @click="navigate({ page: 'new', mode: 'workflow' })"
            >{{ t('expertWorkspace.newWorkflow') }}</Button
          >
          <Button
            variant="primary"
            data-testid="expert-new-agent"
            @click="navigate({ page: 'new', mode: 'agent' })"
            >{{ t('expertWorkspace.newAgent') }}</Button
          >
        </template>
        <Button
          v-if="selected && !editingPage"
          data-testid="expert-edit"
          @click="navigate({ page: 'config', expertId: selected.id })"
          >{{ t('editor.edit') }}</Button
        >
        <Button
          v-if="selected && ['overview', 'tasks'].includes(route.page)"
          variant="primary"
          :disabled="!runnable"
          data-testid="expert-start"
          @click="start"
          >{{ t('expertWorkspace.start') }}</Button
        >
      </div>
    </header>
    <Feedback v-if="error && !editingPage" tone="error"
      >{{ error }} <Button @click="refresh">{{ t('expertAgent.refresh') }}</Button></Feedback
    >
    <p v-if="loading" role="status">{{ t('expertAgent.loading') }}</p>
    <template v-if="route.page === 'list'">
      <p>{{ t('expertWorkspace.listHint') }}</p>
      <Input
        v-model="filter"
        :aria-label="t('expertWorkspace.search')"
        :placeholder="t('expertWorkspace.search')"
      />
      <div class="expert-cards">
        <ActionCard
          v-for="item in visible"
          :key="item.id"
          :label="item.name"
          :data-testid="'expert-card-' + item.id"
          @activate="navigate({ page: 'overview', expertId: item.id })"
        >
          <h2>{{ item.name }}</h2>
          <p>
            {{
              t(item.apiVersion === 'eap/v2' ? 'expertWorkspace.agent' : 'expertWorkspace.workflow')
            }}
            ·
            {{
              t(states[item.id]?.enabled ? 'expertWorkspace.enabled' : 'expertWorkspace.disabled')
            }}
          </p>
          <p>{{ item.agent?.goal || t('expertWorkspace.workflowHint') }}</p>
        </ActionCard>
      </div>
      <EmptyState v-if="!loading && !error && !visible.length">{{
        t('expertWorkspace.empty')
      }}</EmptyState>
    </template>
    <Tabs
      v-if="selected && ['overview', 'tasks'].includes(route.page)"
      :model-value="route.page"
      :label="selected.name"
      :tabs="tabs"
      @update:model-value="
        navigate({ page: $event as 'overview' | 'tasks' | 'config', expertId: selected.id })
      "
    />
    <section v-if="route.page === 'overview' && selected" class="eap-panel expert-overview">
      <h2>{{ t('expertWorkspace.overview') }}</h2>
      <p>{{ selected.agent?.goal || t('expertWorkspace.workflowHint') }}</p>
      <p v-if="agent">{{ t('expertWorkspace.budget') }}</p>
      <h3>{{ t('expertWorkspace.scope') }}</h3>
      <p>
        {{ t('expertWorkspace.knowledgeCount', { count: selected.knowledgeBases?.length ?? 0 }) }} ·
        {{ t('expertWorkspace.databaseCount', { count: selected.databaseProfiles?.length ?? 0 }) }}
      </p>
      <p>{{ t('expertWorkspace.revision', { revision: states[selected.id]?.revision ?? '—' }) }}</p>
      <p v-if="!runnable">{{ t('expertWorkspace.enableHint') }}</p>
    </section>
    <ExpertEditor
      v-if="(route.page === 'config' && selected) || route.page === 'new'"
      :key="route.expertId || route.mode"
      ref="editor"
      :expert-id="route.expertId"
      :create-mode="route.mode"
      @back="back"
      @saved="saved"
      @run="emit('run', $event)"
    />
    <ExpertAgentPanel
      v-if="taskPage && active"
      ref="agentPanel"
      :mode="route.page as 'tasks' | 'start' | 'task' | 'review'"
      :expert-id="route.expertId"
      :run-id="route.runId"
      :from-all="route.from === 'all' || !route.expertId"
      @navigate="navigate"
    />
    <EmptyState
      v-if="
        !loading &&
        !error &&
        route.expertId &&
        !selected &&
        !['task', 'review'].includes(route.page)
      "
      >{{ t('expertWorkspace.notFound') }}</EmptyState
    >
  </section>
</template>

<style scoped>
.expert-workspace {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.expert-workspace--editing {
  display: block;
  height: 100%;
  min-height: 0;
}

.expert-workspace h1 {
  margin: 0;
  font-size: 24px;
  overflow-wrap: anywhere;
}

.expert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.expert-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}

.expert-cards p,
.expert-overview p {
  overflow-wrap: anywhere;
}
</style>
