<script setup lang="ts">
import { computed, nextTick, onDeactivated, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Input,
  Select,
  Dialog,
  Badge,
  EmptyState,
  Feedback,
  Textarea,
  ConfirmBox,
} from '@eap/ui'
import {
  boardTaskColumnValues,
  isPrototypeTaskListItems,
  type PrototypeNode,
  type PrototypeTaskListItem,
} from '@eap/runtime-client/contracts'
import {
  runtimeApi as api,
  isTaskDetailFields,
  type TaskDetailOptimization,
} from '@eap/runtime-client'
const props = defineProps<{ node: PrototypeNode }>()
const { t } = useI18n()
const query = ref(''),
  status = ref('all'),
  selected = ref<PrototypeTaskListItem | null>(null)
const valid = computed(
  () =>
    isPrototypeTaskListItems(props.node.props.items) &&
    props.node.children.length === 0 &&
    (!Object.hasOwn(props.node.props, 'editable') ||
      typeof props.node.props.editable === 'boolean') &&
    (!Object.hasOwn(props.node.props, 'creatable') ||
      typeof props.node.props.creatable === 'boolean'),
)
const items = ref<PrototypeTaskListItem[]>([])
const creating = ref(false),
  created = ref(false)
const creatable = computed(() => props.node.props.creatable === true)
const full = computed(() => items.value.length >= 30)
let createOpener: HTMLElement | null = null
let submitted = false
const editable = computed(() => props.node.props.editable === true)
const editing = ref(false),
  confirming = ref(false),
  attempted = ref(false),
  saved = ref(false)
const draft = reactive({ name: '', goal: '', acceptanceCriteria: '' })
let detailOpener: HTMLElement | null = null
function openDetail(item: PrototypeTaskListItem, event: MouseEvent) {
  detailOpener = event.currentTarget as HTMLElement
  saved.value = false
  selected.value = item
}
function closeDetail() {
  selected.value = null
  void nextTick(() => detailOpener?.isConnected && detailOpener.focus())
}
function updateDraft(key: 'name' | 'goal' | 'acceptanceCriteria', value: string) {
  draft[key] = value
  invalidate()
}
const fields = ['goal', 'acceptanceCriteria'] as const
const formFields = computed(() => (creating.value ? (['name', ...fields] as const) : fields))
const dirty = computed(() =>
  creating.value
    ? formFields.value.some((key) => draft[key] !== '')
    : !!selected.value && fields.some((key) => draft[key] !== selected.value![key]),
)
const suggestion = ref<TaskDetailOptimization | null>(null),
  pending = ref(false),
  aiError = ref(false),
  adopted = ref(false)
let epoch = 0,
  request: { id: string; controller: AbortController } | undefined
