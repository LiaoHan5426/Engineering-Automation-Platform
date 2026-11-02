<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button, Checkbox, Feedback, FileInput, Input, Textarea } from '@eap/ui'
import {
  runtimeApi,
  type SkillImportInput,
  type SkillSnapshot,
  type SkillSummary,
  type SkillSaveRequest,
} from '@eap/runtime-client'
import { useMockServices } from '../../lib/serviceConfig'
import { mockSkillText } from '../../lib/skillFixture'
withDefaults(defineProps<{ mock?: boolean }>(), { mock: useMockServices })
const { t } = useI18n()
const items = ref<SkillSummary[]>([]),
  editing = ref(false),
  busy = ref(false),
  error = ref('')
const draft = ref<SkillImportInput>({
  rawSkillMd: '',
  version: '1.0.0',
  sourceLabel: '',
  resources: [],
  requiredCapabilities: [],
})
const capabilities = ref(''),
  confirmed = ref(false),
  preview = ref<SkillSnapshot>(),
  detail = ref<SkillSnapshot>()
const pending = ref<SkillSaveRequest>()
let pendingJournal: string | undefined
const pendingKey = 'eap.skill.pending.v1:' + (import.meta.env.VITE_API_URL ?? 'local')
try {
  const saved = sessionStorage.getItem(pendingKey)
  if (saved) {
    pending.value = JSON.parse(saved)
    pendingJournal = saved
    draft.value = JSON.parse(JSON.stringify(pending.value!.input))
    capabilities.value = draft.value.requiredCapabilities.join('\n')
  }
} catch {
  error.value = t('skill.failure')
}
let ticket = 0,
  previewTicket = 0,
  detailTicket = 0,
  scope = 0
