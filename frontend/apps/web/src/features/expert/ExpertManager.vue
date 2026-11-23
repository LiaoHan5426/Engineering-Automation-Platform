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
/** Prototype board 05 cards: stable tone per expert id, no hard-coded sample identities. */
function cardTone(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return ['accent', 'success', 'warning', 'error'][hash % 4]
}
/** Tags come from the expert's real granted resources, never from sample copy. */
function cardTags(item: Definition): Array<{ key: string; label: string; count: number }> {
  const tags: Array<{ key: string; label: string; count: number }> = []
  const tools = item.agent?.tools?.length ?? 0
  const knowledge = item.knowledgeBases?.length ?? 0
  const rules = item.rulePacks?.length ?? 0
  if (tools) tags.push({ key: 'tools', label: 'expertWorkspace.tagTools', count: tools })
  if (knowledge) tags.push({ key: 'knowledge', label: 'expertWorkspace.tagKnowledge', count: knowledge })
  if (rules) tags.push({ key: 'rules', label: 'expertWorkspace.tagRules', count: rules })
  return tags.slice(0, 2)
}
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
      <div class="expert-gallery-head">
        <div>
          <h2>{{ t('expertWorkspace.list') }}</h2>
          <p>
            {{
              t('expertWorkspace.enabledCount', {
                count: visible.filter((item) => states[item.id]?.enabled).length,
              })
            }}
          </p>
        </div>
      </div>
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
          class="expert-gallery-card"
          :class="'expert-gallery-card--' + cardTone(item.id)"
          @activate="navigate({ page: 'overview', expertId: item.id })"
        >
          <span class="expert-card-top">
            <span
              class="expert-card-avatar"
              data-testid="expert-card-avatar"
              aria-hidden="true"
              >{{ item.name.trim().charAt(0) }}</span
            >
            <span class="expert-card-identity">
              <strong>{{ item.name }}</strong>
              <small>{{
                t(
                  states[item.id]?.builtin
                    ? 'expertWorkspace.builtin'
                    : 'expertWorkspace.custom',
                )
              }}</small>
            </span>
          </span>
          <span class="expert-card-desc">{{
            item.agent?.goal || t('expertWorkspace.workflowHint')
          }}</span>
          <span class="expert-card-tags">
            <span
              v-for="tag in cardTags(item)"
              :key="tag.key"
              class="expert-card-tag"
              data-testid="expert-card-tag"
              >{{ t(tag.label) }}</span
            >
          </span>
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

.expert-gallery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.expert-gallery-head h2 {
  margin: 0;
}
.expert-gallery-head p {
  margin: 4px 0 0;
  color: var(--eap-text-color-secondary);
  font-size: 12px;
}

.expert-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 12px;
}

/* Prototype board 05: 300x150 expert cards — avatar, name, role type, description, tags. */
.expert-gallery-card {
  min-height: 150px;
}
.expert-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.expert-card-avatar {
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: var(--eap-radius-md, 8px);
  background: var(--eap-color-primary-soft);
  color: var(--eap-color-primary);
  font-size: 15px;
  font-weight: 600;
}
.expert-gallery-card--success .expert-card-avatar {
  background: var(--eap-color-success-soft);
  color: var(--eap-color-success);
}
.expert-gallery-card--warning .expert-card-avatar {
  background: var(--eap-color-warning-soft);
  color: var(--eap-color-warning);
}
.expert-gallery-card--error .expert-card-avatar {
  background: var(--eap-color-danger-soft);
  color: var(--eap-color-danger);
}
.expert-card-identity {
  display: grid;
  min-width: 0;
}
.expert-card-identity strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.expert-card-identity small {
  color: var(--eap-text-color-secondary);
  font-size: 10px;
}
.expert-card-desc {
  color: var(--eap-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.expert-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.expert-card-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--eap-fill-color-hover);
  color: var(--eap-text-color-secondary);
  font-size: 10px;
}

.expert-cards p,
.expert-overview p {
  overflow-wrap: anywhere;
}
</style>
