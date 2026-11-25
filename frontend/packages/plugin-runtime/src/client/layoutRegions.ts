const REGIONS = [
  { id: 'eap-dsh-region-shell', region: 'shell' },
  { id: 'eap-dsh-region-conversation', region: 'conversation' },
  { id: 'eap-dsh-region-settings', region: 'settings' },
  { id: 'eap-dsh-region-sidebar-leading', region: 'sidebar-leading' },
] as const

const RIGHT_ID = 'eap-cordis-sidebar-right'

let retainers = 0
const created = new Set<HTMLElement>()

function mountPoint(): HTMLElement {
  return (
    document.querySelector<HTMLElement>('.app .body') ??
    document.body
  )
}

/** Ensure the five layout outlets exist. The matching release removes only nodes this module created. */
export function retainLayoutRegions(): () => void {
  retainers += 1
  const parent = mountPoint()
  for (const region of REGIONS) {
    let el = document.getElementById(region.id)
    if (!el) {
      el = document.createElement('div')
      el.id = region.id
      el.setAttribute('data-dsh-region', region.region)
      parent.appendChild(el)
      created.add(el)
    } else if (!el.getAttribute('data-dsh-region')) {
      el.setAttribute('data-dsh-region', region.region)
    }
  }
  let right = document.getElementById(RIGHT_ID)
  if (!right) {
    right = document.createElement('aside')
    right.id = RIGHT_ID
    right.className = 'eap-dsh-rightbar'
    parent.appendChild(right)
    created.add(right)
  }
  right.setAttribute('data-dsh-region', 'sidebar-right')
  let released = false
  return () => {
    if (released) return
    released = true
    retainers -= 1
    if (retainers > 0) return
    for (const el of created) el.remove()
    created.clear()
  }
}

export function conversationRegion(): HTMLElement | null {
  return document.getElementById('eap-dsh-region-conversation')
}
