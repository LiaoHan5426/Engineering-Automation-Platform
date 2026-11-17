import { defineComponent, computed, shallowRef, watch, h, onMounted } from 'vue'
import clsx from 'clsx'
import {
  focusWithoutRing,
  IconPlusOutlineMedium,
  IconTriangleRightFillRegular,
  IconWarningOutlineRegular,
  isMobileDevice,
  Toast,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: the `plan` projection key merge (the TodoDock posture — the
// composer reads a host-computed value; the domain owns the key).
import type {} from '@deepseek-ai/dsh-plan-mode/client'
// Type-only: the `goal` projection key merge (hint disambiguation).
import type {} from '@deepseek-ai/dsh-goal/client'
// The `imageLimits` projection key merge (intake pre-check) arrives with the
// wire types: apiproxy's sessions contract declares it, and client-runtime's
// api-remotes import already places it in every client program.
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerBarProps } from '../contract/slots.ts'
import { DraftEditor } from '../input/editor/DraftEditor.tsx'
import {
  focusDraftEditor,
  installDraftFilePicker,
  installDraftKeyboardDismissal,
  installDraftKeymap,
  installDraftWheel,
  keepDraftFocus,
  revealDraftSelection,
} from '../input/editor/view-binding.ts'
import { resolveSubmitMode } from '../input/submission-policy.ts'
import { attachmentErrorText, imageSizeText } from '../image-labels.ts'
import { isImageMediaType } from '../service.ts'
import { ContextMeter } from './ContextMeter.tsx'
import { observeControlRow } from './control-row-layout.ts'
import css from './InputBar.module.css'
export type InputBarProps = ComposerBarProps
export const InputBar = defineComponent(
  (props: InputBarProps) => {
    const useSession = computed(() => props.useSession)
    const useInput = computed(() => props.useInput)
    const inputActions = computed(() => props.inputActions)
    const keyboard = computed(() => props.keyboard)
    const addFiles = computed(() => props.addFiles)
    const removeAttachment = computed(() => props.removeAttachment)
    const resolveDraftAttachments = computed(() => props.resolveDraftAttachments)
    const retryFileUpload = computed(() => props.retryFileUpload)
    const registerFileIntake = computed(() => props.registerFileIntake)
    const toggleCommandMenu = computed(() => props.toggleCommandMenu)
    const stop = computed(() => props.stop)
    const retry = computed(() => props.retry)
    const t = computed(() => props.t)
    const renderSlot = computed(() => props.renderSlot)
    const useBusyEnter = computed(() => props.useBusyEnter)
    const useFileUploads = computed(() => props.useFileUploads)
    const useNotices = computed(() => props.useNotices)
    const useLexicon = computed(() => props.useLexicon)
    const useMenuLauncher = computed(() => props.useMenuLauncher)
    const useStopShortcut = computed(() => props.useStopShortcut)
    const useAccess = computed(() => props.useAccess)
    const useProjection = computed(() => props.useProjection)
    const sessionId = computed(() => props.sessionId)
    const variant = computed(() => props.variant)
    const occurrence = computed(() => props.occurrence)
    const inert = computed(() => props.disabled ?? false)
    const blocked = computed(() => props.blocked)
    const workspacePickerOpen = computed(() => props.workspacePickerOpen ?? false)
    const onRequestWorkspace = computed(() => props.onRequestWorkspace)
    const placeholder = computed(() => props.placeholder)
    const accessory = computed(() => props.accessory)
    const input = useInput.value(s => s)
    const notice = useNotices.value(s => s)
    const busyEnter = useBusyEnter.value(s => s)
    const stopKeys = useStopShortcut.value(keys => keys)
    const promptDeniedSource1 = useAccess.value('session/prompt')
    const promptDenied = computed(() => promptDeniedSource1.value === false)
    const cancelDeniedSource2 = useAccess.value('session/cancel')
    const cancelDenied = computed(() => cancelDeniedSource2.value === false)
    const uploadDeniedSource3 = useAccess.value('fileUploads/upload')
    const uploadDenied = computed(() => uploadDeniedSource3.value === false)
    const stopAction = computed(() => (cancelDenied.value ? undefined : stop.value))
    void useLexicon.value // hook seat stays bound by the inject compartment; text-ref decoration rides the shell's editor transforms
    const commandMenuOpen = useMenuLauncher.value(source => source === 'command')
    const activity = shallowRef(false)
    const setActivity = (
      next: typeof activity.value | ((previous: typeof activity.value) => typeof activity.value),
    ) => {
      activity.value = typeof next === 'function' ? next(activity.value) : next
    }
    const promptErrorSource4 = useSession.value(s => s.promptError)
    const promptError = computed(() => promptErrorSource4.value ?? null)
    const runningSource5 = useSession.value(s => s.running)
    const running = computed(() => runningSource5.value ?? false)
    const retryableFailureSource6 = useProjection.value('conversationContinuation')
    const retryableFailure = computed(() => retryableFailureSource6.value ?? undefined)
    const pendingHumanInput = useProjection.value(
      'inbox',
      inbox =>
        inbox?.['next-step'].some(
          (message: unknown) =>
            typeof message === 'object' &&
            message !== null &&
            'source' in message &&
            typeof message.source === 'object' &&
            message.source !== null &&
            'kind' in message.source &&
            message.source.kind === 'user',
        ) ?? false,
    )
    const historyOpenSource7 = useSession.value(s => s.openState === 'open')
    const historyOpen = computed(() => historyOpenSource7.value ?? false)
    const submissionPendingSource8 = useSession.value(s => s.pendingSubmissions.length > 0)
    const submissionPending = computed(() => submissionPendingSource8.value ?? false)
    const subagentSource9 = useSession.value(s => s.subagent)
    const subagent = computed(() => subagentSource9.value ?? null)
    const removedSource10 = useSession.value(s => s.removed)
    const removed = computed(() => removedSource10.value ?? false)
    const planActive = useProjection.value(
      'plan',
      plan => plan !== undefined && (plan.pending ? !plan.active : plan.active),
    )
    const hasGoal = useProjection.value('goal', goal => goal != null)
    const live = computed(
      () =>
        input.value !== undefined &&
        keyboard.value !== undefined &&
        inputActions.value !== undefined,
    )
    const draft = computed(() => input.value?.draft ?? '')
    const editor = computed(() => keyboard.value?.editor ?? null)
    const attachments = computed(() =>
      input.value === undefined || resolveDraftAttachments.value === undefined
        ? []
        : resolveDraftAttachments.value(input.value.attachmentIds),
    )
    const empty = computed(() => draft.value.trim() === '' && attachments.value.length === 0)
    const uploads = useFileUploads.value(snapshot => snapshot)
    const uploadsPending = computed(() =>
      attachments.value.some(attachment =>
        attachment.kind === 'file'
          ? uploads.value[attachment.id]?.status !== 'ready'
          : uploads.value[attachment.id] !== undefined &&
            uploads.value[attachment.id]?.status !== 'ready',
      ),
    )
    const toast = shallowRef<{
      seq: number
      text: string
    } | null>(null)
    const setToast = (
      next:
        | ({
          seq: number
          text: string
        } | null)
        | ((
          previous: {
            seq: number
            text: string
          } | null,
        ) => {
          seq: number
          text: string
        } | null),
    ) => {
      toast.value = typeof next === 'function' ? next(toast.value) : next
    }
    const toastSeq = shallowRef(0)
    const showToast = (text: string) => {
      toastSeq.value += 1
      setToast({ seq: toastSeq.value, text })
    }
    const dismissToast = () => {
      setToast(null)
    }
    const imageLimits = useProjection.value('imageLimits')
    const failedUpload = computed(() =>
      attachments.value
        .map(attachment => uploads.value[attachment.id])
        .find(upload => upload?.status === 'error'),
    )
    const uploadsHeldText = computed(() =>
      failedUpload.value?.status !== 'error'
        ? t.value('file.stillUploading')
        : failedUpload.value.reason === undefined
          ? t.value('file.uploadFailed')
          : attachmentErrorText(t.value, failedUpload.value.reason, imageLimits.value),
    )
    const rowRef = shallowRef<HTMLDivElement | null>(null)
    const cardRef = shallowRef<HTMLDivElement | null>(null)
    const scrollRef = shallowRef<HTMLDivElement | null>(null)
    const continuable = computed(() => subagent.value?.address.mode === 'continuable')
    const disabled = computed(
      () => removed.value || inert.value || !live.value || blocked.value !== undefined,
    )
    const locked = computed(() => disabled.value)
    const modelSeatLocked = computed(() => removed.value || inert.value || !live.value)
    const machineBusy = computed(
      () =>
        input.value?.phase === 'adjudicating' ||
        input.value?.phase === 'submitting' ||
        input.value?.phase === 'sending',
    )
    const sending = computed(() => input.value?.phase === 'sending')
    const workspaceTrigger = computed(
      () => inert.value && !removed.value && onRequestWorkspace.value !== undefined,
    )
    const editorDisabled = computed(
      () => removed.value || (locked.value && !workspaceTrigger.value),
    )
    const editable = computed(() => live.value && !locked.value && !machineBusy.value)
    const steeringAvailable = computed(
      () => subagent.value === null || subagent.value.address.mode === 'continuable',
    )
    const canSteerQueue = computed(
      () =>
        !locked.value &&
        !machineBusy.value &&
        !commandMenuOpen.value &&
        empty.value &&
        running.value &&
        steeringAvailable.value &&
        (input.value?.queue.length ?? 0) > 0,
    )
    const revealSelection = (): void => {
      revealDraftSelection(scrollRef)
    }
    const busyPhaseSeen = shallowRef(false)
    const intakeFiles = (files: readonly File[], directories?: ReadonlySet<File>): void => {
      if (
        uploadDenied.value ||
        locked.value ||
        machineBusy.value ||
        (subagent.value !== null && !continuable.value) ||
        addFiles.value === undefined ||
        files.length === 0
      )
        return
      const rejected = ((): string | null => {
        // Child prompts support images, but not generic file receipts or the
        // Desktop path-reference fallback. Refuse mixed batches before intake.
        if (
          continuable.value &&
          files.some(file => directories?.has(file) || !isImageMediaType(file.type))
        ) {
          return t.value('image.unsupportedType')
        }
        if (imageLimits.value !== undefined) {
          const limits = imageLimits.value
          const mediaTypes = limits.mediaTypes as readonly string[]
          const images = files.filter(file => mediaTypes.includes(file.type))
          const imageAttachments = attachments.value.filter(
            attachment => attachment.kind === 'image',
          )
          if (imageAttachments.length + images.length > imageLimits.value.maxImagesPerMessage) {
            return t.value('image.tooMany', { count: imageLimits.value.maxImagesPerMessage })
          }
          if (images.some(file => file.size > limits.maxImageBytes)) {
            return t.value('image.fileTooLarge', {
              size: imageSizeText(imageLimits.value.maxImageBytes),
            })
          }
          const total =
            imageAttachments.reduce((sum, attachment) => sum + attachment.file.size, 0) +
            images.reduce((sum, file) => sum + file.size, 0)
          if (total > imageLimits.value.maxMessageImageBytes) {
            return t.value('image.totalTooLarge', {
              size: imageSizeText(imageLimits.value.maxMessageImageBytes),
            })
          }
        }
        return addFiles.value(files, directories)
      })()
      if (rejected !== null) showToast(rejected)
    }
    const canAcceptDrop = computed(
      () =>
        !uploadDenied.value &&
        (subagent.value === null || continuable.value) &&
        !locked.value &&
        !machineBusy.value &&
        addFiles.value !== undefined,
    )
    const fileInputRef = shallowRef<HTMLInputElement | null>(null)
    const onPickFiles = (e: Event): void => {
      const target = e.target
      if (!(target instanceof HTMLInputElement)) return
      const picked = target.files === null ? [] : [...target.files]
      // Reset so picking the same file again re-fires the change event.
      target.value = ''
      if (picked.length > 0) intakeFiles(picked)
    }
    const gate = computed(() => ({
      locked: locked.value,
      machineBusy: machineBusy.value,
      canSteerQueue: canSteerQueue.value,
      running: running.value,
      steeringAvailable: steeringAvailable.value,
      busyEnter: busyEnter.value,
      intakeFiles,
      uploadsPending: uploadsPending.value,
      uploadsHeldText: uploadsHeldText.value,
      showToast,
      canAcceptDrop: canAcceptDrop.value,
    }))
    const keepFocus = (e: MouseEvent): void => {
      keepDraftFocus(e, editor.value)
    }
    const onCardMouseDown = (e: MouseEvent): void => {
      if (!editable.value || editor.value === null || e.button !== 0 || e.defaultPrevented) return
      const target = e.target
      const card = e.currentTarget
      if (!(card instanceof HTMLElement) || !(target instanceof Element) || !card.contains(target))
        return
      if (target.closest('[data-composer-overlay]') !== null) return
      if (scrollRef.value?.contains(target)) return
      const control = target.closest(
        'button, a, input, select, textarea, [role="button"], [contenteditable], [tabindex]',
      )
      if (control !== null && control !== card && card.contains(control)) return
      e.preventDefault()
      // Lexical's stored selection can lag behind native caret moves, so calling
      // editor.focus() on a focused editor can restore an older caret.
      if (document.activeElement !== editor.value.getRootElement())
        focusDraftEditor(editor.value, revealSelection)
    }
    const onToggleCommandMenu = (): void => {
      if (keyboard.value === undefined) return
      // The menu is a combobox over the editor, so the keyboard has to be there
      // before the launcher opens it: activating the button from the keyboard
      // leaves focus on the button, and restoring it afterwards would re-track an
      // empty draft and close the menu again.
      if (editor.value !== null) focusDraftEditor(editor.value, revealSelection)
      toggleCommandMenu.value?.(keyboard.value.caretSpan())
    }
    const onWorkspaceKeyDown = (e: KeyboardEvent): void => {
      if (!workspaceTrigger.value) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onRequestWorkspace.value?.()
      }
    }
    const primaryStops = computed(
      () =>
        running.value &&
        subagent.value === null &&
        !sending.value &&
        (empty.value || blocked.value !== undefined),
    )
    const primaryRetries = computed(
      () =>
        !running.value &&
        subagent.value === null &&
        empty.value &&
        retryableFailure.value !== undefined &&
        !pendingHumanInput.value &&
        historyOpen.value &&
        !submissionPending.value &&
        !disabled.value &&
        input.value?.queue.length === 0 &&
        input.value.phase === 'plain' &&
        retry.value !== undefined,
    )
    const primaryDisabled = computed(() =>
      primaryStops.value
        ? stopAction.value === undefined
        : (!primaryRetries.value && empty.value) ||
          disabled.value ||
          machineBusy.value ||
          uploadsPending.value,
    )
    const interruptible = computed(
      () => running.value && (continuable.value || (sending.value && subagent.value === null)),
    )
    const primarySubmitMode = computed(() =>
      resolveSubmitMode(busyEnter.value, running.value, 'enter', steeringAvailable.value),
    )
    const plainMessageDraft = computed(
      () =>
        !empty.value && input.value?.phase === 'plain' && !draft.value.trimStart().startsWith('/'),
    )
    const primaryLabel = computed(() =>
      primaryStops.value
        ? t.value('input.stop')
        : sending.value
          ? t.value('input.sending')
          : primaryRetries.value
            ? t.value('input.continue')
            : running.value &&
                steeringAvailable.value &&
                !disabled.value &&
                !uploadsPending.value &&
                plainMessageDraft.value
              ? t.value(
                primarySubmitMode.value === 'steer' ? 'input.send.steer' : 'input.send.queue',
              )
              : t.value('input.send'),
    )
    const onPrimary = (): void => {
      if (primaryStops.value) {
        stopAction.value?.()
        return
      }
      if (primaryRetries.value) {
        const retryAction = retry.value
        const failedSeq = retryableFailure.value
        if (retryAction !== undefined && failedSeq !== undefined) retryAction(failedSeq)
        return
      }
      if (keyboard.value === undefined) return // absent machine: the button is disabled
      /* v8 ignore next -- defensive: the primary button is disabled for empty, disabled, and pending-upload states. */
      if (!empty.value && !disabled.value && !machineBusy.value && !uploadsPending.value)
        keyboard.value.submit(primarySubmitMode.value, 'click')
    }
    const claimActive = computed(
      () =>
        (input.value?.phase === 'claimed' || input.value?.phase === 'submitting') &&
        input.value.claim !== undefined &&
        draft.value.startsWith(input.value.claim.token),
    )
    const rawHint = computed(() => {
      const claim = input.value?.claim
      return claimActive.value &&
        claim?.hint !== undefined &&
        draft.value.slice(claim.token.length).trim() === ''
        ? claim.hint
        : null
    })
    const hint = computed(() =>
      ((): string | null => {
        if (rawHint.value === null) return null
        const commandName = input.value?.claim?.name ?? ''
        const hintKey = `hint.${commandName === 'goal' && hasGoal.value ? 'goal.active' : commandName}`
        // Dynamic lookup by claimed command name: unknown commands miss the
        // dictionary and keep the machine's own hint, so the call is wide.
        const translated = (t.value as Translate)(hintKey)
        return translated !== hintKey ? translated : rawHint.value
      })(),
    )
    const placeholderText = computed(
      () =>
        placeholder.value ??
        (disabled.value
          ? t.value('placeholder.unavailable')
          : // The steer hint deliberately outranks the plan placeholder:
        // while it shows, the whole-queue gesture is genuinely available
        // (the gate never consults plan mode), so the actionable hint wins.
          canSteerQueue.value
            ? t.value('placeholder.steerQueue')
            : planActive.value
              ? t.value('placeholder.plan')
              : t.value('placeholder.default')),
    )
    onMounted(() =>
      watch(
        [() => sessionId.value],
        () => {
          setActivity(false)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => promptError.value, () => showToast, () => t.value, () => imageLimits.value],
        () => {
          if (promptError.value === null) return
          const { error } = promptError.value
          if (error.code === 'session/writer-held') {
            showToast(t.value('error.sessionInUse'))
            return
          }
          showToast(
            error.code === 'session/attachment-invalid' ||
              error.code === 'subagent/attachment-invalid'
              ? attachmentErrorText(t.value, error.details.reason, imageLimits.value)
              : `${error.message} (${error.code})`,
          )
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => notice.value, () => showToast],
        () => {
          if (notice.value?.level === 'error') showToast(notice.value.text)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const row = rowRef.value
            if (row === null) return
            return observeControlRow(row)
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => attachments.value, () => input.value?.attachmentIds, () => inputActions.value],
        () => {
          if (input.value === undefined || inputActions.value === undefined) return
          if (attachments.value.length !== input.value.attachmentIds.length) {
            inputActions.value.pruneAttachments(
              attachments.value.map(attachment => attachment.id),
            )
          }
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => locked.value, () => sessionId.value, () => editor.value],
        (_value, _previous, onCleanup) => {
          const target = editor.value
          if (locked.value || target === null || isMobileDevice()) return
          const session = sessionId.value
          const intentElement = document.activeElement
          let pending = true
          let active = true
          // Parent post watchers can run before the resident host binds a new editor.
          // Lexical reports both an already bound root and subsequent root readiness.
          const remove = target.registerRootListener((root) => {
            if (!active || !pending || root === null) return
            pending = false
            if (locked.value || editor.value !== target || sessionId.value !== session) return
            const focused = document.activeElement
            if (focused !== intentElement && focused !== document.body && focused !== root) return
            focusDraftEditor(target, revealSelection)
          })
          onCleanup(() => {
            active = false
            remove()
          })
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => machineBusy.value],
        () => {
          if (machineBusy.value) {
            busyPhaseSeen.value = true
            return
          }
          if (!busyPhaseSeen.value) return
          busyPhaseSeen.value = false
          if (locked.value || editor.value === null) return
          if (document.activeElement !== null && document.activeElement !== document.body) return
          if (isMobileDevice()) {
            if (cardRef.value !== null) focusWithoutRing(cardRef.value, { preventScroll: true })
          } else {
            focusDraftEditor(editor.value, revealSelection)
          }
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => draft.value !== ''],
        () => {
          if (locked.value || draft.value === '') return
          revealSelection()
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            return installDraftWheel(scrollRef)
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => keyboard.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (keyboard.value === undefined) return
            return installDraftFilePicker(keyboard.value, gate, fileInputRef)
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => editor.value, () => keyboard.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (editor.value === null || keyboard.value === undefined) return
            return installDraftKeymap(editor.value, keyboard.value, gate)
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => editor.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (editor.value === null) return
            return installDraftKeyboardDismissal(editor.value, cardRef)
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => registerFileIntake.value, () => occurrence.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() =>
            registerFileIntake.value({
              // The card is an unconditional descendant attached before this effect.
              card: cardRef.value as HTMLDivElement,
              occurrence: occurrence.value,
              accepts: () => gate.value.canAcceptDrop,
              add: (files, directories) => {
                gate.value.intakeFiles(files, directories)
              },
            }))()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      h(
        'div',
        {
          class: clsx(css.root, variant.value === 'hero' && css.hero),
        },
        [
          toast.value !== null &&
            h(Toast, {
              key: toast.value.seq,
              text: toast.value.text,
              icon: h(IconWarningOutlineRegular, null),
              anchor: cardRef.value,
              onDone: dismissToast,
            }),
          notice.value?.level === 'info' &&
            h(
              'div',
              {
                class: css.notice,
                role: 'status',
              },
              [notice.value.text],
            ),
          h(
            'div',
            {
              ref: cardRef,
              tabIndex: -1,
              class: clsx(css.card, workspaceTrigger.value && css.cardWorkspaceTrigger),
              'data-composer-card': true,
              onClick: workspaceTrigger.value ? onRequestWorkspace.value : undefined,
              onPointerdown: workspaceTrigger.value
                ? (e: PointerEvent) => {
                  e.stopPropagation()
                }
                : undefined,
              onMousedown: onCardMouseDown,
            },
            [
              sessionId.value !== undefined &&
                h(
                  'div',
                  {
                    class: css.overlayAnchor,
                    'data-composer-overlay': true,
                  },
                  [renderSlot.value('conversation.input.overlay', {})],
                ),
              accessory.value !== undefined &&
                h(
                  'div',
                  {
                    class: css.accessory,
                  },
                  [accessory.value],
                ),
              renderSlot.value('conversation.input.attachments', {
                attachments: attachments.value,
                canAcceptDrop: canAcceptDrop.value,
                onAddFiles: intakeFiles,
                onRemoveAttachment: (id) => {
                  removeAttachment.value?.(id)
                },
                uploads: uploads.value,
                onRetryFile: (id) => {
                  retryFileUpload.value?.(id)
                },
                uploadFailureText: reason =>
                  attachmentErrorText(t.value, reason, imageLimits.value),
                dropLimits:
                  imageLimits.value === undefined
                    ? undefined
                    : {
                      count: imageLimits.value.maxImagesPerMessage,
                      size: imageSizeText(imageLimits.value.maxImageBytes),
                    },
              }),
              h(DraftEditor, {
                classNames: css,
                editor: editor.value,
                scrollRef: scrollRef,
                editable: editable.value,
                editorDisabled: editorDisabled.value,
                phase: input.value?.phase ?? 'inert',
                placeholderText: placeholderText.value,
                ariaLabel: workspaceTrigger.value
                  ? t.value('hero.chooseWorkspace')
                  : placeholderText.value,
                workspaceTrigger: workspaceTrigger.value,
                workspacePickerOpen: workspacePickerOpen.value,
                onWorkspaceKeyDown: onWorkspaceKeyDown,
                hint: hint.value,
                showPlaceholder:
                  draft.value === '' && attachments.value.length === 0 && !claimActive.value,
              }),
              h(
                'div',
                {
                  ref: rowRef,
                  class: css.row,
                },
                [
                  h(
                    'div',
                    {
                      class: css.tools,
                      hidden: activity.value,
                    },
                    [
                      h(
                        Tooltip,
                        {
                          label: t.value('input.commands'),
                          side: 'top',
                          delayMs: 500,
                          portal: true,
                        },
                        {
                          default: () => [
                            h(
                              'button',
                              {
                                type: 'button',
                                class: css.add,
                                'aria-label': t.value('input.commands'),
                                'aria-haspopup': 'listbox',
                                'aria-expanded': commandMenuOpen.value,
                                disabled: locked.value || toggleCommandMenu.value === undefined,
                                onMousedown: keepFocus,
                                onClick: onToggleCommandMenu,
                              },
                              [
                                h(IconPlusOutlineMedium, {
                                  size: 14,
                                }),
                              ],
                            ),
                          ],
                        },
                      ),
                      h('input', {
                        ref: fileInputRef,
                        type: 'file',
                        multiple: true,
                        disabled: !canAcceptDrop.value || subagent.value !== null,
                        hidden: true,
                        onChange: onPickFiles,
                      }),
                      h(
                        'div',
                        {
                          class: css.modes,
                        },
                        [
                          sessionId.value === undefined
                            ? null
                            : renderSlot.value('conversation.input.permission', {
                              locked: locked.value,
                            }),
                          sessionId.value === undefined
                            ? null
                            : renderSlot.value('conversation.input.plan', { locked: locked.value }),
                        ],
                      ),
                      input.value === undefined || sessionId.value === undefined
                        ? null
                        : renderSlot.value('conversation.input.left', {}),
                    ],
                  ),
                  h(
                    'div',
                    {
                      class: clsx(css.trailing, activity.value && css.trailingActive),
                    },
                    [
                      h(
                        'div',
                        {
                          class: css.standardControls,
                          hidden: activity.value,
                        },
                        [
                          input.value === undefined || sessionId.value === undefined
                            ? null
                            : renderSlot.value('conversation.input.right', {}),
                          sessionId.value === undefined
                            ? null
                            : renderSlot.value('conversation.input.model', {
                              locked: modelSeatLocked.value,
                            }),
                        ],
                      ),
                      input.value === undefined || sessionId.value === undefined
                        ? null
                        : h(
                          'div',
                          {
                            class: activity.value ? css.activityExpanded : css.activity,
                          },
                          [
                            renderSlot.value('conversation.input.activity', {
                              locked: locked.value,
                              onActiveChange: setActivity,
                            }),
                          ],
                        ),
                      interruptible.value &&
                        !cancelDenied.value &&
                        h(
                          Tooltip,
                          {
                            label: t.value('input.stop'),
                            shortcutKeys: stopKeys.value,
                            side: 'top',
                            delayMs: 500,
                            disabled: stopAction.value === undefined,
                            portal: true,
                          },
                          {
                            default: () => [
                              h(
                                'button',
                                {
                                  type: 'button',
                                  class: css.primary,
                                  'aria-label': t.value('input.stop'),
                                  disabled: stopAction.value === undefined,
                                  onMousedown: keepFocus,
                                  onClick: stopAction.value,
                                },
                                [
                                  h(
                                    'svg',
                                    {
                                      viewBox: '0 0 16 16',
                                      width: '16',
                                      height: '16',
                                      'aria-hidden': true,
                                    },
                                    [
                                      h('rect', {
                                        x: '3',
                                        y: '3',
                                        width: '10',
                                        height: '10',
                                        rx: '3',
                                        fill: 'currentColor',
                                      }),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          },
                        ),
                      (primaryStops.value ? cancelDenied.value : promptDenied.value)
                        ? null
                        : h(
                          Tooltip,
                          {
                            label: primaryStops.value
                              ? t.value('input.stop')
                              : primaryLabel.value,
                            ...(primaryStops.value ? { shortcutKeys: stopKeys.value } : {}),
                            side: 'top',
                            delayMs: 500,
                            disabled: primaryDisabled.value,
                            portal: true,
                          },
                          {
                            default: () => [
                              h(
                                'button',
                                {
                                  type: 'button',
                                  class: css.primary,
                                  'aria-label': primaryLabel.value,
                                  'aria-busy': sending.value,
                                  'data-sending': sending.value ? '' : undefined,
                                  disabled: primaryDisabled.value,
                                  onMousedown: keepFocus,
                                  onClick: onPrimary,
                                },
                                [
                                  primaryStops.value
                                    ? h(
                                      'svg',
                                      {
                                        viewBox: '0 0 16 16',
                                        width: '16',
                                        height: '16',
                                        'aria-hidden': true,
                                      },
                                      [
                                        h('rect', {
                                          x: '3',
                                          y: '3',
                                          width: '10',
                                          height: '10',
                                          rx: '3',
                                          fill: 'currentColor',
                                        }),
                                      ],
                                    )
                                    : sending.value
                                      ? h(
                                        'svg',
                                        {
                                          class: css.sendingSpinner,
                                          viewBox: '0 0 16 16',
                                          width: '16',
                                          height: '16',
                                          'aria-hidden': true,
                                        },
                                        [
                                          h('circle', {
                                            cx: '8',
                                            cy: '8',
                                            r: '6',
                                            fill: 'none',
                                            stroke: 'currentColor',
                                            strokeOpacity: '0.35',
                                            strokeWidth: '2',
                                          }),
                                          h('path', {
                                            d: 'M8 2a6 6 0 0 1 6 6',
                                            fill: 'none',
                                            stroke: 'currentColor',
                                            strokeWidth: '2',
                                            strokeLinecap: 'round',
                                          }),
                                        ],
                                      )
                                      : primaryRetries.value
                                        ? h(IconTriangleRightFillRegular, {
                                          size: 16,
                                          className: css.continueIcon ?? '',
                                        })
                                        : h(
                                          'svg',
                                          {
                                            viewBox: '0 0 16 16',
                                            width: '16',
                                            height: '16',
                                            'aria-hidden': true,
                                          },
                                          [
                                            h('path', {
                                              d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
                                              fill: 'currentColor',
                                            }),
                                          ],
                                        ),
                                ],
                              ),
                            ],
                          },
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          h(
            'div',
            {
              class: css.dock,
              'data-composer-dock': true,
            },
            [
              variant.value === 'composer' &&
              input.value !== undefined &&
              sessionId.value !== undefined
                ? renderSlot.value('conversation.composer.dock', {})
                : null,
              activity.value
                ? null
                : h(ContextMeter, {
                  useProjection: useProjection.value,
                  t: t.value,
                }),
            ],
          ),
        ],
      )
  },
  {
    props: [
      'useSession',
      'useInput',
      'inputActions',
      'keyboard',
      'addFiles',
      'removeAttachment',
      'resolveDraftAttachments',
      'retryFileUpload',
      'registerFileIntake',
      'toggleCommandMenu',
      'stop',
      'retry',
      't',
      'renderSlot',
      'useBusyEnter',
      'useFileUploads',
      'useNotices',
      'useLexicon',
      'useMenuLauncher',
      'useStopShortcut',
      'useAccess',
      'useProjection',
      'sessionId',
      'variant',
      'occurrence',
      'disabled',
      'blocked',
      'workspacePickerOpen',
      'onRequestWorkspace',
      'placeholder',
      'accessory',
    ],
    inheritAttrs: false,
  },
)
