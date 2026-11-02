import { afterEach, expect, it } from 'vite-plus/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCircular } from '../src/circular.ts'

it('detects eager glob cycles and respects array exclusions', async () => {
  const packages = sample({
    'a.ts': 'export const files=import.meta.glob(["./b*.ts"], {eager:true});',
    'b.ts': 'import {files} from "./a"; export const b=files;',
  })
  expect((await checkCircular(packages)).length).toBeGreaterThan(0)
  fs.writeFileSync(
    path.join(packages[0]!.root, 'a.ts'),
    'export const files=import.meta.glob(["./b*.ts", "!./b.ts"], {eager:true});',
  )
  expect(await checkCircular(packages)).toEqual([])
})

const cache = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url))
const owned: string[] = []
afterEach(() => {
  for (const directory of owned.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
function sample(files: Record<string, string>) {
  fs.mkdirSync(cache, { recursive: true })
  const root = fs.mkdtempSync(path.join(cache, 'vsh-cycle-'))
  owned.push(root)
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'esnext' } }),
  )
  for (const [name, source] of Object.entries(files))
    fs.writeFileSync(path.join(root, name), source)
  return [{ root, name: 'fixture', exports: {}, dependencies: {} }]
}
it('detects an actual runtime cycle with the upstream scanner', async () => {
  const packages = sample({
    'a.ts': 'import { b } from "./b";export const a=()=>b;',
    'b.ts': 'import { a } from "./a";export const b=()=>a;',
  })
  expect((await checkCircular(packages)).length).toBeGreaterThan(0)
})
it('does not classify pure type references as runtime cycles', async () => {
  const packages = sample({
    'a.ts': 'import type { B } from "./b";export type A={b:B};',
    'b.ts': 'import type { A } from "./a";export type B={a:A};',
  })
  expect(await checkCircular(packages)).toEqual([])
})
it('detects a workspace manifest cycle even when packages use public entrypoints', async () => {
  const [a] = sample({ 'index.ts': 'export const a=1' })
  const [b] = sample({ 'index.ts': 'export const b=1' })
  const circles = await checkCircular([
    { ...a!, name: '@fixture/a', dependencies: { '@fixture/b': 'workspace:*' } },
    { ...b!, name: '@fixture/b', dependencies: { '@fixture/a': 'workspace:*' } },
  ])
  expect(circles.some((circle) => circle.includes(path.join(a!.root, 'package.json')))).toBe(true)
})
it('detects a Vue runtime cycle through script setup even when normal script also exists', async () => {
  const packages = sample({
    'index.ts': 'import View from "./View.vue"; export const value=View;',
    'View.vue':
      '<script>export default {};</script><script setup>import {value} from "./index"; console.log(value);</script><template><div /></template>',
  })
  const circles = await checkCircular(packages)
  expect(circles.some((circle) => circle.includes(path.join(packages[0]!.root, 'View.vue')))).toBe(
    true,
  )
})
