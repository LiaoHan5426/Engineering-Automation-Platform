export const knowledgeContextMessages = {
  'zh-CN': {
    title: '授权知识 · 单专家', open: '选择 / 预览知识', search: '搜索已保存且启用的专家', empty: '没有匹配的已启用专家。请先在专家管理中保存并启用。', loading: '正在读取专家目录…',
    boundary: '仅检索所选专家当前获准访问的知识，不调用模型，不新增权限；与内置指导角色、演示协作专家不同。发送时服务端重新校验版本与授权。',
    preview: '预览当前草稿', use: '使用此专家', cancel: '取消', remove: '移除知识', limit: '带知识预览 / 发送的草稿限 500 字符；不会自动截断。普通对话不受此限制。',
    excerpts: '引用摘录（非全文，最多 5 条，每条最多 1200 字符）', no_matches: '当前草稿未匹配到授权知识。', ready: '当前草稿的授权知识预览',
    failed: '授权知识不可用。草稿和原选版本已保留，请检查专家状态 / 权限后重新选择；不会自动升级版本。',
    unavailable: '仅支持 Chat 且工具为 none；不能与 PREBOUND 工具或代码模式组合。', removed: '已移除知识引用。下次发送时服务端将按会话安全策略清理旧知识记忆。',
    provided: '服务端返回的本轮知识材料：已检索 / 准备，不证明已发送给模型提供方或被模型引用。', cleared: '为防止旧知识跨轮沿用，服务端已清理本轮此前的会话记忆；这不是持久会话保证。',
    mock: 'Mock · 固定模拟知识，不调用真实模型，不代表生产授权或持久会话。',
  },
  'en-US': {
    title: 'Authorized knowledge · one expert', open: 'Select / preview knowledge', search: 'Search saved enabled experts', empty: 'No matching enabled experts. Save and enable one in expert management first.', loading: 'Loading expert catalog…',
    boundary: 'Retrieves only knowledge currently authorized for the selected expert. No model call and no new authority. Separate from built-in guidance and demo collaborators. The server revalidates revision and access on send.',
    preview: 'Preview current draft', use: 'Use this expert', cancel: 'Cancel', remove: 'Remove knowledge', limit: 'Knowledge preview / send is limited to 500 characters, without automatic truncation. Ordinary chat is unaffected.',
    excerpts: 'Reference excerpts (not full documents; at most 5, each up to 1200 characters)', no_matches: 'No authorized knowledge matched this draft.', ready: 'Authorized knowledge preview for this draft',
    failed: 'Knowledge context unavailable. Draft and selected revision retained. Check status / access and explicitly reselect; revisions never auto-upgrade.',
    unavailable: 'Chat with tool mode none only; cannot combine with PREBOUND tools or code mode.', removed: 'Knowledge reference removed. On the next send the server clears old knowledge memory for conversation safety.',
    provided: 'Server-returned knowledge material for this round: retrieved / prepared, not proof of delivery to the model provider or model citation.', cleared: 'The server cleared prior conversation memory to prevent stale knowledge reuse. This is not a durable session guarantee.',
    mock: 'Mock · fixed simulated knowledge, no real model call, production authority or durable conversation.',
  },
};
