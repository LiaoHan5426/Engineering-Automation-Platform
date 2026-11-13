<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import 'grapesjs/dist/css/grapes.min.css'
import PrototypeSchemaPreview from './PrototypeSchemaPreview.vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Feedback,
  Input,
  Select,
  Slider,
  EditorWorkbench,
  Tabs,
  Tree,
  EmptyState,
  Collapse,
  Checkbox,
  Textarea,
  type TreeNode,
} from '@eap/ui'
import {
  readEditorInspection,
  sameInspectionTarget,
  type EditorInspectionResult,
  type EditorInspectionTarget,
} from './editorInspection'
import { runtimeApi, type PrototypeVersionRecord } from '@eap/runtime-client'
import {
  PrototypeActionType,
  prototypeNodes,
  parsePrototypeTaskListItems,
} from '@eap/runtime-client/contracts'
import { interactivePrototypeBlock, taskListPrototypeBlock } from './prototypeBlocks'
import {
  clearPublicationIntent,
  readPublicationIntent,
  writePublicationIntent,
  type PublicationIntent,
} from './prototypePublication'
import {
  readDesignerRecovery,
  writeDesignerRecovery,
  scopedPrototypeStorage,
  type DesignerRecovery,
} from './prototypeDrafts'
import {
  canAutoDeliver,
  deliveryBlockers,
  emptyPrototypeSchema,
  loadPrototypeSchema,
  loadPrototypeVersions,
  savePrototypeSchema,
  schemaFromGrapesProject,
  type PrototypeSchema,
} from './prototypeSchema'

const { t } = useI18n()
const props = withDefaults(
  defineProps<{ sourceRef?: 'builder-alpha' | 'builder-beta'; active?: boolean }>(),
  {
    sourceRef: 'builder-alpha',
    active: true,
  },
)
const emit = defineEmits<{ saved: [schema: PrototypeSchema]; published: [id: string] }>()

