<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch, toRaw } from 'vue'
import { runtimeApi, type CapabilityItem, type CapabilityKindSummary } from '@eap/runtime-client'
import { assertExpertId } from '@eap/expert-sdk'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Checkbox,
  ConfirmBox,
  EmptyState,
  Feedback,
  Input,
  Select,
  Collapse,
  Textarea,
  Tabs,
  Panel,
  EditorWorkbench,
  Tree,
} from '@eap/ui'
import { errorMessage } from '../../lib/presentation'
import {
  isExpertScoped as capabilityIsExpertScoped,
  offersAsNode,
  unknownDeclaredTools as findUnknownDeclaredTools,
  undeclaredScopedNodes as findUndeclaredScopedNodes,
} from '../capability/capabilityScope'
type ExpertDefinition = {
  id: string
  name: string
  knowledgeBases?: string[]
  databaseProfiles?: string[]
  steps?: Step[]
  edges?: Array<{ source: string; target: string }>
  rules?: string[]
  rulePacks?: string[]
  /** Expert-scoped capabilities (MCP tools) this expert is authorised to call. */
  mcpTools?: string[]
  [key: string]: unknown
}
const props = withDefaults(
  defineProps<{ expertId?: string; createMode?: 'workflow' | 'agent' }>(),
  { expertId: '', createMode: 'workflow' },
)
const emit = defineEmits<{ saved: [id: string]; run: [id: string]; back: [] }>()
const { t } = useI18n()
const configTab = ref('basic')
const resourceTab = ref('library')
const inspectorTab = ref('settings')
const query = ref('')
const frame = ref<{ showInspector: () => void; showResources: () => void }>()
const validationAttempted = ref(false)
const goalInput = ref<{ focus?: () => void }>()
const graphCanvas = ref<{ reveal: (id: string) => void }>()
const agentMode = ref(false)
const configTabs = computed(() => [
  { id: 'basic', label: t('expertWorkspace.basicTab') },
  { id: 'resources', label: t('expertWorkspace.resourcesTab') },
  { id: 'rules', label: t('expertWorkspace.rulesTab') },
  ...(!agentMode.value ? [{ id: 'tools', label: t('expertWorkspace.toolsTab') }] : []),
])
const agentGoal = ref('')
const agentTools = ref<string[]>([])
const agentToolChoices = [
  'sql.parse',
  'database.schema.read',
  'database.index.read',
  'database.explain',
  'knowledge.search',
]
const original = ref<ExpertDefinition | null>(null)
const baseline = ref('')
const library = ref<Array<{ id: string; name: string }>>([])
const selectedKnowledge = ref<string[]>([])
const selectedDatabases = ref<string[]>([])
const databaseLibrary = ref<Array<{ id: string; label: string }>>([])
const states = ref<Record<string, { enabled: boolean; builtin: boolean; revision: number }>>({})
const enabled = computed(() => states.value[id.value]?.enabled === true)
const isBuiltin = computed(() => states.value[id.value]?.builtin === true)
const selectedRules = ref<string[]>(['database.credentials.never-expose'])
const ruleChoices = [
  { id: 'database.credentials.never-expose', name: '禁止泄露数据库凭据' },
  { id: 'candidate-sql.must-preserve-semantics', name: '候选 SQL 必须保持原语义' },
]
const loadError = ref('')
const initializing = ref(false)
// Capabilities and rule packs come from the backend catalog so the editor can never offer an
// option the runtime cannot execute or resolve.
const catalogCapabilities = ref<string[]>([])
const catalogCapabilityItems = ref<CapabilityItem[]>([])
const capabilityKinds = ref<CapabilityKindSummary[]>([])
const nodeOptions = computed(() => catalogCapabilities.value)
/**
 * Capabilities offered to the editor, grouped by how they are executed (built-in command / local CLI /
 * MCP tool / HTTP service). Grouping is what keeps an operator from wiring a CLI node into an
 * environment that has no such binary.
 */
const capabilityGroups = computed(() => {
  const groups: Array<{ label: string; options: CapabilityItem[] }> = []
  if (catalogCapabilityItems.value.length) {
    groups.push(
      ...capabilityKinds.value
        .map((kind) => ({
          label: kind.label + '（' + kind.id + ' · ' + kind.scopeLabel + '）',
          // Expert-scoped capabilities are deliberately excluded here: the platform has them, this
          // expert does not — that is the whole point of the authorisation block below. Switched-off
          // platform capabilities are excluded too: the runtime refuses to resolve them, and the
          // disabledPlatform hint below says which ones and why.
          options: catalogCapabilityItems.value.filter(
            (item) => item.kind === kind.id && offersAsNode(item, disabledPlatform.value),
          ),
        }))
        .filter((group) => group.options.length),
    )
  } else {
    groups.push({
      label: '能力',
      options: nodeOptions.value.map((name) => ({ name, title: '', kind: '' }) as CapabilityItem),
    })
  }
  // A declared expert-scoped tool becomes selectable as a node — and only a declared one does, which is
  // exactly the difference between "the platform has it" and "this expert may call it".
  const scopedOptions = declaredMcpTools.value.map(
    (name) =>
      catalogCapabilityItems.value.find((item) => item.name === name) ??
      ({
        name,
        title: '专家级能力（已授权本专家）',
        kind: 'mcp',
        scope: 'expert',
      } as CapabilityItem),
  )
  if (scopedOptions.length) groups.push({ label: '专家级（已授权本专家）', options: scopedOptions })
  return groups
})
const selectedRulePacks = ref<string[]>([])
const rulePackChoices = ref<
  Array<{ id: string; name: string; ruleCount: number; shipped: boolean; requires: string[] }>
