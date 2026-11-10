export const boardCodeMessages = {
  'zh-CN': {
    tab: '源码候选',
    hint: '从任务的持久生成记录恢复候选，不依赖聊天会话或本地历史。这里只读取当前工作区的生成前绑定证据；打开、刷新都不会重新生成、应用或接受。',
    refresh: '读取任务源码候选',
    empty: '此任务在当前工作区没有持久源码候选。',
    truncated: '仅显示最近20条，请核对目标及任务版本。',
    stale: '生成时任务版本与当前不同，仅可审阅或明确拒绝；不能应用。',
    open: '审阅此候选',
    readFailed: '无法确认任务或候选身份。原证据保留供查看，写操作暂停；请明确重查。',
    refuse: '拒绝此源码候选',
    refuseImpact:
      '只拒绝尚未应用的候选并保留原证据；不删除文件、不撤销已写源码，不改变任务验收状态。',
    uncertain: '操作结果尚未确认。请读取原候选核对，不创建新请求、重新生成或自动重发。',
  },
  'en-US': {
    tab: 'Source candidates',
    hint: 'Recover candidates from durable task generation records, independently of Chat memory or local history. Only prebound evidence in this workspace is read. Opening or refreshing never regenerates, applies or accepts.',
    refresh: 'Read task source candidates',
    empty: 'No durable source candidate for this task in the current workspace.',
    truncated: 'Showing the latest 20 records. Check target and task revision.',
    stale:
      'Task revision changed since generation. Review or explicitly refuse only; application is blocked.',
    open: 'Review this candidate',
    readFailed:
      'Task or candidate identity is unconfirmed. Retained evidence is view-only; explicitly check again.',
    refuse: 'Refuse this source candidate',
    refuseImpact:
      'Refuse only a pending candidate while preserving evidence. No files are deleted or reverted and task acceptance is unchanged.',
    uncertain:
      'The action is unconfirmed. Read the original candidate; do not regenerate or automatically replay it.',
  },
}
