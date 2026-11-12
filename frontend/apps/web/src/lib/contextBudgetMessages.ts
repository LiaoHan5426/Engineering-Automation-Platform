export const contextBudgetMessages = {
  'zh-CN': {
    historyTitle: '模型历史',
    summaryGenerate: '生成历史摘要',
    summaryCancel: '请求取消摘要生成',
    summaryReview: '核对并编辑摘要',
    summaryAdopt: '将摘要带入当前草稿',
    summaryBoundary:
      '摘要可能遗漏或误解信息，请核对后再采用。采用只追加到草稿，不发送、不写任务记忆、不清空历史，也不授予权限。',
    summaryImpact:
      '使用此会话绑定的模型处理当前模型窗口，可能产生模型费用；不调用工具。不会自动改写或清空历史。再次生成将替换此面板尚未采用的摘要。',
    summaryDiscard: '放弃尚未采用的摘要？',
    summaryDiscardImpact: '关闭会丢弃此面板中的摘要编辑，原模型历史和当前草稿保持不变。',
    historyChanged: '模型窗口当前仍有消息，请刷新核对；未自动重复清空。',
    historyBoundary:
      '这里统计实际模型窗口的字符估算，包含消息及工具记录，不是供应商 token 数。清空后下一次发送不再携带这些历史；页面对话记录、当前草稿和任务记忆仍保留。',
    historyUsage: '当前模型窗口：{messages} 条消息，约 {chars} 字符。',
    historyRefresh: '刷新用量',
    historyClear: '清空模型历史',
    historyImpact:
      '后续回答将失去旧对话上下文。需要继续使用的目标、约束和事实请先保留在任务记忆或本轮输入中。此操作不生成摘要。',
    historyCleared: '已核对模型窗口为空，可关闭后继续编辑并发送当前草稿。',
    summary: '上下文 · 约 {used} 字符',
    artifacts: '查看执行附件（{count}）',
    title: '上下文用量',
    metering: '计量方式',
    charEstimate: '字符估算（非供应商 token）',
    unknown: '含未知项（如会话历史未精确计量）',
    used: '已用',
    remaining: '剩余（含输出预留后）',
    reserve: '输出预留',
    material: '材料上限内用量',
    sources: '来源明细（字符）',
    notes: '诊断代码',
    exceeded: '上下文超出平台字符预算，请减少附件、原型或检索材料后重试。',
    exceededDetail: '已用 {used} / 平台 {platform}（输出预留 {reserve}）。计量：{metering}。',
  },
  'en-US': {
    historyTitle: 'Model history',
    summaryGenerate: 'Generate history summary',
    summaryCancel: 'Request summary cancellation',
    summaryReview: 'Review and edit summary',
    summaryAdopt: 'Add summary to current draft',
    summaryBoundary:
      'The summary may omit or misunderstand information. Review it before adoption. Adoption only appends to the draft; it does not send, save task memory, clear history or grant permissions.',
    summaryImpact:
      'Use this conversation’s bound model to process its current window; model charges may apply. No tools are invoked, and history stays unchanged. Generating again replaces the unadopted summary in this panel.',
    summaryDiscard: 'Discard the unadopted summary?',
    summaryDiscardImpact:
      'Closing discards summary edits in this panel. Original model history and the current draft stay unchanged.',
    historyChanged:
      'The model window still contains messages. Refresh to check it; clearing was not repeated automatically.',
    historyBoundary:
      'Character estimates cover the actual model window, including messages and tool records, not provider tokens. Clearing removes that history from future requests. Displayed transcripts, the current draft and task memory remain.',
    historyUsage: 'Model window: {messages} messages, about {chars} characters.',
    historyRefresh: 'Refresh usage',
    historyClear: 'Clear model history',
    historyImpact:
      'Future answers lose the old conversation context. Preserve needed goals, constraints and facts in task memory or your next input first. This does not create a summary.',
    historyCleared:
      'The model window is confirmed empty. Close this dialog to continue editing and sending your draft.',
    summary: 'Context · about {used} characters',
    artifacts: 'Execution attachments ({count})',
    title: 'Context usage',
    metering: 'Metering',
    charEstimate: 'Character estimate (not provider tokens)',
    unknown: 'Includes unknown items (chat history not precisely metered)',
    used: 'Used',
    remaining: 'Remaining (after output reserve)',
    reserve: 'Output reserve',
    material: 'Material usage within cap',
    sources: 'Source breakdown (characters)',
    notes: 'Diagnostic codes',
    exceeded:
      'Context exceeds the platform character budget. Reduce attachments, prototypes, or retrieved material and retry.',
    exceededDetail:
      'Used {used} / platform {platform} (output reserve {reserve}). Metering: {metering}.',
  },
} as const
