<script setup lang="ts">
/**
 * Server-authoritative DSH plugin install, update, and uninstall.
 * Mutations go to py-backend. The browser does not fetch the package.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge, Button, Input, Feedback, ConfirmBox } from '@eap/ui'
import { runtimeApi, type PluginInstallItem } from '@eap/runtime-client'

const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const items = ref<PluginInstallItem[]>([])
const spec = ref('')
const busy = ref(false)
const error = ref('')
const uninstallTarget = ref<PluginInstallItem | null>(null)

const uninstallImpact = computed(() => {
  const item = uninstallTarget.value
  if (!item) return []
  const lines = [t('plugin.dshUninstallImpact', { name: item.name, version: item.version })]
  if (item.installSpec) lines.push(t('plugin.dshUninstallSpec', { spec: item.installSpec }))
  return lines
})

async function refresh() {
  const listed = await runtimeApi.plugins.list()
  items.value = listed.items
}

async function install() {
  if (!spec.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    await runtimeApi.plugins.install(spec.value.trim())
    spec.value = ''
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

async function update(item: PluginInstallItem) {
  busy.value = true
  error.value = ''
  try {
    await runtimeApi.plugins.update(item.name)
    await refresh()
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PLUGIN_UPDATE_FAILED'
  } finally {
    busy.value = false
  }
}

async function confirmUninstall() {
  const item = uninstallTarget.value
  if (!item) return
  busy.value = true
  error.value = ''
  try {
    await runtimeApi.plugins.uninstall(item.name)
    uninstallTarget.value = null
    await refresh()
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'PLUGIN_UNINSTALL_FAILED'
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
  <section class="dsh-plugins" data-testid="dsh-plugin-manager" aria-labelledby="dsh-plugin-heading">
    <div class="page-head">
      <h2 id="dsh-plugin-heading">{{ t('plugin.dshTitle') }}</h2>
      <p>{{ t('plugin.dshHint') }}</p>
    </div>
    <form
      class="dsh-plugins__install"
      aria-labelledby="dsh-plugin-install-title"
      @submit.prevent="install"
    >
      <h3 id="dsh-plugin-install-title">{{ t('plugin.dshSpecLabel') }}</h3>
      <p id="dsh-plugin-spec-help" class="hint">{{ t('plugin.dshSpecHelp') }}</p>
      <div class="dsh-plugins__install-row">
        <Input
          id="dsh-plugin-spec"
          name="spec"
          v-model="spec"
          data-testid="dsh-plugin-source"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          enterkeyhint="done"
          required
          aria-describedby="dsh-plugin-spec-help"
          :placeholder="t('plugin.dshSourcePlaceholder')"
          :disabled="busy"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          data-testid="dsh-plugin-install"
          :disabled="busy || !spec.trim()"
        >
          {{ t('plugin.dshInstall') }}
        </Button>
      </div>
    </form>
    <Feedback v-if="error" tone="error" data-testid="dsh-plugin-error">{{ error }}</Feedback>
    <h3>{{ t('plugin.dshInstalled') }}</h3>
    <ul class="dsh-plugins__list">
      <li
        v-for="item in items"
        :key="item.name"
        :data-testid="`dsh-plugin-${item.name}`"
        class="dsh-plugins__item"
        data-control-plane="py-backend"
      >
        <div class="dsh-plugins__meta">
          <h4>
            {{ item.name }} <span class="hint">{{ item.version }}</span>
          </h4>
          <Badge
            :tone="item.enabled ? 'success' : 'neutral'"
            :label="item.enabled ? t('plugin.enabled') : t('plugin.disabled')"
          />
          <p v-if="item.description" class="hint">{{ item.description }}</p>
          <p v-if="item.installSpec" class="hint" data-testid="dsh-plugin-spec">
            {{ item.installSpec }}
          </p>
          <span class="visually-hidden" aria-hidden="true" data-testid="dsh-plugin-control-plane">py-backend</span>
        </div>
        <div class="dsh-plugins__actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            :data-testid="`dsh-plugin-toggle-${item.name}`"
            :disabled="busy || item.broken"
            @click="toggle(item)"
          >
            {{ item.enabled ? t('plugin.disable') : t('plugin.enable') }}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            :data-testid="`dsh-plugin-update-${item.name}`"
            :disabled="busy || item.broken || !item.installSpec"
            :title="item.installSpec ? item.installSpec : t('plugin.dshUpdateMissing')"
            @click="update(item)"
          >
            {{ t('plugin.dshUpdate') }}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            :data-testid="`dsh-plugin-uninstall-${item.name}`"
            :disabled="busy"
            @click="uninstallTarget = item"
          >
            {{ t('plugin.dshUninstall') }}
          </Button>
        </div>
      </li>
    </ul>
    <p v-if="items.length === 0" class="hint" data-testid="dsh-plugin-empty">
      {{ t('plugin.dshEmpty') }}
    </p>
    <ConfirmBox
      v-if="uninstallTarget"
      danger
      :busy="busy"
      :title="t('plugin.dshUninstallTitle', { name: uninstallTarget.name })"
      :confirm-label="t('plugin.dshUninstallConfirm')"
      :impact="uninstallImpact"
      @confirm="confirmUninstall"
      @cancel="uninstallTarget = null"
    />
  </section>
</template>

<style scoped>
.dsh-plugins {
  display: grid;
  gap: 12px;
  margin-block-end: 20px;
}

.dsh-plugins__install {
  display: grid;
  gap: 4px;
  margin: 0;
}

.dsh-plugins__install-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dsh-plugins__install-row :deep(input) {
  flex: 1 1 16rem;
  min-width: 0;
}

.dsh-plugins__list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.dsh-plugins__item {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  border: 1px solid var(--eap-line, var(--border));
  border-radius: 12px;
}

.dsh-plugins__meta,
.dsh-plugins__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.dsh-plugins__meta {
  flex-direction: column;
  align-items: flex-start;
}

.dsh-plugins__meta h4,
.dsh-plugins__install h3,
.dsh-plugins h3 {
  margin: 0;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--eap-muted);
  overflow-wrap: anywhere;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}
</style>
