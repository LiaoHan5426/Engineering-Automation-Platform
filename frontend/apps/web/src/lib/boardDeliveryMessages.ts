export const boardDeliveryMessages = {
  'zh-CN': {
    comparePrototype: '对照本次绑定的设计版本',
    prototypeMismatch: '交付与本次运行的设计版本不一致，请重新核对原记录。',
    previewAddress: '本次交付的页面预览地址',
    previewAddressHint:
      '登记你实际核对的本机页面地址。打开链接不代表页面对应当前源码或检查已经通过，请在人工接受前核对。地址将随决定保存。',
    previewAddressInvalid: '请输入无账号密码的本机 HTTP/HTTPS 地址，例如 http://127.0.0.1:5173/。',
    openPreview: '打开登记的预览页面',
    candidatesHint:
      '读取此 Run 原任务版本在同一工作区已应用的 PREBOUND 候选。选择只填写关联和路径；提交仍由服务端重新核对源码、时间及验证证据。',
    loadCandidates: '读取此任务的已应用候选',
    candidatesFailed: '读取失败或身份不符，旧列表仅供查看，不能选择；请明确重查。',
    noCandidates: '未找到此任务版本的已应用候选。未应用、其他任务或其他工作区的记录不会列出。',
    candidatesTruncated: '仅显示最近 20 条，请核对目标文件及应用时间。',
    selectCandidate: '选择此源码应用证据',
    linkApplication: '关联已应用的 Chat 候选',
    conversationId: '会话 ID',
    proposalId: '候选 ID',
    linkHint:
      '服务端从原始生成记录判断生成前绑定或事后关联，不接受客户端选择归因类型。提交不自动验证或接受。',
    preboundHint:
      '生成前已绑定任务及版本，服务端核对原始快照与本次交付。此 Run 仍仅检查仓库，不是代码实现者；不证明整个 Git 差异均由 Chat 创作，提交不自动验证或接受。',
    applicationInvalid: '关联需完整候选文件集合（1–8个）及两个完整 UUID；不自动修正身份或路径。',
    applicationEvidence: '已应用候选的关联证据',
    generationBaseline: '生成前工作树基线（不是下方 Git 基线）',
    appliedHash: '应用后源码 SHA-256',
    postHocHint:
      '操作者将已应用 Chat 候选事后关联本任务。此 Run 仅检查仓库，不是代码实现者；关联不证明生成时已绑定任务，也不证明整个 Git 差异均由 Chat 创作。提交不自动验证或接受。',
    invalidPaths:
      '请输入 1–8 个不重复的 frontend/ 源码路径。不能含空格、反斜杠或父目录；不会自动修正路径。文件存在性与完整范围由服务端核对。',
    accept: '接受交付',
    reject: '拒绝交付',
    confirmAccept: '确认人工接受此交付',
    confirmReject: '确认拒绝此交付',
    acceptImpact: '服务端重新核对源码与版本，接受成功后任务进入已完成。',
    rejectImpact: '保留证据与拒绝理由，任务返回就绪；不撤销源码修改。',
    criteria: '我已逐项核对并确认验收标准',
    preview: '我已实际查看并确认交互预览',
    comment: '验收说明（拒绝时必填）',
    humanStatement:
      '以下勾选是本地操作者的人工声明，不是自动测试或平台预览通过的事实。每份交付只能决定一次。',
    decision: { ACCEPT: '已人工接受', REJECT: '已人工拒绝' },
    contentConflict:
      '原请求与同身份的服务端记录内容冲突，尚未恢复。原草稿已保留，禁止自动重试或创建新请求；请核对记录并处理冲突。',
    uncertain:
      '提交结果尚未确认。同身份记录不能证明内容相同；请明确点击重试，由服务端校验原请求，不生成新身份。',
    retry: '查找结果并重试原请求',
    recovered: '已重读服务端保存的交付记录。',
    storageFailed: '无法保存请求身份，已阻止提交。请允许会话存储后重试。',
    rejected: '服务端拒绝请求，请刷新任务与证据后重新确认',
    paths: '源码路径（每行一个，保留原始路径）',
    note: '交付说明',
    verification: '独立验证记录',
    before: '基线源码',
    after: '交付源码',
    confirmSubmit: '确认采集外部 / 人工源码修改',
    title: '源码交付与人工验收',
    open: '源码交付与验收',
    refresh: '刷新交付记录',
    submit: '提交源码证据',
    hint: '来源：外部 / 人工修改（EXTERNAL_MANUAL）。只读 Run 未实施源码修改；提交只重采集和核对证据，不运行验证脚本，也不代表人工验收通过。',
    boundary:
      '仅限 1–8 个 frontend 内常规 UTF-8 源码文件，必须覆盖待交付的前端源码变化。不支持凭据、配置、链接、删除、重命名或二进制；其他范围不属于本次验证覆盖。',
    blocked: '当前不可提交',
    loadFailed: '无法读取交付记录。保留已保存证据，写操作暂停；请刷新后重试。',
  },
  'en-US': {
    comparePrototype: 'Compare the bound design version',
    prototypeMismatch:
      'The delivery and Run reference different design versions. Review the original records.',
    previewAddress: 'Page preview address for this delivery',
    previewAddressHint:
      'Register the local page you actually reviewed. Opening it does not prove source identity or successful checks. Verify these before acceptance. The address is saved with your decision.',
    previewAddressInvalid:
      'Enter a local HTTP/HTTPS address without credentials, such as http://127.0.0.1:5173/.',
    openPreview: 'Open registered page preview',
    candidatesHint:
      'Read applied PREBOUND candidates for this Run task revision and workspace. Selection only fills the reference and path; submission rechecks source, time and verification evidence.',
    loadCandidates: 'Read applied candidates for this task',
    candidatesFailed:
      'Read failed or identity mismatched. The previous list is view-only; explicitly check again.',
    noCandidates:
      'No applied candidate for this task revision. Unapplied records and other tasks or workspaces are excluded.',
    candidatesTruncated:
      'Showing the latest 20 records. Check the target file and application time.',
    selectCandidate: 'Select this source application evidence',
    linkApplication: 'Link an applied Chat candidate',
    conversationId: 'Conversation ID',
    proposalId: 'Proposal ID',
    linkHint:
      'The server distinguishes prebound and post-hoc association from the original generation record. Clients cannot select attribution. Submission does not verify or accept.',
    preboundHint:
      'Task and revision were bound before generation and checked against this delivery. The Run only inspected the repository; it did not implement code. This does not establish authorship of the entire Git diff. Submission never automatically verifies or accepts.',
    applicationInvalid:
      'Linking requires the complete candidate file set (1–8 files) and two complete UUIDs. Identities and paths are never repaired automatically.',
    applicationEvidence: 'Linked application evidence',
    generationBaseline: 'Pre-generation working-tree baseline (not the Git baseline below)',
    appliedHash: 'Applied source SHA-256',
    postHocHint:
      'The operator associates an applied Chat candidate with this task after the fact. This Run only inspected the repository; it did not implement code. This does not establish task binding at generation time or authorship of the entire Git diff. Submission never automatically verifies or accepts.',
    invalidPaths:
      'Enter 1–8 distinct frontend/ source paths without spaces, backslashes or parent traversal. Paths are never repaired automatically. The server checks file existence and complete scope.',
    accept: 'Accept delivery',
    reject: 'Reject delivery',
    confirmAccept: 'Confirm human acceptance',
    confirmReject: 'Confirm rejection',
    acceptImpact:
      'The server rechecks source and versions. Successful acceptance moves the task to done.',
    rejectImpact:
      'Evidence and rejection reasons are retained; the task returns to ready. Source changes are not reverted.',
    criteria: 'I checked and confirm every acceptance criterion',
    preview: 'I actually reviewed and confirm the interactive preview',
    comment: 'Review comment (required for rejection)',
    humanStatement:
      'These checkboxes are statements by the local operator, not automated test or platform preview results. Each delivery can be decided only once.',
    decision: { ACCEPT: 'Accepted by a human', REJECT: 'Rejected by a human' },
    contentConflict:
      'The original payload conflicts with the saved record under the same identity; it is not recovered. The draft is retained. No automatic retry or new request is allowed; review and resolve the conflict.',
    uncertain:
      'Submission outcome is unconfirmed. Matching identity does not prove matching content. Explicitly retry to have the server verify the original payload without generating a new identity.',
    retry: 'Look up result and retry original request',
    recovered: 'Recovered the saved delivery record from the server.',
    storageFailed:
      'Cannot persist request identity; submission blocked. Enable session storage before retrying.',
    rejected:
      'The server rejected the request. Refresh the task and evidence before confirming again',
    paths: 'Source paths (one literal path per line)',
    note: 'Delivery note',
    verification: 'Independent verification record',
    before: 'Baseline source',
    after: 'Delivered source',
    confirmSubmit: 'Confirm capture of external / manual source changes',
    title: 'Source delivery and human acceptance',
    open: 'Source delivery and acceptance',
    refresh: 'Refresh delivery',
    submit: 'Submit source evidence',
    hint: 'Origin: external / manual changes (EXTERNAL_MANUAL). The read-only Run did not implement source changes. Submission only recaptures and checks evidence; it does not run verification scripts or imply human acceptance.',
    boundary:
      'Only 1–8 regular UTF-8 frontend source files, covering all frontend source changes for delivery. No credentials, configuration, links, deletions, renames or binary files. Other scopes are not covered by this verification.',
    blocked: 'Submission unavailable',
    loadFailed:
      'Cannot read delivery. Saved evidence is retained and writes are paused; refresh before retrying.',
  },
}
