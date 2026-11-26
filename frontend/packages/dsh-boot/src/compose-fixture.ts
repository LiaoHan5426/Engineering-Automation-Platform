import { CLIENT_MODULES_ID } from './boot-injections.ts'
import type { WebBootEntry, WebBootGraph } from './types.ts'

/**
 * Global required client entry names (from dsh-client-web `boot-client.ts`).
 * A fixture row proves injection only; activation needs built artifacts.
 */
export const FIXTURE_REQUIRED_ENTRY_IDS = [
  CLIENT_MODULES_ID,
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-session-status',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-sidebar',
] as const

function fixtureEntryUrl(id: string): string {
  return `/plugins/fixture/${encodeURIComponent(id)}`
}

function fixtureEntryRev(id: string): string {
  return `fx-${id.replaceAll('/', '-')}`
}

/**
 * Build a stub `WebBootGraph` for Slice B assembly proof without composing
 * dsh-personal at dev-server runtime.
 *
 * Production Host paths use a real composed graph once client artifacts and
 * `ClientModuleRegistry.compose()` are linked; this fixture only validates the
 * index injection contract (`bootInjections` + `__DSH_BOOT__`).
 */
export function composeFixtureGraph(): WebBootGraph {
  const entries: WebBootEntry[] = FIXTURE_REQUIRED_ENTRY_IDS.map((id) => ({
    id,
    url: fixtureEntryUrl(id),
    rev: fixtureEntryRev(id),
    ...(id === CLIENT_MODULES_ID ? { immediately: true as const } : {}),
  }))

  const applicationIds = FIXTURE_REQUIRED_ENTRY_IDS.filter((id) => id !== CLIENT_MODULES_ID)

  return {
    rev: 'fixture-slice-b',
    release: { version: 'fixture', commit: 'eap-slice-b' },
    entries,
    batches: [
      {
        phase: 'bootstrap',
        url: '/plugins/fixture/batch-bootstrap.js',
        rev: 'fixture-bootstrap',
        entries: [CLIENT_MODULES_ID],
      },
      {
        phase: 'application',
        url: '/plugins/fixture/batch-application.js',
        rev: 'fixture-application',
        entries: [...applicationIds],
      },
    ],
  }
}