// @vitest-environment jsdom
/** Promotion preserves the displayed rectangle while the next card changes content height. */
import { createApp, h, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { NoticeTransition } from '../src/client/notice-transition.ts'
import { AccountNoticeStack } from '../src/client/AccountNotifications.tsx'
import { notification } from './notification-fixture.ts'

let transition: NoticeTransition
beforeEach(() => {
  transition = new NoticeTransition()
})

afterEach(() => {
  transition.dispose()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['unavailable', 'reduced motion'])(
  'closes without animation when animation is %s',
  (mode) => {
    const card = document.createElement('aside')
    document.body.append(card)
    const animate = vi.fn<HTMLElement['animate']>()
    if (mode === 'reduced motion') {
      card.animate = animate
      card.style.transitionDuration = '0s'
    }
    const dismiss = vi.fn(() => {
      card.remove()
    })
    transition.dismiss(card, dismiss)
    expect(dismiss).toHaveBeenCalledOnce()
    expect(animate).not.toHaveBeenCalled()
  },
)

it('animates a surviving card from its old position and height and cancels an interrupted transition', async () => {
  const stack = document.createElement('div')
  const first = document.createElement('aside')
  const next = document.createElement('aside')
  stack.append(first, next)
  document.body.append(stack)
  first.style.transitionDuration = '0.25s'
  const animateFirst = vi.fn<HTMLElement['animate']>()
  const animateNext = vi.fn<HTMLElement['animate']>()
  first.animate = animateFirst
  next.animate = animateNext
  first.getAnimations = () => []
  const cancel = vi.fn()
  const interrupted: Pick<Animation, 'cancel'> = { cancel }
  next.getAnimations = () => [interrupted as Animation]
  vi.spyOn(next, 'getBoundingClientRect')
    .mockReturnValueOnce(new DOMRect(14, 196, 272, 100))
    .mockReturnValueOnce(new DOMRect(10, 100, 280, 200))
  next.style.transform = 'translateY(0px) scaleX(1)'
  transition.dismiss(first, () => {
    first.remove()
  })
  await nextTick()
  expect(cancel).toHaveBeenCalledOnce()
  expect(animateFirst).not.toHaveBeenCalled()
  expect(animateNext).toHaveBeenCalledWith(
    [
      { transform: 'translate(0px, 96px) scale(0.9714285714285714, 0.5)' },
      { transform: 'translateY(0px) scaleX(1)' },
    ],
    { duration: 250, easing: 'ease-out' },
  )
  expect(next.style.transition).toBe('')
})

it('dismisses synchronously but measures the surviving native card after Vue commits', async () => {
  const visible = shallowRef(true)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    setup: () => () =>
      h('div', [
        visible.value
          ? h('aside', { key: 'first', style: { transitionDuration: '0.25s' } }, 'first')
          : null,
        h('aside', { key: 'next' }, visible.value ? 'small' : 'large'),
      ]),
  })
  app.mount(host)
  onTestFinished(() => {
    app.unmount()
  })
  const [first, next] = [...host.querySelectorAll('aside')]
  if (first === undefined || next === undefined) throw new Error('missing cards')
  first.animate = vi.fn()
  first.getAnimations = next.getAnimations = () => []
  const animate = vi.fn<HTMLElement['animate']>()
  next.animate = animate
  next.getBoundingClientRect = () =>
    new DOMRect(
      0,
      visible.value && next.textContent === 'small' ? 100 : 0,
      200,
      next.textContent === 'small' ? 100 : 200,
    )
  const dismiss = vi.fn(() => {
    visible.value = false
  })
  transition.dismiss(first, dismiss)
  expect(dismiss).toHaveBeenCalledOnce()
  expect(next.textContent).toBe('small')
  expect(animate).not.toHaveBeenCalled()
  await nextTick()
  expect(next.textContent).toBe('large')
  expect(animate).toHaveBeenCalledWith(
    [{ transform: 'translate(0px, 100px) scale(1, 0.5)' }, { transform: 'none' }],
    { duration: 250, easing: 'ease-out' },
  )
})

it.each(['removed stack', 'moved survivor', 'new dismissal'])(
  'abandons pending geometry after %s',
  async (mode) => {
    const stack = document.createElement('div')
    const first = document.createElement('aside')
    const next = document.createElement('aside')
    stack.append(first, next)
    document.body.append(stack)
    first.style.transitionDuration = next.style.transitionDuration = '0.25s'
    first.animate = vi.fn()
    first.getAnimations = next.getAnimations = () => []
    const animate = vi.fn<HTMLElement['animate']>()
    next.animate = animate
    first.getBoundingClientRect = next.getBoundingClientRect = () => new DOMRect(0, 0, 200, 100)
    transition.dismiss(first, () => {
      first.remove()
    })
    if (mode === 'removed stack') stack.remove()
    else if (mode === 'moved survivor') document.body.append(next)
    else
      transition.dismiss(next, () => {
        next.remove()
      })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    expect(next.style.transition).toBe('')
  },
)

it('releases pending styles on owner disposal and ignores a retired close handler', async () => {
  const stack = document.createElement('div')
  const card = document.createElement('aside')
  stack.append(card)
  document.body.append(stack)
  card.style.transition = 'transform 0.25s'
  card.style.transitionDuration = '0.25s'
  const animate = vi.fn()
  card.animate = animate
  card.getAnimations = () => []
  const dismiss = vi.fn()
  transition.dismiss(card, dismiss)
  expect(card.style.transition).toBe('none')
  transition.dispose()
  expect(card.style.transition).toBe('transform 0.25s')
  transition.dismiss(card, dismiss)
  await nextTick()
  expect(dismiss).toHaveBeenCalledOnce()
  expect(animate).not.toHaveBeenCalled()
})

it('retires pending promotions with the mounted notification stack', async () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const host = document.createElement('div')
  document.body.append(host)
  const dismiss = vi.fn()
  const app = createApp(AccountNoticeStack, {
    notices: [notification('owner', { displayUntil: '2099-01-01T00:00:00Z' })],
    closeLabel: 'Close',
    onDismiss: dismiss,
    onOpenAccount: () => {},
    onShown: () => {},
    onCtaClicked: () => {},
  })
  let mounted = true
  const unmount = () => {
    if (mounted) {
      mounted = false
      app.unmount()
    }
  }
  onTestFinished(unmount)
  app.mount(host)
  const card = host.querySelector('aside')!
  const close = host.querySelector<HTMLButtonElement>('[aria-label="Close"]')!
  card.style.transition = 'transform 0.25s'
  card.style.transitionDuration = '0.25s'
  const animate = vi.fn()
  card.animate = animate
  card.getAnimations = () => []
  close.click()
  expect(card.style.transition).toBe('none')
  unmount()
  expect(card.style.transition).toBe('transform 0.25s')
  close.click()
  await nextTick()
  expect(dismiss).toHaveBeenCalledOnce()
  expect(animate).not.toHaveBeenCalled()
})
