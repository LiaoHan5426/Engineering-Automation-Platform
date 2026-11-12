import { expect, it, vi } from 'vite-plus/test'
import { proposalRefused, runtimeApi, type CodeProposalState } from '@eap/runtime-client'
import { refusedFromState } from '../../../src/features/chat/proposalRefusal'

it('treats server REFUSED as shared refusal evidence', () => {
  expect(proposalRefused('REFUSED')).toBe(true)
  expect(refusedFromState({ status: 'REFUSED' } as CodeProposalState)).toBe(true)
  expect(refusedFromState({ status: 'PROPOSED' } as CodeProposalState)).toBe(false)
})

it('loads the same refusal status for board review projection', async () => {
  const state: CodeProposalState = {
    dependencies: [],
    proposal: {
      id: 'p',
      conversationId: 'c',
      workspace: '/repo',
      summary: '',
      files: [],
      applied: false,
      writeAllowed: true,
      verification: 'not_requested',
    },
    status: 'REFUSED',
    result: null,
    reason: 'OPERATOR_REFUSED',
  }
  const read = vi.spyOn(runtimeApi, 'codeProposal').mockResolvedValue(state)
  await expect(runtimeApi.codeProposal('c', 'p')).resolves.toMatchObject({ status: 'REFUSED' })
  expect(read).toHaveBeenCalledWith('c', 'p')
  expect(refusedFromState(await runtimeApi.codeProposal('c', 'p'))).toBe(true)
})
