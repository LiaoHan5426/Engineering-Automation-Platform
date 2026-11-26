<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeApi, type BoardTask } from '@eap/runtime-client'
import { Button, Feedback } from '@eap/ui'
import { localProjectState } from './localProjects'
import { boardTaskLocation } from './boardLocation'

const props = defineProps<{ boardEnabled: boolean }>()
const { t } = useI18n()
const refresh = ref(0)
const usage = ref<Awaited<ReturnType<typeof runtimeApi.stats>> | null>(null)
const usageState = ref<'loading' | 'ready' | 'error'>('loading')
const tasks = ref<BoardTask[]>([])
const failedProjects = ref<string[]>([])
const loadingTasks = ref(false)
const projects = computed(() => localProjectState.projects)
const titles = computed(() => new Map(projects.value.map(({ id, label }) => [id, label])))

watchEffect((onCleanup) => {
  void refresh.value
  let current = true
  onCleanup(() => { current = false })
  usageState.value = 'loading'
  void runtimeApi.stats().then(
    (result) => {
      if (!current) return
      usage.value = result
      usageState.value = 'ready'
    },
    () => { if (current) usageState.value = 'error' },
  )
})

watchEffect((onCleanup) => {
  void refresh.value
  tasks.value = []
  failedProjects.value = []
  const ids = projects.value.map(({ id }) => id)
  const shouldLoad = props.boardEnabled && ids.length > 0
  loadingTasks.value = shouldLoad
  if (!shouldLoad) return
  let current = true
  onCleanup(() => { current = false })
  void Promise.allSettled(ids.map((id) => runtimeApi.boardTasks(id))).then((results) => {
    if (!current) return
    tasks.value = results.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? result.value.items.filter((task) => task.projectId === ids[index] && task.column !== 'done')
        : [],
    )
    failedProjects.value = ids.filter((_, index) => results[index]?.status === 'rejected')
    loadingTasks.value = false
  })
})
</script>

<template>
  <section class="view" aria-labelledby="workspace-overview-title">
    <div class="page-head">
      <h1 id="workspace-overview-title">{{ t('workspaceOverview.title') }}</h1>
      <Button variant="secondary" type="button" @click="refresh++">
        {{ t('workspaceOverview.refresh') }}
      </Button>
    </div>

    <section class="overview-section" aria-labelledby="workspace-usage-title">
      <h2 id="workspace-usage-title">{{ t('workspaceOverview.usage') }}</h2>
      <p v-if="usageState === 'loading'" role="status">{{ t('workspaceOverview.loading') }}</p>
      <Feedback v-else-if="usageState === 'error'" tone="error" role="alert">
        {{ t('workspaceOverview.statsError') }}
      </Feedback>
      <dl v-else-if="usage" class="overview-metrics">
        <template v-if="usage.chat">
          <div><dt>{{ t('workspaceOverview.newConversations') }}</dt><dd>{{ usage.chat.newConversations }}</dd></div>
          <div><dt>{{ t('workspaceOverview.sentMessages') }}</dt><dd>{{ usage.chat.sentMessages }}</dd></div>
        </template>
        <template v-else>
          <div><dt>{{ t('workspaceOverview.records') }}</dt><dd>{{ usage.tasksInWindow }}</dd></div>
          <div><dt>{{ t('workspaceOverview.modelRuns') }}</dt><dd>{{ usage.model.recordedRuns }}</dd></div>
          <div><dt>{{ t('workspaceOverview.calls') }}</dt><dd>{{ usage.model.calls }}</dd></div>
        </template>
      </dl>
    </section>

    <section class="overview-section" aria-labelledby="workspace-todos-title">
      <h2 id="workspace-todos-title">{{ t('workspaceOverview.todos') }}</h2>
      <p v-if="!boardEnabled">{{ t('workspaceOverview.boardDisabled') }}</p>
      <p v-else-if="loadingTasks" role="status">{{ t('workspaceOverview.loading') }}</p>
      <template v-else>
        <p v-if="!projects.length">{{ t('workspaceOverview.noProjects') }}</p>
        <Feedback v-if="failedProjects.length" tone="error" role="alert">
          {{ t('workspaceOverview.tasksError') }}
          {{ failedProjects.map((id) => titles.get(id)).join(' · ') }}
        </Feedback>
        <p v-if="projects.length && !tasks.length && !failedProjects.length">
          {{ t('workspaceOverview.noTasks') }}
        </p>
        <ul v-if="tasks.length" class="overview-tasks">
          <li v-for="task in tasks" :key="task.projectId + ':' + task.id">
            <a :href="boardTaskLocation({ projectId: task.projectId, taskId: task.id })">
              {{ task.title }}
            </a>
            <span>{{ titles.get(task.projectId) }}</span>
          </li>
        </ul>
      </template>
    </section>
  </section>
</template>

<style scoped>
.overview-section + .overview-section { margin-block-start: 1.5rem; }
.overview-metrics { display: flex; flex-wrap: wrap; gap: 0.75rem 2rem; }
.overview-metrics dd { margin: 0.25rem 0 0; font-size: 1.5em; }
.overview-tasks { padding: 0; list-style: none; }
.overview-tasks li { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; padding-block: 0.35rem; }
</style>
