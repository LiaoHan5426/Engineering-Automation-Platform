import { expect, it } from 'vite-plus/test'
import { mockLanguage, mockProblem } from '../src/problems'

it.each([
  [undefined, 'zh-CN'],
  ['fr-FR', 'zh-CN'],
  ['en-GB', 'en-US'],
  ['de;q=1,en-GB;q=0.9,zh;q=0.1', 'en-US'],
  ['zh;q=0,en;q=0.5', 'en-US'],
  ['en;q=wrong', 'zh-CN'],
  ['*;q=1,en;q=0.5', 'zh-CN'],
])('negotiates explicit mock language %s', (header, expected) => {
  expect(mockLanguage(header)).toBe(expected)
})
it('keeps stable identity and uncertainty context in both languages', () => {
  const context = {
    code: 'TOOL_EXECUTION_BLOCKED',
    execution: { id: 'owned', status: 'UNKNOWN' },
    contextMemoryCleared: true,
    status: 'invalid override',
    detail: 'private diagnostics',
  }
  const zh = mockProblem(409, context, 'zh-CN'),
    en = mockProblem(409, context, 'en-US')
  expect(zh).toMatchObject({
    code: context.code,
    status: 409,
    execution: context.execution,
    contextMemoryCleared: true,
  })
  expect(en).toMatchObject({ code: zh.code, status: zh.status, execution: zh.execution })
  expect(zh.detail).not.toBe(en.detail)
  expect(zh.detail).not.toContain('private diagnostics')
  expect(en.requestId).toBeTruthy()
})
