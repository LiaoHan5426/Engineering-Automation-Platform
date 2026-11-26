const severityLabel: Record<string, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
  info: '提示',
}
const decisionLabels: Record<string, string> = {
  enhance: '调用模型',
  skip: '跳过模型',
  unavailable: '不可用',
}
const modelLabels: Record<string, string> = {
  'unverified-observation': '已调用（待验证）',
  skipped: '已跳过',
  unavailable: '不可用',
  'not-requested': '未请求',
  /** 计划型任务从未到判定阶段：这不是「跳过了模型」，而是根本没有可跳过的阶段。 */
  '': '未到判定阶段',
}

export function severityText(value: string) {
  return severityLabel[value] ?? value
}

export function decisionText(value: string) {
  return decisionLabels[value] ?? value
}

export function modelEnhancementText(value?: string) {
  return modelLabels[value ?? ''] ?? '—'
}
