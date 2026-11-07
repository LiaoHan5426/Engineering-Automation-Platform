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
    {
      packageName: '@modelcontextprotocol/server-sequential-thinking',
      version: '0.6.2',
      packageAtVersion: '@modelcontextprotocol/server-sequential-thinking@0.6.2',
      endpoint: 'npx -y @modelcontextprotocol/server-sequential-thinking@0.6.2',
      readonlyTools: ['sequentialthinking'],
      preferredTool: 'sequentialthinking',
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

  const trustedTools = [
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
          data: { items: trustedTools, source: 'mock-capability-handlers' },
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
