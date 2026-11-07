export const workingMemoryMessages = {
  'zh-CN': {
    title: '任务工作记忆',
    layers: '分层',
    goal: '目标',
    constraints: '约束',
    facts: '事实引用',
    evidence: '证据引用',
    dependencies: '依赖键',
    invalidation: '已失效',
    stickyClearRetained:
      '模型窗口 sticky 清空保护仍保留；本次失效不取消 sticky，也不恢复 ChatMemory。',
    empty: '尚无任务工作记忆（不等于模型窗口或浏览器历史）。',
    saveGoal: '保存目标',
    goalPlaceholder: '本会话当前目标（不写入模型正文）',
    note: '工作记忆与展示历史、模型窗口分离；带任务发送时写入依赖键与执行证据；敏感清空、换模或换任务后失效。',
  },
  'en-US': {
    title: 'Task working memory',
    layers: 'Layers',
    goal: 'Goal',
    constraints: 'Constraints',
    facts: 'Fact refs',
    evidence: 'Evidence refs',
    dependencies: 'Dependency keys',
    invalidation: 'Invalidated',
    stickyClearRetained:
      'Sticky model-window clear protection remains; this invalidation does not cancel sticky or restore ChatMemory.',
    empty: 'No task working memory yet (not the model window or browser history).',
    saveGoal: 'Save goal',
    goalPlaceholder: 'Current session goal (not injected as model body)',
    note: 'Working memory is separate from display history and the model window; task sends write dependency keys and execution evidence; it clears on sensitive wipe, model switch, or task switch.',
  },
} as const
