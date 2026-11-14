import { createHash } from 'node:crypto'
export const digest = (data) => createHash('sha256').update(data).digest('hex')
export const surface = (data) =>
  data
    .toString()
    .split('\n')
    .filter((line) => /^export\b|"exports"|"version"|"inject"|"platform"/.test(line.trim()))
export const services = (data) =>
  [
    ...data
      .toString()
      .matchAll(
        /(?:export const inject\s*=\s*\[[\s\S]*?\]|ctx\.inject\(\[[\s\S]*?\]|ctx\.provide\([^\n]+|(?:ctx|child|scope)\.slots\.(?:inject|register)[\s\S]*?[,\n])/g,
      ),
  ].map((match) => match[0])
function packageSurface(path, data) {
  if (!path.endsWith('package.json')) return null
  try {
    const { version, exports, dependencies, peerDependencies } = JSON.parse(data.toString())
    return { version, exports, dependencies, peerDependencies }
  } catch {
    return { invalid: true }
  }
}
export function compare(path, accepted, candidate) {
  const before = digest(accepted)
  const after = digest(candidate)
  return {
    path,
    status: before === after ? 'unchanged' : 'review-required',
    accepted: before,
    candidate: after,
    exports: { before: surface(accepted), after: surface(candidate) },
    services: { before: services(accepted), after: services(candidate) },
    package: { before: packageSurface(path, accepted), after: packageSurface(path, candidate) },
  }
}
