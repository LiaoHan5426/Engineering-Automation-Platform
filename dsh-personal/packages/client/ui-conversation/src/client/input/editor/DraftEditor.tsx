/** Stateless text-area presentation over the InputBar's borrowed editor. */
import { h, type CSSProperties, type Ref, type VNode } from 'vue'
import type { LexicalEditor } from 'lexical'
import clsx from 'clsx'
import { HoverCardGroup } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InputState } from '../../contract/input.ts'
import { ComposerContentEditable } from './ComposerContentEditable.tsx'
import { DecoratorPortals } from './DecoratorPortals.tsx'
/** Text-area values and the scrollport reference retained by InputBar. */
export interface DraftEditorProps {
  readonly classNames: Readonly<Record<string, string>>
  readonly editor: LexicalEditor | null
  readonly scrollRef: Ref<HTMLDivElement | null>
  readonly editable: boolean
  readonly editorDisabled: boolean
  readonly phase: InputState['phase'] | 'inert'
  readonly placeholderText: string
  readonly ariaLabel: string
  readonly workspaceTrigger: boolean
  readonly workspacePickerOpen: boolean
  readonly onWorkspaceKeyDown: (event: KeyboardEvent) => void
  readonly hint: string | null
  readonly showPlaceholder: boolean
}
/**
 * Render the existing scrollport, editable surface, placeholder, and chip portals.
 * @param props - borrowed editor and presentation values; this component owns no Hooks.
 * @returns the existing text-area DOM without an additional wrapper.
 */
export function DraftEditor({
  classNames: css,
  editor,
  scrollRef,
  editable,
  editorDisabled,
  phase,
  placeholderText,
  ariaLabel,
  workspaceTrigger,
  workspacePickerOpen,
  onWorkspaceKeyDown,
  hint,
  showPlaceholder,
}: DraftEditorProps): VNode {
  return h(
    'div',
    {
      ref: scrollRef,
      class: css.scroll,
      'data-input-scroll': true,
    },
    [
      h(
        HoverCardGroup,
        {
          className: css.grow ?? '',
        },
        {
          default: () => [
            h(
              ComposerContentEditable,
              {
                editor: workspaceTrigger ? null : editor,
                editable: editable,
                class: clsx(css.input, editorDisabled && css.inputDisabled),
                'data-phase': phase,
                'aria-disabled': editorDisabled || undefined,
                'data-placeholder': placeholderText,
                'aria-label': ariaLabel,
                'aria-haspopup': workspaceTrigger ? 'menu' : undefined,
                'aria-expanded': workspaceTrigger ? workspacePickerOpen : undefined,
                tabIndex: workspaceTrigger ? 0 : undefined,
                ...(workspaceTrigger ? { onKeydown: onWorkspaceKeyDown } : {}),
                ...(hint === null
                  ? {}
                  : { style: { '--dsh-composer-hint': JSON.stringify(hint) } as CSSProperties }),
              },
              { default: () => [] },
            ),
            showPlaceholder &&
              h(
                'div',
                {
                  'aria-hidden': true,
                  class: css.placeholder,
                  'data-composer-placeholder': true,
                },
                [placeholderText],
              ),
            h(
              DecoratorPortals,
              {
                editor: workspaceTrigger ? null : editor,
              },
              { default: () => [] },
            ),
          ],
        },
      ),
    ],
  )
}
