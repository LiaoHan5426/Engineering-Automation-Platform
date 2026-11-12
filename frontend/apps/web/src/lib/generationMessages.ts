export const generationMessages = {
  'zh-CN': {
    pendingTask: '有一份任务草稿待采用。当前输入未改，也没有发送；确认后整体带入任务及原型。',
    title: '生成前快照',
    missing: '未关联生成前持久快照（旧记录或模拟候选）。',
    'generation-task-stale':
      '任务或原型版本已变化。草稿和旧绑定保留，请回看板核对后显式采用新版本；不会自动更新版本或重试。',
    'generation-task-blocked':
      '任务尚未准备完整或已有执行/未知应用。草稿保留，请回看板核对阻塞原因。',
    'generation-task-mock':
      '模拟服务不生成持久任务绑定证据。草稿保留；可显式移除绑定后仅演示普通对话。',
    adoptTask: '采用任务草稿并新建对话',
    adoptTaskImpact:
      '整体采用任务文本、版本身份及原型；当前未发送草稿将被替换，不自动发送。目标文件需明确填写；服务端会再次核对任务版本。',
    taskBinding: '生成前任务绑定',
    continueDelivery: '继续验证与交付',
    applicationDetails: '查看应用记录详情',
    taskLinkFailed: '无法打开关联任务。请核对项目和任务是否仍然可用，然后重新读取。',
    taskLinkRetry: '重新读取关联任务',
    prebound: '生成前已绑定任务',
    deliveryNext:
      '应用源码后，请回看板运行独立验证并提交源码证据；生成或应用成功不会自动接受交付。',
    removeTask: '移除任务绑定（保留草稿）',
    target: '唯一生成目标',
    components: '关联页面与资源（每行一个路径，最多 7 个）',
    dependencies: '查看文件依赖',
    dependencyKind: {
      MODULE: '立即加载',
      LAZY_MODULE: '按需加载',
      STYLESHEET: '样式导入',
    },
    componentsHelp:
      '可选路由模块、Vue 页面、本地 CSS 和 JSON。支持明确路径的按需加载；所有依赖须选定、连通且无循环。留空即单文件。',
    captured: '采集时间',
    prototype: '来源原型',
    targetPlaceholder: '仓库相对路径，例如 frontend/apps/web/src/Example.vue',
    targetHelp: '无需关联原型。只生成此入口与明确选择的关联文件；附件不会自动成为目标。',
    absent: '目标不存在（新增文件）',
    'generation-too-large':
      '候选超过完整响应或源码内容上限，已拒绝，不会应用截断内容。草稿保留，请缩小需求范围。',
    boundary: '此记录只证明生成前的输入基线，不代表写入、测试或人工验收。',
    'generation-stale':
      '生成期间目标源码已变化，候选已拒绝，当前修改和草稿保留。请核对源码后显式重新生成。',
    'generation-blocked':
      '生成需要明确的单个目标及完整可读取的源码。请检查目标路径；额外文件不会被自动授权。',
    'generation-unavailable':
      '无法保存或读取生成前上下文，已阻止继续生成。草稿保留，请核对本地服务后再试。',
    retry: '核对源码后重新生成',
  },
  'en-US': {
    continueDelivery: 'Continue to verification and delivery',
    applicationDetails: 'View application record details',
    taskLinkFailed:
      'The linked task could not be opened. Check that the project and task are still available, then read it again.',
    taskLinkRetry: 'Read linked task again',
    pendingTask:
      'A task draft is ready to adopt. Current input is unchanged and nothing was sent. Confirm to adopt task and prototype together.',
    title: 'Pre-generation snapshot',
    missing: 'No persisted pre-generation snapshot (legacy or simulated candidate).',
    'generation-task-stale':
      'The task or prototype revision changed. Draft and original binding are retained. Review the board and explicitly adopt the new revision; no automatic retry or revision update.',
    'generation-task-blocked':
      'Task preparation or an active/unknown operation blocks generation. Draft retained; inspect the board.',
    'generation-task-mock':
      'Mock cannot produce durable task-binding evidence. Draft retained; explicitly remove the binding to demonstrate ordinary chat only.',
    adoptTask: 'Adopt task draft in a new conversation',
    adoptTaskImpact:
      'Adopt task text, version identity and prototype together. This replaces the unsent draft without sending. Specify a target file; the server rechecks task revision.',
    taskBinding: 'Pre-generation task binding',
    prebound: 'Task bound before generation',
    deliveryNext:
      'After applying source, run independent checks and submit source evidence on the board. Generation or application never accepts delivery automatically.',
    removeTask: 'Remove task binding (keep draft)',
    target: 'Single generation target',
    components: 'Related pages and resources (one path per line, up to 7)',
    dependencies: 'View file dependencies',
    dependencyKind: {
      MODULE: 'Eager module',
      LAZY_MODULE: 'Lazy module',
      STYLESHEET: 'Stylesheet import',
    },
    componentsHelp:
      'Select route modules, Vue pages, local CSS and JSON. Literal local lazy imports are supported. Select all dependencies and connect them without cycles. Empty means one file.',
    captured: 'Captured at',
    prototype: 'Source prototype',
    targetPlaceholder: 'Repository-relative path, e.g. frontend/apps/web/src/Example.vue',
    targetHelp:
      'No prototype required. Generate the entry and explicitly selected files. Attachments do not select a target.',
    absent: 'Target absent (new file)',
    'generation-too-large':
      'Candidate exceeds the complete response or source content limit. Rejected without applying truncated content. Draft preserved; reduce the requested scope.',
    boundary:
      'This records the input baseline only, not file application, tests, or human acceptance.',
    'generation-stale':
      'Target source changed during generation. Candidate rejected; edits and draft preserved. Review the source before explicitly generating again.',
    'generation-blocked':
      'Generation requires one explicit target and complete readable source. Check the path; additional files are not automatically authorized.',
    'generation-unavailable':
      'Cannot save or read generation context. Generation is blocked and the draft is preserved. Check the local service before retrying.',
    retry: 'Review source and regenerate',
  },
}
