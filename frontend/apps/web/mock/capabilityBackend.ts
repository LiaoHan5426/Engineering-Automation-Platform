/** Minimal capability/MCP catalog for mock mode browser checks. */
export type TrustedGitMockOutcome = 'success' | 'denied' | 'timeout' | 'cancelled'
export type TrustedVersionProbeOutcome = 'success' | 'fail' | 'conflict' | 'disabled'

type PersistedProbe = {
  versionStatus: string
  detectedVersion: string
  probedAt: string
  probeNote: string
  bindingNote: string
}

/** Module-scoped TD-01 probe cache so remounted mock backends keep durable writeback. */
const persistedTrustedProbes = new Map<string, PersistedProbe>()

export function createMockCapabilityBackend() {
  const productionMatrix = [
    {
      packageName: '@modelcontextprotocol/server-everything',
      version: '2.2.1',
      packageAtVersion: '@modelcontextprotocol/server-everything@2.2.1',
      endpoint: 'npx -y @modelcontextprotocol/server-everything@2.2.1',
      readonlyTools: ['echo'],
      preferredTool: 'echo',
    },
    {
      packageName: '@modelcontextprotocol/server-sequential-thinking',
      version: '0.6.2',
      packageAtVersion: '@modelcontextprotocol/server-sequential-thinking@0.6.2',
      endpoint: 'npx -y @modelcontextprotocol/server-sequential-thinking@0.6.2',
      readonlyTools: ['sequentialthinking'],
      preferredTool: 'sequentialthinking',
    },
    {
      packageName: '@modelcontextprotocol/server-memory',
      version: '2025.11.25',
      packageAtVersion: '@modelcontextprotocol/server-memory@2025.11.25',
      endpoint: 'npx -y @modelcontextprotocol/server-memory@2025.11.25',
      readonlyTools: ['read_graph'],
      preferredTool: 'read_graph',
    },
  ]
  const mcpServers = [
    {
      id: 'official-readonly',
      name: '官方只读样例',
      transport: 'stdio',
      endpoint: 'npx -y @modelcontextprotocol/server-everything@2.2.1',
      trusted: true,
      enabled: true,
      usable: true,
      tools: ['echo'],
      productionGrantedTools: ['echo'],
      productionGranted: true,
      capabilities: ['mcp.official-readonly.echo'],
      authorisedExperts: [] as string[],
      enabledExperts: [] as string[],
      problems: [] as string[],
    },
  ]

  type MockTrustedTool = {
    id: string
    title: string
    kind: string
    scope: string
    readOnly: boolean
    enabled: boolean
    invocation: string
    summary: string
    bindingStatus: string
    bindingSource: string
    binary: string
    resolvedPath: string
    versionStatus: string
    detectedVersion?: string
    probedAt?: string
    probeNote?: string
    bindingNote: string
  }

  const trustedTools: MockTrustedTool[] = [
    {
      id: 'git-status',
      title: 'Git status（只读）',
      kind: 'cli',
      scope: 'platform',
      readOnly: true,
      enabled: true,
      invocation: 'POST /api/runtime/trusted-tools/git-status/invoke',
      summary: '只读检查工作区状态；不修改文件。',
      bindingStatus: 'ready',
      bindingSource: 'shipped',
      binary: 'git',
      resolvedPath: '/mock/bin/git',
      versionStatus: 'unknown',
      bindingNote: '二进制已解析；版本未知（目录不自动探测）。',
    },
    {
      id: 'git-diff',
      title: 'Git diff（只读）',
      kind: 'cli',
      scope: 'platform',
      readOnly: true,
      enabled: false,
      invocation: '',
      summary: '只读检查工作区差异；不修改文件。',
      bindingStatus: 'disabled',
      bindingSource: 'shipped',
      binary: 'git',
      resolvedPath: '/mock/bin/git',
      versionStatus: 'unknown',
      bindingNote: '已停用快照：定义与绑定保留，调用入口拒绝执行。',
    },
    {
      id: 'broken-cli',
      title: '冲突覆盖样例',
      kind: 'cli',
      scope: 'platform',
      readOnly: true,
      enabled: true,
      invocation: '',
      summary: 'mock：操作员覆盖路径不可用，演示绑定冲突。',
      bindingStatus: 'conflict',
      bindingSource: 'operator',
      binary: '/missing/mock-git',
      resolvedPath: '',
      versionStatus: 'unknown',
      bindingNote: '操作员覆盖路径不可用，未静默回退到随附二进制。',
    },
  ]

  for (const tool of trustedTools) {
    const cached = persistedTrustedProbes.get(tool.id)
    if (!cached) continue
    tool.versionStatus = cached.versionStatus
    tool.detectedVersion = cached.detectedVersion
    tool.probedAt = cached.probedAt
    tool.probeNote = cached.probeNote
    tool.bindingNote = cached.bindingNote
  }

  function parseOutcome(path: string): TrustedGitMockOutcome {
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(query)
    const raw = (params.get('mockOutcome') || 'success').trim().toLowerCase()
    if (raw === 'denied' || raw === 'timeout' || raw === 'cancelled') return raw
    return 'success'
  }

  function parseProbeOutcome(path: string): TrustedVersionProbeOutcome {
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(query)
    const raw = (params.get('mockOutcome') || 'success').trim().toLowerCase()
    if (raw === 'fail' || raw === 'conflict' || raw === 'disabled') return raw
    return 'success'
  }

  function pathnameOnly(path: string): string {
    return path.includes('?') ? path.slice(0, path.indexOf('?')) : path
  }

  return {
    async handle(method: string, path: string) {
      const route = pathnameOnly(path)
      if (method === 'GET' && route === '/capabilities') {
        return {
          status: 200,
          data: {
            items: [],
            kinds: [
              {
                id: 'mcp',
                label: 'MCP 工具',
                description: '已登记的 MCP 服务器工具',
                count: 1,
                scope: 'expert',
                scopeLabel: '专家级',
                expertScoped: true,
                management: {
                  id: 'server-registry',
                  label: '服务器登记',
                  description: '登记 MCP 服务器与工具白名单',
                  creation: 'operator',
                  manageable: true,
                },
                manageable: true,
                visible: true,
                availability: { total: 1, available: 1 },
              },
            ],
            capabilities: [],
            globallyUsable: [],
            disabledPlatform: [],
            expertScoped: ['mcp.official-readonly.echo'],
            platformScoped: [],
            expertScopedVocabulary: ['mcp.official-readonly.echo'],
            mcpServers,
            mcpProductionMatrix: productionMatrix,
            settings: {},
            disabledCapabilities: [],
            declared: [],
            unregistered: [],
            undeclared: [],
          },
        }
      }
      if (method === 'GET' && route === '/runtime/trusted-tools') {
        return {
          status: 200,
          data: { items: trustedTools, source: 'mock-capability-handlers' },
        }
      }
      if (method === 'POST' && /^\/runtime\/trusted-tools\/[^/]+\/probe-version$/.test(route)) {
        const id = route.split('/')[3]
        const tool = trustedTools.find((item) => item.id === id)
        if (!tool) return { status: 404, data: { detail: 'TRUSTED_TOOL_NOT_FOUND' } }
        const outcome = parseProbeOutcome(path)
        if (outcome === 'disabled' || tool.bindingStatus === 'disabled') {
          return { status: 403, data: { detail: 'CAPABILITY_DISABLED' } }
        }
        if (outcome === 'conflict' || tool.bindingStatus === 'conflict') {
          return { status: 409, data: { detail: 'BINDING_CONFLICT' } }
        }
        if (outcome === 'fail') {
          tool.versionStatus = 'probe_failed'
          tool.detectedVersion = ''
          tool.probedAt = '2026-11-07T04:00:00Z'
          tool.probeNote = 'mock：显式探测失败，未伪造版本。'
          tool.bindingNote = tool.probeNote
          persistedTrustedProbes.set(id, {
            versionStatus: tool.versionStatus,
            detectedVersion: '',
            probedAt: tool.probedAt,
            probeNote: tool.probeNote,
            bindingNote: tool.bindingNote,
          })
          return {
            status: 200,
            data: {
              id,
              versionStatus: 'probe_failed',
              detectedVersion: '',
              probedAt: tool.probedAt,
              resolvedPath: tool.resolvedPath,
              success: false,
              message: tool.probeNote,
              output: '',
            },
          }
        }
        tool.versionStatus = 'known'
        tool.detectedVersion = 'git version 2.45.1 (mock)'
        tool.probedAt = '2026-11-07T04:00:00Z'
        tool.probeNote = 'mock：显式探测成功；已持久化写回。'
        tool.bindingNote = '二进制已解析；版本已由显式探测持久化写回。'
        persistedTrustedProbes.set(id, {
          versionStatus: tool.versionStatus,
          detectedVersion: tool.detectedVersion,
          probedAt: tool.probedAt,
          probeNote: tool.probeNote,
          bindingNote: tool.bindingNote,
        })
        return {
          status: 200,
          data: {
            id,
            versionStatus: 'known',
            detectedVersion: tool.detectedVersion,
            probedAt: tool.probedAt,
            resolvedPath: tool.resolvedPath,
            success: true,
            message: tool.probeNote,
            output: tool.detectedVersion,
          },
        }
      }
      if (method === 'POST' && route === '/runtime/trusted-tools/git-status/invoke') {
        const outcome = parseOutcome(path)
        if (outcome === 'denied') {
          return { status: 403, data: { detail: 'CAPABILITY_DISABLED' } }
        }
        if (outcome === 'timeout') {
          await new Promise((resolve) => setTimeout(resolve, 40))
          return { status: 504, data: { detail: 'TRUSTED_TOOL_TIMEOUT' } }
        }
        if (outcome === 'cancelled') {
          return { status: 499, data: { detail: 'TRUSTED_TOOL_CANCELLED' } }
        }
        return {
          status: 200,
          data: {
            capability: 'git-status',
            success: true,
            message: 'mock：只读 git status 已返回（未调用真实 git）',
            stdout: '## mock-branch\n M frontend/apps/web/mock/capabilityBackend.ts\n',
            exitCode: 0,
          },
        }
      }
      if (method === 'GET' && route === '/mcp-servers') {
        return { status: 200, data: { items: mcpServers, productionMatrix } }
      }
      if (method === 'GET' && route === '/runtime/data-layout') {
        return {
          status: 200,
          data: {
            physicalMigration: false,
            entries: [
              {
                logical: 'data-root',
                resolved: '/mock/.eap',
                exists: true,
                note: '本机应用数据根（mock）',
              },
              {
                logical: 'cache/trusted-tool-probes',
                resolved: '/mock/.eap/cache/trusted-tool-probes.json',
                exists: true,
                note: 'TD-01 版本探测持久缓存（mock）',
              },
              {
                logical: 'artifacts/ai',
                resolved: '/mock/.eap-ai-artifacts',
                exists: true,
                note: 'AI 执行产物目录（mock）',
              },
            ],
            migrationReadiness: {
              status: 'candidates_present',
              physicalMigration: false,
              approved: false,
              note: '只读盘点旧/现路径存在性；未批准不执行物理迁移或删除。',
              candidates: [
                {
                  id: 'legacy-ai-artifacts',
                  resolved: '/mock/.eap-ai-artifacts',
                  present: true,
                  note: '当前配置的 AI 产物路径；目标归属仍待批准后迁入 data-root/artifacts',
                },
                {
                  id: 'trusted-tool-probes',
                  resolved: '/mock/.eap/cache/trusted-tool-probes.json',
                  present: true,
                  note: 'TD-01 探测缓存已按目标 cache 布局落盘；不是物理迁移动作',
                },
              ],
            },
          },
        }
      }
      return null
    },
  }
}