>([])
/**
 * Expert-scoped capabilities (MCP tools, remote endpoints). The platform never enables them globally,
 * so they are not offered as ordinary nodes: the expert declares them here, activation records the
 * grant, and only then can a node use one — in this expert's own session.
 */
const expertScopedCapabilities = ref<string[]>([])
/**
 * Platform capabilities the operator switched off in the capability catalog. The picker filters them
 * out through {@code offersAsNode}, and the reason is shown below the selector, because a silently
 * missing option is indistinguishable from a broken one.
 */
const disabledPlatform = ref<string[]>([])
const expertScopedVocabulary = ref<string[]>([])
const mcpServers = ref<
  Array<{ id: string; name: string; trusted: boolean; enabled: boolean; tools: string[] }>
>([])
const declaredMcpTools = ref<string[]>([])
const mcpToolToGrant = ref('')
const mcpToolChoices = computed(() =>
  expertScopedVocabulary.value.filter((id) => !declaredMcpTools.value.includes(id)),
)
function isExpertScoped(capability: string) {
  return capabilityIsExpertScoped(
    capability,
    catalogCapabilityItems.value,
    expertScopedVocabulary.value,
  )
}
function addMcpTool() {
  const next = mcpToolToGrant.value || mcpToolChoices.value[0]
  if (next && !declaredMcpTools.value.includes(next))
    declaredMcpTools.value = [...declaredMcpTools.value, next]
  mcpToolToGrant.value = ''
}
function removeMcpTool(tool: string) {
  declaredMcpTools.value = declaredMcpTools.value.filter((entry) => entry !== tool)
  // A node whose authorisation just disappeared would be rejected on save anyway; drop it here so the
  // graph never looks runnable when it is not.
  steps.value = steps.value.filter((step) => step.capability !== tool)
}
/** Node capabilities that are expert-scoped but not declared — rejected by the backend, caught here. */
const undeclaredScopedNodes = computed(() =>
  findUndeclaredScopedNodes(
    steps.value,
    declaredMcpTools.value,
    catalogCapabilityItems.value,
    expertScopedVocabulary.value,
  ),
)
/** Declared tools the platform does not publish: a manifest cannot bring a server into existence. */
const unknownDeclaredTools = computed(() =>
  findUnknownDeclaredTools(declaredMcpTools.value, expertScopedVocabulary.value),
)
/**
 * Capabilities the currently selected rule packs need but the graph does not provide. Without this the
 * expert would save fine and simply never produce those findings.
 */
const graphCapabilities = computed(
  () => new Set(agentMode.value ? agentTools.value : steps.value.map((step) => step.capability)),
)
const missingCapabilities = computed(() => {
  const needed = new Set<string>()
  for (const id of selectedRulePacks.value) {
    const pack = rulePackChoices.value.find((entry) => entry.id === id)
    for (const capability of pack?.requires ?? []) needed.add(capability)
  }
  return [...needed].filter((capability) => !graphCapabilities.value.has(capability)).sort()
})
const dirty = computed(() => editing.value && baseline.value !== definition().manifest)
/**
 * 离开编辑器前不静默丢弃草稿，也不用 `window.confirm`：它阻塞页面、无法被行为断言，
 * 而且说不清「丢掉的到底是哪一版」。这里改为拒绝离开，并把「保存 / 放弃」两个选择放在页面上。
 */
function guardLeave() {
  if (busy.value || activateOpen.value) return false
  if (!dirty.value) return true
  message.value = '当前修改尚未保存：请先「保存草稿」，或点「放弃修改」明确丢弃这一版。'
  return false
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))
import WorkflowCanvas from '../../components/WorkflowCanvas.vue'
import { inspectGraph, type WorkflowNode } from '../../lib/workflowGraph'
type Step = WorkflowNode
const items = ref<ExpertDefinition[]>([])
const id = ref('')
const name = ref('')

