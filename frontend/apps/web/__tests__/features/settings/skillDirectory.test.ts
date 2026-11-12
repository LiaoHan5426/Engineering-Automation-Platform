import { expect, it } from 'vite-plus/test'
import { readSkillDirectory } from '../../../src/features/settings/skillDirectory'

function entry(path: string, content: string | Uint8Array) {
  const file = new File([content], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
const raw = '---\nname: directory-guide\ndescription: Review\n---\nUse references/checks.md.'
it('preserves complete nested text resources and source without saving anything', async () => {
  const result = await readSkillDirectory([
    entry('guide/references/checks.md', 'Check the route. 中文'),
    entry('guide/SKILL.md', raw),
  ])
  expect(result).toEqual({
    rawSkillMd: raw,
    sourceLabel: 'local-directory:guide',
    resources: [
      {
        path: 'references/checks.md',
        mediaType: 'text/markdown',
        content: 'Check the route. 中文',
      },
    ],
  })
})
it('rejects an entire directory with unsupported entries, duplicate paths or no root entry', async () => {
  for (const path of [
    'guide/scripts/run.md',
    'guide/run.js',
    'guide/.hidden.md',
    'guide/../outside.md',
    'other/readme.txt',
    'guide/skill.md',
  ])
    await expect(
      readSkillDirectory([entry('guide/SKILL.md', raw), entry(path, 'body')]),
    ).rejects.toThrow()
  await expect(readSkillDirectory([entry('guide/references/SKILL.md', raw)])).rejects.toThrow()
  await expect(
    readSkillDirectory([
      entry('guide/SKILL.md', raw),
      entry('guide/a.md', 'a'),
      entry('guide/A.md', 'b'),
    ]),
  ).rejects.toThrow()
})
it('rejects malformed UTF-8 and content beyond the backend text contract without truncating', async () => {
  await expect(
    readSkillDirectory([entry('guide/SKILL.md', new Uint8Array([0xff]))]),
  ).rejects.toThrow()
  await expect(readSkillDirectory([entry('guide/SKILL.md', 'x'.repeat(16001))])).rejects.toThrow()
  await expect(
    readSkillDirectory([
      entry('guide/SKILL.md', raw),
      entry('guide/a.md', 'x'.repeat(13000)),
      entry('guide/b.md', 'x'.repeat(13000)),
    ]),
  ).rejects.toThrow()
})
