export type McpInputSchema = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}
type Common = { tool: string; expertId: string; approved: boolean; inputSchema: McpInputSchema }
type WebFields = {
  inputArgument: string
  resultsField: string
  titleField: string
  urlField: string
  textField: string
}
export type McpSearchBinding = Common & WebFields & { operation: 'SEARCH' }
export type McpReadBinding = Common & WebFields & { operation: 'READ'; ownerPolicyArgument: string }
export type McpAsrBinding = Common & {
  operation: 'ASR'
  audioArgument: string
  mimeArgument: string
  textField: string
  resultFormat: 'JSON' | 'TEXT'
}
export type McpTtsBinding = Common & {
  operation: 'TTS'
  textArgument: string
  audioField: string
  mimeField: string
  resultFormat: 'JSON' | 'AUDIO'
}
export type McpOperationBinding = McpSearchBinding | McpReadBinding | McpAsrBinding | McpTtsBinding
export type McpOperationBindingsSnapshot = { revision: number; bindings: McpOperationBinding[] }
export type McpOperationBindingsWrite = {
  expectedRevision: number
  bindings: McpOperationBinding[]
}

/** Exact wire shape only: approval and schema/tool authorization remain server decisions. */
export function isMcpOperationBinding(value: unknown): value is McpOperationBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const common = ['operation', 'tool', 'expertId', 'approved', 'inputSchema']
  const fields =
    row.operation === 'SEARCH'
      ? ['inputArgument', 'resultsField', 'titleField', 'urlField', 'textField']
      : row.operation === 'READ'
        ? [
            'inputArgument',
            'resultsField',
            'titleField',
            'urlField',
            'textField',
            'ownerPolicyArgument',
          ]
        : row.operation === 'ASR'
          ? ['audioArgument', 'mimeArgument', 'textField', 'resultFormat']
          : row.operation === 'TTS'
            ? ['textArgument', 'audioField', 'mimeField', 'resultFormat']
            : null
  if (
    !fields ||
    Object.keys(row).length !== common.length + fields.length ||
    Object.keys(row).some((key) => ![...common, ...fields].includes(key))
  )
    return false
  if (
    typeof row.tool !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,60}$/.test(row.tool) ||
    typeof row.expertId !== 'string' ||
    !row.expertId.trim() ||
    row.expertId.length > 120 ||
    typeof row.approved !== 'boolean'
  )
    return false
  if (
    !row.inputSchema ||
    typeof row.inputSchema !== 'object' ||
    Array.isArray(row.inputSchema) ||
    (row.inputSchema as Record<string, unknown>).type !== 'object' ||
    JSON.stringify(row.inputSchema).length > 65536
  )
    return false
  if (
    fields.some(
      (field) =>
        typeof row[field] !== 'string' ||
        (row[field] as string).length > 80 ||
        (field !== 'resultsField' && !(row[field] as string).trim()),
    )
  )
    return false
  if (row.operation === 'ASR' && !['JSON', 'TEXT'].includes(row.resultFormat as string))
    return false
  if (row.operation === 'TTS' && !['JSON', 'AUDIO'].includes(row.resultFormat as string))
    return false
  const schema = row.inputSchema as McpInputSchema
  const props = schema.properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return false
  const supplied =
    row.operation === 'ASR'
      ? [row.audioArgument, row.mimeArgument]
      : row.operation === 'TTS'
        ? [row.textArgument]
        : row.operation === 'READ'
          ? [row.inputArgument, row.ownerPolicyArgument]
          : [row.inputArgument]
  for (const field of supplied) {
    const property = props[field as string]
    const expected =
      row.operation === 'READ' && field === row.ownerPolicyArgument ? 'object' : 'string'
    if (
      !property ||
      typeof property !== 'object' ||
      (property as { type?: string }).type !== expected
    )
      return false
  }
  if (row.operation === 'READ' && row.inputArgument === row.ownerPolicyArgument) return false
  if (
    schema.required &&
    (!Array.isArray(schema.required) || schema.required.some((field) => !supplied.includes(field)))
  )
    return false
  return true
}
export function isMcpOperationBindingsSnapshot(
  value: unknown,
): value is McpOperationBindingsSnapshot {
  if (!value || typeof value !== 'object') return false
  const row = value as McpOperationBindingsSnapshot
  return (
    Object.keys(row).length === 2 &&
    Number.isSafeInteger(row.revision) &&
    row.revision >= 0 &&
    Array.isArray(row.bindings) &&
    row.bindings.length <= 4 &&
    row.bindings.every(isMcpOperationBinding) &&
    new Set(row.bindings.map((binding) => binding.operation)).size === row.bindings.length
  )
}
