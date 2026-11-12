import type { ChatTurn } from './chatSession'

/** Export the loaded display record only, never settings, drafts, attachment bodies or hidden history. */
export function chatMarkdown(input: {
  title: string
  conversationId: string
  turns: readonly ChatTurn[]
  labels: {
    boundary: string
    user: string
    assistant: string
    status: string
    execution: string
    verification: string
    artifacts: string
  }
}): string {
  const lines = [
    '# ' + input.title.replace(/[\r\n]/g, ' '),
    '',
    input.labels.boundary,
    '',
    input.conversationId,
    '',
  ]
  input.turns.forEach((turn, index) => {
    lines.push(
      '## ' +
        (index + 1) +
        '. ' +
        (turn.role === 'user' ? input.labels.user : input.labels.assistant),
      '',
    )
    // Quote the transcript as plain code, using a delimiter absent from its content.
    const runs = turn.text.match(/`+/g) ?? []
    const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)))
    lines.push(fence + 'text', turn.text, fence, '', input.labels.status + ': ' + turn.status)
    if (turn.executionId) lines.push(input.labels.execution + ': ' + turn.executionId)
    if (turn.verification) lines.push(input.labels.verification + ': ' + turn.verification)
    if (turn.error) lines.push('code: ' + turn.error)
    for (const artifact of turn.artifacts ?? [])
      lines.push(
        input.labels.artifacts +
          ': ' +
          artifact.artifactId +
          ' | ' +
          artifact.kind +
          ' | ' +
          artifact.sizeBytes +
          ' B | SHA-256 ' +
          artifact.sha256,
      )
    lines.push('')
  })
  return lines.join('\n') + '\n'
}
