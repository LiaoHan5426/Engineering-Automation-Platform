import {
  runtimeApi,
  type CapabilityItem,
  type CapabilityKindSummary,
  type SqlAnalysis,
  type SqlFinding,
  type TaskResult,
  type TaskStatistics,
} from '@eap/runtime-client'
import { computed, ref, watch } from 'vue'
import { errorMessage, statusLabel } from '../../lib/presentation'
import { describeSecret } from '../../lib/sensitive'
import { decisionText, modelEnhancementText } from './analysisLabels'
import {
  DEFAULT_WORKSPACE,
  TASK_TAGS_KEY,
  WORKSPACE_KEY,
  WORKSPACES_KEY,
  readList,
  readStore,
  readTags,
  writeStore,
} from './consoleWorkspaceStore'

export type RegisteredExpert = {
  id: string
  name: string
  databaseProfiles?: string[]
  steps?: Array<{ capability: string }>
}

/** 任务列表的状态筛选。空串 = 不筛。 */
export const TASK_STATUS_FILTERS = [
  { value: 'completed', label: '已完成' },
  { value: 'needs-planning', label: '待规划' },
  { value: 'failed', label: '执行失败' },
]

function timeNow() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 分析工作台的状态与动作，以及它读取的运行时目录（能力、专家、数据库资料、任务、统计、健康）。
 * 顶栏状态、概览、任务流、检查器与状态栏共享同一份实例。
 */
