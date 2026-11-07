/** Minimal capability/MCP catalog for mock mode browser checks. */
export function createMockCapabilityBackend() {
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

  return {
    handle(method: string, path: string) {
      if (method === 'GET' && path === '/capabilities') {
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
            settings: {},
            disabledCapabilities: [],
            declared: [],
            unregistered: [],
            undeclared: [],
          },
        }
      }
      if (method === 'GET' && path === '/runtime/trusted-tools') {
        return { status: 200, data: { items: [] } }
      }
      if (method === 'GET' && path === '/mcp-servers') {
        return { status: 200, data: { items: mcpServers } }
      }
      return null
    },
  }
}
