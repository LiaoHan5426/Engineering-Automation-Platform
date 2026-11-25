import { describe, expect, it } from 'vite-plus/test'
import { canonicalSlotName } from '../src/client/layoutNames.ts'
import {
  LAYOUT_FACTORIES,
  LAYOUT_OCCUPANTS,
  LAYOUT_PREFIX,
  LAYOUT_SLOTS,
} from '../src/client/layoutSlots.ts'

describe('layout slot catalog', () => {
  it('rewrites every catalog key except root and rejects unknown names', () => {
    expect(LAYOUT_SLOTS).toHaveLength(126)
    expect(canonicalSlotName('settings.section')).toBe('dsh-layout-settings.section')
    expect(canonicalSlotName('dsh-layout-rightbar')).toBe('dsh-layout-rightbar')
    expect(canonicalSlotName('root')).toBe('root')
    expect(canonicalSlotName('conversation.chat.assistant-actions')).toBe(
      `${LAYOUT_PREFIX}conversation.chat.assistant-actions`,
    )
    expect(() => canonicalSlotName('not.a.slot')).toThrow(/not\.a\.slot/)
  })

  it('gives each shell key one declarer', () => {
    expect(LAYOUT_SLOTS.filter((slot) => slot.declarer === 'package')).toHaveLength(0)
    const shellChildren = LAYOUT_OCCUPANTS.flatMap((item) => item.children)
    const factoryChildren = LAYOUT_FACTORIES.flatMap((item) => item.children)
    const declared = [...shellChildren, ...factoryChildren]
    expect(new Set(declared).size).toBe(declared.length)
    const shellKeys = LAYOUT_SLOTS.filter((slot) => slot.key !== 'root').map((slot) => slot.key)
    expect(declared.slice().sort()).toEqual(shellKeys.slice().sort())
  })
})
