<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Badge, Button } from '@eap/ui'
import type { PluginHost } from './host'
import { GRANTS, MANIFESTS, type PluginId } from './model'
import { PLUGIN_SERVICE_DEPENDENCIES } from './pluginRuntimeView'

defineProps<{ host: PluginHost }>()
const { t } = useI18n()
const mockPluginScenarios = import.meta.env.MODE === 'mock'

function name(id: PluginId): string {
  if (id === 'chat') return t('plugin.chat')
  if (id === 'board') return t('desktop.board')
  return t('plugin.builder')
}

function runtimeLabel(kind: string): string {
  if (kind === 'ready') return t('plugin.runtimeReady')
  if (kind === 'disabled') return t('plugin.disabled')
  if (kind === 'dependency_missing') return t('plugin.dependencyMissing')
  if (kind === 'activation_failed') return t('plugin.activationFailed')
  return kind
}

function runtimeTone(kind: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (kind === 'ready') return 'success'
  if (kind === 'disabled') return 'warning'
  if (kind === 'dependency_missing' || kind === 'activation_failed') return 'danger'
  return 'neutral'
}

function toggle(host: PluginHost, id: PluginId) {
  try {
    host.setEnabled(id, !host.installation.value.enabled[id])
  } catch {
    /* activation/dependency failures keep prior installation; UI reads host.runtimeOf */
  }
}
</script>

<template>
  <section class="view" data-testid="plugin-center">
    <div class="page-head">
      <p class="eyebrow">PLUGINS</p>
      <h1>{{ t('plugin.center') }}</h1>
      <p>{{ t('plugin.centerHint') }}</p>
    </div>
    <div class="plugin-toolbar">
      <Button
        variant="secondary"
        size="sm"
        data-testid="plugin-refresh"
        @click="host.refreshFromStore()"
      >
        {{ t('plugin.refresh') }}
      </Button>
      <template v-if="mockPluginScenarios">
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-dependency-missing"
          @click="host.setServiceAvailable('runtime.board-api', false)"
        >
          {{ t('plugin.mockDependencyMissing') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-dependency-restore"
          @click="host.setServiceAvailable('runtime.board-api', true)"
        >
          {{ t('plugin.mockDependencyRestore') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="plugin-mock-activation-fail"
          @click="host.armActivationFailure(t('plugin.mockActivationFailReason'))"
        >
          {{ t('plugin.mockActivationFail') }}
        </Button>
      </template>
    </div>
    <ul class="plugin-list">
      <li v-for="manifest in MANIFESTS" :key="manifest.id" :data-testid="`plugin-${manifest.id}`">
        <h2>
          {{ name(manifest.id) }} <span class="hint">{{ manifest.version }}</span>
        </h2>
        <span :data-testid="`plugin-runtime-${manifest.id}`">
          <Badge
            :tone="runtimeTone(host.runtimeOf(manifest.id).kind)"
            :label="runtimeLabel(host.runtimeOf(manifest.id).kind)"
          />
        </span>
        <p
          v-if="host.runtimeOf(manifest.id).kind === 'dependency_missing'"
          class="hint"
          data-testid="plugin-dependency-missing"
        >
          {{ t('plugin.dependencyMissingDetail', { deps: host.runtimeOf(manifest.id).message }) }}
        </p>
        <p
          v-if="host.runtimeOf(manifest.id).kind === 'activation_failed'"
          class="hint"
          data-testid="plugin-activation-failed"
        >
          {{ t('plugin.activationFailedDetail', { reason: host.runtimeOf(manifest.id).message }) }}
        </p>
        <p v-if="PLUGIN_SERVICE_DEPENDENCIES[manifest.id].length" class="hint">
          {{ t('plugin.dependencies') }}：{{
            PLUGIN_SERVICE_DEPENDENCIES[manifest.id].map((item) => item.label).join('、')
          }}
        </p>
        <p class="hint">
          {{ t('plugin.requests') }}：{{ manifest.requests.map((item) => item.id).join('、') }}
        </p>
        <p class="hint">
          {{ t('plugin.grants') }}：{{ GRANTS.length ? GRANTS.join('、') : t('plugin.noGrant') }}
        </p>
        <Button
          variant="secondary"
          :data-testid="`plugin-toggle-${manifest.id}`"
          @click="toggle(host, manifest.id)"
        >
          {{
            host.installation.value.enabled[manifest.id] ? t('plugin.disable') : t('plugin.enable')
          }}
        </Button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.plugin-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.plugin-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.plugin-list li {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 16px;
  border: 1px solid var(--eap-line, var(--border));
  border-radius: 12px;
}
</style>