const steps = ref<Step[]>([])
const message = ref('')
const busy = ref(false)
const editing = ref(false)
const selectedNode = ref('')
const selectedStep = computed(() => steps.value.find((step) => step.id === selectedNode.value))
function addNode(capability: string) {
  if (
    !capabilityGroups.value.some((group) => group.options.some((item) => item.name === capability))
  )
    return
  const node = {
    id: crypto.randomUUID(),
    label:
      catalogCapabilityItems.value.find((item) => item.name === capability)?.title || capability,
    capability,
    required: true,
  }
  steps.value.push(node)
  selectNode(node.id)
}
function connectInOrder() {
  if (edges.value.length || steps.value.length < 2) return
  edges.value = steps.value.slice(1).map((step, index) => ({
    source: steps.value[index]!.id,
    target: step.id,
  }))
  message.value = '已按当前列表排列创建串行依赖，请检查箭头方向；此后执行顺序由连线定义。'
}
function removeNode() {
  const node = selectedNode.value
  steps.value = steps.value.filter((step) => step.id !== node)
  edges.value = edges.value.filter((edge) => edge.source !== node && edge.target !== node)
  selectedNode.value = ''
}
const edges = ref<Array<{ source: string; target: string }>>([])
const filteredGroups = computed(() =>
  capabilityGroups.value
    .map((group) => ({
      ...group,
      options: group.options.filter((item) =>
        (item.name + ' ' + item.title).toLowerCase().includes(query.value.toLowerCase()),
      ),
    }))
    .filter((group) => group.options.length),
)
const structure = computed(() =>
  steps.value.map((step) => ({ id: step.id, label: step.label || step.capability })),
)
function showResources() {
  configTab.value = 'resources'
  inspectorTab.value = 'settings'
  frame.value?.showInspector()
}
function selectNode(nodeId: string, reveal = true) {
  selectedNode.value = nodeId
  inspectorTab.value = 'node'
  frame.value?.showInspector()
  if (reveal) graphCanvas.value?.reveal(nodeId)
}
watch(
  steps,
  () => {
    const ids = new Set(steps.value.map((step) => step.id))
    edges.value = edges.value.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    if (!ids.has(selectedNode.value)) {
      selectedNode.value = ''
      inspectorTab.value = 'settings'
    }
  },
  { deep: true },
)
type EditorIssue = { text: string; target: 'graph' | 'basic' | 'rules' | 'tools' | 'goal' }
const issues = computed<EditorIssue[]>(() => {
  const list: EditorIssue[] = agentMode.value
    ? []
    : inspectGraph(steps.value, edges.value).errors.map((text) => ({ text, target: 'graph' }))
  if (validationAttempted.value) {
    try {
      assertExpertId(id.value)
    } catch (e) {
      list.push({ text: e instanceof Error ? e.message : '专家 id 无效', target: 'basic' })
    }
    if (!name.value.trim()) list.push({ text: '请填写专家名称', target: 'basic' })
    if (agentMode.value && (!agentGoal.value.trim() || !agentTools.value.includes('sql.parse')))
      list.push({ text: t('expertWorkspace.agentRequired'), target: 'goal' })
    if (missingCapabilities.value.length)
      list.push({
        text: '规则包缺少能力：' + missingCapabilities.value.join('、'),
        target: 'rules',
      })
    if (unknownDeclaredTools.value.length || undeclaredScopedNodes.value.length)
      list.push({ text: '专家级工具声明需要检查', target: 'tools' })
  }
  return list
})
async function locateIssue(issue: EditorIssue) {
  if (issue.target === 'goal') {
    await nextTick()
    goalInput.value?.focus?.()
  } else if (issue.target !== 'graph') {
    configTab.value = issue.target
    inspectorTab.value = 'settings'
    frame.value?.showInspector()
  } else {
    const node =
      steps.value.find((step) => !step.capability) ??
      steps.value.find((step) => !edges.value.some((edge) => edge.target === step.id)) ??
      steps.value[0]
    if (node) selectNode(node.id)
    else {
      resourceTab.value = 'library'
      frame.value?.showResources()
    }
  }
}