export function createAnalysisWorkbench(options: {
  /** 顶栏主按钮总是落到分析工作台。 */
  openWorkbench: () => void
  /** 全量刷新后重读当前打开的管理页。 */
  reloadActive: () => Promise<void>
}) {
  const runtimeStatus = ref('检测中')
  const refreshing = ref(false)
  const errors = ref<Record<string, string>>({})
  const capabilities = ref<string[]>([])
  const capabilityItems = ref<CapabilityItem[]>([])
  const capabilityKinds = ref<CapabilityKindSummary[]>([])
  const expertCount = ref(0)
  const expertStates = ref<Record<string, { enabled: boolean; builtin: boolean }>>({})
  const registeredExperts = ref<RegisteredExpert[]>([])
  const databaseInfo = ref<
    Array<{
      id: string
      label: string
      engine: string
      environment: string
      credentialsExposed: boolean
    }>
  >([])
  const lastRefresh = ref('')
  const stats = ref<TaskStatistics | null>(null)
  const statsError = ref('')
  const inspectorOpen = ref(false)

  const history = ref<TaskResult[]>([])
  const task = ref<TaskResult | null>(null)
  const goal = ref('')
  const taskBusy = ref(false)
  const taskError = ref('')
  const taskStatusFilter = ref('')
  const composerGoal = ref<{
    focus: () => void
    scrollIntoView: (options?: ScrollIntoViewOptions) => void
  } | null>(null)

  const searchPattern = ref('')
  const selectedExpert = ref('')
  const selectedDatabase = ref('')
  const explainText = ref('')
  const enhanceModel = ref(false)
  const sql = ref('')
  const sqlResult = ref<SqlAnalysis | null>(null)
  const sqlBusy = ref(false)
  const sqlError = ref('')
  const selectedFinding = ref<SqlFinding | null>(null)

  const workspace = ref(readStore(WORKSPACE_KEY, DEFAULT_WORKSPACE))
  const knownWorkspaces = ref<string[]>(readList(WORKSPACES_KEY))
  const taskTags = ref<Record<string, string>>(readTags())
  const workspaceMessage = ref('')

  /** 决策阶段的展开说明；「跳过模型」必须能说出为什么，而不是只显示一个词。 */
  const decisionOpen = ref(false)
  const supplement = ref('')
  const supplementMessage = ref('')
  const ignoredFindings = ref<string[]>([])
  const rewriteOpen = ref(false)
  function toggleRewrite() {
    rewriteOpen.value = !rewriteOpen.value
  }
  const inspectorMessage = ref('')
  const rerunBusy = ref(false)

  const workspaceOptions = computed(() => [
    ...new Set([
      DEFAULT_WORKSPACE,
      ...knownWorkspaces.value,
      ...Object.values(taskTags.value),
      workspace.value,
    ]),
  ])
  /** 本机标注过的执行才属于当前工作空间；未标注的归入默认工作空间。 */
  const visibleHistory = computed(() =>
    history.value.filter(
      (entry) => (taskTags.value[entry.id] ?? DEFAULT_WORKSPACE) === workspace.value,
    ),
  )
  /** 任务列表 = 当前工作空间 + 状态筛选。筛选只作用在列表上，不改动任务本身。 */
  const filteredHistory = computed(() =>
    taskStatusFilter.value
      ? visibleHistory.value.filter((entry) => entry.status === taskStatusFilter.value)
      : visibleHistory.value,
  )
  /** 「＋ 新的分析」把光标送回输入框：这是使用界面里唯一需要滚动的跳转。 */
  function focusComposer() {
    try {
      composerGoal.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      /* 无 scrollIntoView（SSR / 旧环境）时退化为直接聚焦 */
    }
    composerGoal.value?.focus()
  }
  /** 清空本次输入。它只清输入，不动已经产生的任务记录——那些是历史，不该被一个按钮抹掉。 */
  function clearComposer() {
    goal.value = ''
    sql.value = ''
    searchPattern.value = ''
    explainText.value = ''
    selectedDatabase.value = ''
    sqlResult.value = null
    selectedFinding.value = null
    sqlError.value = ''
  }
  const enabledExpertCount = computed(
    () => Object.values(expertStates.value).filter((state) => state.enabled).length,
  )
  const disabledCapabilityCount = computed(
    () => capabilityItems.value.filter((item) => item.disabled).length,
  )
  /** 概览「模型调用占比」：null 表示还没有记录了模型走向的执行，不是 0%。 */
  const modelShareText = computed(() => {
    const share = stats.value?.model.share ?? null
    return share === null ? '尚无记录' : `${Math.round(share * 100)}%`
  })
  const deterministicCoverageText = computed(() => {
    const share = stats.value?.deterministicShare ?? null
    return share === null ? '尚无记录' : `${Math.round(share * 100)}%`
  })
  /** 近 N 日实际发生了什么——决策与状态的分布，来自同一份统计，不是设计意图。 */
  const windowDistribution = computed(() => {
    const source = stats.value
    if (!source) return ''
    const decisions = Object.entries(source.byDecision).map(
      ([key, count]) => `${statusLabel(key)} ${count}`,
    )
    const statuses = Object.entries(source.byStatus).map(
      ([key, count]) => `${statusLabel(key)} ${count}`,
    )
    return [
      decisions.length ? '决策 ' + decisions.join('、') : '',
      statuses.length ? '状态 ' + statuses.join('、') : '',
    ]
      .filter(Boolean)
      .join(' · ')
  })

  const allowedDatabases = computed(() =>
    databaseInfo.value.filter((profile) =>
      registeredExperts.value
        .find((expert) => expert.id === selectedExpert.value)
        ?.databaseProfiles?.includes(profile.id),
    ),
  )
  const findings = computed<SqlFinding[]>(
    () => sqlResult.value?.deterministicAnalysis?.findings ?? [],
  )
  const selectedExpertDef = computed(() =>
    registeredExperts.value.find((expert) => expert.id === selectedExpert.value),
  )
  const needsPattern = computed(() =>
    selectedExpertDef.value?.steps?.some((step) => step.capability === 'rg-search'),
  )
  const decision = computed(() => sqlResult.value?.modelAdvisor?.decision ?? 'unavailable')
  /**
   * 任务流显示哪一种内容，由「选中任务」与「本次会话的分析结果」共同决定：
   * - 选中的任务就是刚才那次分析（同一个 id）→ 回放完整报表（历史接口只返回摘要，报表只在会话里有）；
   * - 选中的是本地能力任务 → 回放它的请求与工具观测；
   * - 什么都没选 → 空态，把人引向左栏或底部输入框。
   */
  const streamMode = computed<'empty' | 'task' | 'report'>(() => {
    if (sqlResult.value && (!task.value || task.value.id === sqlResult.value.id)) return 'report'
    if (task.value) return 'task'
    return 'empty'
  })
  /** Task-scoped SQL evidence strip — never a chat SessionPanel or settings overview. */
  const sqlEvidence = computed(() => {
    if (streamMode.value === 'empty') {
      return { mode: 'empty' as const }
    }
    if (streamMode.value === 'report' && sqlResult.value) {
      const result = sqlResult.value
      return {
        mode: 'report' as const,
        id: result.id,
        status: statusLabel(result.status),
        findings: result.deterministicAnalysis?.findings?.length ?? 0,
        model: modelEnhancementText(result.modelEnhancement),
        observations: null as number | null,
      }
    }
    const current = task.value
    if (!current) return { mode: 'empty' as const }
    return {
      mode: 'task' as const,
      id: current.id,
      status: statusLabel(current.status),
      findings: null as number | null,
      model: modelEnhancementText(current.modelEnhancement),
      observations: current.observations?.length ?? 0,
    }
  })
  const compression = computed(() => sqlResult.value?.modelAdvisor?.preprocessing)
  const blockedRules = computed(() => sqlResult.value?.deterministicAnalysis?.blockedRules ?? [])
  const rulePackRequirements = computed(() => sqlResult.value?.rulePackRequirements ?? [])
  /** "5 内置命令 · 3 本地 CLI" — capability kinds summarised for the overview metric. */
  const kindSummary = computed(() => {
    const parts = capabilityKinds.value
      .filter((kind) => kind.count > 0)
      .map((kind) => `${kind.count} ${kind.label}`)
    const scoped = capabilityItems.value.filter((item) => item.expertScoped).length
    if (scoped) parts.push(`${scoped} 专家级`)
    return parts.length ? parts.join(' · ') : '本地确定性能力'
  })

  watch(selectedExpert, () => {
    selectedDatabase.value = ''
    searchPattern.value = ''
    sqlResult.value = null
    selectedFinding.value = null
  })

  async function refresh(reloadActive = true) {
    if (refreshing.value) return
    refreshing.value = true
    errors.value = {}
    const jobs: Array<[string, () => Promise<void>]> = [
      [
        'health',
        async () => {
          const health = await runtimeApi.health()
          runtimeStatus.value = health.status === 'ok' ? '已连接' : '服务降级'
        },
      ],
      [
        'capabilities',
        async () => {
          const catalog = await runtimeApi.capabilities()
          capabilities.value = catalog.capabilities
          capabilityItems.value = catalog.items ?? []
          capabilityKinds.value = catalog.kinds ?? []
        },
      ],
      [
        'databases',
        async () => {
          databaseInfo.value = (await runtimeApi.databases()).items
        },
      ],
      [
        'experts',
        async () => {
          const response = await runtimeApi.experts()
          expertCount.value = response.items.length
          expertStates.value = response.states ?? {}
          registeredExperts.value = response.items
            .map((text) => JSON.parse(text))
            .filter((expert) => response.states?.[expert.id]?.enabled)
          if (!registeredExperts.value.some((expert) => expert.id === selectedExpert.value)) {
            selectedExpert.value = registeredExperts.value[0]?.id ?? ''
          }
        },
      ],
      [
        'tasks',
        async () => {
          history.value = (await runtimeApi.tasks()).items
        },
      ],
      // 概览的两个窗口数字来自运行时，而不是页面上写死的样本；取不到时如实报错，不退回占位值。
      [
        'stats',
        async () => {
          stats.value = await runtimeApi.stats()
          statsError.value = ''
        },
      ],
    ]
    await Promise.all(
      jobs.map(async ([key, work]) => {
        try {
          await work()
        } catch (error) {
          errors.value[key] = errorMessage(error)
          if (key === 'health') runtimeStatus.value = '未连接'
          if (key === 'stats') statsError.value = errorMessage(error)
        }
      }),
    )
    if (reloadActive) await options.reloadActive()
    lastRefresh.value = timeNow()
    refreshing.value = false
  }

  /** 一次执行结束后只重读任务与统计：它们是刚才这次运行真正改变的东西。 */
  async function refreshTasks() {
    try {
      history.value = (await runtimeApi.tasks()).items
      stats.value = await runtimeApi.stats()
      statsError.value = ''
    } catch (error) {
      statsError.value = errorMessage(error)
    }
    lastRefresh.value = timeNow()
  }

  function switchWorkspace(id: string) {
    workspace.value = id
    writeStore(WORKSPACE_KEY, id)
    const count = history.value.filter(
      (entry) => (taskTags.value[entry.id] ?? DEFAULT_WORKSPACE) === id,
    ).length
    workspaceMessage.value =
      count > 0
        ? `已切换到工作空间 ${id}：本机标注在该空间的执行有 ${count} 条。`
        : `已切换到工作空间 ${id}：还没有标注在该空间的执行。` +
          '任务在服务端不按工作空间分表，所以这里只过滤控制台本机标注过的运行；' +
          '本地执行目录请在「运行环境 → 桌面外壳 → 本地工作空间」查看（该页尚未在应用中实现）。'
  }

  /**
   * 新建一个「本机视图」工作空间。
   *
   * 它必须被持久化在已知列表里：只靠「标注过的执行」推导选项时，一个刚建好、还没有执行的
   * 工作空间会在切走后消失——那会看起来像是控制台把它弄丢了。
   */
  function addWorkspace(name: string) {
    if (!knownWorkspaces.value.includes(name)) {
      knownWorkspaces.value = [...knownWorkspaces.value, name]
      writeStore(WORKSPACES_KEY, JSON.stringify(knownWorkspaces.value))
    }
    switchWorkspace(name)
  }

  function tagTask(id: string) {
    taskTags.value = { ...taskTags.value, [id]: workspace.value }
    writeStore(TASK_TAGS_KEY, JSON.stringify(taskTags.value))
  }

  const canAnalyze = computed(
    () => !!sql.value.trim() || !!goal.value.trim() || !!searchPattern.value.trim(),
  )
  /**
   * 顶栏的主按钮与 分析工作台是同一个动作——不是两个行为相近的入口。
   * 没有可分析的内容时它必须说出来，而不是安静地什么都不做。
   */
  function primaryAction() {
    options.openWorkbench()
    if (!canAnalyze.value) {
      sqlError.value = '还没有可分析的内容：请在 分析工作台填写业务问题、SQL 或本地检索目标。'
      return
    }
    void analyzeSql()
  }

  /** 重新运行 = 用同样的目标再提交一次：新增一条记录，旧记录与它的证据保持原样。 */
  async function rerunTask(entry: TaskResult) {
    if (rerunBusy.value) return
    rerunBusy.value = true
    taskError.value = ''
    try {
      const rerun = await runtimeApi.createTask(entry.goal)
      tagTask(rerun.id)
      await refreshTasks()
      task.value = rerun
      workspaceMessage.value = ''
    } catch (error) {
      taskError.value = errorMessage(error)
    } finally {
      rerunBusy.value = false
    }
  }

  async function submitTask() {
    if (taskBusy.value || !goal.value.trim()) return
    taskBusy.value = true
    taskError.value = ''
    task.value = null
    try {
      task.value = await runtimeApi.createTask(goal.value)
      tagTask(task.value.id)
      history.value = [task.value, ...history.value.filter((t) => t.id !== task.value!.id)]
      void refreshTasks()
    } catch (error) {
      taskError.value = errorMessage(error)
    } finally {
      taskBusy.value = false
    }
  }

  async function selectHistory(entry: TaskResult) {
    if (taskBusy.value) return
    taskBusy.value = true
    taskError.value = ''
    task.value = null
    try {
      task.value = await runtimeApi.task(entry.id)
    } catch (error) {
      taskError.value = errorMessage(error)
    } finally {
      taskBusy.value = false
    }
  }

  async function analyzeSql() {
    if (sqlBusy.value) return
    if (!canAnalyze.value) {
      sqlError.value = '请先填写业务问题、SQL 或本地检索目标。'
      return
    }
    // 运行时会在服务端拒绝含凭据的字段；在这里先拒绝，是为了能指出**哪一个字段**、以及它看起来是什么。
    const fields: Array<[string, string]> = [
      ['SQL', sql.value],
      ['业务问题', goal.value],
      ['本地检索目标', searchPattern.value],
    ]
    for (const [label, value] of fields) {
      const reason = describeSecret(value)
      if (reason) {
        sqlError.value = `${label}里含有${reason}。平台不接收凭据，请改用环境变量或凭据存储。`
        return
      }
    }
    sqlBusy.value = true
    sqlError.value = ''
    sqlResult.value = null
    selectedFinding.value = null
    inspectorMessage.value = ''
    rewriteOpen.value = false
    ignoredFindings.value = []
    decisionOpen.value = false
    supplementMessage.value = ''
    try {
      let plan: Record<string, unknown> | undefined
      if (explainText.value.trim()) {
        const parsed = JSON.parse(explainText.value)
        plan = Array.isArray(parsed) ? parsed[0] : parsed
        if (!plan || typeof plan !== 'object' || Array.isArray(plan))
          throw new Error('执行计划需要是 JSON 对象或 PostgreSQL EXPLAIN JSON 数组')
      }
      const result = await runtimeApi.analyzeSql(sql.value, goal.value, {
        expertId: selectedExpert.value,
        databaseId: selectedDatabase.value || undefined,
        explainPlan: plan,
        enhanceWithModel: enhanceModel.value,
        pattern: searchPattern.value || undefined,
      })
      sqlResult.value = result
      selectedFinding.value = null
      // 本次会话的报表要显示出来：清掉「选中的历史任务」，否则同屏会停在上一条任务的过程回放上。
      task.value = null
      // 这次执行和 /api/tasks 里那条记录是同一个 id（运行时用同一个 id 持久化）。
      if (result.id) tagTask(result.id)
      void refreshTasks()
    } catch (error) {
      sqlError.value = errorMessage(error)
    } finally {
      sqlBusy.value = false
    }
  }

  /**
   * 补充上下文 = 把新上下文并入目标后再执行一次。
   *
   * 运行时没有 "supplement" 资源，所以这不是就地改写历史，而是再一次
   * `POST /api/experts/{id}/execute`：旧记录（含其中「未判定」的规则）原样保留，便于对比。控制台如实说明
   * 这一点，而不是把它画成一个会覆盖上一条结果的按钮。
   */
  async function applySupplement() {
    const text = supplement.value.trim()
    if (!text) {
      supplementMessage.value = '请先填写要补充的上下文。'
      return
    }
    const reason = describeSecret(text)
    if (reason) {
      supplementMessage.value = `补充内容里含有${reason}。运行时会拒绝它，请改用环境变量或凭据存储。`
      return
    }
    goal.value = [goal.value.trim(), text].filter(Boolean).join('\n\n')
    supplement.value = ''
    await analyzeSql()
    supplementMessage.value = sqlError.value
      ? '补充上下文后重新执行失败：' + sqlError.value
      : '已把补充上下文并入目标并重新执行了一次（POST /api/experts/{id}/execute）。上一条记录与它的证据保持原样，便于对照。'
  }

  async function copyResult() {
    if (!sqlResult.value) return
    try {
      await navigator.clipboard.writeText(
        [...(sqlResult.value.advice ?? []), sqlResult.value.expertAdvice ?? ''].join('\n\n'),
      )
      return true
    } catch {
      return false
    }
  }

  /**
   * 决策阶段为什么这么走。
   *
   * 「跳过模型」是这套平台最值得解释的一句话，所以它能被点开：结论、理由、提供方与耗时都来自
   * `modelAdvisor`。没有到决策阶段时也要说清楚是在哪里停下的，而不是留一个空阶段。
   */
  const decisionExplanation = computed(() => {
    const advisor = sqlResult.value?.modelAdvisor
    if (!advisor) {
      return {
        title: '本次没有到决策阶段',
        lines: [
          '决策阶段只在确定性解析通过之后运行；解析未通过或必需节点失败时，流程在更早的地方就停下了。',
          `本次状态：${sqlResult.value ? statusLabel(sqlResult.value.status) : '尚未分析'}`,
        ],
      }
    }
    const lines: string[] = []
    if (advisor.rationale) lines.push(advisor.rationale)
    if (advisor.decision === 'skip')
      lines.push('跳过不是省事：确定性证据已经足以判定，调用模型只会增加成本与不确定性。')
    if (advisor.attempted === false) lines.push('本次没有尝试调用模型。')
    if (advisor.provider || advisor.model)
      lines.push(`提供方 ${advisor.provider ?? '—'} · 模型 ${advisor.model ?? '—'}`)
    if (advisor.latencyMs !== undefined)
      lines.push(
        `耗时 ${advisor.latencyMs} ms · 提示 ${advisor.promptTokens ?? '—'} / 补全 ${advisor.completionTokens ?? '—'} tokens`,
      )
    return { title: decisionText(advisor.decision ?? 'unavailable'), lines }
  })

  function isFindingIgnored(code: string) {
    return ignoredFindings.value.includes(code)
  }

  /**
   * 标记忽略只记录操作者在这一条发现上的判断：发现本身留在列表里（带标记，不删除），
   * 也绝不修改规则包 —— 否则「这条我看过了」会变成「这条不存在」。
   */
  function toggleFindingIgnored(finding: SqlFinding) {
    ignoredFindings.value = isFindingIgnored(finding.code)
      ? ignoredFindings.value.filter((code) => code !== finding.code)
      : [...ignoredFindings.value, finding.code]
    inspectorMessage.value = isFindingIgnored(finding.code)
      ? `已标记忽略 ${finding.code}：只影响本次查看，规则包与证据都没有改动。`
      : `已取消 ${finding.code} 的忽略标记。`
  }

  async function copyFindingAdvice(finding: SqlFinding) {
    try {
      await navigator.clipboard.writeText(finding.suggestion)
      inspectorMessage.value = '建议已复制（语义保持，未执行）'
    } catch {
      inspectorMessage.value = '复制失败，请手动选择建议文本复制'
    }
  }

  function selectFinding(finding: SqlFinding) {
    selectedFinding.value = finding
    inspectorOpen.value = true
    rewriteOpen.value = false
    inspectorMessage.value = ''
  }

  return {
    runtimeStatus,
    refreshing,
    errors,
    capabilities,
    capabilityItems,
    expertCount,
    registeredExperts,
    lastRefresh,
    stats,
    statsError,
    inspectorOpen,
    history,
    task,
    goal,
    taskBusy,
    taskError,
    taskStatusFilter,
    composerGoal,
    searchPattern,
    selectedExpert,
    selectedDatabase,
    explainText,
    enhanceModel,
    sql,
    sqlResult,
    sqlBusy,
    sqlError,
    selectedFinding,
    workspace,
    workspaceMessage,
    workspaceOptions,
    decisionOpen,
    supplement,
    supplementMessage,
    rewriteOpen,
    toggleRewrite,
    inspectorMessage,
    rerunBusy,
    filteredHistory,
    focusComposer,
    clearComposer,
    enabledExpertCount,
    disabledCapabilityCount,
    modelShareText,
    deterministicCoverageText,
    windowDistribution,
    allowedDatabases,
    findings,
    needsPattern,
    decision,
    streamMode,
    sqlEvidence,
    compression,
    blockedRules,
    rulePackRequirements,
    kindSummary,
    refresh,
    switchWorkspace,
    addWorkspace,
    canAnalyze,
    primaryAction,
    rerunTask,
    submitTask,
    selectHistory,
    applySupplement,
    copyResult,
    decisionExplanation,
    isFindingIgnored,
    toggleFindingIgnored,
    copyFindingAdvice,
    selectFinding,
  }
}

export type AnalysisWorkbench = ReturnType<typeof createAnalysisWorkbench>
