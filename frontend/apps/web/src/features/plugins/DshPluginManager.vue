<script setup lang="ts">
/**
 * Server-authoritative DSH plugin install/enable bar.
 * Does not execute Host/Agent logic — all mutations go to py-backend via runtimeApi.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Button, Input, Feedback } from '@eap/ui'
import { runtimeApi, type PluginInstallItem } from '@eap/runtime-client'

const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const items = ref<PluginInstallItem[]>([])
const sourcePath = ref('')
const busy = ref(false)
const error = ref('')

async function refresh() {
  const listed = await runtimeApi.plugins.list()
  items.value = listed.items
}

async function install() {
  if (!sourcePath.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    await runtimeApi.plugins.install(sourcePath.value.trim())
    sourcePath.value = ''
    await refresh()
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PLUGIN_INSTALL_FAILED'
  } finally {
    busy.value = false
  }
}

async function toggle(item: PluginInstallItem) {
  busy.value = true
  error.value = ''
  try {
    if (item.enabled) await runtimeApi.plugins.disable(item.name)
    else await runtimeApi.plugins.enable(item.name)
    await refresh()
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PLUGIN_TOGGLE_FAILED'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refresh().catch((err) => {
    error.value = err instanceof Error ? err.message : 'PLUGIN_LIST_FAILED'
  })
})

defineExpose({ refresh })
</script>

<template>
  <section class="dsh-plugins" data-testid="dsh-plugin-manager">
    <div class="page-head">
      <h2>{{ t('plugin.dshTitle') }}</h2>
      <p>{{ t('plugin.dshHint') }}</p>
    </div>
    <div class="dsh-plugins__install">
      <Input
        v-model="sourcePath"
        data-testid="dsh-plugin-source"
        :placeholder="t('plugin.dshSourcePlaceholder')"
        :disabled="busy"
      />
      <Button
        variant="primary"
        size="sm"
        data-testid="dsh-plugin-install"
        :disabled="busy || !sourcePath.trim()"
        @click="install"
      >
        {{ t('plugin.dshInstall') }}
      </Button>
    </div>
    <Feedback v-if="error" tone="error" data-testid="dsh-plugin-error">{{ error }}</Feedback>
    <ul class="dsh-plugins__list">
      <li
        v-for="item in items"
        :key="item.name"
        :data-testid="`dsh-plugin-${item.name}`"
        class="dsh-plugins__item"
      >
        <div>
          <strong>{{ item.name }}</strong>
          <span class="hint">{{ item.version }}</span>
          <Badge
            :tone="item.enabled ? 'success' : 'neutral'"
            :label="item.enabled ? t('plugin.enabled') : t('plugin.disabled')"
          />
          <p v-if="item.description" class="hint">{{ item.description }}</p>
          <p class="hint" data-testid="dsh-plugin-control-plane">
            controlPlane={{ item.controlPlane }}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          :data-testid="`dsh-plugin-toggle-${item.name}`"
          :disabled="busy || item.broken"
          @click="toggle(item)"
        >
          {{ item.enabled ? t('plugin.disable') : t('plugin.enable') }}
        </Button>
      </li>
    </ul>
    <p v-if="items.length === 0" class="hint" data-testid="dsh-plugin-empty">
      {{ t('plugin.dshEmpty') }}
    </p>
  </section>
</template>

<style scoped>
.dsh-plugins {
  margin-block: 1.5rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--eap-border, #ddd);
}
.dsh-plugins__install {
  display: flex;
  gap: 0.5rem;
  margin-block: 0.75rem;
  align-items: center;
}
.dsh-plugins__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.dsh-plugins__item {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.hint {
  color: var(--eap-muted, #666);
  font-size: 0.85rem;
  margin-inline-start: 0.5rem;
}
</style>
