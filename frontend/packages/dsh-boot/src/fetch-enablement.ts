import type { UiClientContribution } from './types.ts'

/** Fetch py-backend plugin UI enablement (`uiClients`). */
export async function fetchEnablement(apiBase = ''): Promise<UiClientContribution[]> {
  const base = apiBase.replace(/\/$/, '')
  const url = `${base}/api/plugins/contributions`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`dsh-boot: contributions failed (${response.status})`)
  }
  const body = (await response.json()) as { uiClients?: UiClientContribution[] }
  return (body.uiClients ?? []).filter(
    (item) => item.controlPlane === undefined || item.controlPlane === 'py-backend',
  )
}