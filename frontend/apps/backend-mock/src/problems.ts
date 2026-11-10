import { randomUUID } from 'node:crypto'

export function mockLanguage(acceptLanguage?: string): 'zh-CN' | 'en-US' {
  const ranges = String(acceptLanguage ?? '')
    .split(',')
    .map((entry) => {
      const match = entry
        .trim()
        .match(/^([a-z]+(?:-[a-z0-9]+)*|\*)(?:\s*;\s*q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?$/i)
      return match ? { range: match[1]!.toLowerCase(), weight: Number(match[2] ?? 1) } : null
    })
  if (ranges.some((item) => item === null)) return 'zh-CN'
  for (const item of ranges.filter((item) => item !== null).sort((a, b) => b.weight - a.weight)) {
    if (item.weight === 0) continue
    if (item.range === '*' || /^zh(?:-|$)/.test(item.range)) return 'zh-CN'
    if (/^en(?:-|$)/.test(item.range)) return 'en-US'
  }
  return 'zh-CN'
}

/** Explicit Mock presentation, independent of Java errors and provider/model execution. */
export function mockProblem(status: number, data: unknown, acceptLanguage?: string) {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const english = mockLanguage(acceptLanguage) === 'en-US'
  return {
    ...body,
    type: 'about:blank',
    title: english ? 'Mock operation not completed' : '模拟操作未完成',
    status,
    code: typeof body.code === 'string' ? body.code : 'MOCK_REQUEST_FAILED',
    detail: english
      ? 'The simulated request was rejected. Check the input, configuration and original Mock record.'
      : '模拟请求被拒绝，请核对输入、配置及原模拟记录。',
    requestId: randomUUID(),
  }
}
