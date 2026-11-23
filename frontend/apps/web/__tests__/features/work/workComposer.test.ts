import { expect, it } from 'vite-plus/test'
import { buildWorkComposerAxes } from '../../../src/features/work/workComposer'

const t = (key: string, params?: Record<string, unknown>) => {
  const table: Record<string, string> = {
    'composerUi.axisReferences': `refs:${params?.count}`,
    'composerUi.axisChat': 'chat',
    'composerUi.axisPlan': 'plan',
    'composerUi.axisAgent': 'agent',
    'composerUi.axisReadOnly': 'readonly',
    'composerUi.axisApprove': 'approve',
    'modelUi.pending': 'pending',
    'task.modelDefault': 'default',
    'task.high': 'high',
  }
  return table[key] ?? key
}

it('mirrors only real composer state into the selection axes', () => {
  const axes = buildWorkComposerAxes(
    {
      references: 2,
      executionMode: 'plan',
      approval: 'read_only',
      model: '真实模型',
      reasoning: 'high',
    },
    t,
  )
  expect(axes.map((axis) => axis.label)).toEqual(['refs:2', 'plan', 'readonly', '真实模型', 'high'])
})

it('shows pending values instead of a fabricated model when nothing is connected', () => {
  const axes = buildWorkComposerAxes(
    {
      references: 0,
      executionMode: 'chat',
      approval: '',
      model: '',
      reasoning: '',
    },
    t,
  )
  expect(axes.map((axis) => axis.label)).toEqual([
    'refs:0',
    'chat',
    'pending',
    'pending',
    'default',
  ])
})