watch(dirty, (value) => {
  if (value) window.addEventListener('beforeunload', beforeUnload)
  else window.removeEventListener('beforeunload', beforeUnload)
})
async function load() {
  const response = await runtimeApi.experts()
  states.value = response.states ?? {}
  items.value = response.items.map((text) => JSON.parse(text) as ExpertDefinition)
  try {
    const catalog = await runtimeApi.expertCatalog()
    catalogCapabilities.value = catalog.capabilities ?? []
    catalogCapabilityItems.value = catalog.capabilityItems ?? []
    capabilityKinds.value = catalog.capabilityKinds ?? []
    expertScopedCapabilities.value = catalog.expertScoped ?? []
    disabledPlatform.value = catalog.disabledPlatform ?? []
    expertScopedVocabulary.value = catalog.expertScopedVocabulary ?? []
    mcpServers.value = catalog.mcpServers ?? []
    rulePackChoices.value = (catalog.rulePacks ?? []).map((pack) => ({
      id: pack.id,
      name: pack.name,
      ruleCount: pack.ruleCount,
      shipped: pack.shipped,
      requires: pack.requires ?? [],
    }))
  } catch {
    message.value = t('editor.emptyLibrary')
    catalogCapabilities.value = []
    catalogCapabilityItems.value = []
    capabilityKinds.value = []
    rulePackChoices.value = []
    disabledPlatform.value = []
  }
}
function create() {
  if (!guardLeave()) return
  original.value = null
  agentMode.value = props.createMode === 'agent'
  agentGoal.value = agentMode.value ? t('expertAgent.goal') : ''
  agentTools.value = agentMode.value ? ['sql.parse', 'database.explain'] : []
  editing.value = true
  selectedNode.value = ''
  id.value = ''
  name.value = ''
  selectedKnowledge.value = []
  selectedDatabases.value = []
  selectedRules.value = ['database.credentials.never-expose']
  selectedRulePacks.value = []
  declaredMcpTools.value = []
  steps.value = []
  edges.value = []
  message.value = ''
  baseline.value = definition().manifest
}
/** Load a definition into the editor. `note` overrides the message, so a discard can explain itself. */
function applyDefinition(item: ExpertDefinition, note?: string) {
  const source = toRaw(item)
  const behavior = source.behavior as { id?: string; version?: number } | undefined
  if (
    !behavior ||
    !Number.isInteger(behavior.version) ||
    Number(behavior.version) < 1 ||
    !Array.isArray(source.steps) ||
    !Array.isArray(source.edges) ||
    'capabilities' in source ||
    (source.apiVersion === 'eap/v2'
      ? behavior.id !== 'sql-readonly-agent' || behavior.version !== 1
      : source.apiVersion !== 'eap/v1')
  ) {
    loadError.value = t('expertWorkspace.unsupported')
    return
  }
  original.value = structuredClone(source)
  agentMode.value = source.apiVersion === 'eap/v2'
  const agent = source.agent as { goal?: string; tools?: string[] } | undefined
  agentGoal.value = agent?.goal ?? ''
  agentTools.value = [...(agent?.tools ?? [])]
  editing.value = true
  selectedNode.value = ''
  edges.value = structuredClone(source.edges ?? [])
  id.value = source.id
  name.value = source.name
  selectedKnowledge.value = [...(source.knowledgeBases ?? [])]
  selectedDatabases.value = [...(source.databaseProfiles ?? [])]
  selectedRules.value = [...new Set(['database.credentials.never-expose', ...(source.rules ?? [])])]
  selectedRulePacks.value = [...((source.rulePacks as string[] | undefined) ?? [])]
  declaredMcpTools.value = [...((source.mcpTools as string[] | undefined) ?? [])]
  steps.value = structuredClone(source.steps!)
  message.value = note ?? ''
  baseline.value = definition().manifest
}
/** 明确放弃未保存的修改，而不是把它藏在一个确认框后面。 */
function discardDraft() {
  if (!original.value) {
    baseline.value = definition().manifest
    create()
    return
  }
  applyDefinition(original.value, '已放弃未保存的修改，回到上次保存的版本。')
}
function copyExpert() {
  if (!original.value) return
  id.value = original.value.id + '-copy'
  name.value = original.value.name + '（副本）'
  message.value = '已复制，请修改标识后保存为新专家。'
}
function definition() {
  // `steps` is the single source of truth for capabilities; a duplicate `capabilities` array used to be
  // written here and could silently disagree with the graph.
  const base = { ...((original.value ?? {}) as Record<string, unknown>) }
  return {
    id: id.value,
    name: name.value,
    manifest: JSON.stringify({
      ...base,
      apiVersion: agentMode.value ? 'eap/v2' : 'eap/v1',
      ...(agentMode.value
        ? {
            behavior: { id: 'sql-readonly-agent', version: 1 },
            agent: { goal: agentGoal.value, tools: agentTools.value },
          }
        : { behavior: original.value?.behavior ?? { id: 'sql-analysis', version: 1 } }),
      kind: 'Expert',
      id: id.value,
      name: name.value,
      knowledgeBases: selectedKnowledge.value,
      databaseProfiles: selectedDatabases.value,
      steps: agentMode.value ? [] : steps.value,
      edges: agentMode.value ? [] : edges.value,
      rules: selectedRules.value,
      rulePacks: selectedRulePacks.value,
      // MCP tools are authorisation, not scheduling: declared here, granted on activation, and only
      // then resolvable for this expert's nodes.
      mcpTools: agentMode.value ? [] : declaredMcpTools.value,
    }),
  }
}
async function submit(save: boolean) {
  if (busy.value) return
  validationAttempted.value = true
  try {
    assertExpertId(id.value)
  } catch (error) {
    message.value = error instanceof Error ? error.message : '专家 id 无效'
    return
  }
  if (!name.value.trim()) {
    message.value = '请填写专家名称'
    return
  }
  if (agentMode.value && (!agentGoal.value.trim() || !agentTools.value.includes('sql.parse'))) {
    message.value = t('expertWorkspace.agentRequired')
    return
  }
  const graph = inspectGraph(steps.value, edges.value)
  if (!agentMode.value && graph.errors.length) {
    message.value = graph.errors.join('；')
    return
  }
  if (missingCapabilities.value.length) {
    message.value =
      '所选规则包需要能力 ' +
      missingCapabilities.value.join('、') +
      '，但专家没有声明这些能力。请补充能力或取消勾选对应规则包。'
    return
  }
  if (unknownDeclaredTools.value.length) {
    message.value =
      '以下能力是专家级能力（MCP/远端工具），但平台尚未登记对应服务器并放行其工具：' +
      unknownDeclaredTools.value.join('、') +
      '。清单不能让一个服务器存在，请先在能力目录登记服务器与工具白名单。'
    return
  }
  if (undeclaredScopedNodes.value.length) {
    message.value =
      '节点 ' +
      undeclaredScopedNodes.value.map((step) => step.id).join('、') +
      ' 使用了专家级能力，但本专家清单未声明授权：MCP 工具不会全局启用，请先在下方勾选对应工具。'
    return
  }
  if (save && isBuiltin.value) {
    message.value = '内置专家不可覆盖，请点击复制为新专家。'
    return
  }
  const ids = new Set(steps.value.map((step) => step.id))
  if (ids.size !== steps.value.length || steps.value.some((step) => !step.id || !step.capability)) {
    message.value = '节点标识必须唯一，节点能力不能为空'
    return
  }
  if (edges.value.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) {
    message.value = '连线引用了已删除的节点，请移除该连线'
    return
  }
  const pending = new Set(ids)
  const ordered: Step[] = []
  while (pending.size) {
    const next = steps.value.find(
      (step) =>
        pending.has(step.id) &&
        !edges.value.some((edge) => edge.target === step.id && pending.has(edge.source)),
    )
    if (!next) {
      message.value = '流程存在循环连线，请调整后保存'
      return
    }
    ordered.push(next)
    pending.delete(next.id)
  }
  steps.value = ordered
  busy.value = true
  const submitted = definition()
  try {
    const result = save
      ? await runtimeApi.saveExpert(submitted)
      : await runtimeApi.validateExpert(submitted)
    message.value = save
      ? '草稿已保存'
      : result.valid
        ? '定义校验通过'
        : (result.errors ?? []).join('；')
    if (save) {
      baseline.value = submitted.manifest
      await load()
      original.value = JSON.parse(submitted.manifest) as ExpertDefinition
      emit('saved', (JSON.parse(submitted.manifest) as ExpertDefinition).id)
    }
  } catch (error) {
    message.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
async function refreshData() {
  try {
    await load()
    loadError.value = ''
  } catch (error) {
    loadError.value = errorMessage(error)
  }
  try {
    library.value = (await runtimeApi.knowledgeBases()).items
  } catch (error) {
    message.value = '知识库列表加载失败：' + errorMessage(error)
  }
  try {
    databaseLibrary.value = (await runtimeApi.databases()).items
  } catch (error) {
    message.value = '资料或能力目录加载失败：' + errorMessage(error)
  }
}
const activateOpen = ref(false)
const activateRefusal = ref('')
/**
 * 启用即授权，所以确认框里列的是**会获得的权限**，而不是一个动词；停用同理——它撤销的是这些授权。
 */
const activationImpact = computed(() => {
  const knowledge = selectedKnowledge.value.join('、') || '无'
  const databases = selectedDatabases.value.join('、') || '无'
  const tools = declaredMcpTools.value.join('、') || '无'
  return enabled.value
    ? [
        '停用后本专家不再运行，已授予的资料读取授权会被撤销。',
        `撤销知识库读取：${knowledge}`,
        `撤销脱敏数据库资料读取：${databases}`,
        `撤销 MCP 工具授权：${tools}`,
      ]
    : [
        `知识库读取：${knowledge}`,
        `脱敏数据库资料读取：${databases}`,
        `执行流程中声明的能力：${[...graphCapabilities.value].join('、') || '无'}`,
        `MCP 工具：${tools}（仅本专家可用，不向其他专家开放）`,
      ]
})

function askActivate() {
  activateRefusal.value = ''
  activateOpen.value = true
}

async function activate(value: boolean) {
  if (busy.value || dirty.value) return
  busy.value = true
  activateRefusal.value = ''
  try {
    await runtimeApi.activateExpert(id.value, value)
    await load()
    activateOpen.value = false
    message.value = value ? '专家已启用并获得所选资料读取授权' : '专家已停用，资料读取授权已撤销'
    emit('saved', id.value)
  } catch (error) {
    // 后端拒绝（例如流程引用了已停用的能力）时，原因留在对话框里，确认按钮保持原位但禁用。
    activateRefusal.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
defineExpose({ refresh: refreshData, guardLeave })
async function initialize() {
  if (initializing.value) return
  initializing.value = true
  await refreshData()
  if (!loadError.value) {
    const item = items.value.find((item) => item.id === props.expertId)
    if (item) applyDefinition(item)
    else if (!props.expertId) create()
    else loadError.value = t('expertWorkspace.notFound')
  }
  initializing.value = false
}
onMounted(initialize)
</script>
<template>
  <section class="expert-editor">
    <p v-if="initializing" role="status">{{ t('product.loading') }}</p>
    <Button v-if="loadError" :disabled="busy || initializing" @click="initialize">{{
      t('product.retry')
    }}</Button>
    <Feedback v-if="loadError" tone="error">{{ loadError }}</Feedback>
    <Button :disabled="busy" v-if="loadError" @click="emit('back')">{{ t('editor.back') }}</Button>
    <EditorWorkbench
      v-if="editing && !loadError"
      ref="frame"
      :resources-label="t('editor.resources')"
      :inspector-label="t('editor.properties')"
      :resize-label="t('editor.resize')"
      :close-label="t('editor.close')"
    >
      <template #header>
        <div class="manager-toolbar editor-heading">
          <div>
            <Button
              :disabled="busy"
              variant="link"
              data-testid="expert-back"
              @click="emit('back')"
              >{{ t('editor.back') }}</Button
            >
            <h1 tabindex="-1">{{ name || '新专家' }}</h1>
            <small>{{
              isBuiltin
                ? '内置模板 · 请复制后保存'
                : dirty
                  ? '草稿 · 有未保存修改'
                  : enabled
                    ? '已启用 · 读取授权已生效'
                    : '草稿 · 尚未启用运行'
            }}</small>
          </div>
          <div class="editor-actions">
            <Button variant="secondary" v-if="original" :disabled="busy" @click="copyExpert">
              复制为新专家</Button
            ><Button variant="secondary" :disabled="busy" @click="submit(false)">校验</Button
            ><Button
              variant="primary"
              :disabled="busy || isBuiltin || !id.trim() || !name.trim()"
              @click="submit(true)"
            >
              {{ busy ? '处理中…' : '保存草稿' }}
            </Button>
            <Button variant="secondary" v-if="dirty" :disabled="busy" @click="discardDraft">
              放弃修改
            </Button>
            <Button
              variant="secondary"
              v-if="!isBuiltin && states[id]"
              :disabled="busy || dirty"
              @click="askActivate"
            >
              {{ enabled ? '停用并撤销授权' : '启用并授权' }}
            </Button>
            <Button
              variant="secondary"
              v-if="enabled && !agentMode"
              :disabled="busy || dirty"
              @click="emit('run', id)"
            >
              进入运行工作台
            </Button>
          </div>
        </div>
      </template>
      <template #toolbar
        ><strong>{{
          t(agentMode ? 'expertWorkspace.agentBehavior' : 'expertWorkspace.flowTab')
        }}</strong></template
      >
      <template #resources>
        <template v-if="agentMode">
          <h3>{{ t('expertWorkspace.tools') }}</h3>
          <label v-for="tool in agentToolChoices" :key="tool">
            <Checkbox
              v-model="agentTools"
              :value="tool"
              :disabled="busy || tool === 'sql.parse' || disabledPlatform.includes(tool)"
            />{{ tool }}
          </label>

          <Button :disabled="busy" @click="showResources">{{ t('editor.agentResources') }}</Button>
        </template>
        <template v-else>
          <Tabs
            v-model="resourceTab"
            :label="t('editor.resources')"
            :tabs="[
              { id: 'library', label: t('editor.library') },
              { id: 'structure', label: t('editor.structure') },
            ]"
          />
          <template v-if="resourceTab === 'library'">
            <Input
              :disabled="busy"
              v-model="query"
              :aria-label="t('editor.search')"
              :placeholder="t('editor.search')"
            />
            <section v-for="group in filteredGroups" :key="group.label" class="node-library-group">
              <h3>{{ group.label }}</h3>
              <Panel v-for="item in group.options" :key="item.name" panel-class="node-library-item">
                <div class="node-library-card">
                  <strong>{{ item.title || item.name }}</strong
                  ><code>{{ item.name }}</code>
                  <small>{{
                    t(isExpertScoped(item.name) ? 'editor.declared' : 'editor.available')
                  }}</small>
                  <Button
                    :disabled="busy"
                    size="sm"
                    :data-testid="'node-add-' + item.name"
                    @click="addNode(item.name)"
                    >{{ t('editor.add') }}</Button
                  >
                </div>
              </Panel>
            </section>
            <EmptyState v-if="!filteredGroups.length">{{ t('editor.emptyLibrary') }}</EmptyState>
            <p v-if="disabledPlatform.length" class="hint">
              {{ t('editor.unavailable') }}: {{ disabledPlatform.join('、') }}
            </p>
          </template>
          <template v-else>
            <Tree
              v-model="selectedNode"
              :items="structure"
              :label="t('editor.structure')"
              @select="selectNode($event.id)"
            />
            <EmptyState v-if="!steps.length">{{ t('editor.emptyStructure') }}</EmptyState>
            <Button
              :disabled="busy"
              v-if="steps.length > 1 && !edges.length"
              @click="connectInOrder"
              >按当前排列串联</Button
            >
          </template>
        </template>
      </template>
      <div v-if="agentMode" class="eap-panel property-panel">
        <h3>{{ t('expertWorkspace.agentBehavior') }}</h3>
        <p>{{ t('expertWorkspace.agentHint') }}</p>
        <label
          >{{ t('expertAgent.question')
          }}<Textarea
            :disabled="busy"
            ref="goalInput"
            v-model="agentGoal"
            :maxlength="8000"
            data-testid="expert-agent-goal"
        /></label>
        <p>{{ t('expertWorkspace.budget') }}</p>
      </div>

      <div v-else class="flow-workspace" data-testid="expert-flow-workspace">
        <h2 class="canvas-title">流程画布</h2>
        <WorkflowCanvas
          ref="graphCanvas"
          v-model:selected="selectedNode"
          :nodes="steps"
          :edges="edges"
          @select="selectNode($event, false)"
        />
        <EmptyState v-if="!steps.length">{{ t('editor.emptyStructure') }}</EmptyState>
      </div>
      <template #inspector>
        <Tabs
          v-if="!agentMode"
          v-model="inspectorTab"
          :label="t('editor.properties')"
          :tabs="[
            { id: 'settings', label: t('editor.settings') },
            { id: 'node', label: t('editor.node') },
          ]"
        />
        <template v-if="!agentMode && inspectorTab === 'node'">
          <div v-if="selectedStep" class="property-panel">
            <h3>节点属性</h3>
            <template v-if="selectedStep"
              ><small>节点标识：{{ selectedStep.id }}</small
              ><label>显示名称<Input :disabled="busy" v-model="selectedStep.label" /></label
              ><label
                >调用能力<Input
                  :disabled="busy"
                  v-model="selectedStep.capability"
                  placeholder="sql.parse" /></label
              ><small v-if="isExpertScoped(selectedStep.capability)" class="requirement-line">
                专家级能力：不会全局启用，只在本专家本次执行的会话内调用；移除授权后该节点会一并移除。 </small
              ><label
                ><Checkbox :disabled="busy" v-model="selectedStep.required" />
                失败时阻止后续执行</label
              ><Button :disabled="busy" variant="secondary" @click="removeNode"
                >移除节点及连线</Button
              ></template
            >
          </div>

          <EmptyState v-if="!selectedStep">{{ t('editor.noSelection') }}</EmptyState>
        </template>
        <template v-else>
          <Tabs
            v-model="configTab"
            :label="t('expertWorkspace.configSections')"
            :tabs="configTabs"
          />
          <Panel v-if="configTab === 'basic'"
            ><div class="expert-config-section">
              <h3>专家信息</h3>
              <label
                >标识<Input
                  v-model="id"
                  :disabled="busy || (!!original && id === original.id)"
                  placeholder="sql-reviewer" /></label
              ><label>名称<Input :disabled="busy" v-model="name" /></label>
              <Collapse>
                <template #summary>由草稿生成的 Manifest（只读）</template>
                <p class="hint">
                  这段清单由当前草稿即时生成，不是固定样例：它与画布、授权区和规则包引用读的是同一份状态，
                  所以不可能声明编辑器里没有的东西。保存时提交给后端的就是它。
                </p>
                <pre>{{ definition().manifest }}</pre>
              </Collapse>
            </div></Panel
          >
          <Panel v-if="configTab === 'resources'"
            ><div class="expert-config-section">
              <h3>知识库配置</h3>
              <EmptyState v-if="!library.length && !selectedKnowledge.length">{{
                t('expertWorkspace.noKnowledge')
              }}</EmptyState>
              <div v-else class="choice-list">
                <label v-for="base in library" :key="base.id"
                  ><Checkbox :disabled="busy" v-model="selectedKnowledge" :value="base.id" />{{
                    base.name
                  }}</label
                ><label
                  v-for="base in selectedKnowledge.filter(
                    (key) => !library.some((item) => item.id === key),
                  )"
                  :key="base"
                  ><Checkbox :disabled="busy" v-model="selectedKnowledge" :value="base" />{{
                    base
                  }}（未加载的定义引用）</label
                >
              </div>
              <small>保存只登记引用；点击启用并授权后，运行时才允许读取所选知识库。</small>
              <h3>数据库资料授权</h3>
              <EmptyState v-if="!databaseLibrary.length">{{
                t('expertWorkspace.noDatabases')
              }}</EmptyState>
              <div v-else class="choice-list">
                <label v-for="profile in databaseLibrary" :key="profile.id"
                  ><Checkbox :disabled="busy" v-model="selectedDatabases" :value="profile.id" />{{
                    profile.label
                  }}</label
                >
              </div>
              <small>仅授权读取人工登记的脱敏快照，不授权连接或执行业务数据库。</small>
            </div></Panel
          >
          <Panel v-if="configTab === 'rules'"
            ><div class="expert-config-section">
              <h3>规则配置</h3>
              <div class="choice-list">
                <label v-for="rule in ruleChoices" :key="rule.id"
                  ><Checkbox
                    v-model="selectedRules"
                    :value="rule.id"
                    :disabled="busy || rule.id === 'database.credentials.never-expose'"
                  />{{ rule.name }}</label
                >
                <label
                  v-for="rule in selectedRules.filter(
                    (key) => !ruleChoices.some((item) => item.id === key),
                  )"
                  :key="rule"
                  ><Checkbox :disabled="busy" v-model="selectedRules" :value="rule" />{{
                    rule
                  }}</label
                >
              </div>
              <small
                >运行时强制检查凭据保护和资料读取范围；模型建议未通过语义或性能验证，不会自动执行。</small
              >
              <h3>规则包（专家判定依据）</h3>
              <div class="choice-list">
                <label v-for="pack in rulePackChoices" :key="pack.id" class="pack-choice"
                  ><Checkbox :disabled="busy" v-model="selectedRulePacks" :value="pack.id" />
                  <span
                    >{{ pack.name }}
                    <span class="hint"
                      >· {{ pack.ruleCount }} 条规则{{ pack.shipped ? ' · 内置' : '' }}</span
                    >
                    <small class="requirement-line">
                      需要能力：{{
                        pack.requires.length
                          ? pack.requires.join('、')
                          : '未声明（该包无法通过校验）'
                      }}
                    </small></span
                  ></label
                >
                <p v-if="!rulePackChoices.length" class="hint">
                  没有可引用的规则包。请先到「规则库」复制或新建一个规则包；未引用规则包的专家只做解析与事实抽取。
                </p>
              </div>
              <Feedback tone="error" v-if="missingCapabilities.length">
                所选规则包需要能力 <b>{{ missingCapabilities.join('、') }}</b
                >，但专家未声明这些能力：这些规则依赖的事实不会被产出。请补充能力，或取消勾选该规则包。
              </Feedback>
              <small
                >规则包决定该专家命中哪些检查、严重级、证据与建议，并决定何时把压缩后的证据提交给模型；规则本身是数据，可在「规则库」中编辑与试算。规则包所需能力必须包含在专家的工具或流程节点中，启用时后端会再次校验。</small
              >
            </div></Panel
          >
          <Panel v-if="configTab === 'tools' && !agentMode"
            ><div class="expert-config-section">
              <h3>MCP 工具授权（专家级能力）</h3>
              <p class="hint">
                MCP
                工具不会被平台全局启用：只有这里声明、并在启用时授权的工具，才会成为本专家的节点，且调用发生在
                本专家本次执行自己的会话里。平台未登记或未信任的服务器不会出现在可选项里。
              </p>
              <div class="choice-list">
                <label v-for="tool in declaredMcpTools" :key="tool"
                  ><Checkbox :disabled="busy" :model-value="true" @change="removeMcpTool(tool)" />
                  <span class="mono">{{ tool }}</span></label
                >
                <p v-if="!declaredMcpTools.length" class="hint">未授权任何 MCP 工具。</p>
              </div>
              <div class="form-actions">
                <Select
                  v-model="mcpToolToGrant"
                  aria-label="选择要授权的 MCP 工具"
                  :disabled="busy || !mcpToolChoices.length"
                >
                  <option v-for="tool in mcpToolChoices" :key="tool" :value="tool">
                    {{ tool }}
                  </option>
                </Select>
                <Button
                  variant="secondary"
                  :disabled="busy || !mcpToolChoices.length"
                  @click="addMcpTool"
                >
                  授权该工具
                </Button>
              </div>
              <p v-if="!mcpServers.length" class="hint">
                当前没有登记任何 MCP 服务器，因此没有工具可授权（平台专家级能力
                {{ expertScopedCapabilities.length }} 项）。这是如实状态，不是错误。
              </p>
              <div v-else class="choice-list">
                <p v-for="server in mcpServers" :key="server.id" class="hint">
                  <b>{{ server.name }}</b> <span class="mono">{{ server.id }}</span> ·
                  {{ server.trusted && server.enabled ? '已启用并信任' : '未启用或未信任' }} ·
                  工具：<span class="mono">{{ server.tools.join('、') || '无' }}</span>
                </p>
              </div>
              <Feedback tone="error" v-if="unknownDeclaredTools.length">
                清单声明的工具 <b>{{ unknownDeclaredTools.join('、') }}</b> 未在任何已启用并信任的
                MCP 服务器中发布：清单不能凭名字让一个服务器存在。
              </Feedback>
              <Feedback tone="error" v-if="undeclaredScopedNodes.length">
                节点 <b>{{ undeclaredScopedNodes.map((step) => step.id).join('、') }}</b>
                使用了专家级能力但未声明授权，保存会被拒绝。请在上方授权对应工具，或移除该节点。
              </Feedback>
            </div></Panel
          >

          <p class="hint">{{ t('expertWorkspace.saveHint') }}</p>
        </template>
      </template>
      <template #status>
        <Feedback v-if="message" data-testid="expert-editor-message">{{ message }}</Feedback>
        <Collapse v-if="issues.length" :open="validationAttempted"
          ><template #summary>{{ t('editor.issues') }} ({{ issues.length }})</template>
          <div v-for="issue in issues" :key="issue.target + issue.text" class="editor-issue">
            <span>{{ issue.text }}</span
            ><Button :disabled="busy" size="sm" @click="locateIssue(issue)">{{
              t('editor.locate')
            }}</Button>
          </div>
        </Collapse>
      </template>
    </EditorWorkbench>
    <ConfirmBox
      v-if="activateOpen"
      :title="enabled ? `停用专家 ${id} 并撤销授权？` : `启用专家 ${id} 并授权？`"
      :impact="activationImpact"
      :confirm-label="enabled ? '停用并撤销授权' : '启用并授权'"
      :danger="enabled"
      :busy="busy"
      :refusal="activateRefusal"
      @confirm="activate(!enabled)"
      @cancel="
        () => {
          activateOpen = false
          activateRefusal = ''
        }
      "
    />
  </section>
</template>
<style scoped>
.expert-editor {
  height: 100%;
  min-height: 0;
}

.editor-heading {
  gap: 12px;
  width: 100%;
}

.editor-heading h1 {
  margin: 0;
  font-size: 20px;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.flow-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.canvas-title {
  margin: 0;
  font-size: 15px;
}

.expert-config-section,
.node-library-card,
.node-library-group {
  display: grid;
  gap: 12px;
  align-content: start;
  min-width: 0;
}

.expert-config-section > label {
  display: grid;
  gap: 8px;
}

.node-library-item {
  padding: 12px;
}

.node-library-card {
  gap: 8px;
}

.node-library-card code {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.node-library-group h3 {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
}

.editor-issue {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

pre {
  max-width: 100%;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
