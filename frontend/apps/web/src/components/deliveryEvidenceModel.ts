export type EvidenceFile = {
  path: string
  before: string | null
  content: string
  baseHash: string
}

export function evidenceRows(files: EvidenceFile[], query: string): EvidenceFile[] {
  const normalizedQuery = query.toLowerCase()
  return files.filter((file) => file.path.toLowerCase().includes(normalizedQuery))
}
