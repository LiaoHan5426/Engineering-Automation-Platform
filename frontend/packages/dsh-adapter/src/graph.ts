export function requireBrowserServices(
  services: readonly string[],
  has: (name: string) => boolean,
) {
  for (const service of services)
    if (!has(service)) throw new Error(`DSH_MISSING_SERVICE:${service}`)
}

const prefix = '@deepseek-ai/dsh-client-'
export const browserRoster = Object.freeze([
  {
    id: prefix + 'ui-shortcuts',
    inject: [prefix + 'locale', prefix + 'ui-layout', prefix + 'shortcuts'],
  },
  { id: prefix + 'ui-file-actions', inject: [] },
  { id: prefix + 'locale', inject: [] },
  { id: prefix + 'ui-layout', inject: [] },
  { id: prefix + 'shortcuts', inject: [prefix + 'locale'] },
  {
    id: prefix + 'ui-context-menu',
    inject: [prefix + 'locale', prefix + 'ui-layout', prefix + 'shortcuts'],
  },
])
export const browserManifest = {
  rev: '39163dd30f703a79079e2d2446545cff3c453738',
  release: { version: '0.2.2-rc.3', commit: '39163dd30f703a79079e2d2446545cff3c453738' },
  entries: browserRoster.map((row) => ({
    ...row,
    rev: '39163dd',
    url: 'eap-static:reviewed?rev=39163dd',
  })),
  batches: [
    {
      phase: 'application',
      url: 'eap-static:reviewed?rev=39163dd',
      rev: '39163dd',
      entries: browserRoster.map((row) => row.id),
    },
  ],
}
