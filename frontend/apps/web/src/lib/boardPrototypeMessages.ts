export const boardPrototypeMessages = {
  'zh-CN': {
    title: '关联原型版本', hint: '可选择已保存到服务端的原型版本；普通任务可以不关联。关联不代表设计验收或仓库授权，也不会自动修改任务目标和验收条件。',
    linked: '已关联原型', unlinked: '已移除原型关联', none: '不关联原型', choose: '选择已保存版本', save: '保存关联', view: '查看保存版本', previewChoice: '预览所选版本', refresh: '刷新版本列表',
    viewTitle: '保存的原型版本', loading: '正在读取原型版本…', previewHint: '以下内容来自这一份保存版本。预览中的交互只用于检查设计，不修改已保存版本。', textOnly: '该版本没有可用的语义预览，可展开查看原始正文。',
    savedContent: '保存的正文', savedChecks: '版本保存时的检查标记（不等于任务验收）', hashMismatch: '版本内容哈希与本次 Run 快照不一致，已阻止预览，请核对服务端记录。',
    loadFailed: '无法读取原型版本，请刷新重试。', saved: '原型关联已保存；已有 Run 保留原来的版本快照。', conflict: '任务版本或运行状态已变化。已请求刷新，请核对当前关联后重新选择。',
    saveFailed: '关联结果尚未确认，已请求刷新当前任务；请核对已保存关联，避免覆盖其他修改。', stale: '任务已有新版本，请采用当前关联后重新选择。', adopt: '采用当前关联', active: '存在运行中或结果未知的 Run，暂时不能变更原型关联。',
    runVersion: '本次 Run 的原型版本', runNone: '本次 Run 未记录原型版本。', designLinked: '设计版本已关联；设计验收仍待确认。',
  },
  'en-US': {
    title: 'Linked prototype version', hint: 'Select a version saved on the server, or leave ordinary tasks unlinked. Linking does not accept the design, grant repository access or change task goals and criteria.',
    linked: 'Linked prototype', unlinked: 'Prototype link removed', none: 'No linked prototype', choose: 'Choose a saved version', save: 'Save link', view: 'View saved version', previewChoice: 'Preview selection', refresh: 'Refresh versions',
    viewTitle: 'Saved prototype version', loading: 'Loading prototype…', previewHint: 'Content comes from this saved version. Preview interactions inspect the design without changing the stored version.', textOnly: 'No semantic preview is available for this version. Expand the saved text to inspect it.',
    savedContent: 'Saved text', savedChecks: 'Checks recorded with this version (not task acceptance)', hashMismatch: 'The content hash differs from this Run snapshot. Preview is blocked; check server records.',
    loadFailed: 'Cannot read prototype versions. Refresh to retry.', saved: 'Prototype link saved. Existing Runs retain their original version snapshots.', conflict: 'Task version or execution state changed. Refresh requested; review the current link before selecting again.',
    saveFailed: 'Link outcome is unconfirmed. Refresh requested; check the saved link before retrying.', stale: 'The task has a newer version. Adopt the current link before selecting again.', adopt: 'Adopt current link', active: 'An active or unknown Run prevents changing the prototype link.',
    runVersion: 'Prototype used by this Run', runNone: 'This Run has no recorded prototype version.', designLinked: 'Design version linked; design acceptance is still pending.',
  },
};
