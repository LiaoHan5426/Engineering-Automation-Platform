import { createHash } from 'node:crypto'
import type { SkillContext, SkillSnapshot, SkillSummary, SkillRef } from '@eap/runtime-client'
import { mockSkillText } from '../src/lib/skillFixture'
class Rejected extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail)
  }
}
function fail(detail: string, status = 400): never {
  throw new Rejected(status, detail)
}
function fields(value: unknown, keys: string[], code: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('|') !== [...keys].sort().join('|')
  )
    fail(code)
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, code: string, blank = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!blank && !value.trim()) ||
    value.includes('\0') ||
    !value.isWellFormed()
  )
    fail(code)
  return value
}
const validId = (s: unknown): s is string =>
  typeof s === 'string' && s.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
const validVersion = (s: unknown): s is string =>
  typeof s === 'string' &&
  s.length <= 32 &&
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(s)
function resourcePath(value: unknown): string {
  const path = text(value, 240, 'INVALID_SKILL_RESOURCE')
  if (
    !/^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/.test(path) ||
    !/\.(md|txt)$/i.test(path) ||
    path.includes('..') ||
    path.split('/').some((p) => p.toLowerCase() === 'scripts')
  )
    fail('INVALID_SKILL_RESOURCE')
  return path
}
function digest(values: string[]) {
  const hash = createHash('sha256')
  for (const value of values) {
    const data = Buffer.from(value, 'utf8'),
      size = Buffer.alloc(4)
    size.writeInt32BE(data.length)
    hash.update(size).update(data)
  }
  return hash.digest('hex')
}
function parse(value: unknown): SkillSnapshot {
  const input = fields(
    value,
    ['rawSkillMd', 'version', 'sourceLabel', 'resources', 'requiredCapabilities'],
    'INVALID_SKILL_INPUT',
  )
  const raw = text(input.rawSkillMd, 16000, 'INVALID_SKILL_INPUT')
  if (!validVersion(input.version)) fail('INVALID_SKILL_VERSION')
  const source = text(input.sourceLabel, 200, 'INVALID_SKILL_INPUT')
  // Deliberately no pretend YAML parser. Only this documented byte-exact fixture is supported.
  if (raw !== mockSkillText) fail('MOCK_SKILL_PARSER_UNSUPPORTED')
  if (!Array.isArray(input.resources) || input.resources.length > 4) fail('INVALID_SKILL_RESOURCE')
  let total = raw.length
  const seen = new Set<string>()
  const resources = input.resources
    .map((value) => {
      const r = fields(value, ['path', 'mediaType', 'content'], 'INVALID_SKILL_RESOURCE'),
        path = resourcePath(r.path)
      if (seen.has(path.toLowerCase())) fail('INVALID_SKILL_RESOURCE')
      seen.add(path.toLowerCase())
      const mediaType = path.toLowerCase().endsWith('.md')
        ? ('text/markdown' as const)
        : ('text/plain' as const)
      if (r.mediaType !== mediaType) fail('INVALID_SKILL_RESOURCE')
      const content = text(r.content, 16000, 'INVALID_SKILL_RESOURCE', true)
      total += content.length
      if (total > 24000) fail('INVALID_SKILL_SIZE')
      return { path, mediaType, content }
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.length > 16)
    fail('INVALID_SKILL_DEPENDENCIES')
  const requiredCapabilities = input.requiredCapabilities
    .map((value) => {
      const id = text(value, 120, 'INVALID_SKILL_DEPENDENCIES')
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) fail('INVALID_SKILL_DEPENDENCIES')
      return id
    })
    .sort()
  if (new Set(requiredCapabilities).size !== requiredCapabilities.length)
    fail('INVALID_SKILL_DEPENDENCIES')
  if (
    /(?:password|passwd|api[_-]?key|secret|token)\s*[:=]\s*\S+|Bearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{8,}/i.test(
      JSON.stringify([source, resources, requiredCapabilities]),
    )
  )
    fail('INVALID_SKILL_SECRET')
  const scope = 'mock:skill-text',
    id = 'mock-review'
  const values = ['skill-text-v1', scope, id, input.version, source, raw, String(resources.length)]
  for (const r of resources) values.push(r.path, r.mediaType, r.content)
  values.push(String(requiredCapabilities.length), ...requiredCapabilities)
  return {
    id,
    version: input.version,
    description: 'Safe mock review fixture',
    sourceLabel: source,
    rawSkillMd: raw,
    instructions: 'Review changes and verify tests. This is simulated guidance.\n',
    resources,
    requiredCapabilities,
    scope,
    digest: digest(values),
    enabled: false,
    stateRevision: 1,
    createdAt: null,
    trust: null,
    schemaVersion: 1,
    entry: 'SKILL.md',
    dependencies: requiredCapabilities.map((id) => ({ id, status: 'unknown' })),
  }
}
/** Scalar/file validation precedes Skill resolution in runtime TaskContext.parse. */
export function validSkillTaskFields(value: Record<string, unknown>): boolean {
  const enums: Record<string, string[]> = {
    mode: ['chat', 'code'],
    expert: ['general', 'sql', 'frontend'],
    reasoning: ['default', 'low', 'medium', 'high'],
    approval: ['review', 'read_only'],
  }
  for (const [key, allowed] of Object.entries(enums))
    if (key in value && (typeof value[key] !== 'string' || !allowed.includes(value[key] as string)))
      return false
  for (const [key, max] of Object.entries({
    instructions: 4000,
    prototypeVersionId: 36,
    targetPath: 260,
  }))
    if (key in value && (typeof value[key] !== 'string' || (value[key] as string).length > max))
      return false
  if (
    typeof value.targetPath === 'string' &&
    (value.targetPath.includes('..') ||
      value.targetPath.includes('\\') ||
      value.targetPath.startsWith('/'))
  )
    return false
  if ('files' in value) {
    if (!Array.isArray(value.files) || value.files.length > 6) return false
    let total = 0
    for (const file of value.files) {
      if (
        !file ||
        typeof file !== 'object' ||
        Object.keys(file).sort().join('|') !== 'content|name' ||
        typeof file.name !== 'string' ||
        !file.name.trim() ||
        file.name.length > 160 ||
        typeof file.content !== 'string' ||
        file.content.length > 16000
      )
        return false
      total += file.content.length
    }
    if (total > 24000) return false
  }
  return true
}
export function createSkillBackend() {
  const saved = new Map<string, SkillSnapshot>()
  function get(id: string, version: string) {
    if (!validId(id) || !validVersion(version)) fail('INVALID_SKILL_REF')
    const result = saved.get(id + '/' + version)
    if (!result) fail('SKILL_NOT_FOUND', 404)
    return result
  }
  function selection(value: unknown): { skillRef: SkillRef; resourcePaths: string[] } {
    const body = fields(value, ['skillRef', 'resourcePaths'], 'INVALID_SKILL_CONTEXT'),
      ref = fields(body.skillRef, ['id', 'version', 'digest', 'stateRevision'], 'INVALID_SKILL_REF')
    if (
      !validId(ref.id) ||
      !validVersion(ref.version) ||
      typeof ref.digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(ref.digest) ||
      !Number.isSafeInteger(ref.stateRevision) ||
      Number(ref.stateRevision) < 1
    )
      fail('INVALID_SKILL_REF')
    if (!Array.isArray(body.resourcePaths) || body.resourcePaths.length > 4)
      fail('INVALID_SKILL_RESOURCE_PATHS')
    let paths: string[]
    try {
      paths = body.resourcePaths.map(resourcePath)
    } catch {
      fail('INVALID_SKILL_RESOURCE_PATHS')
    }
    if (new Set(paths.map((p) => p.toLowerCase())).size !== paths.length)
      fail('INVALID_SKILL_RESOURCE_PATHS')
    return {
      skillRef: {
        id: ref.id,
        version: ref.version,
        digest: ref.digest,
        stateRevision: Number(ref.stateRevision),
      },
      resourcePaths: paths,
    }
  }
  function context(value: unknown): SkillContext {
    const { skillRef: ref, resourcePaths } = selection(value)
    const item = get(ref.id, ref.version)
    if (item.digest !== ref.digest || item.stateRevision !== ref.stateRevision)
      fail('SKILL_REF_STALE', 409)
    if (!item.enabled) fail('SKILL_DISABLED', 409)
    const resources = resourcePaths.map((path) => {
      const r = item.resources.find((r) => r.path === path)
      if (!r) fail('INVALID_SKILL_RESOURCE_PATHS')
      return r
    })
    return {
      skillRef: {
        id: item.id,
        version: item.version,
        digest: item.digest,
        stateRevision: item.stateRevision,
      },
      instructions: item.instructions,
      resources,
      dependencies: item.dependencies,
    }
  }
  function handle(
    method: string,
    path: string,
    body: unknown,
  ): { status: number; data: unknown } | undefined {
    if (!path.startsWith('/skills')) return
    try {
      let data: unknown
      if (path === '/skills/preview' && method === 'POST') data = parse(body)
      else if (path === '/skills/context/preview' && method === 'POST') data = context(body)
      else if (path === '/skills' && method === 'GET')
        data = {
          items: [...saved.values()].map((item) => {
            const {
              id,
              version,
              description,
              digest,
              enabled,
              stateRevision,
              sourceLabel,
              createdAt,
              dependencies,
            } = item
            return {
              id,
              version,
              description,
              digest,
              enabled,
              stateRevision,
              sourceLabel,
              createdAt: createdAt!,
              dependencies,
            } satisfies SkillSummary
          }),
        }
      else if (path === '/skills' && method === 'POST') {
        const request = fields(
          body,
          ['input', 'expectedDigest', 'confirmed'],
          'INVALID_SKILL_IMPORT',
        )
        if (request.confirmed !== true) fail('INVALID_SKILL_CONFIRMATION')
        if (
          typeof request.expectedDigest !== 'string' ||
          !/^[0-9a-f]{64}$/.test(request.expectedDigest)
        )
          fail('INVALID_SKILL_DIGEST')
        const item = parse(request.input)
        if (item.digest !== request.expectedDigest) fail('SKILL_DIGEST_MISMATCH', 409)
        const key = item.id + '/' + item.version,
          existing = saved.get(key)
        if (existing && existing.digest !== item.digest) fail('SKILL_VERSION_CONFLICT', 409)
        if (!existing) {
          const now = new Date().toISOString()
          saved.set(key, {
            ...item,
            createdAt: now,
            trust: { operator: 'mock-operator', confirmedAt: now },
          })
        }
        data = saved.get(key)
      } else {
        const match = path.match(/^\/skills\/([^/]+)\/versions\/([^/]+)(\/activation)?$/)
        if (!match) return { status: 404, data: { detail: 'SKILL_NOT_FOUND' } }
        const item = get(decodeURIComponent(match[1]!), decodeURIComponent(match[2]!))
        if (method === 'POST' && match[3]) {
          const request = fields(body, ['enabled', 'stateRevision'], 'INVALID_SKILL_ACTIVATION')
          if (
            typeof request.enabled !== 'boolean' ||
            !Number.isSafeInteger(request.stateRevision) ||
            Number(request.stateRevision) < 1
          )
            fail('INVALID_SKILL_ACTIVATION')
          if (request.stateRevision !== item.stateRevision) fail('SKILL_STATE_STALE', 409)
          item.enabled = request.enabled
          item.stateRevision++
        } else if (method !== 'GET' || match[3])
          return { status: 404, data: { detail: 'SKILL_NOT_FOUND' } }
        data = item
      }
      return { status: 200, data: structuredClone(data) }
    } catch (e) {
      if (e instanceof Rejected) return { status: e.status, data: { detail: e.detail } }
      throw e
    }
  }
  function validate(value: unknown) {
    try {
      selection(value)
      return undefined
    } catch (e) {
      if (e instanceof Rejected) return { status: e.status, data: { detail: e.detail } }
      throw e
    }
  }
  return { handle, validate }
}
