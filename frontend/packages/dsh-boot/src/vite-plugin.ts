import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { composeArtifactBoot } from './compose-artifacts.ts'
import type { Plugin, ViteDevServer } from 'vite'
import { bootInjections } from './boot-injections.ts'
import { composeFixtureGraph } from './compose-fixture.ts'
import { renderIndexInjections } from './injections.ts'

const FIXTURE_STUB_BODY = '/* Injection fixture: no client artifact is executed. */'

function installFixtureMiddleware(server: ViteDevServer): void {
  server.middlewares.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const path = req.url?.split('?')[0] ?? ''
    if (!path.startsWith('/plugins/fixture/')) return next()
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    if (req.method === 'HEAD') {
      res.statusCode = 200
      res.end()
      return
    }
    res.end(FIXTURE_STUB_BODY)
  })
}

/** Inject the static protocol fixture for wire-format checks. */
export function eapDshBoot(): Plugin {
  return {
    name: '@eap/dsh-boot/fixture',
    configureServer: installFixtureMiddleware,
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return renderIndexInjections(html, bootInjections(composeFixtureGraph()))
      },
    },
  }
}

const GRAPH_FILE = 'eap-dsh/core-graph.json'

/** Use the same Host graph generation for development and the built preview. */
export function eapDshArtifactBoot(root: string, document: string): Plugin {
  let built: ReturnType<typeof composeArtifactBoot> | undefined
  const compose = () => (built ??= composeArtifactBoot(root, []))
  return {
    name: '@eap/dsh-boot/artifacts',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return context.bundle === undefined && context.server ? html : document
      },
    },
    async writeBundle(options) {
      if (!options.dir) throw new Error('DSH artifacts require an output directory')
      const { graph } = await compose()
      const index = resolve(options.dir, 'index.html')
      writeFileSync(index, renderIndexInjections(readFileSync(index, 'utf8'), bootInjections(graph)))
    },
    async generateBundle() {
      const { graph, artifacts } = await compose()
      this.emitFile({ type: 'asset', fileName: GRAPH_FILE, source: JSON.stringify(graph) })
      for (const { row, source } of artifacts.values()) {
        this.emitFile({
          type: 'asset',
          fileName: decodeURIComponent(new URL(row.url, 'http://localhost').pathname.slice(1)),
          source,
        })
      }
    },
    async configureServer(server) {
      const { graph, artifacts } = await compose()
      const sources = new Map([...artifacts.values()].map(({ row, source }) => [row.url, source]))
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname.startsWith('/eap-dsh/client/')) {
          const source = sources.get(url.pathname + url.search)
          if (!source) {
            res.statusCode = 404
            return res.end()
          }
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          return res.end(source)
        }
        if (url.pathname !== '/' && url.pathname !== '/index.html') return next()
        try {
          const html = await server.transformIndexHtml(req.url ?? '/', document)
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          return res.end(renderIndexInjections(html, bootInjections(graph)))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}
