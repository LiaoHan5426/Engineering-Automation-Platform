// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { ensureDshCenterAnchor } from '../src/centerAnchor.ts'

afterEach(() => {
  document.body.innerHTML = ''
  document.getElementById('root')?.remove()
})

describe('ensureDshCenterAnchor', () => {
  it('installs the conversation outlet as the measurement box', () => {
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
    expect(document.querySelector('[data-dsh-region="conversation"]')).toBeTruthy()
    expect(document.getElementById('root')).toBeNull()
    expect(document.querySelector('[data-slot="main.conversation"]')).toBeNull()
    expect(document.querySelector('[data-slot="dsh-layout-main.conversation"]')).toBeNull()
    release()
    expect(document.querySelector('[data-dsh-region="conversation"]')).toBeNull()
  })
})
