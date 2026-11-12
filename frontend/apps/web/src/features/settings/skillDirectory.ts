import type { SkillImportInput, SkillResource } from '@eap/runtime-client'

/** Browser-selected files only. Nothing is fetched, skipped, executed or saved. */
export async function readSkillDirectory(files: File[]): Promise<{
  rawSkillMd: string
  resources: SkillImportInput['resources']
  sourceLabel: string
}> {
  if (!files.length || files.length > 5) throw new Error('Invalid skill directory size')
  let root = ''
  let rawSkillMd: string | undefined
  let total = 0
  const seen = new Set<string>()
  const resources: SkillResource[] = []
  for (const file of files) {
    const relative = file.webkitRelativePath
    const separator = relative.indexOf('/')
    if (separator < 1) throw new Error('Directory-relative paths required')
    const directory = relative.slice(0, separator)
    const path = relative.slice(separator + 1)
    if (!root) root = directory
    if (
      root !== directory ||
      directory === '.' ||
      directory === '..' ||
      /[\\:\0]/.test(directory) ||
      !/^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/.test(path) ||
      path.length > 240 ||
      path.includes('..') ||
      path.split('/').some((part) => part.toLowerCase() === 'scripts') ||
      !/\.(md|txt)$/i.test(path) ||
      seen.has(path.toLowerCase()) ||
      file.size > 96000
    )
      throw new Error('Unsupported skill directory entry')
    seen.add(path.toLowerCase())
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    if (content.includes('\0') || content.length > 16000 || (total += content.length) > 24000)
      throw new Error('Skill directory content limit')
    if (path === 'SKILL.md') rawSkillMd = content
    else {
      if (path.toLowerCase() === 'skill.md') throw new Error('Entry must be named SKILL.md')
      resources.push({
        path,
        mediaType: /\.md$/i.test(path) ? 'text/markdown' : 'text/plain',
        content,
      })
    }
  }
  if (rawSkillMd === undefined || resources.length > 4 || root.length > 180)
    throw new Error('Root SKILL.md required')
  return {
    rawSkillMd,
    resources: resources.sort((a, b) => a.path.localeCompare(b.path)),
    sourceLabel: 'local-directory:' + root,
  }
}
