import { loadPlaywright } from './playwright-runtime.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium, expect } = loadPlaywright()
const output = resolve('docs/evidence/frontend-batch/task-list-instances')
const id = '00000000-0000-4000-8000-000000000000'
const item = {
  id: 'LOCAL-' + id,
  name: 'First list existing task',
  status: 'planned',
  priority: 'none',
  summary: '',
  goal: 'Original goal',
  acceptanceCriteria: 'Original criteria',
}
const schema = {
  version: 1,
  title: 'Two legal task lists',
  root: {
    id: 'root',
    kind: 'page',
    props: {},
    children: [
      {
        id: 'first',
        kind: 'task-list',
        props: { label: 'First task list', editable: true, creatable: true, items: [item] },
        children: [],
      },
      {
        id: 'second',
        kind: 'task-list',
        props: { label: 'Second task list', editable: true, creatable: true, items: [] },
        children: [],
      },
    ],
  },
  unknownMappings: [],
  grapesProject: {},
  updatedAt: '2026-11-14T00:00:00Z',
}
const version = {
  id: 'two-task-lists',
  requestId: id,
  sourceRef: 'builder-alpha',
  title: schema.title,
  body: JSON.stringify({ format: 'eap-prototype-v1', schema }),
  acceptance: [],
  contentHash: 'explicit-fixture',
}
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const results = []
try {
  for (const [phase, base] of [
    ['before', 'http://127.0.0.1:5187'],
    ['after', 'http://127.0.0.1:5186'],
  ])
    for (const width of [1440, 390]) {
      await mkdir(resolve(output, phase), { recursive: true })
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      const page = await context.newPage(),
        errors = [],
        blockedWrites = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/api/**', (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname
        const reply = (body, status = 200) =>
          route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
        if (request.method() !== 'GET') {
          blockedWrites.push(path)
          return reply(
            {
              type: 'about:blank',
              title: 'Fixture blocks mutation',
              status: 409,
              code: 'AUDIT_WRITE_BLOCKED',
            },
            409,
          )
        }
        if (path === '/api/prototype-versions') return reply({ items: [version] })
        if (path === '/api/prototype-versions/' + version.id) return reply(version)
        return route.continue()
      })
      const open = async () => {
        await page.goto(base + '/#builder-alpha')
        await page.reload()
        await page.getByTestId('builder-tab-versions').click()
        await page.getByTestId('open-version').click()
        await expect(page.getByTestId('task-list-preview')).toHaveCount(2)
      }
      await open()
      // Explicit multi-open fixture; preserve two independent editor subtrees for ARIA isolation checks.
      await page
        .getByTestId('task-create-open')
        .nth(0)
        .evaluate((node) => node.click())
      await page
        .getByTestId('task-create-open')
        .nth(1)
        .evaluate((node) => node.click())
      await expect(page.getByTestId('task-edit-dialog')).toHaveCount(2)
      await page.getByTestId('task-edit-dialog').nth(1).getByTestId('task-edit-save').click()
      const validation = await page
        .getByTestId('task-edit-dialog')
        .nth(1)
        .getByTestId('task-edit-name')
        .evaluate((node) => ({
          focused: document.activeElement === node,
          localDescription: node
            .closest('[data-testid="task-edit-dialog"]')
            .contains(document.getElementById(node.getAttribute('aria-describedby'))),
          uniqueIds:
            new Set(
              Array.from(document.querySelectorAll('[aria-describedby]')).map((field) =>
                field.getAttribute('aria-describedby'),
              ),
            ).size === document.querySelectorAll('[aria-describedby]').length,
        }))
      await page.screenshot({
        path: resolve(output, phase, `validation-${width}.png`),
        fullPage: true,
      })
      await open()
      await page.evaluate((id) => {
        crypto.randomUUID = () => id
      }, id)
      await page.getByTestId('task-create-open').nth(1).click()
      for (const [field, value] of [
        ['name', 'Second list new task'],
        ['goal', 'Local fixture goal'],
        ['acceptanceCriteria', 'Local fixture criteria'],
      ])
        await page.getByTestId('task-edit-' + field).fill(value)
      await page.getByTestId('task-edit-save').click()
      await expect(page.getByTestId('task-edit-dialog')).toHaveCount(0)
      const createdFocus = await page
        .getByTestId('task-list-preview')
        .nth(1)
        .evaluate(
          (node) =>
            node.contains(document.activeElement) &&
            document.activeElement.closest('[data-task-id]')?.getAttribute('data-task-id') ===
              'LOCAL-00000000-0000-4000-8000-000000000000',
        )
      await page.screenshot({
        path: resolve(output, phase, `created-focus-${width}.png`),
        fullPage: true,
      })
      if (phase === 'after') {
        expect(validation.focused).toBe(true)
        expect(validation.localDescription).toBe(true)
        expect(validation.uniqueIds).toBe(true)
        expect(createdFocus).toBe(true)
      }
      results.push({
        phase,
        width,
        validation,
        createdFocus,
        pageErrors: errors,
        blockedWrites,
        boundary:
          'Existing saved-version renderer with explicit legal two-list fixture; multi-open and UUID collision injected locally; no AI, publishing, backend mutation, or generated candidate validation.',
      })
      await context.close()
    }
} finally {
  await browser.close()
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
}
console.log(JSON.stringify(results, null, 2))