let writeFlight: symbol | undefined
function leave() {
  ++scope
  editing.value = false
  ++previewTicket
  ++detailTicket
  ++ticket
  preview.value = undefined
  confirmed.value = false
  // Deactivation does not settle a write or make an overlapping retry safe.
  busy.value = !!writeFlight
}
async function read(item: SkillSummary) {
  const current = ++detailTicket
  error.value = ''
  detail.value = undefined
  try {
    const result = await runtimeApi.skill(item.id, item.version)
    if (current === detailTicket) detail.value = result
  } catch (e) {
    if (current === detailTicket) failure(e)
  }
}
watch(
  draft,
  () => {
    preview.value = undefined
    confirmed.value = false
  },
  { deep: true, flush: 'sync' },
)
watch(capabilities, (value) => {
  draft.value.requiredCapabilities = value
    .split('\n')
    .map((id) => id.trim())
    .filter(Boolean)
})
function failure(e: unknown) {
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
  error.value = detail || t('skill.failure')
}
async function refresh() {
  const current = ++ticket
  try {
    const result = await runtimeApi.skills()
    if (current === ticket) items.value = result.items
  } catch (e) {
    if (current === ticket) failure(e)
  }
}
function withinLimits(input: SkillImportInput) {
  return (
    input.rawSkillMd.length <= 16000 &&
    input.resources.length <= 4 &&
    input.resources.every((resource) => resource.content.length <= 16000) &&
    input.rawSkillMd.length + input.resources.reduce((n, r) => n + r.content.length, 0) <= 24000
  )
}
async function upload(event: Event, resources: boolean) {
  const field = event.target as HTMLInputElement
  const files = Array.from(field.files ?? [])
  field.value = ''
  if (busy.value || pending.value || !files.length) return
  if (
    (!resources && files.length !== 1) ||
    (resources && draft.value.resources.length + files.length > 4)
  ) {
    error.value = t('skill.uploadError')
    return
  }
  const current = ++previewTicket
  busy.value = true
  error.value = ''
  try {
    if (
      files.some(
        (file) =>
          file.size > 96000 ||
          !(resources ? /^[^\\/:]+\.(md|txt)$/i : /^[^\\/:]+\.md$/i).test(file.name) ||
          file.name.includes('..'),
      )
    )
      throw new Error('type')
    const values = await Promise.all(
      files.map(async (file) => ({
        path: file.name,
        mediaType: file.name.toLowerCase().endsWith('.md')
          ? ('text/markdown' as const)
          : ('text/plain' as const),
        content: await file.text(),
      })),
    )
    if (current !== previewTicket) return
    const next = {
      ...draft.value,
      resources: resources ? [...draft.value.resources, ...values] : draft.value.resources,
      rawSkillMd: resources ? draft.value.rawSkillMd : values[0]!.content,
    }
    if (
      !withinLimits(next) ||
      new Set(next.resources.map((r) => r.path.toLowerCase())).size !== next.resources.length
    )
      throw new Error('limit')
    draft.value = next
  } catch {
    if (current === previewTicket) error.value = t('skill.uploadError')
  } finally {
    if (current === previewTicket) busy.value = false
  }
}
async function validate() {
  if (!withinLimits(draft.value)) {
    error.value = t('skill.uploadError')
    return
  }
  const current = ++previewTicket
  preview.value = undefined
  confirmed.value = false
  busy.value = true
  error.value = ''
  try {
    const result = await runtimeApi.previewSkill(JSON.parse(JSON.stringify(draft.value)))
    if (current === previewTicket) preview.value = result
  } catch (e) {
    if (current === previewTicket) failure(e)
  } finally {
    if (current === previewTicket) busy.value = false
  }
}
async function save() {
  if (!preview.value || !confirmed.value || busy.value) return
  const request: SkillSaveRequest = {
    input: JSON.parse(JSON.stringify(draft.value)),
    expectedDigest: preview.value.digest,
    confirmed: true,
  }
  try {
    const journal = JSON.stringify({ ...request, journalId: crypto.randomUUID() })
    sessionStorage.setItem(pendingKey, journal)
    pendingJournal = journal
    pending.value = request
  } catch (e) {
    failure(e)
    return
  }
  await retrySave()
}
async function retrySave() {
  if (!pending.value || busy.value || writeFlight) return
  const entry = pending.value
  const journal = pendingJournal
  // Journal identity is local metadata, never part of the API request.
  const request: SkillSaveRequest = JSON.parse(
    JSON.stringify({
      input: entry.input,
      expectedDigest: entry.expectedDigest,
      confirmed: entry.confirmed,
    }),
  )
  const flight = (writeFlight = Symbol())
  const currentScope = scope
  const current = () => {
    if (writeFlight !== flight || scope !== currentScope || pending.value !== entry) return false
    try {
      return pendingJournal === journal && sessionStorage.getItem(pendingKey) === journal
    } catch {
      return false
    }
  }
  busy.value = true
  error.value = ''
  let accepted = false
  try {
    const result = await runtimeApi.saveSkill(request)
    if (!current()) return
    accepted = true
    const stored = await runtimeApi.skill(result.id, result.version)
    if (!current()) return
    if (stored.digest !== request.expectedDigest || !stored.trust) throw new Error('digest')
    sessionStorage.removeItem(pendingKey)
    pending.value = undefined
    editing.value = false
    await refresh()
  } catch (e) {
    if (!current()) return
    failure(e)
    const status = (e as { response?: { status?: number } })?.response?.status
    if (!accepted && status && status >= 400 && status < 500) {
      sessionStorage.removeItem(pendingKey)
      pending.value = undefined
      confirmed.value = false
      preview.value = undefined
    }
  } finally {
    if (writeFlight === flight) {
      writeFlight = undefined
      busy.value = false
    }
  }
}
async function activate(item: SkillSummary) {
  if (busy.value || writeFlight) return
  const flight = (writeFlight = Symbol())
  const currentScope = scope
  const current = () => writeFlight === flight && scope === currentScope
  busy.value = true
  error.value = ''
  try {
    const result = await runtimeApi.activateSkill(item.id, item.version, {
      enabled: !item.enabled,
      stateRevision: item.stateRevision,
    })
    if (!current()) return
    const stored = await runtimeApi.skill(item.id, item.version)
    if (!current()) return
    if (stored.enabled !== result.enabled || stored.stateRevision !== result.stateRevision)
      throw new Error('state')
    await refresh()
  } catch (e) {
    if (current()) failure(e)
  } finally {
    if (writeFlight === flight) {
      writeFlight = undefined
      busy.value = false
    }
  }
}
onMounted(refresh)
onBeforeUnmount(leave)
onDeactivated(leave)
</script>
<template>
  <section class="skill-manager">
    <h2>{{ t('skill.title') }}</h2>
    <p>{{ t('skill.hint') }}</p>
    <Feedback v-if="mock">{{ t('skill.mock') }}</Feedback>
    <Feedback v-if="error" tone="error" data-testid="skill-error">{{ error }}</Feedback>
    <Feedback v-if="pending" tone="warning" data-testid="skill-pending"
      >{{ t('skill.pending')
      }}<Button data-testid="skill-retry" :disabled="busy" @click="retrySave">{{
        t('skill.retry')
      }}</Button></Feedback
    >
    <template v-if="!editing">
      <Button data-testid="skill-import" @click="editing = true">{{ t('skill.import') }}</Button>
      <Button :disabled="busy" @click="refresh">{{ t('skill.refresh') }}</Button>
      <p v-if="!items.length">{{ t('skill.empty') }}</p>
      <article v-for="item in items" :key="item.id + item.version">
        <h3>{{ item.id }} · {{ item.version }}</h3>
        <p>{{ item.description }}</p>
        <p>
          {{ item.sourceLabel }} · {{ t(item.enabled ? 'skill.enabled' : 'skill.disabled') }} · r{{
            item.stateRevision
          }}
        </p>
        <code>{{ item.digest }}</code>
        <Button
          :data-testid="'skill-activate-' + item.id + '-' + item.version"
          :disabled="busy"
          @click="activate(item)"
          >{{ t(item.enabled ? 'skill.disable' : 'skill.enable') }}</Button
        >
        <Button
          :data-testid="'skill-detail-' + item.id + '-' + item.version"
          :disabled="busy"
          @click="read(item)"
          >{{ t('skill.detail') }}</Button
        >
      </article>
      <section v-if="detail" data-testid="skill-detail-result">
        <h3>{{ detail.id }} · {{ detail.version }}</h3>
        <pre>{{ detail.rawSkillMd }}</pre>
        <div v-for="resource in detail.resources" :key="resource.path">
          <strong>{{ resource.path }}</strong>
          <pre>{{ resource.content }}</pre>
        </div>
        <p>{{ t('skill.trust') }}: {{ detail.trust }}</p>
        <p>{{ t('skill.dependencies') }}: {{ detail.dependencies }}</p>
      </section>
    </template>
    <section v-else data-testid="skill-import-form">
      <p>{{ t('skill.subset') }}</p>
      <p>{{ t('skill.limits') }}</p>
      <p>{{ t('skill.boundary') }}</p>
      <Button
        v-if="mock"
        data-testid="skill-fixture"
        :disabled="busy || !!pending"
        @click="draft.rawSkillMd = mockSkillText"
        >{{ t('skill.fixture') }}</Button
      >
      <label
        >{{ t('skill.raw')
        }}<Textarea
          v-model="draft.rawSkillMd"
          data-testid="skill-raw"
          rows="10"
          :disabled="busy || !!pending"
      /></label>
      <FileInput
        data-testid="skill-file"
        accept=".md"
        :aria-label="t('skill.raw')"
        :disabled="busy || !!pending"
        @change="upload($event, false)"
      />
      <label
        >{{ t('skill.resources')
        }}<FileInput
          data-testid="skill-resources"
          multiple
          accept=".md,.txt"
          :disabled="busy || !!pending"
          @change="upload($event, true)"
      /></label>
      <div v-for="resource in draft.resources" :key="resource.path">
        <code>{{ resource.path }}</code>
        <pre>{{ resource.content }}</pre>
        <Button
          :disabled="busy || !!pending"
          @click="draft.resources = draft.resources.filter((r) => r.path !== resource.path)"
          >{{ t('skill.remove') }}</Button
        >
      </div>
      <label
        >{{ t('skill.version')
        }}<Input v-model="draft.version" data-testid="skill-version" :disabled="busy || !!pending"
      /></label>
      <label
        >{{ t('skill.source')
        }}<Input
          v-model="draft.sourceLabel"
          data-testid="skill-source"
          :disabled="busy || !!pending"
      /></label>
      <label
        >{{ t('skill.capabilities')
        }}<Textarea v-model="capabilities" :disabled="busy || !!pending"
      /></label>
      <Button data-testid="skill-preview" :disabled="busy || !!pending" @click="validate">{{
        t('skill.preview')
      }}</Button>
      <section v-if="preview" data-testid="skill-preview-result">
        <h3>{{ preview.id }} · {{ preview.version }}</h3>
        <p>{{ preview.description }}</p>
        <code>{{ preview.digest }}</code>
        <pre>{{ preview.instructions }}</pre>
        <p>{{ t('skill.dependencies') }}: {{ preview.dependencies }}</p>
      </section>
      <label
        ><Checkbox v-model="confirmed" data-testid="skill-confirm" :disabled="!preview || busy" />{{
          t('skill.confirm')
        }}</label
      >
      <Button
        data-testid="skill-save"
        :disabled="!preview || !confirmed || busy || !!pending"
        @click="save"
        >{{ t('skill.save') }}</Button
      >
      <Button data-testid="skill-cancel" :disabled="busy && !!pending" @click="leave">{{
        t('skill.cancel')
      }}</Button>
    </section>
  </section>
</template>
<style scoped>
.skill-manager,
label {
  display: grid;
  gap: 12px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
article {
  display: grid;
  gap: 8px;
  margin-block: 16px;
}
</style>
