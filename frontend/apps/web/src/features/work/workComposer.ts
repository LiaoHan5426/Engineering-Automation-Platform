/**
 * Selection-axis labels for the Work document composer (Ardot prototype board 03).
 *
 * Every label is a read-only mirror of real session/workbench state. When no
 * model connection exists the labels fall back to an explicit "pending" value;
 * nothing from the prototype's sample copy is reproduced as if it were real.
 */
import type { ExecutionMode } from '../shell/workbench'

export type WorkComposerState = {
  /** Number of real referenced files in the active session. */
  references: number
  /** Real execution mode from the shared workbench. */
  executionMode: ExecutionMode
  /** Real approval policy; empty means no active session / unknown. */
  approval: string
  /** Real model label; empty means no connection. */
  model: string
  /** Real reasoning effort; empty means default/unknown. */
  reasoning: string
}

export type WorkComposerAxis = {
  key: 'references' | 'execution' | 'approval' | 'model' | 'effort'
  label: string
  tone: 'info' | 'warning'
}

type Translator = (key: string, params?: Record<string, unknown>) => string

export function buildWorkComposerAxes(state: WorkComposerState, t: Translator): WorkComposerAxis[] {
  const execution =
    state.executionMode === 'plan'
      ? t('composerUi.axisPlan')
      : state.executionMode === 'agent'
        ? t('composerUi.axisAgent')
        : t('composerUi.axisChat')
  const readOnly = state.approval === 'read_only'
  return [
    {
      key: 'references',
      label: t('composerUi.axisReferences', { count: state.references }),
      tone: 'info',
    },
    { key: 'execution', label: execution, tone: 'info' },
    {
      key: 'approval',
      label: !state.approval
        ? t('modelUi.pending')
        : readOnly
          ? t('composerUi.axisReadOnly')
          : t('composerUi.axisApprove'),
      tone: readOnly ? 'info' : 'warning',
    },
    { key: 'model', label: state.model || t('modelUi.pending'), tone: 'info' },
    {
      key: 'effort',
      label: state.reasoning ? t('task.' + state.reasoning) : t('task.modelDefault'),
      tone: 'info',
    },
  ]
}
