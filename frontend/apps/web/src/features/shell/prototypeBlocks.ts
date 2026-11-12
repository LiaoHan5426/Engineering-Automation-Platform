import type { ComponentDefinition } from 'grapesjs'
import { PrototypeActionType } from '@eap/runtime-client/contracts'

/** Editable design data. These elements run only in the Grapes canvas, never as application controls. */
export function interactivePrototypeBlock(
  kind: 'form' | 'select' | 'checkbox' | 'dialog',
  label: (key: string) => string,
): ComponentDefinition | ComponentDefinition[] {
  const prefix = 'design-' + crypto.randomUUID()
  const node = (
    id: string,
    type: string,
    tagName: string,
    attributes: Record<string, string> = {},
    content = '',
  ): ComponentDefinition => ({
    tagName,
    attributes: { 'data-eap-kind': type, 'data-eap-id': id, ...attributes },
    content,
  })
  if (kind === 'select')
    return node(prefix, kind, 'select', {
      'data-label': label('choice'),
      'data-options': label('optionOne') + '\n' + label('optionTwo'),
    })
  if (kind === 'checkbox')
    return node(prefix, kind, 'input', { type: 'checkbox', 'data-label': label('checkbox') })
  if (kind === 'dialog')
    return [
      node(
        prefix + '-open',
        'button',
        'button',
        { 'data-action': PrototypeActionType.TOGGLE, 'data-target': prefix },
        label('open'),
      ),
      {
        ...node(prefix, kind, 'section', { 'data-label': label('dialog') }),
        components: [
          node(prefix + '-text', 'text', 'p', {}, label('dialogContent')),
          node(
            prefix + '-close',
            'button',
            'button',
            { 'data-action': PrototypeActionType.TOGGLE, 'data-target': prefix },
            label('close'),
          ),
        ],
      },
    ]
  return {
    ...node(prefix, kind, 'section', { 'data-label': label('form') }),
    components: [
      node(prefix + '-name', 'input', 'input', {
        'data-label': label('name'),
        'data-required': 'true',
        placeholder: label('name'),
      }),
      node(prefix + '-choice', 'select', 'select', {
        'data-label': label('choice'),
        'data-options': label('optionOne') + '\n' + label('optionTwo'),
        'data-required': 'true',
      }),
      node(prefix + '-checked', 'checkbox', 'input', {
        type: 'checkbox',
        'data-label': label('checkbox'),
        'data-required': 'true',
      }),
      node(
        prefix + '-submit',
        'button',
        'button',
        { 'data-action': PrototypeActionType.SUBMIT, 'data-target': prefix },
        label('submit'),
      ),
      node(
        prefix + '-reset',
        'button',
        'button',
        { 'data-action': PrototypeActionType.RESET, 'data-target': prefix },
        label('reset'),
      ),
    ],
  }
}
