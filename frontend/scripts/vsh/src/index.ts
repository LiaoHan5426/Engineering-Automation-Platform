import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBoundaries, workspacePackages } from './boundaries.ts'
import { checkCircular } from './circular.ts'

export { checkBoundaries, workspacePackages } from './boundaries.ts'
export { checkCircular } from './circular.ts'
export { inspectUiStyles, inspectUiTemplate } from './ui-boundaries.ts'
export { inspectTestLayout } from './test-layout.ts'

export async function run(
  command = 'check',
  root = fileURLToPath(new URL('../../../', import.meta.url)),
): Promise<number> {
  if (!['check', 'check-boundaries', 'check-circular'].includes(command)) {
    console.error('Usage: vsh [check | check-boundaries | check-circular]')
    return 2
  }
  try {
    const problems = command === 'check-circular' ? [] : checkBoundaries(root)
    if (command !== 'check-boundaries') {
      const circles = await checkCircular(workspacePackages(root))
      problems.push(
        ...circles.map(
          (circle) =>
            `Runtime circular dependency: ${circle.map((file) => path.relative(root, file)).join(' -> ')}`,
        ),
      )
    }
    if (problems.length) {
      console.error(problems.join('\n'))
      return 1
    }
    console.warn(`vsh ${command}: passed`)
    return 0
  } catch (error) {
    console.error(`vsh ${command} failed:`, error)
    return 1
  }
}
