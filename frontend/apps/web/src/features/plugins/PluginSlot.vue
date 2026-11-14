<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import BuilderWorkspace from './BuilderWorkspace.vue'
import DshContextMenu from './DshContextMenu.vue'
import type { PluginHost } from './host'
import type { BuilderInstanceId } from './model'

const props = defineProps<{ viewId: string; host: PluginHost; chatView: Component }>()
const { t } = useI18n()
const emit = defineEmits<{ navigate: [view: 'capabilities'] }>()
const builders = new Map<string, { guardLeave: () => boolean }>()
function bindBuilder(id: string, value: unknown) {
  if (value) builders.set(id, value as { guardLeave: () => boolean })
  else builders.delete(id)
}
const chat = ref<{ guardLeave?: (onDiscard?: () => void) => boolean } | null>(null)
function bindChat(value: unknown) {
  chat.value = value as typeof chat.value
}
defineExpose({
  guardLeave: (id: string, onDiscard?: () => void) =>
    id === 'chat'
      ? (chat.value?.guardLeave?.(onDiscard) ?? true)
      : (builders.get(id)?.guardLeave() ?? true),
})
const visited = reactive(new Set<string>())
const workspaceIds = ['chat', 'builder-alpha', 'builder-beta'] as const
watch(
  () => props.viewId,
  (id) => {
    if (workspaceIds.some((value) => value === id)) visited.add(id)
  },
  { immediate: true },
)
const cachedViews = computed(() =>
  workspaceIds.filter(
    (id) =>
      visited.has(id) &&
      (id === 'chat'
        ? props.host.installation.value.enabled.chat
        : props.host.builderContributionVisible.value),
  ),
)

const instanceId = computed((): BuilderInstanceId | '' => {
  if (props.viewId === 'builder-alpha') return 'alpha'
  if (props.viewId === 'builder-beta') return 'beta'
  return ''
})
const enabled = computed(() =>
  props.viewId === 'chat'
    ? props.host.installation.value.enabled.chat
    : props.host.builderContributionVisible.value,
)
</script>

<template>
  <DshContextMenu :active="viewId === 'chat' && host.installation.value.enabled.chat" />
  <template v-for="id in cachedViews" :key="id">
    <component
      :is="chatView"
      :ref="bindChat"
      v-if="id === 'chat'"
      v-show="viewId === id"
      :inert="viewId !== id"
      :aria-hidden="viewId !== id"
      :active="viewId === id"
      @navigate="emit('navigate', $event)"
    />
    <BuilderWorkspace
      v-else
      :ref="(value) => bindBuilder(id, value)"
      v-show="viewId === id"
      :inert="viewId !== id"
      :aria-hidden="viewId !== id"
      :instance-id="id === 'builder-alpha' ? 'alpha' : 'beta'"
      :active="viewId === id"
      :host="host"
    />
  </template>
  <section
    v-if="(viewId === 'chat' || instanceId) && !enabled"
    class="view"
    data-testid="plugin-disabled"
  >
    <div class="page-head">
      <h1>{{ t('plugin.hiddenTitle') }}</h1>
      <p>{{ t('plugin.hiddenBody') }}</p>
    </div>
  </section>
</template>
