import { computed, defineComponent, Fragment, h, onMounted, shallowRef, useId, watch } from 'vue'
import clsx from 'clsx'
import { Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, MarkdownText, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { planReviewOf, type QuestionAnswer, type QuestionCardSnapshot, type QuestionComposerProps } from './contract/slots.ts'
import type { PendingQuestion } from './contract/slots.ts'
import type { QuestionDraftAnswer, QuestionDraftProgress } from './draft-store.ts'
import { PlanReviewPanel } from './PlanReviewPanel.tsx'
import css from './QuestionComposer.module.css'
/**
 * Displayed feedback: validation feedback is stored as a dictionary KEY and
 * translated at render, so already-shown feedback follows a locale switch;
 * runtime failure messages (finished strings from the wire) pass through
 * verbatim.
 */
type Feedback = {
  key: 'error.incomplete' | 'error.unanswered' | 'error.unavailable' | 'error.resubmit' | 'status.sent'
} | {
  text: string
}
/** A removed card can remain mounted until the composer seat updates. */
const REMOVED_CARD: QuestionCardSnapshot = {
  state: 'open', waitState: 'counting', countdown: undefined, channel: 'none', closed: true,
}
/** Long copy the user expanded on one question: the question itself or an option description by index. */
interface ExpandedCopy {
  /** Index of the question the expansions belong to. */
  readonly index: number
  /** Expanded copy of that question: `'question'` or an option index. */
  readonly copies: ReadonlySet<'question' | number>
}
const NOTHING_EXPANDED: ExpandedCopy['copies'] = new Set()
/**
 * Split the conventional recommendation suffix without changing the answer value.
 * @param label - Original option label returned if selected.
 * @returns Display label plus recommendation state.
 */
export function parseRecommendedLabel(label: string): {
  label: string
  recommended: boolean
} {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i
  return suffix.test(label)
    ? { label: label.replace(suffix, ''), recommended: true }
    : { label, recommended: false }
}
/**
 * Implicit draft selection the user still submits: every marked choice of a
 * multi-select question, or a marked first choice of a single-select question.
 */
function recommendedOptions(question: PendingQuestion['questions'][number]): string[] {
  const labels = (question.options ?? []).map(option => option.label)
  const candidates = question.multiSelect === true ? labels : labels.slice(0, 1)
  return candidates.filter(label => parseRecommendedLabel(label).recommended)
}
/** Accept persisted progress only when it still describes this question batch. */
function isQuestionDraftProgress(value: unknown, questionCount: number): value is QuestionDraftProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const progress = value as Record<string, unknown>
  if (typeof progress.index !== 'number' || !Number.isInteger(progress.index)
        || progress.index < 0 || progress.index >= questionCount
        || !Array.isArray(progress.drafts) || progress.drafts.length !== questionCount
        || (progress.wait !== undefined && progress.wait !== 'editing' && progress.wait !== 'waiting'))
    return false
  return progress.drafts.every((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      return false
    const draft = item as Record<string, unknown>
    return Array.isArray(draft.selected) && draft.selected.every((label: unknown) => typeof label === 'string')
            && typeof draft.custom === 'string' && typeof draft.skipped === 'boolean'
  })
}
/** Return whether a text-field key event belongs to an active IME composition. */
function isComposing(event: KeyboardEvent): boolean {
  // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
  return event.isComposing || Reflect.get(event, 'keyCode') === 229
}
/** The free-text answer field shared by both question variants. */
interface AnswerFieldProps {
  /** Visual variant: the custom row's inline column or the optionless question's framed block. */
  variant: 'inline' | 'block'
  /** Current draft text. */
  value: string
  /** Empty-field prompt. */
  placeholder: string
  /** Whether a submission in flight has frozen the field. */
  disabled: boolean
  /** Whether this field takes focus on mount. */
  autoFocus?: boolean
  /** Called when the field takes focus. */
  onFocus?: () => void
  /** Called with each edit of the draft. */
  onChange: (event: Event) => void
  /** Called with each key press, before the browser's own handling. */
  onKeyDown: (event: KeyboardEvent) => void
}
/**
 * Auto-growing free-text answer: a textarea, so a long answer soft-wraps and
 * Shift+Enter breaks a line, over a hidden mirror that owns the height.
 *
 * The mirror renders the draft plus a trailing newline in normal flow and so
 * sizes the grid row (counting rows by '\n' cannot see soft wraps); the
 * textarea shares that one cell and stretches to it, and `rows={1}` keeps the
 * control's own intrinsic height out of the row sizing so the mirror alone
 * decides. Past the mirror's cap the textarea scrolls itself — it is the only
 * scrollport in the stack, there being no second glyph layer to keep aligned.
 * Mirror and textarea MUST share font, line-height, padding and wrapping rules
 * or the two heights diverge.
 *
 * @param props - visual variant, draft text, and the field's event handlers.
 * @returns The mirrored auto-growing field.
 */
