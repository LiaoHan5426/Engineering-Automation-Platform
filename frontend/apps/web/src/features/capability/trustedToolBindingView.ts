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
  if (status === 'probe_failed') return '探测失败'
  return '版本未知'
}

export function versionStatusTone(
  status: string | undefined,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'known') return 'success'
  if (status === 'probe_failed') return 'danger'
  if (status === 'not_applicable') return 'neutral'
  return 'warning'
}

export function canProbeVersion(tool: TrustedToolItem): boolean {
  return tool.bindingStatus === 'ready' && tool.kind === 'cli' && tool.versionStatus !== 'not_applicable'
}

export function versionDetail(tool: TrustedToolItem): string {
  const parts: string[] = []
  if (tool.detectedVersion) parts.push(`探测版本 ${tool.detectedVersion}`)
  if (tool.probedAt) parts.push(`探测于 ${tool.probedAt}`)
  if (tool.versionStatus === 'probe_failed' && tool.probeNote) parts.push(tool.probeNote)
  return parts.join(' · ')
}

export function bindingDetail(tool: TrustedToolItem): string {
  const parts: string[] = []
  if (tool.bindingSource) parts.push(`来源 ${tool.bindingSource}`)
  if (tool.binary) parts.push(`二进制 ${tool.binary}`)
  if (tool.resolvedPath) parts.push(`路径 ${tool.resolvedPath}`)
  if (tool.bindingNote) parts.push(tool.bindingNote)
  return parts.join(' · ')
}

export type BindingStatusCounts = {
  total: number
  ready: number
  disabled: number
  conflict: number
  missingBinary: number
  unknownVersion: number
  other: number
}

/** Aggregate binding statuses for the trusted-tools panel summary. */
export function bindingStatusCounts(tools: TrustedToolItem[]): BindingStatusCounts {
  const counts: BindingStatusCounts = {
    total: tools.length,
    ready: 0,
    disabled: 0,
    conflict: 0,
    missingBinary: 0,
    unknownVersion: 0,
    other: 0,
  }
  for (const tool of tools) {
    switch (tool.bindingStatus) {
      case 'ready':
        counts.ready += 1
        break
      case 'disabled':
        counts.disabled += 1
        break
      case 'conflict':
        counts.conflict += 1
        break
      case 'missing_binary':
        counts.missingBinary += 1
        break
      case 'unknown_version':
        counts.unknownVersion += 1
        break
      default:
        counts.other += 1
        break
    }
  }
  return counts
}
