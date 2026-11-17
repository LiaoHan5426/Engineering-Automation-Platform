/** Test-only readiness reporter and explicit local credential provider. */
import { writeFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'

export const inject = ['webServer', 'connection', 'connection.authentication', 'clientModules']

/** Publish the OS-selected listener after the actual Host services activate. */
export async function apply(ctx: Context, config: { readyFile: string }): Promise<void> {
  const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
  ctx.connection.authentication.register({
    authenticate: request => (request.headers instanceof Headers ? request.headers.get('x-vue-smoke') : request.headers['x-vue-smoke']) === 'local-test' ? peer : undefined,
  })
  const tree = ctx.fiber.entry?.parent.tree
  if (tree === undefined) throw new Error('smoke carrier requires a real Loader entry')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/vue-smoke/toggle', auth: 'required',
    handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      const disabled = new URL(request.url ?? '/', 'http://localhost').searchParams.get('disabled') === 'true'
      await tree.update('vue-smoke', { disabled })
      response.writeHead(204).end()
    },
  }))
  await writeFile(config.readyFile, JSON.stringify({ port: ctx.webServer.port }))
}
