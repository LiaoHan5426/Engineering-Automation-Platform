<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { runtimeApi, type BoardTask } from '@eap/runtime-client'
import { localProjectState } from '../../web/src/features/shell/localProjects'

const props = defineProps<{ projectId?: string; taskId?: string }>()
const project = ref(props.projectId ?? localProjectState.selectedProjectId ?? 'local-eap')
const projects = computed(() => [
  { id: project.value, label: project.value },
  ...localProjectState.projects.filter(({ id }) => id !== project.value),
])
const tasks = ref<BoardTask[]>([])
const task = ref<BoardTask>()
const busy = ref(false)
const loading = ref(false)
let pendingCreate: { key: string; id: string } | undefined
const error = ref('')
const title = ref('')
const fields = reactive({
  goal: '',
  acceptanceCriteria: '',
  notes: '',
  priority: 'none' as BoardTask['priority'],
})
const columns = [
  { id: 'planned', label: '待规划' },
  { id: 'ready', label: '就绪' },
  { id: 'running', label: '执行中' },
  { id: 'acceptance', label: '待验收' },
  { id: 'done', label: '已完成' },
] as const

function select(value?: BoardTask) {
  task.value = value
  Object.assign(fields, {
    goal: value?.goal ?? '',
    acceptanceCriteria: value?.acceptanceCriteria ?? '',
    notes: value?.notes ?? '',
    priority: value?.priority ?? 'none',
  })
  error.value = ''
}

watch(
  project,
  (id, _, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    select()
    tasks.value = []
    loading.value = true
    const detail =
      props.taskId && id === props.projectId
        ? runtimeApi.boardTask(props.taskId, id)
        : Promise.resolve(undefined)
    void Promise.allSettled([runtimeApi.boardTasks(id), detail]).then(([list, selected]) => {
      if (!current) return
      loading.value = false
      if (list.status === 'fulfilled') tasks.value = list.value.items
      if (selected.status === 'fulfilled' && selected.value) {
        select(selected.value)
        if (!tasks.value.some((item) => item.id === selected.value?.id)) {
          tasks.value = [selected.value, ...tasks.value]
        }
      }
      if (list.status === 'rejected') error.value = '无法读取任务板'
      else if (selected.status === 'rejected') error.value = '无法读取链接中的任务'
    })
  },
  { immediate: true },
)

async function save(column?: BoardTask['column']) {
  if (busy.value || loading.value) return
  const current = task.value
  const projectId = project.value
  busy.value = true
  error.value = ''
  try {
    const key = JSON.stringify([projectId, title.value, fields.goal, fields.acceptanceCriteria])
    if (!current && pendingCreate?.key !== key) pendingCreate = { key, id: crypto.randomUUID() }
    const saved = current
      ? await runtimeApi.updateBoardTask(current.id, {
          projectId,
          revision: current.revision,
          ...fields,
          ...(column ? { column } : {}),
        })
      : await runtimeApi.createBoardTask({
          projectId,
          title: title.value,
          column: 'planned',
          sessionId: '',
          goal: fields.goal,
          acceptanceCriteria: fields.acceptanceCriteria,
          requestId: pendingCreate!.id,
        })
    tasks.value = current
      ? tasks.value.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...tasks.value]
    if (!current) pendingCreate = undefined
    title.value = ''
    select(saved)
  } catch {
    error.value = '保存失败。请检查任务准备项，或刷新后重试。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="eap-task-board" aria-labelledby="eap-task-board-title">
    <h1 id="eap-task-board-title">任务板</h1>
    <label
      >项目
      <select v-model="project" :disabled="busy || loading">
        <option v-for="item in projects" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select></label
    >
    <button type="button" :disabled="busy || loading" @click="select()">新建任务</button>
    <div class="eap-task-columns">
      <section v-for="column in columns" :key="column.id">
        <h2>{{ column.label }}</h2>
        <button
          v-for="item in tasks.filter((task) => task.column === column.id)"
          :key="item.id"
          type="button"
          :disabled="busy || loading"
          @click="select(item)"
        >
          {{ item.title }}
        </button>
      </section>
    </div>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || loading">
        <h2 v-if="task">{{ task.title }}</h2>
        <label v-else>任务标题 <input v-model="title" required maxlength="200" /></label>
        <label>目标 <textarea v-model="fields.goal" maxlength="4000"></textarea></label>
        <label
          >验收标准 <textarea v-model="fields.acceptanceCriteria" maxlength="4000"></textarea>
        </label>
        <template v-if="task">
          <label>备注 <textarea v-model="fields.notes" maxlength="4000"></textarea></label>
          <label
            >优先级
            <select v-model="fields.priority">
              <option v-for="priority in ['none', 'p0', 'p1', 'p2']" :key="priority">
                {{ priority }}
              </option>
            </select></label
          >
        </template>
        <p v-if="error" role="alert">{{ error }}</p>
        <button
          type="submit"
          :disabled="busy || loading || (!!task && !task.allowedColumns.length)"
        >
          {{ task ? '保存任务' : '创建任务' }}
        </button>
        <button
          v-if="task?.column === 'planned' && !task.executionActive"
          type="button"
          :disabled="busy || !fields.goal.trim() || !fields.acceptanceCriteria.trim()"
          @click="save('ready')"
        >
          移到就绪
        </button>
        <button
          v-if="task?.column === 'ready' && !task.executionActive"
          type="button"
          :disabled="busy || loading"
          @click="save('planned')"
        >
          移到待规划
        </button>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.eap-task-columns {
  display: grid;
  grid-template-columns: repeat(5, minmax(7rem, 1fr));
  gap: 0.75rem;
  overflow: auto;
}
.eap-task-columns section,
form {
  border: 1px solid currentColor;
  padding: 0.75rem;
  border-radius: 0.5rem;
}
.eap-task-columns button,
form label {
  display: block;
}
form {
  max-width: 42rem;
  margin-top: 1rem;
}
form :is(input, textarea, select) {
  display: block;
  margin-bottom: 0.5rem;
}
button {
  margin: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.35rem;
}
</style>
