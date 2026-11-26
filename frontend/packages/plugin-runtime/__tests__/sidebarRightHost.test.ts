// @vitest-environment happy-dom
/**
 * The right column is a shell outlet. A DSH guide attribute is not part of boot.
 */
import { describe, expect, it } from 'vite-plus/test'
import { createShellContext } from '../src/client/shellContext'
import { CLIENT_PACKAGE_APPLY } from '../src/client/assembly.ts'

describe('sidebar-right contract', () => {
  it('does not apply a dsh client package from the shell', () => {
    expect(CLIENT_PACKAGE_APPLY).toEqual([])
  })
})

it('activates optional service effects once and disposes active and pending effects', () => {
  const shell = createShellContext()
  const events: string[] = []
  const cancel = shell.inject(['sidebar', 'tabs'], (ctx) => {
    events.push(String(ctx.get('tabs')))
    return () => {
      events.push('cleanup')
    }
  })
  shell.inject('missing', () => {
    events.push('unexpected')
  })
  shell.provide('sidebar', {})
  expect(events).toEqual([])
  shell.provide('tabs', 'ready')
  shell.provide('tabs', 'updated')
  expect(events).toEqual(['ready'])
  cancel()
  shell.dispose()
  shell.provide('missing', {})
  expect(events).toEqual(['ready', 'cleanup'])
})
