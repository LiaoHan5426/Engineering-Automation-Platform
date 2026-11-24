// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { ensureDshCenterAnchor } from '../src/centerAnchor.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.getElementById('root')?.remove()
})

describe('ensureDshCenterAnchor', () => {
  it('installs #root main.conversation measurement host only', () => {
    const main = document.createElement('div')
    main.className = 'body--chat'
    const col = document.createElement('div')
    col.className = 'main'
    Object.defineProperty(col, 'getBoundingClientRect', {
      value: () => ({
        left: 100,
        right: 900,
        top: 40,
        bottom: 700,
        width: 800,
        height: 660,
        x: 100,
        y: 40,
        toJSON() {
          return this
        },
      }),
    })
    main.appendChild(col)
    document.body.appendChild(main)

    const release = ensureDshCenterAnchor()
    const root = document.getElementById('root')
    expect(root).toBeTruthy()
    expect(root?.querySelector('[data-slot="main.conversation"]')).toBeTruthy()
    expect(document.getElementById('eap-dsh-dock-clearance')).toBeNull()
    release()
    expect(document.getElementById('root')).toBeNull()
  })
})
