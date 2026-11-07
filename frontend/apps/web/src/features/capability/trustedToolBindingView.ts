import type { TrustedToolItem } from '@eap/runtime-client'

export function bindingStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'ready':
      return '绑定就绪'
    case 'disabled':
      return '已停用'
    case 'missing_binary':
      return '缺少二进制'
    case 'conflict':
      return '绑定冲突'
    case 'unknown_version':
      return '版本未知'
    default:
      return status || '未知'
  }
}

export function bindingStatusTone(
  status: string | undefined,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ready') return 'success'
  if (status === 'disabled' || status === 'unknown_version') return 'warning'
  if (status === 'missing_binary' || status === 'conflict') return 'danger'
  return 'neutral'
}

export function versionStatusLabel(status: string | undefined): string {
  if (status === 'known') return '版本已知'
  if (status === 'not_applicable') return '无版本'
  return '版本未知'
}

export function bindingDetail(tool: TrustedToolItem): string {
  const parts: string[] = []
  if (tool.bindingSource) parts.push(`来源 ${tool.bindingSource}`)
  if (tool.binary) parts.push(`二进制 ${tool.binary}`)
  if (tool.resolvedPath) parts.push(`路径 ${tool.resolvedPath}`)
  if (tool.bindingNote) parts.push(tool.bindingNote)
  return parts.join(' · ')
}
