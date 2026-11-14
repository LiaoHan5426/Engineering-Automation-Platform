<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Tabs } from '@eap/ui'
import {
  runtimeApi,
  type PrototypeDeliveryRecord,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { errorMessage } from '../../lib/presentation'
import PrototypeVersionContent from '../../components/PrototypeVersionContent.vue'
import PrototypeTaskDialog from '../shell/PrototypeTaskDialog.vue'
import { prototypeVersionDesign } from '../shell/prototypeVersionDesign'
import { scenarioWorkspaceState } from '../shell/scenarioWorkspaceState'
import type { PluginHost } from './host'
import type { BuilderInstanceId } from './model'

const GrapesEditorScaffold = defineAsyncComponent(() => import('../shell/GrapesEditorScaffold.vue'))

const props = withDefaults(
  defineProps<{ instanceId: BuilderInstanceId; host: PluginHost; active?: boolean }>(),
  { active: true },
)
const { t } = useI18n()
const surface = ref('design')
const taskDialog = ref(false)
const designer = ref<{ guardLeave: () => boolean; prepareDisable: () => boolean }>()
const unregister = props.host.registerBuilderInstance(
  `builder-${props.instanceId}`,
  () => designer.value?.prepareDisable() ?? false,
)
function guardLeave() {
  const accepted = designer.value?.guardLeave() ?? true
  if (!accepted) surface.value = 'design'
  return accepted
}
defineExpose({ guardLeave })
function backToScenes() {
  if (!guardLeave()) {
    surface.value = 'design'
    return
  }
  window.location.hash = 'scenes'
}
async function publishedVersion(id: string) {
  scenarioWorkspaceState.versionId = id
  await loadVersions()
  await openVersion(id)
  surface.value = 'versions'
}
const versions = ref<PrototypeVersionRecord[]>([])
const opened = ref<PrototypeVersionRecord | null>(null)
const designBlocked = computed(
  () => !!opened.value && prototypeVersionDesign(opened.value.body).blocked,
)
const delivery = ref<PrototypeDeliveryRecord | null>(null)
const deliveryBusy = ref(false)
const versionNote = ref('')
const versionListError = ref('')
let openRequest = 0
let deliveryRequest = 0
let listRequest = 0
async function loadVersions() {
  if (typeof window === 'undefined') return
  const request = ++listRequest
  try {
    const page = await runtimeApi.prototypeVersions(`builder-${props.instanceId}`)
    if (request !== listRequest) return
    versions.value = page.items
    versionListError.value = ''
  } catch (error) {
    if (request !== listRequest) return
    versionListError.value = errorMessage(error)
  }
}

async function openVersion(id: string) {
  taskDialog.value = false
  const request = ++openRequest
  versionNote.value = ''
  deliveryRequest += 1
  deliveryBusy.value = false
  try {
    const version = await runtimeApi.prototypeVersion(id)
    if (request !== openRequest) return
    opened.value = version
    delivery.value = null
  } catch (error) {
    if (request !== openRequest) return
    versionNote.value = errorMessage(error)
  }
}

function closeVersion() {
  versionNote.value = ''
  taskDialog.value = false
  openRequest += 1
  deliveryRequest += 1
  deliveryBusy.value = false
  opened.value = null
  delivery.value = null
}

function useVersionInChat() {
  if (!opened.value || designBlocked.value) return
  sessionStorage.setItem('eap.chat.prototype', opened.value.id)
  window.location.hash = 'chat'
}

async function createDelivery() {
  if (!opened.value || deliveryBusy.value || designBlocked.value) return
  const versionId = opened.value.id
  const request = ++deliveryRequest
  deliveryBusy.value = true
  versionNote.value = ''
  try {
    const sheet = await runtimeApi.createPrototypeDelivery(versionId)
    if (request !== deliveryRequest || opened.value?.id !== versionId) return
    delivery.value = sheet
  } catch (error) {
    if (request !== deliveryRequest || opened.value?.id !== versionId) return
    versionNote.value = errorMessage(error)
  } finally {
    if (request === deliveryRequest) deliveryBusy.value = false
  }
}

onMounted(() => {
  void loadVersions()
})

onUnmounted(() => {
  unregister()
  openRequest += 1
  deliveryRequest += 1
  listRequest += 1
})
</script>

<template>
  <section class="view work-page builder-workspace" :data-testid="`builder-${instanceId}`">
    <header class="builder-nav">
      <Button variant="link" data-testid="builder-back-scenes" @click="backToScenes">{{
        t('builder.backScenes')
      }}</Button
      ><strong>{{
        instanceId === 'alpha' ? t('plugin.builderAlpha') : t('plugin.builderBeta')
      }}</strong>
    </header>
    <Tabs
      v-model="surface"
      :label="t('builder.surfaces')"
      :tabs="[
        { id: 'design', label: t('builder.design'), testId: 'builder-tab-design' },
        { id: 'versions', label: t('builder.versions'), testId: 'builder-tab-versions' },
      ]"
    />
    <section
      v-show="surface === 'design'"
      :inert="surface !== 'design'"
      class="builder-design-surface"
      data-testid="builder-design-panel"
      :aria-label="t('builder.design')"
    >
      <GrapesEditorScaffold
        ref="designer"
        :source-ref="`builder-${instanceId}`"
        :active="props.active && surface === 'design'"
        @published="publishedVersion"
      />
    </section>
    <section
      v-show="surface === 'versions'"
      :inert="surface !== 'versions'"
      class="stack version-panel"
      data-testid="prototype-version"
      :aria-label="t('builder.versions')"
    >
      <div class="section-heading">
        <h2>{{ t('workUi.versionsTitle') }}</h2>
        <span>{{ t('workUi.versionStep') }}</span>
      </div>
      <Button size="sm" @click="loadVersions">{{ t('desktop.refreshVersions') }}</Button>
      <p v-if="!versions.length && !versionListError" class="hint">{{ t('desktop.noVersions') }}</p>
      <p v-if="versionNote" class="hint" data-testid="version-note">{{ versionNote }}</p>
      <p v-if="versionListError" class="hint" data-testid="version-list-error">
        {{ versionListError }}
      </p>
      <ul v-if="versions.length" class="version-list">
        <li v-for="item in versions" :key="item.id">
          <div class="version-label">
            <strong>{{ item.title }}</strong
            ><small>{{ item.sourceRef }} · {{ item.id.slice(0, 8) }}</small>
          </div>
          <Button
            variant="secondary"
            type="button"
            data-testid="open-version"
            @click="openVersion(item.id)"
          >
            {{ t('plugin.versionOpen') }}
          </Button>
        </li>
      </ul>
      <div v-if="opened" data-testid="version-preview">
        <p class="eyebrow">{{ t('plugin.versionPreview') }}</p>
        <PrototypeVersionContent v-if="surface === 'versions' && props.active" :version="opened" />
        <ul>
          <li v-for="item in opened.acceptance" :key="item">{{ item }}</li>
        </ul>
        <p data-testid="version-hash">
          {{ t('plugin.versionHash', { hash: opened.contentHash }) }}
        </p>
        <div class="version-actions">
          <Button
            :disabled="designBlocked"
            data-testid="prototype-create-task"
            @click="taskDialog = true"
            >{{ t('builder.task.title') }}</Button
          >
          <Button
            type="button"
            variant="primary"
            data-testid="prototype-to-code"
            :disabled="designBlocked"
            @click="useVersionInChat"
            >{{ t('task.useInChat') }}</Button
          >
          <Button
            variant="secondary"
            type="button"
            data-testid="close-version"
            @click="closeVersion"
          >
            {{ t('plugin.versionClose') }}
          </Button>
          <Button
            variant="secondary"
            type="button"
            data-testid="create-delivery"
            :disabled="deliveryBusy || designBlocked"
            @click="createDelivery"
          >
            {{ t('plugin.deliveryCreate') }}
          </Button>
        </div>
        <p v-if="delivery" data-testid="delivery-sheet">
          {{ t('plugin.deliverySheet', { id: delivery.id, versionId: delivery.versionId }) }}
        </p>
      </div>
      <PrototypeTaskDialog
        v-if="taskDialog && opened"
        :key="opened.id"
        :version="opened"
        @close="taskDialog = false"
      />
    </section>
  </section>
</template>

<style scoped>
.builder-workspace {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow: auto;
}

.builder-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding: 8px 16px 0;
}

.builder-design-surface {
  flex: 1;
  min-height: 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
