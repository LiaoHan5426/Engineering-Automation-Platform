export const pluginCheckMessages = {
  'zh-CN': {
    designer: {
      boundary:
        '设计器贡献停用会释放画布和观察结果；各实例草稿在本机恢复，服务器版本、候选和任务保留。',
      check: '检查原型版本服务',
      unchecked: '原型版本服务未检查',
      checking: '正在检查原型版本服务',
      available: '原型版本目录可读取',
      failed: '原型版本服务检查失败，可用性未知',
      observed: '上次成功观测：已发布版本 {count} 个 · {time}',
      old: '此为上次成功快照，本次读取未确认。请重新检查。',
      disableTitle: '停用设计器',
      disableConfirm: '保存恢复草稿并停用',
      suspendBlocked:
        '正在发布或本机恢复草稿保存未确认，设计器保持启用。请返回设计器等待发布结束或修复浏览器存储后重试。',
      disableImpact:
        'A/B 实例的当前草稿将在本浏览器中保存恢复数据，随后释放设计器画布与实例观察结果。',
      disablePreserve:
        '本机保存未确认或正在发布时将阻止停用。不会发布新版本、删除服务器版本、取消核心任务或自动重放请求。',
    },
    composition: {
      title: '场景组合依赖',
      required: '必需：设计器贡献、可读取的原型版本服务及已发布版本。可选：任务看板。',
      designerReady: '设计器贡献可用',
      designerMissing: '设计器已停用、缺少依赖或激活失败；请到插件中心处理。',
      boardReady: '可选任务看板可用',
      boardMissing: '可选任务看板不可用，不阻止此场景。',
      blocked:
        '必需依赖尚未确认或没有已发布版本，暂不能应用或进入代码开发；仍可打开可用的设计器创建版本。',
      manage: '管理插件依赖',
      boundary:
        '依赖合同来自核心服务，插件启停以当前本机 Host 为准。保存的场景标签不是授权；检查、启用及应用不会自动安装、授权、发布、发送或执行。仓库、模型和验证条件仍需在开发准备中核对。',
    },
    check: {
      action: '检查运行时依赖',
      project: '查询项目 ID',
      projectHint: '填写看板使用的项目 ID（最多 120 字符）。这只是查询范围，不是目录授权。',
      unchecked: '未检查',
      stale: '输入项目已变化；下方为上次观测，请重新检查。',
      checking: '检查中',
      available: 'Task/Run 状态可读取',
      failed: '检查失败（可用性未知）',
      savedObservation: '上次成功观测：项目 {project} · {time}',
      totals: 'Task {tasks} 条 · Run {runs} 条',
      runs: 'Run：在途 {active} · 结果未知 {unknown}',
      verifications: '独立验证：在途 {active} · 结果未知 {unknown}',
      writes: '源码写入：在途 {active} · 结果未知 {unknown}',
      storedState: '保存状态',
      items: '查看在途与未知记录标识',
      RUN: 'Run',
      VERIFICATION: '独立验证',
      SOURCE_WRITE: '源码写入',
      truncated: '仅显示前 20 个在途/未知标识，计数覆盖本项目全部持久记录。',
      oldSnapshot: '下方是上次成功快照，不能据此判断当前无在途工作；请核对项目并重新检查。',
      openWork: '本项目存在在途或结果未知记录。停用插件只隐藏看板，后台工作及未知互锁继续保留。',
      noOpenWork: '本次观测未发现本项目在途或未知记录；不代表其他项目或随后时刻没有执行。',
      disabledBoundary:
        '看板 UI 已停用时，核心 Task/Run、验证与源码写入仍由原服务管理。可在此重新检查；重新启用后读取原记录。停用不会取消、删除、解除 UNKNOWN 或自动重跑。',
      disableTitle: '停用看板显示',
      disableConfirm: '仅停用看板显示',
      disableImpact:
        '隐藏看板入口并释放其页面。项目任务、执行证据和工作区互锁保持；其他插件和核心服务继续运行。',
      disableObserved:
        '项目 {project} 在 {time} 观测到 {count} 条在途/未知活动；这是观测快照，不是停止证明。',
      disableUnverified:
        '当前未取得与输入项目一致的成功观测；不能确认是否有后台工作。仍可只停用显示，之后在此检查。',
      scope:
        '只读检查指定项目的 Task/Run、独立验证和源码写入持久状态。空项目可通过；不启动任务或命令、不调用模型、不扫描目录、不证明进程退出或全服务健康。插件停用不影响此查询。',
      source: '来源：{source}',
      time: '观测时间：{time}',
      reason: '失败原因：{reason}',
      simulated: '模拟环境：请求由 mock 响应，不是真实后端检查。',
    },
  },
  'en-US': {
    designer: {
      boundary:
        'Disabling releases the canvas and observations. Drafts recover locally per instance; server versions, proposals and tasks remain.',
      check: 'Check prototype version service',
      unchecked: 'Prototype service not checked',
      checking: 'Checking prototype service',
      available: 'Prototype version catalog readable',
      failed: 'Prototype service check failed; availability unknown',
      observed: 'Last successful observation: {count} published versions · {time}',
      old: 'This is an older successful snapshot. The current read is unconfirmed; check again.',
      disableTitle: 'Disable designer',
      disableConfirm: 'Save recovery drafts and disable',
      suspendBlocked:
        'Publishing or local recovery storage is unconfirmed. The designer stays enabled; wait for publishing or repair browser storage and retry.',
      disableImpact:
        'Save recovery data for A/B drafts in this browser, then release designer canvases and instance observations.',
      disablePreserve:
        'Unconfirmed local storage or an active publish blocks disabling. No new publication, server deletion, task cancellation or automatic replay occurs.',
    },
    composition: {
      title: 'Scenario composition dependencies',
      required:
        'Required: designer contribution, readable version service and published versions. Optional: task board.',
      designerReady: 'Designer contribution available',
      designerMissing:
        'Designer disabled, missing dependencies or failed activation. Manage it in the plugin center.',
      boardReady: 'Optional task board available',
      boardMissing: 'Optional task board unavailable; this does not block the scenario.',
      blocked:
        'Required dependencies are unconfirmed or no published version exists. Apply and code development are blocked; an available designer can still create a version.',
      manage: 'Manage plugin dependencies',
      boundary:
        'The core declares dependencies; this local Host owns plugin enablement. Saved labels are not grants. Checking, enabling and applying do not install, authorize, publish, send or execute. Workspace, model and verification checks remain separate.',
    },
    check: {
      action: 'Check runtime dependency',
      project: 'Query project ID',
      projectHint:
        'Enter the board project ID (up to 120 characters). This scopes the query; it is not directory authorization.',
      unchecked: 'Not checked',
      stale:
        'The project input changed; the observation below is from the previous check. Check again.',
      checking: 'Checking',
      available: 'Task/Run state readable',
      failed: 'Check failed (availability unknown)',
      savedObservation: 'Last successful observation: project {project} · {time}',
      totals: '{tasks} Tasks · {runs} Runs',
      runs: 'Runs: {active} active · {unknown} unknown',
      verifications: 'Verification: {active} active · {unknown} unknown',
      writes: 'Source writes: {active} active · {unknown} unknown',
      storedState: 'stored status',
      items: 'Inspect active and unknown record IDs',
      RUN: 'Run',
      VERIFICATION: 'Verification',
      SOURCE_WRITE: 'Source write',
      truncated:
        'Only the first 20 active/unknown IDs are shown. Counts include all persisted records in this project.',
      oldSnapshot:
        'This is the last successful snapshot. It cannot establish that no work is active now; check the project and refresh.',
      openWork:
        'This project has active or unknown records. Disabling only hides the board; core work and unknown reservations remain.',
      noOpenWork:
        'No active or unknown records were observed in this project at this time. Other projects and later work are not covered.',
      disabledBoundary:
        'Disabling board UI leaves core Tasks/Runs, verification and source writes under their existing services. Check here while disabled; enabling reads the original records. Disabling does not cancel, delete, close UNKNOWN or replay.',
      disableTitle: 'Hide the board UI',
      disableConfirm: 'Hide board UI only',
      disableImpact:
        'Hide the board entry and release its page. Tasks, execution evidence and workspace reservations remain; other plugins and core services continue.',
      disableObserved:
        'Project {project} had {count} active/unknown activities at {time}. This is an observation, not proof of termination.',
      disableUnverified:
        'No successful observation matches the current project input. Background work is unconfirmed. You may hide the UI and check here afterward.',
      scope:
        'Read-only persisted Task/Run, verification and source-write state for one project. Empty projects can pass. Does not start work, invoke models, scan directories, prove process exit or overall health. Available while board UI is disabled.',
      source: 'Source: {source}',
      time: 'Observed at: {time}',
      reason: 'Failure reason: {reason}',
      simulated: 'Simulated environment: mock responses, not a real backend check.',
    },
  },
}