const canvas = ref<HTMLElement | null>(null)
const title = ref('EAP layout')
const frame = ref<{ showInspector: () => void }>()
const resourcesTab = ref('components')
const inspectorTab = ref('page')
const surface = ref('canvas')
const selectedId = ref('')
const savedSnapshot = ref('')
const structure = ref<TreeNode[]>([])
const blocks = [
  'section',
  'text',
  'heading',
  'button',
  'link',
  'list',
  'task-list',
  'input',
  'textarea',
  'form',
  'select',
  'checkbox',
  'dialog',
] as const
let cleanProject: import('grapesjs').ProjectData | undefined
let cleanTitle = 'EAP layout'
function snapshot() {
  return JSON.stringify({
    title: title.value,
    project: editor?.getProjectData?.() ?? schema.value.grapesProject ?? {},
  })
}
const dirty = computed(() => {
  void revision.value
  return !!savedSnapshot.value && savedSnapshot.value !== snapshot()
})
function markSaved() {
  cleanProject = JSON.parse(
    JSON.stringify(editor?.getProjectData?.() ?? schema.value.grapesProject ?? {}),
  )
  cleanTitle = title.value
  savedSnapshot.value = snapshot()
}
function guardLeave() {
  if (publishing.value) return false
  if (!dirty.value) return true
  return checkpoint()
}
function guardReplaceDocument() {
  if (!publishing.value && !publicationIntent.value && !publicationInvalid.value && !dirty.value)
    return true
  note.value = t('editor.leaveHint')
  return false
}
function discard() {
  title.value = cleanTitle
  if (cleanProject) editor?.loadProjectData(cleanProject)
  note.value = ''
  markSaved()
  refreshStructure()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function refreshStructure() {
  function nodes(collection: import('grapesjs').Component[]): TreeNode[] {
    return collection.map((component) => ({
      id: component.getId(),
      label: component.getName(),
      children: nodes(component.components().models),
    }))
  }
  structure.value = nodes(editor?.getWrapper?.()?.components().models ?? [])
}
function selectComponent(id: string) {
  function find(items: import('grapesjs').Component[]): import('grapesjs').Component | undefined {
    for (const item of items) {
      if (item.getId() === id) return item
      const child = find(item.components().models)
      if (child) return child
    }
  }
  const component = find(editor?.getWrapper?.()?.components().models ?? [])
  if (component) editor?.select(component)
}
function removeComponent() {
  activeComponent?.remove()
  activeComponent = undefined
  selected.value = false
  selectedId.value = ''
  inspectorTab.value = 'page'
  refreshStructure()
}
function preview() {
  schema.value = schemaFromGrapesProject(
    title.value,
    editor?.getProjectData?.() ?? schema.value.grapesProject ?? {},
  )
  surface.value = surface.value === 'preview' ? 'canvas' : 'preview'
}
function validateDesign() {
  schema.value = schemaFromGrapesProject(
    title.value,
    editor?.getProjectData?.() ?? schema.value.grapesProject ?? {},
  )
  const blockers = deliveryBlockers(schema.value)
  note.value = blockers.length
    ? t('desktop.grapesBlocked', { reasons: blockers.join(' · ') })
    : t('desktop.grapesDeliverOk')
}
defineExpose({
  guardLeave,
  prepareDisable: () =>
    !publishing.value &&
    !publicationIntent.value &&
    !publicationInvalid.value &&
    (!initialized || checkpoint()),
})

const status = ref<'loading' | 'ready' | 'offline'>('loading')
const note = ref('')
const selectedText = ref('')
const selected = ref(false)
const selectedKind = ref('')
const actionType = ref('')
const actionTarget = ref('')
const fieldLabel = ref('')
const fieldOptions = ref('')
const fieldItems = ref('')
const fieldCreatable = ref(false)
function updateTaskCreatable() {
  activeComponent?.addAttributes({ 'data-creatable': String(fieldCreatable.value) })
}
const fieldEditable = ref(false)
function updateTaskEditable() {
  activeComponent?.addAttributes({ 'data-editable': String(fieldEditable.value) })
}
const invalidItems = computed(
  () =>
    selectedKind.value === 'task-list' && parsePrototypeTaskListItems(fieldItems.value) === null,
)
function updateTaskItems() {
  activeComponent?.addAttributes({ 'data-items': fieldItems.value })
}
const fieldRequired = ref(false)
const fieldValue = ref('')
const fieldPlaceholder = ref('')
const fieldChecked = ref(false)
const actionTargets = computed(() =>
  prototypeNodes(design.value).filter((node) =>
    actionType.value === PrototypeActionType.TOGGLE
      ? ['section', 'dialog'].includes(node.kind)
      : node.kind === 'form',
  ),
)
function updateInteraction() {
  activeComponent?.addAttributes({
    'data-label': fieldLabel.value,
    ...(['input', 'textarea'].includes(selectedKind.value)
      ? { placeholder: fieldPlaceholder.value }
      : {}),
    'data-action': actionType.value,
    'data-target': actionTarget.value,
    'data-options': fieldOptions.value,
    'data-required': String(fieldRequired.value),
    'data-value': fieldValue.value,
    'data-checked': String(fieldChecked.value),
  })
}
function changeActionType() {
  actionTarget.value = ''
  updateInteraction()
}
const instanceId = crypto.randomUUID()
const documentId = ref(crypto.randomUUID())
const revision = ref(0)
const inspection = ref<EditorInspectionResult | null>(null)
const inspectionTarget = computed<EditorInspectionTarget>(() => ({
  instanceId,
  documentId: documentId.value,
  sourceRef: props.sourceRef,
  revision: revision.value,
}))
const inspectionStale = computed(
  () =>
    inspection.value?.status === 'ok' &&
    !sameInspectionTarget(inspection.value.target, inspectionTarget.value),
)
function changed() {
  revision.value += 1
  if (initialized)
    queueMicrotask(() => {
      if (!disposed) checkpoint()
    })
  refreshStructure()
}
function switchDocument() {
  documentId.value = crypto.randomUUID()
  changed()
  inspection.value = null
}
watch(title, changed, { flush: 'sync' })
watch(() => props.sourceRef, switchDocument, { flush: 'sync' })
watch(
  () => props.active,
  () => {
    inspection.value = null
  },
  { flush: 'sync' },
)
function inspect() {
  inspection.value = readEditorInspection(
    inspectionTarget.value,
    () =>
      !disposed && props.active && status.value === 'ready' && editor
        ? inspectionTarget.value
        : null,
    () => ({
      title: title.value,
      project: editor!.getProjectData(),
      selection: editor!.getSelected()?.toJSON() ?? null,
    }),
  )
}
const layout = ref('block'),
  spacing = ref(12)
function updateLayout() {
  activeComponent?.addStyle({
    display: layout.value,
    gap: `${spacing.value}px`,
    padding: `${spacing.value}px`,
  })
}
let activeComponent: import('grapesjs').Component | undefined
const publishing = ref(false)
const checkingPublication = ref(false)
const publicationIntent = ref<PublicationIntent | null>(null)
const publicationInvalid = ref(false)
try {
  publicationIntent.value = readPublicationIntent(props.sourceRef)
} catch {
  publicationInvalid.value = true
}
function newDesign() {
  if (!guardReplaceDocument()) {
    note.value = t('editor.newHint')
    return
  }
  switchDocument()
  editor?.setComponents([])
  schema.value = emptyPrototypeSchema(title.value)
  selected.value = false
  activeComponent = undefined
}
async function publish() {
  if (publishing.value || publicationIntent.value || publicationInvalid.value || !editor) return
  if (!save()) return
  if (!canAutoDeliver(schema.value)) return
  const intent: PublicationIntent = {
    format: 1,
    status: 'unknown',
    request: {
      requestId: crypto.randomUUID(),
      sourceRef: props.sourceRef,
      title: schema.value.title,
      body: JSON.stringify({ format: 'eap-prototype-v1', schema: schema.value }),
      acceptance: ['semantic-preview'],
    },
  }
  try {
    writePublicationIntent(intent)
    publicationIntent.value = intent
  } catch {
    publicationInvalid.value = true
    note.value = t('editor.publicationStorageFailed')
    return
  }
  await sendPublication(intent)
}
function confirmPublication(version: PrototypeVersionRecord, intent: PublicationIntent) {
  if (
    version.requestId !== intent.request.requestId ||
    version.sourceRef !== intent.request.sourceRef ||
    !version.id
  )
    throw new Error('PUBLICATION_RESPONSE_MISMATCH')
  clearPublicationIntent(intent.request.sourceRef)
  publicationIntent.value = null
  note.value = t('desktop.grapesPublished', { id: version.id })
  emit('published', version.id)
}
async function sendPublication(intent: PublicationIntent) {
  publishing.value = true
  try {
    confirmPublication(await runtimeApi.savePrototypeVersion(intent.request), intent)
  } catch {
    intent.status = 'unknown'
    publicationIntent.value = intent
    try {
      writePublicationIntent(intent)
    } catch {
      publicationInvalid.value = true
    }
    note.value = t('editor.publicationUnknown')
  } finally {
    publishing.value = false
  }
}
async function checkPublication() {
  const intent = publicationIntent.value
  if (!intent || checkingPublication.value || publishing.value) return
  checkingPublication.value = true
  try {
    confirmPublication(await runtimeApi.prototypePublication(intent.request.requestId), intent)
  } catch (error) {
    intent.status =
      (error as { response?: { status?: number } }).response?.status === 404 ? 'absent' : 'unknown'
    try {
      writePublicationIntent(intent)
    } catch {
      publicationInvalid.value = true
    }
    note.value = t(
      intent.status === 'absent' ? 'editor.publicationAbsent' : 'editor.publicationUnknown',
    )
  } finally {
    checkingPublication.value = false
  }
}
async function retryPublication() {
  const intent = publicationIntent.value
  if (
    !intent ||
    intent.status !== 'absent' ||
    publishing.value ||
    checkingPublication.value ||
    publicationInvalid.value
  )
    return
  intent.status = 'unknown'
  try {
    writePublicationIntent(intent)
  } catch {
    publicationInvalid.value = true
    return
  }
  await sendPublication(intent)
}
function addBlock(kind: (typeof blocks)[number]) {
  if (!editor) return
  if (kind === 'task-list') {
    const [component] = editor.addComponents(taskListPrototypeBlock())
    if (component) editor.select(component)
    return
  }
  if (kind === 'form' || kind === 'select' || kind === 'checkbox' || kind === 'dialog') {
    const [component] = editor.addComponents(
      interactivePrototypeBlock(kind, (key) => t('editor.interaction.' + key)),
    )
    if (component) editor.select(component)
    return
  }
  const tags = {
    section: 'section',
    text: 'p',
    heading: 'h1',
    button: 'button',
    input: 'input',
    textarea: 'textarea',
    link: 'a',
    list: 'ul',
  }
  const [component] = editor.addComponents(
    kind === 'list'
      ? {
          tagName: 'ul',
          attributes: { 'data-eap-kind': 'list' },
          components: [
            { tagName: 'li', content: 'Item 1' },
            { tagName: 'li', content: 'Item 2' },
          ],
        }
      : {
          tagName: tags[kind],
          attributes: {
            'data-eap-kind': kind,
            ...(['input', 'textarea'].includes(kind)
              ? { placeholder: t('editor.interaction.description') }
              : {}),
            ...(kind === 'link' ? { href: '#' } : {}),
            ...(kind === 'heading' ? { 'data-level': '1' } : {}),
          },
          content: ['input', 'textarea'].includes(kind)
            ? ''
            : kind === 'button'
              ? 'Action'
              : kind === 'link'
                ? 'Link'
                : kind === 'heading'
                  ? 'Heading'
                  : 'Text',
        },
  )
  if (component) {
    editor.select(component)
    activeComponent = component
    selected.value = true
    selectedText.value = component.get('content') || 'Text'
  }
}
function updateText() {
  const component = activeComponent ?? editor?.getSelected()
  if (!component) return
  // Text nodes are encoded; no user-entered HTML or scripts are executed.
  const encoded = selectedText.value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  component.set('content', '')
  component.components(encoded)
}
const schema = ref<PrototypeSchema>(emptyPrototypeSchema())
const design = computed(() => {
  void revision.value
  return status.value === 'ready' && editor
    ? schemaFromGrapesProject(title.value, editor.getProjectData())
    : schema.value
})
const versions = ref(loadPrototypeVersions(scopedPrototypeStorage(props.sourceRef)))
function reopen(id: string) {
  if (!guardReplaceDocument()) return
  const version = versions.value.find((item) => item.id === id)
  if (!version) return
  switchDocument()
  schema.value = JSON.parse(JSON.stringify(version))
  title.value = version.title
  editor?.loadProjectData(version.grapesProject as import('grapesjs').ProjectData)
  markSaved()
  refreshStructure()
}
let editor: import('grapesjs').Editor | null = null
let disposed = false
let initialized = false
const recoveryFailed = ref(false)
const recoveryRestored = ref(false)
function checkpoint() {
  if (!initialized) return false
  try {
    writeDesignerRecovery({
      format: 1,
      sourceRef: props.sourceRef,
      title: title.value,
      project: editor?.getProjectData?.() ?? schema.value.grapesProject ?? {},
      cleanTitle,
      cleanProject: cleanProject ?? {},
    })
    recoveryFailed.value = false
    return true
  } catch {
    recoveryFailed.value = true
    note.value = t('editor.recoveryFailed')
    return false
  }
}

async function mountEditor() {
  status.value = 'loading'
  note.value = ''
  let recovery: DesignerRecovery | null = null
  try {
    recovery = readDesignerRecovery(props.sourceRef)
  } catch {
    recoveryFailed.value = true
    note.value = t('editor.recoveryInvalid')
    status.value = 'offline'
    return
  }
  const restored = loadPrototypeSchema(scopedPrototypeStorage(props.sourceRef))
  if (restored) {
    schema.value = restored
    title.value = restored.title
  }
  if (recovery) {
    title.value = recovery.title
    schema.value.grapesProject = recovery.project
    recoveryRestored.value = true
  }
  try {
    const { default: grapes } = await import('grapesjs')
    if (disposed || !canvas.value) return
    editor?.destroy?.()
    editor = grapes.init({
      container: canvas.value,
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false,
      telemetry: false,
      noticeOnUnload: false,
      avoidInlineStyle: false,
      cssIcons: '',
      panels: { defaults: [] },
      blockManager: {
        blocks: [
          {
            id: 'section',
            label: 'Section',
            content:
              '<section data-eap-kind="section"><p data-eap-kind="text">Section</p></section>',
          },
          { id: 'text', label: 'Text', content: '<p data-eap-kind="text">Text</p>' },
          {
            id: 'heading',
            label: 'Heading',
            content: '<h1 data-eap-kind="heading" data-level="1">Heading</h1>',
          },
          {
            id: 'button',
            label: 'Button',
            content: '<button data-eap-kind="button">Action</button>',
          },
          { id: 'link', label: 'Link', content: '<a data-eap-kind="link" href="#">Link</a>' },
          {
            id: 'list',
            label: 'List',
            content: '<ul data-eap-kind="list"><li>Item 1</li><li>Item 2</li></ul>',
          },
          {
            id: 'input',
            label: 'Input',
            content: '<textarea data-eap-kind="input" placeholder="Describe a task"></textarea>',
          },
        ],
      },
    })
    const syncSelection = () => {
      changed()
      queueMicrotask(() => {
        if (disposed) return
        const component = editor?.getSelected()
        if (component) {
          activeComponent = component
          selected.value = true
          selectedId.value = component.getId()
          const attrs = component.getAttributes()
          selectedKind.value = String(attrs['data-eap-kind'] ?? '')
          actionType.value = String(attrs['data-action'] ?? '')
          actionTarget.value = String(attrs['data-target'] ?? '')
          fieldLabel.value = String(attrs['data-label'] ?? '')
          fieldPlaceholder.value = String(attrs.placeholder ?? '')
          fieldOptions.value = String(attrs['data-options'] ?? '')
          fieldItems.value = String(attrs['data-items'] ?? '')
          fieldEditable.value = attrs['data-editable'] === 'true' || attrs['data-editable'] === true
          fieldCreatable.value =
            attrs['data-creatable'] === 'true' || attrs['data-creatable'] === true
          fieldRequired.value = attrs['data-required'] === 'true'
          fieldValue.value = String(
            attrs['data-value'] ??
              (selectedKind.value === 'textarea' ? component.get('content') : '') ??
              '',
          )
          fieldChecked.value = attrs['data-checked'] === 'true'
          inspectorTab.value = 'component'
          layout.value = String(component.getStyle().display ?? 'block')
          spacing.value = Number.parseFloat(String(component.getStyle().gap ?? '12')) || 0
          frame.value?.showInspector()
          selectedText.value =
            component.get('content') || component.getInnerHTML().replace(/<[^>]*>/g, '')
        } else {
          activeComponent = undefined
          selected.value = false
          selectedText.value = ''
          selectedId.value = ''
          inspectorTab.value = 'page'
        }
      })
    }
    editor.on('update', changed)
    editor.on('destroy', () => {
      inspection.value = null
      status.value = 'offline'
      editor = null
    })
    editor.on('component:selected', syncSelection)
    editor.on('component:deselected', syncSelection)
    if (
      schema.value.grapesProject &&
      Object.keys(schema.value.grapesProject).length &&
      typeof (editor as { loadProjectData?: (data: Record<string, unknown>) => void })
        .loadProjectData === 'function'
    ) {
      ;(editor as { loadProjectData: (data: Record<string, unknown>) => void }).loadProjectData(
        JSON.parse(JSON.stringify(schema.value.grapesProject)),
      )
    } else {
      editor.setComponents([
        {
          tagName: 'section',
          attributes: { 'data-eap-kind': 'section' },
          components: [
            {
              tagName: 'h1',
              type: 'text',
              attributes: { 'data-eap-kind': 'text' },
              content: 'EAP Workspace',
            },
            interactivePrototypeBlock('form', (key) =>
              t('editor.interaction.' + key),
            ) as import('grapesjs').ComponentDefinition,
          ],
        },
      ])
    }
    status.value = 'ready'
    if (recovery) {
      cleanTitle = recovery.cleanTitle
      cleanProject = recovery.cleanProject as import('grapesjs').ProjectData
      savedSnapshot.value = JSON.stringify({ title: cleanTitle, project: cleanProject })
    } else markSaved()
    initialized = true
    refreshStructure()
  } catch {
    editor?.destroy?.()
    editor = null
    status.value = 'offline'
    note.value = t('desktop.grapesOffline')
    markSaved()
    initialized = false
  }
}

function save() {
  if (status.value !== 'ready' || !editor) return false
  const project = editor?.getProjectData?.() ?? schema.value.grapesProject ?? {}
  const next = schemaFromGrapesProject(title.value, project)
  if (
    deliveryBlockers(next).some(
      (reason) => reason.startsWith('invalid_task_list:') || reason.includes('task_list_children'),
    )
  ) {
    note.value = t('editor.taskList.invalid')
    return false
  }
  try {
    schema.value = savePrototypeSchema(next, scopedPrototypeStorage(props.sourceRef))
  } catch {
    recoveryFailed.value = true
    note.value = t('editor.recoveryFailed')
    return false
  }
  versions.value = loadPrototypeVersions(scopedPrototypeStorage(props.sourceRef))
  const blockers = deliveryBlockers(schema.value)
  note.value = blockers.length
    ? t('desktop.grapesBlocked', { reasons: blockers.join(' · ') })
    : t('desktop.grapesSaved')
  markSaved()
  checkpoint()
  emit('saved', schema.value)
  return true
}

onMounted(() => {
  void mountEditor()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  if (initialized) checkpoint()
  disposed = true
  inspection.value = null
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  editor?.destroy?.()
  editor = null
})
</script>

<template>
  <EditorWorkbench
    ref="frame"
    class="grapes-scaffold"
    data-testid="grapes-scaffold"
    :resources-label="t('editor.resources')"
    :inspector-label="t('editor.properties')"
    :resize-label="t('editor.resize')"
    :close-label="t('editor.close')"
  >
    <template #header>
      <div>
        <h2>{{ title }}</h2>
        <small data-testid="grapes-status">{{
          status === 'ready'
            ? t('desktop.grapesReady')
            : status === 'offline'
              ? t('desktop.grapesOfflineShort')
              : t('desktop.grapesLoading')
        }}</small>
        <small v-if="dirty"> · {{ t('editor.unsaved') }}</small>
      </div>
      <div class="actions">
        <Button data-testid="grapes-preview" :disabled="status !== 'ready'" @click="preview">{{
          t(surface === 'preview' ? 'editor.canvas' : 'editor.preview')
        }}</Button>
        <Button :disabled="status !== 'ready'" @click="validateDesign">{{
          t('editor.validation')
        }}</Button>
        <Button v-if="dirty" data-testid="grapes-discard" @click="discard">{{
          t('editor.discard')
        }}</Button>
        <div class="actions">
          <Button
            type="button"
            size="sm"
            data-testid="grapes-save"
            :disabled="status !== 'ready'"
            @click="save"
            >{{ t('desktop.grapesSave') }}</Button
          >
          <Button
            type="button"
            size="sm"
            variant="primary"
            data-testid="grapes-publish"
            :disabled="
              status !== 'ready' ||
              publishing ||
              !!publicationIntent ||
              publicationInvalid ||
              !canAutoDeliver(design)
            "
            @click="publish"
            >{{ t('desktop.grapesPublish') }}</Button
          >
          <span class="hint" data-testid="grapes-deliver">{{
            canAutoDeliver(design)
              ? t('desktop.grapesDeliverOk')
              : t('desktop.grapesDeliverBlocked')
          }}</span>
        </div>
        <Feedback
          v-if="publicationIntent || publicationInvalid"
          tone="warning"
          data-testid="publication-review"
        >
          <p>
            {{
              t(
                publicationInvalid
                  ? 'editor.publicationStorageFailed'
                  : 'editor.publicationUnknown',
              )
            }}
          </p>
          <template v-if="publicationIntent">
            <p>
              {{
                t('editor.publicationIdentity', {
                  id: publicationIntent.request.requestId,
                  title: publicationIntent.request.title,
                })
              }}
            </p>
            <Button
              data-testid="publication-check"
              :disabled="publishing || checkingPublication || publicationInvalid"
              @click="checkPublication"
              >{{ t('editor.publicationCheck') }}</Button
            >
            <Button
              v-if="publicationIntent.status === 'absent'"
              data-testid="publication-retry"
              :disabled="publishing || checkingPublication || publicationInvalid"
              @click="retryPublication"
              >{{ t('editor.publicationRetry') }}</Button
            >
          </template>
        </Feedback>
      </div>
    </template>
    <template #toolbar
      ><strong>{{
        t(surface === 'preview' ? 'editor.preview' : 'editor.canvas')
      }}</strong></template
    >
    <template #resources>
      <Tabs
        v-model="resourcesTab"
        :label="t('editor.resources')"
        :tabs="[
          { id: 'components', label: t('editor.components') },
          { id: 'structure', label: t('editor.pageStructure') },
        ]"
      />
      <div v-if="resourcesTab === 'components'" class="component-library">
        <Button
          v-for="kind in blocks"
          :key="kind"
          :disabled="status !== 'ready'"
          :data-testid="'grapes-add-' + kind"
          @click="addBlock(kind)"
          >{{
            ['form', 'select', 'checkbox', 'dialog'].includes(kind)
              ? t('editor.interaction.add.' + kind)
              : t('desktop.grapesAdd' + kind)
          }}</Button
        >
        <Button :disabled="status !== 'ready'" data-testid="grapes-new" @click="newDesign">{{
          t('desktop.grapesNew')
        }}</Button>
      </div>
      <template v-else
        ><Tree
          v-model="selectedId"
          :items="structure"
          :label="t('editor.pageStructure')"
          @select="selectComponent($event.id)"
        /><EmptyState v-if="!structure.length">{{
          t('editor.emptyStructure')
        }}</EmptyState></template
      >
    </template>
    <div
      v-show="surface === 'canvas'"
      ref="canvas"
      class="grapes-canvas eap-scrollbar"
      data-testid="grapes-canvas"
      :data-mode="status"
    />
    <PrototypeSchemaPreview v-if="surface === 'preview' && props.active" :schema="schema" />
    <p v-if="status === 'offline'" class="hint" data-testid="grapes-offline-panel">
      {{ t('desktop.grapesOfflineBody') }}
    </p>
    <template #inspector>
      <Tabs
        v-model="inspectorTab"
        :label="t('editor.properties')"
        :tabs="[
          { id: 'page', label: t('editor.pageSettings') },
          { id: 'component', label: t('editor.componentSettings') },
        ]"
      />
      <div v-if="inspectorTab === 'page'" class="editor-controls">
        <label class="title-field">
          {{ t('desktop.grapesName') }}
          <Input
            v-model="title"
            maxlength="120"
            :disabled="status !== 'ready'"
            data-testid="grapes-title"
          />
        </label>
        <label v-if="versions.length" class="title-field"
          >{{ t('desktop.chooseVersion')
          }}<Select :model-value="schema.id || ''" @update:model-value="reopen(String($event))"
            ><option value="" disabled>—</option>
            <option v-for="version in versions" :key="version.id" :value="version.id">
              {{ version.title }} · {{ version.updatedAt }}
            </option></Select
          ></label
        >
      </div>
      <div v-else class="editor-controls">
        <label v-if="selected && ['text', 'heading', 'button', 'link'].includes(selectedKind)"
          >{{ t('desktop.grapesText') }}<Input v-model="selectedText" @input="updateText"
        /></label>
        <template
          v-if="
            selected &&
            ['input', 'textarea', 'select', 'checkbox', 'form', 'dialog', 'task-list'].includes(
              selectedKind,
            )
          "
        >
          <label
            >{{ t('editor.interaction.label')
            }}<Input
              v-model="fieldLabel"
              data-testid="grapes-field-label"
              @update:model-value="updateInteraction"
          /></label>
          <label v-if="['input', 'textarea', 'select'].includes(selectedKind)"
            >{{ t('editor.interaction.initialValue')
            }}<Textarea
              v-if="selectedKind === 'textarea'"
              v-model="fieldValue"
              data-testid="grapes-field-value"
              maxlength="2000"
              @update:model-value="updateInteraction" />
            <Input
              v-else
              v-model="fieldValue"
              data-testid="grapes-field-value"
              @update:model-value="updateInteraction"
          /></label>
          <label v-if="['input', 'textarea'].includes(selectedKind)"
            >{{ t('editor.interaction.placeholder')
            }}<Input
              v-model="fieldPlaceholder"
              data-testid="grapes-field-placeholder"
              @update:model-value="updateInteraction"
          /></label>
          <template v-if="selectedKind === 'task-list'">
            <label
              ><Checkbox
                v-model="fieldCreatable"
                data-testid="grapes-task-creatable"
                @update:model-value="updateTaskCreatable"
              />{{ t('editor.taskList.creatable') }}</label
            >
            <label
              ><Checkbox
                v-model="fieldEditable"
                data-testid="grapes-task-editable"
                @update:model-value="updateTaskEditable"
              />{{ t('editor.taskList.editable') }}</label
            >
            <label
              >{{ t('editor.taskList.items')
              }}<Textarea
                v-model="fieldItems"
                data-testid="grapes-field-items"
                :rows="12"
                :aria-invalid="invalidItems"
                @update:model-value="updateTaskItems"
            /></label>
            <Feedback v-if="invalidItems" tone="warning" role="alert">{{
              t('editor.taskList.invalid')
            }}</Feedback>
          </template>
          <label v-if="selectedKind === 'select'"
            >{{ t('editor.interaction.options')
            }}<Textarea
              v-model="fieldOptions"
              data-testid="grapes-field-options"
              @update:model-value="updateInteraction"
          /></label>
          <label v-if="['input', 'textarea', 'select', 'checkbox'].includes(selectedKind)"
            ><span
              ><Checkbox v-model="fieldRequired" @update:model-value="updateInteraction" />
              {{ t('editor.interaction.requiredSetting') }}</span
            ></label
          >
          <label v-if="selectedKind === 'checkbox'"
            ><span
              ><Checkbox v-model="fieldChecked" @update:model-value="updateInteraction" />
              {{ t('editor.interaction.initialChecked') }}</span
            ></label
          >
        </template>
        <template v-if="selected && selectedKind === 'button'">
          <label
            >{{ t('editor.interaction.action')
            }}<Select
              v-model="actionType"
              data-testid="grapes-action-type"
              @update:model-value="changeActionType"
            >
              <option value="">{{ t('editor.interaction.noAction') }}</option>
              <option v-for="value in PrototypeActionType" :key="value" :value="value">
                {{ t('editor.interaction.actions.' + value) }}
              </option>
            </Select></label
          >
          <label v-if="actionType"
            >{{ t('editor.interaction.target')
            }}<Select
              v-model="actionTarget"
              data-testid="grapes-action-target"
              @update:model-value="updateInteraction"
            >
              <option value="">{{ t('editor.interaction.choose') }}</option>
              <option v-for="node in actionTargets" :key="node.id" :value="node.id">
                {{ node.props.label || node.id }}
              </option>
            </Select></label
          >
        </template>
        <label v-if="selected"
          >{{ t('desktop.grapesLayout')
          }}<Select v-model="layout" @change="updateLayout"
            ><option value="block">Block</option>
            <option value="flex">Flex</option>
            <option value="grid">Grid</option></Select
          ></label
        >
        <label v-if="selected"
          >{{ t('desktop.grapesSpacing') }} · {{ spacing }}px<Slider
            v-model="spacing"
            :min="0"
            :max="48"
            @input="updateLayout"
        /></label>

        <Button
          v-if="selected"
          variant="danger"
          data-testid="grapes-remove"
          @click="removeComponent"
          >{{ t('editor.deleteComponent') }}</Button
        >
        <EmptyState v-else>{{ t('editor.chooseComponent') }}</EmptyState>
      </div>
      <Collapse
        ><template #summary>{{ t('desktop.grapesInspect') }}</template>
        <section class="inspection-panel" data-testid="grapes-inspection">
          <p class="hint">{{ t('desktop.grapesInspectBoundary') }}</p>
          <p class="hint" data-testid="grapes-inspection-target">
            {{ props.sourceRef }} · {{ instanceId }} · {{ documentId }} · revision {{ revision }}
          </p>
          <Button
            size="sm"
            class="inspection-trigger"
            data-testid="grapes-inspect"
            :disabled="status !== 'ready' || !props.active"
            @click="inspect"
          >
            {{ t('desktop.grapesInspect') }}
          </Button>
          <Feedback v-if="inspectionStale" tone="warning" data-testid="grapes-inspection-stale">{{
            t('desktop.grapesInspectStale')
          }}</Feedback>
          <pre
            v-if="inspection?.status === 'ok'"
            class="inspection-result eap-scrollbar"
            data-testid="grapes-inspection-result"
            >{{ JSON.stringify(inspection, null, 2) }}</pre>
          <Feedback v-else-if="inspection" tone="warning" data-testid="grapes-inspection-error">{{
            t('desktop.grapesInspectError.' + inspection.status)
          }}</Feedback>
        </section>
      </Collapse>
    </template>
    <template #status>
      <Feedback v-if="recoveryFailed" tone="error" data-testid="grapes-recovery-error">{{
        t('editor.recoveryFailed')
      }}</Feedback>
      <p v-else-if="dirty || recoveryRestored" class="hint" data-testid="grapes-recovery-state">
        {{ t('editor.recoveryLocal') }}
      </p>
      <p v-if="note" role="status" data-testid="grapes-note">{{ note }}</p>
      <small class="hint" data-testid="grapes-boundary">{{ t('desktop.grapesBoundary') }}</small>
    </template>
  </EditorWorkbench>
</template>
<style scoped>
.grapes-scaffold {
  min-height: 0;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.hint,
small {
  font-size: 12px;
  color: var(--text-soft);
}

.grapes-canvas {
  flex: 1;
  min-height: 280px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
}

.editor-controls,
.component-library {
  display: grid;
  gap: 12px;
  align-content: start;
}

.editor-controls label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.inspection-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.inspection-result {
  max-height: 280px;
  overflow: auto;
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>

<style>
.grapes-scaffold .grapes-canvas .gjs-cv-canvas {
  top: 0;
  width: 100%;
  height: 100%;
}
</style>
