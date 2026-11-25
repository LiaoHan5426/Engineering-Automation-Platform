/**
 * One-shot: merge duplicate top-level selectors in a CSS file.
 * Later declarations win for the same property. Nested rules / at-rules kept as-is.
 */
import fs from 'node:fs'
import path from 'node:path'
import postcss from '../node_modules/.pnpm/postcss@8.5.32/node_modules/postcss/lib/postcss.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/_merge-dup-selectors.mjs <file.css>')
  process.exit(1)
}

const abs = path.resolve(file)
const css = fs.readFileSync(abs, 'utf8')
const root = postcss.parse(css, { from: abs })

/** @type {Map<string, import('postcss').Rule>} */
const firstBySelector = new Map()
let merged = 0

for (const node of [...root.nodes]) {
  if (node.type !== 'rule') continue
  // Only top-level rules (siblings of at-rules), not nested.
  if (node.parent !== root) continue
  const key = node.selector
  const existing = firstBySelector.get(key)
  if (!existing) {
    firstBySelector.set(key, node)
    continue
  }
  // Append decls/nodes from duplicate into first; later props override.
  for (const child of [...node.nodes]) {
    if (child.type === 'decl') {
      for (const n of [...existing.nodes]) {
        if (n.type === 'decl' && n.prop === child.prop) n.remove()
      }
      existing.append(child.clone())
    } else {
      existing.append(child.clone())
    }
  }
  node.remove()
  merged += 1
}

fs.writeFileSync(abs, root.toString())
console.log(`${path.relative(process.cwd(), abs)}: merged ${merged} duplicate rule(s)`)