function invalidate() {
  epoch++
  suggestion.value = null
  pending.value = false
  aiError.value = false
  adopted.value = false
  if (request) {
    const old = request
    request = undefined
    old.controller.abort()
    void api.cancelTaskDetailOptimization(old.id).catch(() => {})
  }
}
function error(key: 'name' | (typeof fields)[number]) {
  return !draft[key].trim()
    ? t('editor.taskList.required')
    : draft[key].length > (key === 'name' ? 120 : 2000)
      ? t('editor.taskList.' + (key === 'name' ? 'nameTooLong' : 'tooLong'))
      : ''
}
function focusField(key: string) {
  void nextTick(() =>
    nextTick(() =>
      document.querySelector<HTMLElement>('[data-testid="task-edit-' + key + '"]')?.focus(),
    ),
  )
}
function openCreate(event: MouseEvent) {
  if (!creatable.value || full.value || editing.value) return
  createOpener = event.currentTarget as HTMLElement
  invalidate()
  selected.value = null
  Object.assign(draft, { name: '', goal: '', acceptanceCriteria: '' })
  creating.value = true
  editing.value = true
  submitted = false
  attempted.value = false
  focusField('name')
}
function openEdit() {
  submitted = false
  creating.value = false
  invalidate()
  Object.assign(draft, {
    goal: selected.value!.goal,
    acceptanceCriteria: selected.value!.acceptanceCriteria,
  })
  attempted.value = false
  editing.value = true
  saved.value = false
  focusField('goal')
}
function exitEdit() {
  invalidate()
  const wasCreating = creating.value
  editing.value = false
  creating.value = false
  confirming.value = false
  if (wasCreating) void nextTick(() => createOpener?.isConnected && createOpener.focus())
  else focusField('open')
}
function requestExit() {
  invalidate()
  if (dirty.value) confirming.value = true
  else exitEdit()
}
function save() {
  if (!editing.value || submitted) return
  invalidate()
  attempted.value = true
  const first = formFields.value.find((key) => error(key))
  if (first) {
    focusField(first)
    return
  }
  if (creating.value) {
    if (full.value) return
    submitted = true
    let id: string
    do {
      id = 'LOCAL-' + crypto.randomUUID()
    } while (items.value.some((item) => item.id === id))
    items.value.unshift({
      id,
      name: draft.name,
      goal: draft.goal,
      acceptanceCriteria: draft.acceptanceCriteria,
      status: 'planned',
      priority: 'none',
      summary: '',
    })
    resetFilters()
    exitEdit()
    created.value = true
    void nextTick(() =>
      document.querySelector<HTMLElement>('[data-task-id="' + id + '"] button')?.focus(),
    )
    return
  }
  Object.assign(selected.value!, { goal: draft.goal, acceptanceCriteria: draft.acceptanceCriteria })
  exitEdit()
  saved.value = true
}
async function optimize() {
  invalidate()
  if (!isTaskDetailFields(draft)) return
  const version = epoch,
    operation = { id: crypto.randomUUID(), controller: new AbortController() }
  request = operation
  pending.value = true
  try {
    const result = await api.optimizeTaskDetail(
      operation.id,
      { goal: draft.goal, acceptanceCriteria: draft.acceptanceCriteria },
      { signal: operation.controller.signal },
    )
    if (version === epoch && editing.value) suggestion.value = result
  } catch {
    if (version === epoch) aiError.value = true
  } finally {
    if (version === epoch) {
      pending.value = false
      request = undefined
    }
  }
}
function adopt() {
  if (!suggestion.value) return
  const value = suggestion.value
  invalidate()
  Object.assign(draft, { goal: value.goal, acceptanceCriteria: value.acceptanceCriteria })
  adopted.value = true
  focusField('goal')
}
const shown = computed(() =>
  items.value.filter(
    (item) =>
      item.name.toLowerCase().includes(query.value.trim().toLowerCase()) &&
      (status.value === 'all' || item.status === status.value),
  ),
)
function resetFilters() {
  query.value = ''
  status.value = 'all'
}
function reset() {
  exitEdit()
  saved.value = false
  created.value = false
  items.value = valid.value
    ? (props.node.props.items as PrototypeTaskListItem[]).map((item) => ({ ...item }))
    : []
  query.value = ''
  status.value = 'all'
  selected.value = null
}
watch(() => props.node, reset, { deep: true, immediate: true })
onBeforeUnmount(invalidate)
onDeactivated(reset)
</script>
<template>
  <Feedback v-if="!valid" tone="warning">{{ t('editor.taskList.invalid') }}</Feedback>
  <section
    v-else
    class="task-list"
    data-testid="task-list-preview"
    :data-editable="editable"
    :data-creatable="creatable"
    :aria-label="String(node.props.label || t('editor.taskList.title'))"
  >
    <div class="task-list__results">
      <h1>{{ node.props.label || t('editor.taskList.title') }}</h1>
      <Button
        v-if="creatable"
        data-testid="task-create-open"
        :disabled="full"
        @click="openCreate"
        >{{ t('editor.taskList.create') }}</Button
      >
    </div>
    <Feedback v-if="creatable && full" data-testid="task-create-capacity">{{
      t('editor.taskList.capacity')
    }}</Feedback>
    <p v-if="created" role="status" data-testid="task-create-notice">
      {{ t('editor.taskList.created') }}
    </p>
    <p>{{ t('editor.taskList.intro') }}</p>
    <div class="task-list__filters">
      <label
        >{{ t('editor.taskList.name')
        }}<Input
          v-model="query"
          type="search"
          data-testid="task-list-query"
          :placeholder="t('editor.taskList.search')"
      /></label>
      <label
        >{{ t('editor.taskList.status')
        }}<Select
          v-model="status"
          :aria-label="t('editor.taskList.status')"
          data-testid="task-list-status"
          ><option value="all">{{ t('editor.taskList.all') }}</option>
          <option v-for="value in boardTaskColumnValues" :key="value" :value="value">
            {{ t('editor.taskList.states.' + value) }}
          </option></Select
        ></label
      >
      <Button variant="secondary" @click="resetFilters">{{ t('editor.taskList.clear') }}</Button>
    </div>
    <div class="task-list__results">
      <h2>{{ t('editor.taskList.allTasks') }}</h2>
      <span role="status" data-testid="task-list-count">{{
        t('editor.taskList.count', { matching: shown.length, total: items.length })
      }}</span>
    </div>
    <div class="task-list__columns" aria-hidden="true">
      <span>{{ t('editor.taskList.name') }} / {{ t('editor.taskList.summary') }}</span
      ><span>{{ t('editor.taskList.status') }}</span
      ><span>{{ t('editor.taskList.priority') }}</span
      ><span>{{ t('editor.taskList.actions') }}</span>
    </div>
    <ul class="task-list__rows">
      <li v-for="item in shown" :key="item.id" :data-task-id="item.id">
        <div>
          <h3>{{ item.name }}</h3>
          <p>{{ item.summary }}</p>
        </div>
        <Badge>{{ t('editor.taskList.states.' + item.status) }}</Badge
        ><span>{{ item.priority.toUpperCase() }}</span>
        <Button
          variant="secondary"
          size="sm"
          :aria-label="t('editor.taskList.view') + '：' + item.name"
          @click="openDetail(item, $event)"
          >{{ t('editor.taskList.view') }} →</Button
        >
      </li>
    </ul>
    <EmptyState
      v-if="!shown.length"
      :title="t('editor.taskList.empty')"
      data-testid="task-list-empty"
      ><p>{{ t('editor.taskList.emptyHint') }}</p>
      <Button @click="resetFilters">{{ t('editor.taskList.reset') }}</Button
      ><Button
        v-if="creatable"
        data-testid="task-create-empty"
        :disabled="full"
        @click="openCreate"
        >{{ t('editor.taskList.create') }}</Button
      ></EmptyState
    >
    <Dialog
      v-if="selected && !editing"
      :title="t('editor.taskList.detail')"
      :close-label="t('editor.taskList.close')"
      data-testid="task-list-detail"
      @close="closeDetail"
    >
      <div class="task-list__detail">
        <small>{{ selected.id }}</small>
        <h2>{{ selected.name }}</h2>
        <Badge>{{ t('editor.taskList.states.' + selected.status) }}</Badge
        ><span>{{ selected.priority.toUpperCase() }}</span>
        <h3>{{ t('editor.taskList.summary') }}</h3>
        <p>{{ selected.summary }}</p>
        <h3>{{ t('editor.taskList.goal') }}</h3>
        <p>{{ selected.goal }}</p>
        <h3>{{ t('editor.taskList.criteria') }}</h3>
        <p>{{ selected.acceptanceCriteria }}</p>
      </div>
      <template #footer
        ><span v-if="saved" role="status">{{ t('editor.taskList.saved') }}</span
        ><Button v-if="editable" data-testid="task-edit-open" @click="openEdit">{{
          t('editor.taskList.edit')
        }}</Button
        ><Button @click="closeDetail">{{ t('editor.taskList.close') }}</Button></template
      >
    </Dialog>
    <Dialog
      v-if="editing"
      :title="t('editor.taskList.' + (creating ? 'createTitle' : 'editTitle'))"
      :close-label="t('editor.taskList.closeEdit')"
      data-testid="task-edit-dialog"
      @close="requestExit"
    >
      <div class="task-list__detail">
        <template v-if="selected && !creating"
          ><small>{{ selected.id }}</small>
          <h2>{{ selected.name }}</h2>
          <p>
            {{ t('editor.taskList.states.' + selected.status) }} ·
            {{ selected.priority.toUpperCase() }}
          </p>
          <p>{{ selected.summary }}</p></template
        >
        <p v-else>
          {{ t('editor.taskList.states.planned') }} · {{ t('editor.taskList.priorityNone') }}
        </p>
        <label v-for="key in formFields" :key="key"
          >{{
            t('editor.taskList.' + (key === 'name' ? 'name' : key === 'goal' ? 'goal' : 'criteria'))
          }}
          *
          <component
            :is="key === 'name' ? Input : Textarea"
            :aria-label="
              t(
                'editor.taskList.' +
                  (key === 'name' ? 'name' : key === 'goal' ? 'goal' : 'criteria'),
              )
            "
            :model-value="draft[key]"
            :data-testid="'task-edit-' + key"
            :rows="5"
            :aria-invalid="attempted && !!error(key)"
            :aria-describedby="'task-edit-error-' + key"
            @update:model-value="updateDraft(key, $event)"
          />
          <span
            :id="'task-edit-error-' + key"
            :role="attempted && error(key) ? 'alert' : undefined"
            >{{ attempted ? error(key) : '' }}</span
          ><small>{{ draft[key].length }} / {{ key === 'name' ? 120 : 2000 }}</small>
        </label>
        <p v-if="adopted" role="status">{{ t('editor.taskList.adopted') }}</p>
        <section
          v-if="pending || suggestion || aiError"
          data-testid="task-ai-panel"
          :aria-label="t('editor.taskList.suggestions')"
        >
          <p role="status">
            {{ t('editor.taskList.' + (pending ? 'optimizing' : aiError ? 'aiError' : 'review')) }}
          </p>
          <Button v-if="pending" data-testid="task-ai-cancel" @click="invalidate">{{
            t('editor.taskList.cancelAI')
          }}</Button>
          <template v-if="suggestion"
            ><h3>{{ t('editor.taskList.goal') }}</h3>
            <p data-testid="task-ai-goal">{{ suggestion.goal }}</p>
            <h3>{{ t('editor.taskList.criteria') }}</h3>
            <p data-testid="task-ai-criteria">{{ suggestion.acceptanceCriteria }}</p>
            <Button data-testid="task-ai-keep" @click="invalidate">{{
              t('editor.taskList.keep')
            }}</Button
            ><Button data-testid="task-ai-adopt" @click="adopt">{{
              t('editor.taskList.adopt')
            }}</Button></template
          >
        </section>
      </div>
      <template #footer
        ><div class="task-list__edit-actions">
          <Button
            variant="ai"
            data-testid="task-ai-optimize"
            :disabled="pending || !isTaskDetailFields(draft)"
            @click="optimize"
            ><span aria-hidden="true">✧</span>{{ t('editor.taskList.ai') }}</Button
          >
          <Button data-testid="task-edit-cancel" @click="requestExit">{{
            t('editor.taskList.cancel')
          }}</Button>
          <Button variant="success" data-testid="task-edit-save" @click="save">{{
            t('editor.taskList.' + (creating ? 'createSave' : 'save'))
          }}</Button>
        </div></template
      >
    </Dialog>
    <ConfirmBox
      v-if="confirming"
      :title="t('editor.taskList.discardTitle')"
      :impact="[t('editor.taskList.discardImpact')]"
      :confirm-label="t('editor.taskList.discard')"
      :cancel-label="t('editor.taskList.continue')"
      danger
      @confirm="exitEdit"
      @cancel="confirming = false"
    />
  </section>
