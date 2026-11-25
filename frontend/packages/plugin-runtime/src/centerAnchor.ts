/**
 * Position the conversation layout outlet over the EAP chat column.
 * The outlet is the measurement box. Slot hosts inside it use layout names
 * (`dsh-layout-main.conversation`); this helper does not create a second node.
 */

import { conversationRegion, retainLayoutRegions } from './client/layoutRegions'

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
  return { left: 280, right: 320, top: 48, bottom: 0 }
}

export function ensureDshCenterAnchor(): () => void {
  const release = retainLayoutRegions()
  const region = conversationRegion()
  const applyBox = () => {
    const target = conversationRegion()
    if (!target) return
    const box = measureEapCenter()
    Object.assign(target.style, {
      position: 'fixed',
      left: `${box.left}px`,
      right: `${box.right}px`,
      top: `${box.top}px`,
      bottom: `${box.bottom}px`,
      pointerEvents: 'none',
      zIndex: '1',
    })
  }
  applyBox()
  const onResize = () => applyBox()
  window.addEventListener('resize', onResize)
  const timer = window.setInterval(applyBox, 1500)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('resize', onResize)
    if (region) region.removeAttribute('style')
    release()
  }
}
