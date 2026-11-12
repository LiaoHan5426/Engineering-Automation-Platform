import { expect, it } from 'vite-plus/test'
import { chatMarkdown } from '../../../src/features/chat/chatExport'
import type { ChatTurn } from '../../../src/features/chat/chatSession'
it('preserves loaded text and evidence without exporting credentials or hidden materials', () => {
  const turn = {
    role: 'assistant',
    text: '```\n<script>example()</script>\n```',
    status: 'UNKNOWN',
    error: 'INTERRUPTED',
    executionId: 'run-a',
    verification: 'unverified',
    artifacts: [
      {
        artifactId: 'artifact-a',
        executionId: 'run-a',
        kind: 'diff',
        sizeBytes: 12,
        sha256: 'hash-a',
      },
    ],
    secret: 'must-not-export',
    proposal: { files: [{ content: 'hidden source' }] },
    knowledgeContext: { content: 'hidden knowledge' },
  } as unknown as ChatTurn
  const result = chatMarkdown({
    title: 'Task\nInjected heading',
    conversationId: 'conversation-a',
    turns: [turn],
    labels: {
      boundary: 'Display only',
      user: 'User',
      assistant: 'Assistant',
      status: 'Status',
      execution: 'Execution',
      verification: 'Verification',
      artifacts: 'Artifact',
    },
  })
  expect(result).toContain('# Task Injected heading')
  expect(result).toContain('````text\n```\n<script>example()</script>\n```\n````')
  expect(result).toContain('Status: UNKNOWN')
  expect(result).toContain('Execution: run-a')
  expect(result).toContain('artifact-a | diff | 12 B | SHA-256 hash-a')
  expect(result).not.toContain('must-not-export')
  expect(result).not.toContain('hidden source')
  expect(result).not.toContain('hidden knowledge')
})
