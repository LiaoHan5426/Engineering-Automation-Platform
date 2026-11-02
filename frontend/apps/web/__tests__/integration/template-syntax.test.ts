import { expect, it } from 'vite-plus/test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'vue/compiler-sfc'

it('keeps every production Vue template parseable after formatting', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url))
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    )
  }
  const failures = files(root)
    .filter((file) => file.endsWith('.vue'))
    .flatMap((file) =>
      parse(readFileSync(file, 'utf8'), { filename: file }).errors.map(
        (error) => `${file}: ${String(error)}`,
      ),
    )
  expect(failures).toEqual([])
})
