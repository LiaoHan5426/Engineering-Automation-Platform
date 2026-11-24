/**
 * better-sidebar measures its bottom workbench against DSH AppFrame's center
 * column: `#root [data-slot="main.conversation"]`. EAP's Vue shell uses `#app`
 * instead, so without an anchor the panel stays visibility:hidden at 0 width.
 *
 * The RIGHT column is owned by the Cordis ui-sidebar-right seat
 * (`#eap-cordis-sidebar-right`). This helper is measurement-only — no Host/Agent
 * power and no EAP profile.
 */

const ROOT_ID = 'root'
const SLOT = 'main.conversation'

function measureEapCenter(): { left: number; right: number; top: number; bottom: number } {
  const candidates = [
    document.querySelector<HTMLElement>('.body--chat .main'),
    document.querySelector<HTMLElement>('.app .body > .main'),
    document.querySelector<HTMLElement>('[data-testid="chat-workspace"]'),
    document.querySelector<HTMLElement>('.app .body'),
  ]
  for (const el of candidates) {
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 120 && rect.height > 120) {
      return {
        left: rect.left,
        right: window.innerWidth - rect.right,
        top: rect.top,
        bottom: window.innerHeight - rect.bottom,
      }
    }
  }
  // Fallback: leave room for EAP left nav + optional inspector.
  return { left: 280, right: 320, top: 48, bottom: 0 }
}

export function ensureDshCenterAnchor(): () => void {
  let root = document.getElementById(ROOT_ID)
  let createdRoot = false
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    root.setAttribute('data-eap-dsh-center-root', '')
    document.body.appendChild(root)
    createdRoot = true
  }

  let slot = root.querySelector<HTMLElement>(`[data-slot="${SLOT}"]`)
  let createdSlot = false
  if (!slot) {
    slot = document.createElement('div')
    slot.setAttribute('data-slot', SLOT)
    slot.setAttribute('data-eap-dsh-center-slot', '')
    // display:contents so columnOfSlotHost walks to #root's box.
    slot.style.display = 'contents'
    root.appendChild(slot)
    createdSlot = true
  }

  const applyBox = () => {
    if (!root) return
    const box = measureEapCenter()
    Object.assign(root.style, {
      position: 'fixed',
      left: `${box.left}px`,
      right: `${box.right}px`,
      top: `${box.top}px`,
      bottom: `${box.bottom}px`,
      pointerEvents: 'none',
      zIndex: '0',
      // Real box (not contents) so better-sidebar's column walker stops here.
      display: 'block',
    })
  }
  applyBox()
  const onResize = () => applyBox()
  window.addEventListener('resize', onResize)
  const timer = window.setInterval(applyBox, 1500)

  return () => {
    window.clearInterval(timer)
    window.removeEventListener('resize', onResize)
    if (createdSlot) slot?.remove()
    if (createdRoot) root?.remove()
  }
}
