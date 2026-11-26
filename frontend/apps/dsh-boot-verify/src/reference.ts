export function startReference(): void {
  const root = document.getElementById('root')
  const entry = document.querySelector<HTMLElement>('[data-eap-reference-entry]')?.dataset
    .eapReferenceEntry
  if (!root || !entry || !/^\.\/assets\/index-[a-z0-9_-]+\.js$/i.test(entry)) {
    throw new Error('Missing DSH reference entry')
  }

  // Load the browser artifact so its static Vue modules and browser-specific
  // resolution rules match the reference build that generated the boot graph.
  const script = document.createElement('script')
  script.type = 'module'
  script.src = new URL(entry, location.href).href
  script.addEventListener('load', () => {
    root.dataset.eapReferenceBoot = 'entry-loaded'
  })
  script.addEventListener('error', () => {
    root.dataset.eapReferenceBoot = 'failed'
  })
  document.head.append(script)
}
