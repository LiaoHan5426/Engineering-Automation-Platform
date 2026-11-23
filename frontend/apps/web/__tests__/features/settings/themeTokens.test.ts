// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

/**
 * Ardot board 02 (`Code 编程工作台 · Light`) is the same four-column canvas as
 * board 01 (dark). The entire light variant is delivered by swapping `--eap-*`
 * token values, not by forking component CSS. That only stays true while both
 * theme files define the same semantic token names. A token present in dark but
 * missing in light falls back to a browser default and is exactly how a white-
 * on-white / unreadable-control regression slips in.
 *
 * These tests guard that contract at the source, complementing the behavioural
 * appearance tests (decode/apply) which cannot see the CSS definitions.
 */
const themesDir = join(import.meta.dirname, '../../../../../packages/style/src/themes')

function tokenNames(file: string): Set<string> {
  const css = readFileSync(join(themesDir, file), 'utf8')
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1] as string))
}

// Tokens that carry a theme-specific colour/surface meaning. Design constants
// (radius, spacing, font, z-index, size, transition) live only in the light
// file's `:root` block and are shared by both themes, so they are intentionally
// excluded from this parity set.
const semanticPrefixes = [
  '--eap-color-',
  '--eap-text-color-',
  '--eap-bg-color',
  '--eap-fill-color',
  '--eap-border-color',
  '--eap-overlay-color',
  '--eap-box-shadow',
  '--eap-rail-',
] as const

function semanticNames(file: string): Set<string> {
  return new Set(
    [...tokenNames(file)].filter((name) =>
      semanticPrefixes.some((prefix) => name.startsWith(prefix)),
    ),
  )
}

describe('Ardot board 02 light/dark theme parity', () => {
  const light = semanticNames('light.css')
  const dark = semanticNames('dark.css')

  it('defines a non-empty semantic token set in both themes', () => {
    expect(light.size).toBeGreaterThan(0)
    expect(dark.size).toBeGreaterThan(0)
  })

  it('keeps every dark semantic token defined in light (no white-on-white fallback)', () => {
    const missingInLight = [...dark].filter((name) => !light.has(name)).sort()
    expect(missingInLight).toEqual([])
  })

  it('keeps every light semantic token defined in dark (no dark-mode fallback gap)', () => {
    const missingInDark = [...light].filter((name) => !dark.has(name)).sort()
    expect(missingInDark).toEqual([])
  })

  it('uses a light near-white surface and dark near-black surface', () => {
    const lightCss = readFileSync(join(themesDir, 'light.css'), 'utf8')
    const darkCss = readFileSync(join(themesDir, 'dark.css'), 'utf8')
    expect(lightCss).toMatch(/--eap-bg-color:\s*#f[0-9a-f]{5}/i)
    expect(darkCss).toMatch(/--eap-bg-color:\s*#0[0-9a-f]{5}/i)
  })
})
