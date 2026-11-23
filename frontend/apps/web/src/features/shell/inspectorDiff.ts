/**
 * Line-level diff for the read-only inspector's candidate-change cards.
 *
 * Input is a real `CodeProposal.file` (path / before / content / baseHash);
 * output is derived from those strings only. Nothing is synthesised, and files
 * beyond the line budget are explicitly flagged instead of silently truncated.
 */
export type InspectorDiffSource = {
  path: string
  before: string | null
  content: string
  baseHash?: string
}

export type InspectorDiffRow = { kind: 'context' | 'add' | 'remove'; text: string }

export type InspectorDiffFile = {
  path: string
  baseHash: string
  added: number
  removed: number
  rows: InspectorDiffRow[]
  truncated: boolean
}

/** LCS is quadratic; cap the lines we compare and surface the cap to the UI. */
const MAX_DIFF_LINES = 400

function splitLines(text: string): string[] {
  if (!text) return []
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function buildInspectorDiffs(files: InspectorDiffSource[]): InspectorDiffFile[] {
  return files.map((file) => {
    const beforeLines = splitLines(file.before ?? '')
    const afterLines = splitLines(file.content ?? '')
    const truncated = beforeLines.length > MAX_DIFF_LINES || afterLines.length > MAX_DIFF_LINES
    const before = beforeLines.slice(0, MAX_DIFF_LINES)
    const after = afterLines.slice(0, MAX_DIFF_LINES)
    const n = before.length
    const m = after.length

    // dp[i][j] = longest common subsequence of before[i..] and after[j..]
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i]![j] =
          before[i] === after[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
      }
    }

    const rows: InspectorDiffRow[] = []
    let added = 0
    let removed = 0
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (before[i] === after[j]) {
        rows.push({ kind: 'context', text: before[i]! })
        i += 1
        j += 1
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        rows.push({ kind: 'remove', text: before[i]! })
        removed += 1
        i += 1
      } else {
        rows.push({ kind: 'add', text: after[j]! })
        added += 1
        j += 1
      }
    }
    while (i < n) {
      rows.push({ kind: 'remove', text: before[i]! })
      removed += 1
      i += 1
    }
    while (j < m) {
      rows.push({ kind: 'add', text: after[j]! })
      added += 1
      j += 1
    }

    return {
      path: file.path,
      baseHash: file.baseHash ?? '',
      added,
      removed,
      rows,
      truncated,
    }
  })
}