const AnswerField = defineComponent((props: AnswerFieldProps) => {
  const element = shallowRef<HTMLTextAreaElement | null>(null)
  onMounted(() => {
    if (props.autoFocus === true && !props.disabled)
      element.value?.focus()
  })
  return () => {
    return (h('div', { 'class': clsx(css.field, props.variant === 'inline' ? css.customInline : css.customBlock) }, [h('div', { 'aria-hidden': true, 'class': css.fieldMirror }, [`${props.value}\n`]), h('textarea', { 'ref': element, 'autofocus': props.autoFocus, 'class': css.fieldInput, 'value': props.value, 'disabled': props.disabled, 'rows': 1, 'placeholder': props.placeholder, 'onFocus': props.onFocus, 'onInput': props.onChange, 'onKeydown': props.onKeyDown }, undefined)]))
  }
}, { name: 'AnswerField', inheritAttrs: false, props: ['variant', 'value', 'placeholder', 'disabled', 'autoFocus', 'onFocus', 'onChange', 'onKeyDown'] })
/**
 * Composer takeover router. Generic-question drafts live in this entry's
 * Session-scoped Slot store, keyed by the pending carrier, so a strict Session
 * entry remount restores the same request without exposing it to another one.
 *
 * One takeover, two presentations: a request that declares a presentation intent this
 * package renders uses that presentation (a plan review is one decision over one
 * plan, not a question set), and every other request takes the generic flow.
 * The routing lives here, at the one entry that owns the composer seat, so
 * neither presentation can claim a request the other is already rendering.
 *
 * @param props - the selector-matched pending question carrier plus the framework standard kit.
 * @returns The question flow, or the intent's own surface, for this request.
 */
