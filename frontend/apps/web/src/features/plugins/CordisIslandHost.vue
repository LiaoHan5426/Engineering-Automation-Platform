<script setup lang="ts">
/**
 * Vue shell sync island for Cordis Client contributions.
 * Right-column geometry is `#eap-cordis-sidebar-right` in App body;
 * guide/tabs are rendered by ui-sidebar-right seat — not here.
 * Enable/disable stays on py-backend. No EAP profile.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPluginIsland, type IslandHost } from '@eap/plugin-runtime'
import { runtimeApi } from '@eap/runtime-client'

const props = defineProps<{ refreshToken?: number }>()
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const error = ref('')
const mountedNames = ref<string[]>([])
let island: IslandHost | null = null

async function syncFromServer() {
  status.value = 'loading'
  error.value = ''
  try {
    if (!island) island = createPluginIsland()
    const contrib = await runtimeApi.plugins.contributions()
    await island.sync(contrib.uiClients)
    mountedNames.value = island.mounted()
    status.value = 'ready'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'ISLAND_SYNC_FAILED'
    status.value = 'error'
  }
}

onMounted(() => {
  void syncFromServer()
})

watch(
  () => props.refreshToken,
  () => {
    void syncFromServer()
  },
)

onBeforeUnmount(() => {
  island?.dispose()
  island = null
})

defineExpose({ syncFromServer, mountedNames })
</script>

<template>
  <div
    class="cordis-island-host"
    data-testid="cordis-island-host"
    :data-status="status"
    :data-mounted="mountedNames.join(',')"
    aria-hidden="true"
  >
    <span v-if="error" data-testid="cordis-island-error">{{ error }}</span>
  </div>
</template>

<style scoped>
.cordis-island-host {
  display: none;
}
</style>