</template>
<style scoped>
.task-list__edit-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}
.task-list__edit-actions > * {
  flex: 1;
  min-width: 0;
  padding-inline: 8px;
}
.task-list {
  padding: 24px;
  min-width: 0;
}
h1,
h2,
h3,
p {
  margin: 0;
  overflow-wrap: anywhere;
}
h1 {
  font-size: 28px;
}
h2 {
  font-size: 16px;
}
h3 {
  font-size: 14px;
}
p {
  color: var(--text-muted);
  margin-top: 8px;
  white-space: pre-wrap;
}
.task-list__filters {
  display: flex;
  align-items: end;
  gap: 16px;
  margin-top: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 8px;
  flex: 1;
  min-width: 140px;
}
.task-list__results {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 0;
}
.task-list__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.task-list__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 65px 100px;
  gap: 20px;
  padding: 12px 0;
  color: var(--text-muted);
  background: var(--surface);
  font-size: 12px;
}
li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 65px auto;
  gap: 20px;
  align-items: center;
  padding: 22px 0;
  border-top: 1px solid var(--border);
}
.task-list__detail {
  display: grid;
  gap: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .task-list__columns {
    display: none;
  }
  .task-list {
    padding: 12px;
  }
  li {
    grid-template-columns: 1fr auto;
    gap: 14px;
  }
  li > div {
    grid-column: 1 / -1;
  }
}
</style>