export function QuestionComposer(props: QuestionComposerProps) {
  const question = props.matched
  const review = planReviewOf(question.questions)
  return review === undefined
    ? (h(QuestionFlow, { 'key': question.key, 'pending': question, 't': props.t, 'useStore': props.useStore, 'useQuestionCard': props.useQuestionCard, 'actions': props.actions }, undefined))
    : h(PlanReviewPanel, { 'key': question.key, 'pending': question, 'review': review, 't': props.t, 'renderSlot': props.renderSlot }, undefined)
}
type QuestionFlowProps = {
  pending: PendingQuestion
} & Pick<QuestionComposerProps, 't' | 'useStore' | 'useQuestionCard' | 'actions'>
const QuestionFlow = defineComponent((props: QuestionFlowProps) => {
  const { useStore, useQuestionCard } = props
  const pending = computed(() => props.pending)
  const t = computed(() => props.t)
  const actions = computed(() => props.actions)
  const descriptionIdPrefix = useId()
  const questions = computed(() => pending.value.questions)
  // A read-only card built from a settled call's transcript: the same panel
  // over the recorded answers, with nothing left to submit.
  const review = computed(() => pending.value.review)
  const markdownLabels = computed(() => ({
    code: { copyLabel: t.value('copy'), copiedLabel: t.value('copied'), toolbarLabels: { codeLabel: t.value('codeBlock.title'), wrapLabel: t.value('codeBlock.wrap'), unwrapLabel: t.value('codeBlock.unwrap') } },
    footnotes: t.value('markdown.footnotes'),
  }))
  const initialDrafts = computed<QuestionDraftAnswer[]>(() => {
    // Recorded answers echo the question ids rather than their order.
    const recorded = new Map((review.value ?? []).map(answer => [answer.id, answer]))
    return questions.value.map((item) => {
      const answer = recorded.get(item.id)
      const custom = answer?.custom ?? ''
      return {
        selected: answer !== undefined ? [...answer.selected] : review.value === undefined ? recommendedOptions(item) : [],
        custom,
        // A recorded answer with no selection and no custom text was skipped.
        skipped: answer !== undefined && answer.selected.length === 0 && custom === '',
      }
    })
  })
  const stored = useStore(state => state.progressByRequest[pending.value.key])
  const validStored = computed(() => isQuestionDraftProgress(stored.value, questions.value.length) ? stored.value : undefined)
  // A review card renders the record itself, so a draft its live card left
  // behind can never surface as an answer; only the page position is restored.
  const storedProgress = computed(() => review.value === undefined ? validStored.value : undefined)
  const index = computed(() => validStored.value?.index ?? 0)
  const drafts = computed(() => storedProgress.value?.drafts ?? initialDrafts.value)
  const restoredWait = computed(() => storedProgress.value?.wait
        ?? (storedProgress.value?.drafts.some((item, itemIndex) => item.selected.length !== initialDrafts.value[itemIndex]?.selected.length
            || item.selected.some((label, labelIndex) => label !== initialDrafts.value[itemIndex]?.selected[labelIndex])
            || item.custom !== '' || item.skipped) === true
          ? 'editing' : undefined))
  const busy = shallowRef<'answer' | 'cancel' | null>(null)
  const setBusy = (next: typeof busy.value | ((current: typeof busy.value) => typeof busy.value)): void => { busy.value = typeof next === 'function' ? next(busy.value) : next }
  const error = shallowRef<Feedback | null>(null)
  const setError = (next: typeof error.value | ((current: typeof error.value) => typeof error.value)): void => { error.value = typeof next === 'function' ? next(error.value) : next }
  const cardSeat = useQuestionCard(pending.value.key, snapshot => snapshot)
  const card = computed(() => cardSeat.value ?? REMOVED_CARD)
  const canSubmit = computed(() => card.value.channel !== 'none')
  // The answer surface freezes while a submission is in flight, and for good on
  // a review card: its call has already settled.
  const locked = computed(() => busy.value !== null || review.value !== undefined)
  // A waterfall submission is only "sent": the gateway drops an outcome that
  // arrives after another Client settled the event, without telling anyone.
  // The draft therefore survives until the projection closes the card, and a
  // card that flips to continued while a submission is in flight re-arms the
  // controls so the same draft can go through the Remote path.
  const sentVia = shallowRef<'waterfall' | null>(null)
  watch(() => [card.value.state], () => {
    if (sentVia.value !== 'waterfall' || card.value.state !== 'continued')
      return
    sentVia.value = null
    setBusy(null)
    setError({ key: 'error.resubmit' })
  }, { immediate: true, flush: 'post' })
  watch(() => [actions.value, card.value.closed, pending.value.key], () => {
    if (card.value.closed)
      actions.value.clear(pending.value.key)
  }, { immediate: true, flush: 'post' })
  watch(() => [actions.value, pending.value], () => {
    actions.value.prune(pending.value.liveKeys())
  }, { immediate: true, flush: 'post' })
  const waitDisposition = shallowRef<'editing' | 'waiting' | undefined>(restoredWait.value)
  watch(() => [pending.value], () => {
    if (waitDisposition.value === 'waiting')
      pending.value.takeTime()
    if (waitDisposition.value === 'editing')
      pending.value.engage()
  }, { immediate: true, flush: 'post' })
  // The countdown belongs to the carrier, not to this component: the user can
  // close the panel and reopen it from the tool call row, and a timer that died
  // with the mount would leave the tool call waiting past its deadline.
  const countdown = computed(() => card.value.countdown)
  const minimized = shallowRef(false)
  const setMinimized = (next: typeof minimized.value | ((current: typeof minimized.value) => typeof minimized.value)): void => { minimized.value = typeof next === 'function' ? next(minimized.value) : next }
  // The free-form textarea autofocuses on first presentation; re-expanding a
  // collapsed question must not steal focus from the expand toggle back into
  // the input, so focus is granted once per question index.
  const focusedQuestions = shallowRef(new Set<number>())
  const answerSurface = shallowRef<HTMLDivElement | null>(null)
  // Every navigation write stays in bounds and drafts mirrors questions 1:1.
  // oxlint-disable-next-line typescript/no-non-null-assertion
  const question = computed(() => questions.value[index.value]!)
  // oxlint-disable-next-line typescript/no-non-null-assertion
  const draft = computed(() => drafts.value[index.value]!)
  const hasOptions = computed(() => (question.value.options?.length ?? 0) > 0)
  const expandedCopy = shallowRef<ExpandedCopy>({ index: index.value, copies: NOTHING_EXPANDED })
  const setExpandedCopy = (next: typeof expandedCopy.value | ((current: typeof expandedCopy.value) => typeof expandedCopy.value)): void => { expandedCopy.value = typeof next === 'function' ? next(expandedCopy.value) : next }
  const expanded = computed(() => expandedCopy.value.index === index.value ? expandedCopy.value.copies : NOTHING_EXPANDED)
  const questionToggleLabel = computed(() => t.value(expanded.value.has('question') ? 'text.collapse' : 'text.expand'))
  const toggleCopy = (copy: 'question' | number): void => {
    const copies = new Set(expanded.value)
    if (!copies.delete(copy))
      copies.add(copy)
    setExpandedCopy({ index: index.value, copies })
  }
  const replaceProgress = (nextIndex: number, nextDrafts: QuestionDraftAnswer[]): void => {
    if (nextIndex !== index.value) {
      // Another question starts at its top with its long copy collapsed.
      if (answerSurface.value !== null)
        answerSurface.value.scrollTop = 0
      setExpandedCopy({ index: nextIndex, copies: NOTHING_EXPANDED })
    }
    actions.value.replace(pending.value.key, {
      index: nextIndex,
      drafts: nextDrafts,
      ...(waitDisposition.value === undefined ? {} : { wait: waitDisposition.value }),
    })
  }
  const takeTime = (): void => {
    waitDisposition.value = 'waiting'
    pending.value.takeTime()
    replaceProgress(index.value, drafts.value)
  }
  const engage = (): void => {
    if (waitDisposition.value !== undefined)
      return
    waitDisposition.value = 'editing'
    pending.value.engage()
  }
  const focusAnswerSurface = (event: FocusEvent): void => {
    if (event.target instanceof HTMLTextAreaElement) focusedQuestions.value.add(index.value)
    if (!(event.currentTarget instanceof HTMLDivElement && event.currentTarget.contains(
      event.relatedTarget instanceof Node ? event.relatedTarget : null)))
      pending.value.holdFocus()
  }
  const blurAnswerSurface = (event: FocusEvent): void => {
    if (!(event.currentTarget instanceof HTMLDivElement && event.currentTarget.contains(
      event.relatedTarget instanceof Node ? event.relatedTarget : null)))
      pending.value.releaseFocus()
  }
  watch(() => [pending.value], (_current, _previous, onCleanup) => {
    const dispose = (() => {
      const release = (): void => { pending.value.releaseFocus() }
      const refocus = (): void => {
        if (waitDisposition.value === 'editing') {
          pending.value.engage()
          return
        }
        if (answerSurface.value?.contains(document.activeElement) === true)
          pending.value.holdFocus()
      }
      const visibilityChanged = (): void => {
        if (document.hidden)
          release()
        else
          refocus()
      }
      window.addEventListener('blur', release)
      window.addEventListener('focus', refocus)
      document.addEventListener('visibilitychange', visibilityChanged)
      return () => {
        release()
        window.removeEventListener('blur', release)
        window.removeEventListener('focus', refocus)
        document.removeEventListener('visibilitychange', visibilityChanged)
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  const dismissFlow = (): void => {
    // A tool-call-keyed panel only leaves the seat; nothing is sent and nothing
    // is persisted, and the tool call row brings it back.
    if (pending.value.dismissal === 'hide') {
      void pending.value.dismiss()
      return
    }
    if (!canSubmit.value) {
      setError({ key: 'error.unavailable' })
      return
    }
    setBusy('cancel')
    setError(null)
    sentVia.value = 'waterfall'
    void pending.value.dismiss()
      .catch((cause: unknown) => {
        sentVia.value = null
        setBusy(null)
        setError({ text: cause instanceof Error ? cause.message : String(cause) })
      })
  }
  const updateDraft = (update: (current: QuestionDraftAnswer) => QuestionDraftAnswer, nextIndex = index.value): void => {
    engage()
    const nextDrafts = drafts.value.map((item, itemIndex) => itemIndex === index.value ? update(item) : item)
    replaceProgress(nextIndex, nextDrafts)
    setError(null)
  }
  const choose = (label: string): void => {
    updateDraft((current) => {
      if (question.value.multiSelect === true) {
        const selected = current.selected.includes(label)
          ? current.selected.filter(item => item !== label)
          : [...current.selected, label]
        return { ...current, selected, skipped: false }
      }
      return { selected: [label], custom: '', skipped: false }
    }, question.value.multiSelect !== true && index.value < questions.value.length - 1 ? index.value + 1 : index.value)
  }
  const answered = (item: QuestionDraftAnswer): boolean => item.selected.length > 0 || item.custom.trim() !== ''
  const completed = (item: QuestionDraftAnswer): boolean => answered(item) || item.skipped
  const submitDrafts = (values: QuestionDraftAnswer[]): void => {
    const missing = values.findIndex(item => !completed(item))
    if (missing >= 0) {
      replaceProgress(missing, values)
      setError({ key: 'error.incomplete' })
      return
    }
    if (!canSubmit.value) {
      setError({ key: 'error.unavailable' })
      return
    }
    const answer: QuestionAnswer = {
      answers: questions.value.map((item, itemIndex) => {
        const value = values[itemIndex] as QuestionDraftAnswer
        if (value.skipped)
          return { id: item.id, selected: [] }
        const custom = value.custom.trim()
        return {
          id: item.id,
          selected: custom === '' || item.multiSelect === true ? value.selected : [],
          ...(custom === '' ? {} : { custom }),
        }
      }),
    }
    setBusy('answer')
    setError(null)
    // The external-store render can lag the carrier as a timed call continues.
    // Read the channel used by answer() in this same event turn.
    const channel = pending.value.snapshot().channel
    sentVia.value = channel === 'waterfall' ? 'waterfall' : null
    void pending.value.answer(answer)
      .then(() => {
        if (channel !== 'rpc')
          return
        sentVia.value = null
        setBusy(null)
        setError(null)
        void pending.value.dismiss().catch(() => { setError({ key: 'status.sent' }) })
      })
      .catch((cause: unknown) => {
        sentVia.value = null
        setBusy(null)
        setError({ text: cause instanceof Error ? cause.message : String(cause) })
      })
  }
  const continueFlow = (): void => {
    if (!answered(draft.value)) {
      setError({ key: 'error.unanswered' })
      return
    }
    if (index.value < questions.value.length - 1) {
      replaceProgress(index.value + 1, drafts.value)
      setError(null)
      return
    }
    submitDrafts(drafts.value)
  }
  // Shared by the inline custom field and the optionless one: a multi-select
  // draft retains checked labels, while a single-select custom answer replaces
  // its selection. Enter continues the flow, Shift+Enter breaks a line.
  const draftCustom = (event: Event): void => {
    if (!(event.target instanceof HTMLTextAreaElement))
      return
    const value = event.target.value
    updateDraft(current => ({
      ...current,
      selected: question.value.multiSelect === true ? current.selected : [],
      custom: value,
      skipped: false,
    }))
  }
  const continueFromCustom = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.shiftKey || isComposing(event))
      return
    event.preventDefault()
    continueFlow()
  }
  const skipQuestion = (): void => {
    engage()
    const nextDrafts = drafts.value.map((item, itemIndex) => itemIndex === index.value
      ? { selected: [], custom: '', skipped: true }
      : item)
    replaceProgress(index.value < questions.value.length - 1 ? index.value + 1 : index.value, nextDrafts)
    setError(null)
    if (index.value < questions.value.length - 1) {
      return
    }
    submitDrafts(nextDrafts)
  }
  return () => (h('div', { 'class': css.frame, 'data-question-key': pending.value.key }, [h('section', { 'class': clsx(css.card, minimized.value && css.cardMinimized), 'aria-labelledby': `question-${pending.value.key}-${String(index.value)}` }, [h('header', { 'class': css.header }, [(question.value.header !== undefined || minimized.value) && (h('div', { 'class': css.headingBlock }, [question.value.header !== undefined && h('div', { 'class': css.eyebrow }, [question.value.header]), minimized.value && (h('h2', { 'class': css.title, 'id': `question-${pending.value.key}-${String(index.value)}` }, [question.value.question]))])), h('div', { 'class': css.headerActions }, [countdown.value !== undefined && card.value.waitState !== 'waiting' && card.value.waitState !== 'editing' && card.value.waitState !== 'continued' && (h('span', { 'class': css.waitStatus }, [t.value(countdown.value.running ? 'wait.countdown' : 'wait.paused', {
    seconds: Math.ceil(countdown.value.remainingMs / 1000),
  })])), countdown.value !== undefined && card.value.waitState !== 'waiting' && card.value.waitState !== 'editing' && card.value.waitState !== 'continued' && (h(Button, { 'variant': 'outline', 'className': css.waitButton ?? '', 'onClick': takeTime }, { default: () => [t.value('wait.takeTime')] })), card.value.state === 'continued' && h('span', { 'class': css.waitStatus }, [t.value('wait.continued')]), countdown.value !== undefined && (card.value.waitState === 'waiting' || card.value.waitState === 'editing') && (h('span', { 'class': css.waitStatus }, [t.value('wait.held')])), review.value !== undefined && h('span', { 'class': css.waitStatus }, [t.value('review.status')]), h('button', { 'type': 'button', 'class': css.iconButton, 'aria-label': t.value(minimized.value ? 'nav.maximize' : 'nav.minimize'), 'title': t.value(minimized.value ? 'nav.maximize' : 'nav.minimize'), 'aria-expanded': !minimized.value, 'disabled': busy.value !== null, 'onClick': () => { setMinimized(current => !current) } }, [minimized.value ? h(IconChevronUpOutlineRegular, { size: 18 }, undefined) : h(IconChevronDownOutlineRegular, { size: 18 }, undefined)]), h('button', { 'type': 'button', 'class': css.iconButton, 'aria-label': t.value(pending.value.dismissal === 'hide' ? 'nav.close' : 'nav.cancel'), 'title': t.value(pending.value.dismissal === 'hide' ? 'nav.close' : 'nav.cancel'), 'disabled': busy.value !== null, 'onClick': dismissFlow }, [h(IconCloseOutlineRegular, { size: 15 }, undefined)])])]), !minimized.value && (h(Fragment, null, [h('div', { 'ref': answerSurface, 'class': css.body, 'data-question-scroll': true, 'onFocusCapture': focusAnswerSurface, 'onBlurCapture': blurAnswerSurface }, [h('div', { 'class': css.questionTitle, 'data-expanded': expanded.value.has('question') || undefined }, [h('h2', { 'class': clsx(css.title, css.titlePreview), 'id': `question-${pending.value.key}-${String(index.value)}` }, [question.value.question]), h(Tooltip, { 'label': questionToggleLabel.value, 'side': 'top', 'portal': true }, { default: () => [h('button', { 'type': 'button', 'class': clsx(css.iconButton, css.copyToggle, css.questionToggle), 'aria-label': questionToggleLabel.value, 'aria-expanded': expanded.value.has('question'), 'aria-controls': `question-${pending.value.key}-${String(index.value)}`, 'aria-describedby': `question-${pending.value.key}-${String(index.value)}`, 'onClick': () => { toggleCopy('question') } }, [expanded.value.has('question') ? h(IconChevronUpOutlineRegular, null, undefined) : h(IconChevronDownOutlineRegular, null, undefined)])] })]), question.value.detail !== undefined && (h('div', { 'class': css.detail }, [h(MarkdownText, { 'text': question.value.detail, 'labels': markdownLabels.value }, undefined)])), h('div', { 'class': css.options, 'role': question.value.multiSelect === true ? 'group' : 'radiogroup' }, [(question.value.options ?? []).map((option, optionIndex) => {
    const selected = draft.value.selected.includes(option.label)
    const display = parseRecommendedLabel(option.label)
    const hasDescription = option.description !== undefined && option.description.trim() !== ''
    const descriptionExpanded = expanded.value.has(optionIndex)
    const descriptionToggleLabel = t.value(descriptionExpanded ? 'text.collapse' : 'text.expand')
    const descriptionId = `${descriptionIdPrefix}-question-${String(index.value)}-option-${String(optionIndex)}-description`
    return (h('div', { 'key': `${option.label}-${String(optionIndex)}`, 'class': clsx(css.optionRow, !locked.value && css.optionRowInteractive, selected && question.value.multiSelect !== true && css.optionSelected), 'data-option-row': true, 'data-expanded': descriptionExpanded || undefined }, [h('button', { 'type': 'button', 'class': css.option, 'role': question.value.multiSelect === true ? 'checkbox' : 'radio', 'aria-checked': selected, 'aria-label': display.label, 'aria-describedby': hasDescription ? descriptionId : undefined, 'disabled': locked.value, 'onClick': () => { choose(option.label) }, 'onKeydown': (event) => {
      if (event.key !== 'Enter')
        return
      event.preventDefault()
      submitDrafts(drafts.value)
    } }, [question.value.multiSelect === true
      ? (h('span', { 'class': clsx(css.checkbox, selected && css.checkboxChecked), 'aria-hidden': 'true' }, [selected && h(IconCheckOutlineRegular, { 'size': 12 }, undefined)]))
      : h('span', { 'class': css.number }, [optionIndex + 1]), h('span', { 'class': css.optionCopy }, [h('span', { 'class': css.optionLine, 'data-option-line': true }, [h('span', { 'class': css.optionLabel }, [display.label]), display.recommended && (h('span', { 'class': css.badge }, [t.value('option.recommended')]))]), hasDescription && (h('span', { 'id': descriptionId, 'class': css.description, 'data-option-description': true }, [option.description]))])]), hasDescription && (h(Tooltip, { 'label': descriptionToggleLabel, 'side': 'top', 'portal': true }, { default: () => [h('button', { 'type': 'button', 'class': clsx(css.iconButton, css.copyToggle, css.descriptionToggle), 'aria-label': descriptionToggleLabel, 'aria-expanded': descriptionExpanded, 'aria-controls': descriptionId, 'aria-describedby': descriptionId, 'onClick': () => { toggleCopy(optionIndex) } }, [descriptionExpanded ? h(IconChevronUpOutlineRegular, null, undefined) : h(IconChevronDownOutlineRegular, null, undefined)])] }))]))
  }), review.value !== undefined && draft.value.skipped && (h('p', { 'class': css.reviewNote }, [t.value('review.skipped')])), (review.value === undefined || draft.value.custom !== '') && (hasOptions.value ? (h('div', { 'class': clsx(css.customRow, draft.value.custom !== '' && css.customRowActive, question.value.multiSelect !== true && draft.value.selected.length > 0 && css.customRowYielded) }, [question.value.multiSelect === true
    ? (h('span', { 'class': clsx(css.checkbox, draft.value.custom !== '' && css.checkboxChecked), 'aria-hidden': 'true' }, [draft.value.custom !== '' && h(IconCheckOutlineRegular, { 'size': 12 }, undefined)]))
    : (h('span', { 'class': css.number, 'aria-hidden': 'true' }, [h(IconEditOutlineRegular, { 'size': 12 }, undefined)])), h(AnswerField, { 'variant': 'inline', 'value': draft.value.custom, 'disabled': locked.value, 'placeholder': t.value('custom.placeholder'), 'onChange': draftCustom, 'onKeyDown': continueFromCustom }, undefined)]))
    : (h(AnswerField, { 'autoFocus': canSubmit.value && countdown.value === undefined && !locked.value && !focusedQuestions.value.has(index.value), 'variant': 'block', 'value': draft.value.custom, 'disabled': locked.value, 'placeholder': t.value('custom.placeholder'), 'onFocus': () => { focusedQuestions.value.add(index.value) }, 'onChange': draftCustom, 'onKeyDown': continueFromCustom }, undefined)))])]), h('footer', { 'class': css.footer }, [h('div', { 'class': css.pager }, [h('button', { 'type': 'button', 'class': css.iconButton, 'aria-label': t.value('nav.prev'), 'disabled': index.value === 0 || busy.value !== null, 'onClick': () => { replaceProgress(index.value - 1, drafts.value); setError(null) } }, [h(IconChevronLeftOutlineRegular, null, undefined)]), h('span', { 'class': css.progress }, [index.value + 1, ' / ', questions.value.length]), h('button', { 'type': 'button', 'class': css.iconButton, 'aria-label': t.value('nav.next'), 'disabled': index.value === questions.value.length - 1 || busy.value !== null, 'onClick': () => { replaceProgress(index.value + 1, drafts.value); setError(null) } }, [h(IconChevronRightOutlineRegular, null, undefined)])]), h('div', { 'class': css.feedback, 'role': 'status' }, [error.value === null ? null : 'key' in error.value ? t.value(error.value.key) : error.value.text]), review.value === undefined && (h('div', { 'class': css.footerActions }, [h(Button, { 'variant': 'outline', 'disabled': busy.value !== null, 'onClick': skipQuestion }, { default: () => [t.value('action.skip')] }), h(Button, { 'variant': 'primary', 'disabled': busy.value !== null || !answered(draft.value) || (index.value === questions.value.length - 1 && !canSubmit.value), 'onClick': continueFlow }, { default: () => [busy.value === 'answer'
    ? t.value('submitting')
    : index.value === questions.value.length - 1 ? t.value('submit') : t.value('action.next')] })]))])]))])]))
}, { name: 'QuestionFlow', inheritAttrs: false, props: ['pending', 't', 'useStore', 'useQuestionCard', 'actions'] })
