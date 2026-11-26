// @vitest-environment happy-dom
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { classifyFileType, fileSizeText } from '../src/client/pluginUi.ts'
import { pluginRequire } from '../src/moduleLoader.ts'

describe('plugin require', () => {
  it('serves local UI helpers under the package id plugins already use', () => {
    const ui = pluginRequire('@deepseek-ai/dsh-client-ui-primitives') as {
      fileSizeText: (bytes: number) => string
      classifyFileType: (path: string) => string
      FileTypeIcon: (props: { kind?: string }) => unknown
      Button: (props: { children?: string }) => unknown
      NotAPrimitive?: unknown
    }
    expect(ui.fileSizeText(312)).toBe('312B')
    expect(ui.fileSizeText(4.2 * 1024)).toBe('4.2KB')
    expect(ui.classifyFileType('src/App.vue')).toBe('vue')
    expect(fileSizeText(1536)).toBe('1.5KB')
    expect(classifyFileType('notes.txt')).toBe('file')
    const html = renderToStaticMarkup(createElement(ui.FileTypeIcon, { kind: 'vue' }))
    expect(html).toContain('data-eap-ui="FileTypeIcon"')
    expect(html).toContain('data-kind="vue"')
    const button = renderToStaticMarkup(createElement(ui.Button, {}, 'Close'))
    expect(button).toContain('<button')
    expect(button).toContain('Close')
    expect(ui.NotAPrimitive).toBeUndefined()
  })

  it('renders separate glyphs for directory controls and classifies files by path', () => {
    const ui = pluginRequire('@deepseek-ai/dsh-client-ui-primitives') as Record<
      string,
      ComponentType<{ kind?: string; path?: string }>
    >
    const render = (name: string, props = {}) =>
      renderToStaticMarkup(createElement(ui[name]!, props))
    const path = (html: string) => html.match(/<path d="([^"]+)"/)?.[1]
    const folder = render('FileTypeIcon', { kind: 'folder' })
    const file = render('FileTypeIcon', { path: 'candidate.json' })
    const right = render('IconChevronRightOutlineRegular')
    const down = render('IconChevronDownOutlineRegular')

    expect(file).toContain('data-kind="json"')
    expect(folder).toContain('data-kind="folder"')
    const shapes = [folder, file, right, down].map(path)
    expect(shapes.every(Boolean)).toBe(true)
    expect(new Set(shapes).size).toBe(4)
  })

  it('does not provide other dsh packages', () => {
    expect(() => pluginRequire('@deepseek-ai/dsh-client-ui-renderer')).toThrow(
      /MODULE_NOT_PROVIDED:@deepseek-ai\/dsh-client-ui-renderer/,
    )
    expect(() => pluginRequire('./local')).toThrow(/RELATIVE_REQUIRE_UNSUPPORTED/)
  })
})
