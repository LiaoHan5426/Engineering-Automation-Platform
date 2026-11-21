/**
 * Local rule-pack fixtures. The mock never evaluates SQL or persists anything;
 * it only returns the shapes the rule manager needs to exercise its UI.
 */
type RulePackSummary = {
  id: string
  name: string
  description?: string | null
  version?: number | null
  ruleCount: number
  shipped: boolean
  editable: boolean
  enabled: boolean
  revision: number
  requires?: string[]
  requiredFacts?: string[]
}

type StoredPack = RulePackSummary & { manifest: string }

const VOCABULARY = {
  facts: [
    { id: 'table.count', label: '涉及表数量', type: 'number' },
    { id: 'join.count', label: 'JOIN 数量', type: 'number' },
    { id: 'where.missing', label: '缺少 WHERE', type: 'boolean' },
    { id: 'select.star', label: '使用 SELECT *', type: 'boolean' },
  ],
  operators: ['eq', 'gt', 'gte', 'lt', 'contains', 'exists'],
  producers: ['sql.parse', 'sql.metadata'],
}

const MANIFEST = (id: string, name: string, ruleCount: number, requires: string[]) =>
  JSON.stringify(
    {
      id,
      name,
      version: 1,
      requires: { capabilities: requires },
      rules: Array.from({ length: ruleCount }, (_, index) => ({
        id: `${id}-r${index + 1}`,
        title: `示例规则 ${index + 1}`,
        when: { fact: 'table.count', op: 'gt', value: 0 },
        then: { severity: 'warning', message: '示例判定，仅用于本地视觉验收' },
      })),
    },
    null,
    2,
  )

export function createRuleBackend() {
  const packs = new Map<string, StoredPack>()
  const seed = (pack: StoredPack) => packs.set(pack.id, pack)
  seed({
    id: 'shipped-core',
    name: '内置核心规则',
    description: '随产品发布，只读',
    version: 1,
    ruleCount: 8,
    shipped: true,
    editable: false,
    enabled: true,
    revision: 1,
    requires: ['sql.parse'],
    requiredFacts: ['table.count', 'where.missing'],
    manifest: MANIFEST('shipped-core', '内置核心规则', 8, ['sql.parse']),
  })
  seed({
    id: 'custom-credit',
    name: '信贷风控自定义规则',
    description: '本地视觉验收样例',
    version: 1,
    ruleCount: 5,
    shipped: false,
    editable: true,
    enabled: true,
    revision: 3,
    requires: ['sql.parse', 'sql.metadata'],
    requiredFacts: ['join.count'],
    manifest: MANIFEST('custom-credit', '信贷风控自定义规则', 5, ['sql.parse', 'sql.metadata']),
  })
  seed({
    id: 'custom-disabled',
    name: '停用的实验规则',
    description: '用于展示已停用状态',
    version: 1,
    ruleCount: 2,
    shipped: false,
    editable: true,
    enabled: false,
    revision: 1,
    requires: [],
    manifest: MANIFEST('custom-disabled', '停用的实验规则', 2, []),
  })

  const reply = (status: number, data: unknown) => ({ status, data })
  const publicFields = (pack: StoredPack): RulePackSummary => {
    const { manifest: _manifest, ...summary } = pack
    return structuredClone(summary)
  }

  return {
    handle(method: string, url: URL, body: Record<string, unknown>) {
      const path = url.pathname
      if (!/^\/rule-packs(?:\/|$)/.test(path)) return undefined

      if (method === 'GET' && path === '/rule-packs') {
        return reply(200, { items: [...packs.values()].map(publicFields) })
      }
      if (method === 'GET' && path === '/rule-packs/vocabulary') {
        return reply(200, structuredClone(VOCABULARY))
      }
      if (method === 'POST' && path === '/rule-packs/validate') {
        return reply(200, { valid: true, errors: [], requirements: { declared: [], derived: [] } })
      }
      if (method === 'POST' && path === '/rule-packs/dry-run') {
        return reply(200, { findings: [], sql: body.sql ?? '' })
      }
      if (method === 'POST' && path === '/rule-packs') {
        const id =
          typeof body.id === 'string' && body.id.trim()
            ? body.id.trim()
            : `custom-${packs.size + 1}`
        if (packs.has(id)) return reply(409, { message: '标识已存在' })
        const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : id
        const manifest = typeof body.manifest === 'string' ? body.manifest : '{}'
        const pack: StoredPack = {
          id,
          name,
          ruleCount: 0,
          shipped: false,
          editable: true,
          enabled: true,
          revision: 1,
          requires: [],
          manifest,
        }
        packs.set(id, pack)
        return reply(200, { id, revision: pack.revision, enabled: true })
      }

      const id = decodeURIComponent(path.slice('/rule-packs/'.length).split('/')[0] ?? '')
      const pack = packs.get(id)
      if (!pack) return reply(404, { message: '规则包不存在' })

      if (method === 'GET' && path === `/rule-packs/${encodeURIComponent(id)}`) {
        return reply(200, {
          manifest: pack.manifest,
          shipped: pack.shipped,
          editable: pack.editable,
          requirements: {
            declared: pack.requires ?? [],
            derived: [],
            facts: pack.requiredFacts ?? [],
          },
        })
      }
      if (method === 'PUT' && path === `/rule-packs/${encodeURIComponent(id)}`) {
        if (typeof body.manifest === 'string') pack.manifest = body.manifest
        if (typeof body.name === 'string' && body.name.trim()) pack.name = body.name.trim()
        pack.revision += 1
        return reply(200, { id, revision: pack.revision, enabled: pack.enabled })
      }
      if (
        method === 'PUT' &&
        path === `/rule-packs/${encodeURIComponent(id)}/activation` &&
        typeof body.enabled === 'boolean'
      ) {
        pack.enabled = body.enabled
        return reply(200, { id, revision: pack.revision, enabled: pack.enabled })
      }
      if (method === 'DELETE' && path === `/rule-packs/${encodeURIComponent(id)}`) {
        if (pack.shipped) return reply(400, { message: '内置包不可删除' })
        packs.delete(id)
        return reply(200, { id })
      }
      return reply(404, { message: '规则包路由不存在' })
    },
  }
}
