import { createHash } from 'node:crypto'
export const digest = (data) => createHash('sha256').update(data).digest('hex')
export const surface = (data) =>
  data
    .toString()
    .split('\n')
    .filter((line) => /^export\b|"exports"|"version"|"inject"|"platform"/.test(line.trim()))
export function compare(path, accepted, candidate) {
  const before = digest(accepted)
  const after = digest(candidate)
  return {
    path,
    status: before === after ? 'unchanged' : 'review-required',
    accepted: before,
    candidate: after,
    exports: { before: surface(accepted), after: surface(candidate) },
  }
}
