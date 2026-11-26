<script setup lang="ts">
import { Button, Input, Popover } from '@eap/ui'
import { ref, shallowRef } from 'vue'
import type { AnalysisWorkbench } from './analysisWorkbench'

const props = defineProps<{ analysis: AnalysisWorkbench }>()
const { workspace, workspaceOptions } = props.analysis
const open = ref(false)
const anchor = shallowRef<HTMLElement | null>(null)
const adding = ref(false)
const newWorkspace = ref('')

function toggle(event: MouseEvent) {
  anchor.value = event.currentTarget as HTMLElement
  open.value = !open.value
}
function choose(id: string) {
  open.value = false
  props.analysis.switchWorkspace(id)
}
function add() {
  const name = newWorkspace.value.trim()
  if (!name) return
  adding.value = false
  newWorkspace.value = ''
  open.value = false
  props.analysis.addWorkspace(name)
}
</script>

<template>
  <div class="brand" aria-label="工程自动化平台"><b>EAP</b></div>
  <div class="menu-wrap">
    <Button size="sm" variant="ghost" class="ws" :aria-expanded="open" @click="toggle">
      工作空间 <b>{{ workspace }}</b><span class="caret">▾</span>
    </Button>
    <Popover
      v-if="open"
      class="menu"
      :anchor="anchor"
      label="工作空间（本机视图范围）"
      @close="open = false"
    >
      <div class="menu-head">工作空间（本机视图范围）</div>
      <Button
        size="sm"
        variant="secondary"
        v-for="option in workspaceOptions"
        :key="option"
        :active="option === workspace"
        @click="choose(option)"
      >
        {{ option }}
      </Button>
      <form v-if="adding" class="menu-form" @submit.prevent="add">
        <Input
          v-model="newWorkspace"
          aria-label="新工作空间名称"
          placeholder="例如 orders-service"
        />
        <Button variant="primary" type="submit" :disabled="!newWorkspace.trim()"> 添加 </Button>
      </form>
      <Button size="sm" variant="secondary" v-else class="menu-add" @click="adding = true">
        ＋ 新建本机工作空间…
      </Button>
      <p class="menu-note">
        任务在服务端不按工作空间分表。这里只是把控制台本机标注过的执行分组；能力目录、规则库与
        知识库是应用级配置，不随它变化。决定本地 CLI 在哪里执行的是运行时进程的执行目录。
      </p>
    </Popover>
  </div>
</template>
