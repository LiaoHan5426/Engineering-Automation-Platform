/**
 * Which keystroke submits the chat draft.
 *
 * Kept as a pure predicate: IME behaviour differs per browser and platform, so this
 * needs its own regression coverage independent of mounting the whole workspace.
 */
export interface DraftKeyEvent {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  keyCode?: number
}

export function isDraftSubmitKey(event: DraftKeyEvent): boolean {
  if (event.key !== 'Enter') return false
  // Shift+Enter is the explicit newline key.
  if (event.shiftKey) return false
  // Safari < 16.4 reports the candidate-confirm Enter as keyCode 229 without isComposing.
  return !event.isComposing && event.keyCode !== 229
}
