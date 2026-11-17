// @vitest-environment jsdom
/** Optional voice entries follow the production Loader and unload lifecycle. */
import { expect } from 'vitest'
import { openStream } from '@deepseek-ai/dsh-remote-mock'
import {
  ClientRoster,
  createClientTest,
  webApp,
} from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import manifest from '../package.json' with { type: 'json' }
import { VoiceInput } from '../src/client/VoiceInput.tsx'
import { VoicePreparation } from '../src/client/PreparationCard.tsx'
import { VoiceSetupPrompt } from '../src/client/VoiceSetupPrompt.tsx'

const VOICE = manifest.name
const roster = ClientRoster.of([
  ...webApp.rows,
  {
    name: VOICE,
    inject: manifest.dsh.client.inject,
    immediately: false,
  },
]).closure([
  VOICE,
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-tool',
])
const test = createClientTest({ roster }, { mount: true, mountedRemoteNamespaces: ['speech'] })

test('loads the optional voice entries and removes them on unload', async ({ start, mock }) => {
  mock.load({ stream: { 'speech/follow': openStream([]) } })
  const client = await start()
  const positions = [
    'conversation.input.activity',
    'plugins.bundle.config',
    'plugins.bundle.activation',
  ] as const
  for (const position of positions) {
    expect(
      client.ctx.slots
        .entries(position)
        .some(entry =>
          [VoiceInput, VoicePreparation, VoiceSetupPrompt].some(
            component => component === entry.component,
          ),
        ),
    ).toBe(true)
  }
  await expect.poll(() => mock.log.streams().find(stream => stream.endpoint === 'speech/follow')?.state).toBe('open')
  expect(mock.log.streams().find(stream => stream.endpoint === 'speech/follow')?.args).toEqual([{}])
  await client.unload(VOICE)
  await expect.poll(() => mock.log.streams().find(stream => stream.endpoint === 'speech/follow')?.state).toBe('cancelled')
  for (const position of positions) {
    expect(
      client.ctx.slots
        .entries(position)
        .some(entry =>
          [VoiceInput, VoicePreparation, VoiceSetupPrompt].some(
            component => component === entry.component,
          ),
        ),
    ).toBe(false)
  }
}, 60_000)
