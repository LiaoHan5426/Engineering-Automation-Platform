/** Paths are relative to frontend/, including the workspace tooling pseudo-package. */
export function inspectTestLayout(files: string[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/')
    const testOnly =
      /\.(?:test|spec|typecheck|fixture)\.[cm]?[jt]sx?$/.test(normalized) ||
      normalized.endsWith('.snap') ||
      normalized.split('/').includes('__tests__')
    if (!testOnly) continue
    const parts = normalized.split('/')
    const rootDepth = ['apps', 'packages', 'internal', 'scripts'].includes(parts[0] ?? '') ? 2 : 0
    if (parts[rootDepth] !== '__tests__')
      problems.push(
        `${normalized}: tests, fixtures and type contracts belong in the owning root __tests__/`,
      )
  }
  return problems
}
