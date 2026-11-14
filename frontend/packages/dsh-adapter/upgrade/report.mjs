import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { compare, digest } from './compare.mjs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const accepted = JSON.parse(readFileSync(root + 'baseline/accepted.json', 'utf8'))
const candidate = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(candidate ?? ''))
  throw new Error(
    'Pass one exact candidate commit SHA; accepted baseline is never changed by this command.',
  )
const files = Object.entries(accepted.sources).map(([path, acceptedDigest]) => {
  const before = readFileSync(root + 'upstream/' + path + '.snapshot')
  if (digest(before) !== acceptedDigest) throw new Error('DSH_SOURCE_DIGEST_MISMATCH:' + path)
  let data
  try {
    data = execFileSync(
      'gh',
      [
        'api',
        `repos/deepseek-ai/deepseek-harness/contents/${path}?ref=${candidate}`,
        '-H',
        'Accept: application/vnd.github+json',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    )
    const response = JSON.parse(data.toString())
    if (response.encoding !== 'base64' || typeof response.content !== 'string')
      throw new Error('DSH_CANDIDATE_SOURCE_ENCODING')
    data = Buffer.from(response.content, 'base64')
  } catch {
    return { path, status: 'missing-or-unreadable', accepted: acceptedDigest }
  }
  return compare(path, before, data)
})
const report = {
  accepted: accepted.commit,
  candidate,
  files,
  decision:
    'Candidate only. Explicit review, frozen fixtures and compatibility tests are required before editing accepted.json.',
}
writeFileSync(root + 'upgrade/candidate-report.json', JSON.stringify(report, null, 2) + '\n')
process.stdout.write(
  JSON.stringify({
    candidate,
    changed: files.filter((f) => f.status !== 'unchanged').length,
    acceptedBaselineUnchanged: true,
  }),
)
