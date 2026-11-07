/** Minimal capability/MCP catalog for mock mode browser checks. */
export type TrustedGitMockOutcome = 'success' | 'denied' | 'timeout' | 'cancelled'

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

  const trustedGitTool = {
    id: 'git-status',
    title: 'Git status（只读）',
    kind: 'cli',
    scope: 'platform',
    readOnly: true,
    enabled: true,
    invocation: 'POST /api/runtime/trusted-tools/git-status/invoke',
    summary: '只读检查工作区状态；不修改文件。',
  }

  function parseOutcome(path: string): TrustedGitMockOutcome {
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
    const params = new URLSearchParams(query)
    const raw = (params.get('mockOutcome') || 'success').trim().toLowerCase()
    if (raw === 'denied' || raw === 'timeout' || raw === 'cancelled') return raw
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
          data: { items: [trustedGitTool], source: 'mock-capability-handlers' },
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
      return null
    },
  }
}
