import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileBlocksAgainstBuiltTypes, compileBlocksStandalone, extractBlocks, type Block, type CompilerFace } from './doc-typecheck.ts'

function block(face: CompilerFace, code: string): Block {
  return { file: `fixture-${face}.md`, line: 12, kind: 'check', face, code }
}

function validBlock(face: CompilerFace): Block {
  const imports = face === 'client'
    ? extractBlocks(join(import.meta.dirname, '../packages/client/ui-workspace/README.md')).find(fence => fence.face === 'client' && fence.kind === 'check')!.code
    : 'import { SessionId } from \'@deepseek-ai/dsh-session/types\'; const id = SessionId(\'doc-fixture\'); void id;'
  return block(face, `${imports}\ndeclare global { interface DocumentationCompilerFace { value: '${face}' } }\nconst owner: DocumentationCompilerFace['value'] = '${face}'; void owner;`)
}

describe('documentation compiler faces', () => {
  it('checks explicit client fences and preserves existing fence ownership and TSX exclusion', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doc-faces-'))
    try {
      const file = join(directory, 'README.md')
      const infos = ['ts', 'ts client', 'ts ignore-check', 'ts type-equiv', 'ts public-api', 'ts cordis-catalog', 'ts persistence-catalog', 'ts config-catalog', 'tsx', 'tsx client']
      writeFileSync(file, infos.map(info => `\`\`\`${info}\nexport {}\n\`\`\``).join('\n'))
      expect(extractBlocks(file).map(({ kind, face }) => ({ kind, face }))).toEqual([
        { kind: 'check', face: 'host' }, { kind: 'check', face: 'client' },
        { kind: 'ignore', face: 'host' }, { kind: 'type-equiv', face: 'host' },
        { kind: 'type-equiv', face: 'host' }, { kind: 'cordis-catalog', face: 'host' },
        { kind: 'persistence-catalog', face: 'host' }, { kind: 'config-catalog', face: 'host' },
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(['host', 'client'] as const)('accepts valid %s fences and maps standalone errors to Markdown', (face) => {
    expect(compileBlocksStandalone([validBlock(face)], face)).toBeUndefined()
    const error = compileBlocksStandalone([block(face, 'export {}; const value: number = "wrong"; void value;')], face)
    expect(error).toContain(`fixture-${face}.md (block at line 12`)
    expect(error).toContain('TS2322')
  }, 120000)

  it('keeps incompatible host and client augmentations in separate built programs', () => {
    const host = validBlock('host')
    const client = validBlock('client')
    expect(compileBlocksAgainstBuiltTypes([host], 'host')).toEqual([])
    expect(compileBlocksAgainstBuiltTypes([client], 'client')).toEqual([])
    // This conflict is the reason the two faces cannot share one compiler program.
    expect(compileBlocksAgainstBuiltTypes([host, client], 'client').some(diagnostic => diagnostic.code === 2717)).toBe(true)
  }, 120000)

  it.each(['host', 'client'] as const)('rejects invalid %s fences against built declarations', (face) => {
    const diagnostics = compileBlocksAgainstBuiltTypes([block(face, 'export {}; const value: number = "wrong"; void value;')], face)
    expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual([2322])
  }, 120000)
})
