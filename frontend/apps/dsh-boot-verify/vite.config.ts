import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { get, type IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import { eapDshArtifactBoot, eapDshBoot } from '@eap/dsh-boot/vite'

const referenceIndexScript =
  /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="(\.\/assets\/index-[a-z0-9_-]+\.js)")[^>]*><\/script>/i

function requestReferenceIndex(origin: URL, incoming: IncomingMessage): Promise<IncomingMessage> {
  const authority = incoming.headers.host
  if (!authority || !/^127\.0\.0\.1(?::[0-9]+)?$/.test(authority)) {
    return Promise.reject(new Error('Reference verification must be opened on 127.0.0.1'))
  }
  return new Promise((resolve, reject) => {
    const request = get(
      new URL('/' + new URL(incoming.url ?? '/', origin).search, origin),
      {
        // DSH binds its cookie to the HTTP authority, including the port.
        // Forward the same authority used by Vite's RPC proxy.
        headers: { host: authority, cookie: incoming.headers.cookie ?? '', accept: 'text/html' },
        signal: AbortSignal.timeout(10_000),
      },
      resolve,
    )
    request.on('error', reject)
  })
}

function referenceDocument(origin: URL, bootstrap: string): Plugin {
  return {
    name: 'eap-dsh-reference-document',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? '/', origin)
        if (req.method !== 'GET' || requestUrl.pathname !== '/') return next()
        try {
          const upstream = await requestReferenceIndex(origin, req)
          const status = upstream.statusCode ?? 502
          res.statusCode = status
          for (const key of [
            'content-type',
            'cache-control',
            'content-security-policy',
            'set-cookie',
          ]) {
            const value = upstream.headers[key]
            if (value !== undefined) res.setHeader(key, value)
          }
          const location = upstream.headers.location
          if (location !== undefined) {
            const target = new URL(location, origin)
            const browserOrigin = 'http://' + req.headers.host
            if (target.origin !== origin.origin && target.origin !== browserOrigin) {
              throw new Error('Unexpected reference Host redirect')
            }
            res.setHeader('Location', target.pathname + target.search + target.hash)
          }
          let html = ''
          upstream.setEncoding('utf8')
          for await (const chunk of upstream) html += chunk
          if (status < 200 || status >= 300) return res.end(html)
          const entry = referenceIndexScript.exec(html)?.[1]
          if (!entry || !html.includes('__DSH_BOOT__')) {
            throw new Error('Reference Host did not serve the expected built DSH document')
          }
          const bridge = `<script type="module" src="/src/${bootstrap}.ts" data-eap-reference-entry="${entry}"></script>`
          res.end(html.replace(referenceIndexScript, bridge))
        } catch (cause) {
          res.statusCode = 502
          res.removeHeader('Location')
          res.removeHeader('Set-Cookie')
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(cause instanceof Error ? cause.message : 'Reference Host unavailable')
        }
      })
    },
  }
}

function loopbackOrigin(value: string): URL {
  const origin = new URL(value)
  if (
    origin.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Reference verification requires a local HTTP Host origin')
  }
  return origin
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const referenceOrigin = process.env.EAP_DSH_REFERENCE_ORIGIN ?? env.EAP_DSH_REFERENCE_ORIGIN
  if (mode === 'reference' || mode === 'reference-react') {
    if (!referenceOrigin) throw new Error('Set EAP_DSH_REFERENCE_ORIGIN for reference mode')
    if (command !== 'serve') throw new Error('Reference verification requires Vite dev')
    const origin = loopbackOrigin(referenceOrigin)
    const reactEnabled = mode === 'reference-react'
    const sidebarOrigin =
      process.env.EAP_DSH_VERIFY_SIDEBAR_ORIGIN ?? env.EAP_DSH_VERIFY_SIDEBAR_ORIGIN
    if (sidebarOrigin && !reactEnabled)
      throw new Error('Sidebar verification requires reference-react mode')
    const sidebarTarget = sidebarOrigin ? loopbackOrigin(sidebarOrigin).origin : origin.origin
    return {
      plugins: [
        referenceDocument(origin, reactEnabled ? 'reference-react' : 'reference-entry'),
        vue(),
      ],
      cacheDir: reactEnabled
        ? 'node_modules/.vite-reference-react'
        : 'node_modules/.vite-reference',
      optimizeDeps: {
        noDiscovery: true,
        ...(reactEnabled
          ? {
              include: [
                '@eap/plugin-runtime > react',
                '@eap/plugin-runtime > react-dom',
                '@eap/plugin-runtime > react-dom/client',
                '@eap/plugin-runtime > react/jsx-runtime',
              ],
            }
          : {}),
      },
      server: {
        host: '127.0.0.1',
        port: 5199,
        proxy: {
          '^/sidebar(/|$)': {
            target: sidebarTarget,
            changeOrigin: false,
            ws: true,
            configure(proxy) {
              if (!sidebarOrigin) return
              // The split Host has its own authority; do not forward DSH credentials.
              proxy.on('proxyReq', (request) => {
                request.removeHeader('cookie')
                request.removeHeader('authorization')
              })
              proxy.on('proxyReqWs', (request) => {
                request.removeHeader('cookie')
                request.removeHeader('authorization')
              })
            },
          },
          '^/api(/|$)': { target: origin.origin, changeOrigin: false, ws: true },
          '^/(?!src/|@|node_modules/)': { target: origin.origin, changeOrigin: false },
        },
      },
    }
  }

  const target = process.env.EAP_API_PROXY ?? env.EAP_API_PROXY ?? 'http://127.0.0.1:8080'
  if (mode !== 'fixture') {
    const root = resolve(process.cwd(), '../../../dsh-personal')
    const dist = join(root, 'apps/web/dist')
    const html = readFileSync(join(dist, 'index.html'), 'utf8')
    if (!referenceIndexScript.test(html)) throw new Error('Missing built DSH browser entry')
    const document = html.replace(
      referenceIndexScript,
      '<meta data-eap-reference-entry="$1" data-eap-artifact-graph><script type="module" src="/src/reference-react.ts"></script>',
    )
    return {
      publicDir: dist,
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      plugins: [eapDshArtifactBoot(root, document), vue()],
      cacheDir: 'node_modules/.vite-eap-artifacts',
      optimizeDeps: {
        noDiscovery: true,
        include: [
          '@eap/plugin-runtime > react',
          '@eap/plugin-runtime > react-dom',
          '@eap/plugin-runtime > react-dom/client',
          '@eap/plugin-runtime > react/jsx-runtime',
        ],
      },
      server: {
        host: '127.0.0.1',
        port: 5173,
        proxy: {
          '^/api(/|$)': { target, changeOrigin: false, ws: true },
          '^/sidebar(/|$)': { target, changeOrigin: false, ws: true },
        },
      },
    }
  }
  return {
    plugins: [vue(), eapDshBoot()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true, ws: true },
        '/sidebar': { target, changeOrigin: true },
      },
    },
  }
})
