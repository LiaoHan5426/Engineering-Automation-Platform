/** Direct component fixture for the tree's framework seats; integration specs use the real renderer. */
import { defineComponent, h, type Component } from 'vue'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { FactoryComponentPropsOf, FactoryLocalComponent, SlotFactoryMap, FactoryLocalComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTree } from '../src/client/FileTree.tsx'
import type { FileTreeInput } from '../src/client/FileTree.tsx'
import { en } from '../src/client/locales.ts'

export type Accessory = FactoryLocalComponent<'sidebar.files.tree', 'accessory'>
function unused(): never { throw new Error('Unexpected tree framework seat') }
const seats = { t: makeTranslate(en), renderFactorySlot: unused, useSessions: unused,
  useSessionStatus: unused, useSessionRetainInfo: unused, useSessionAccess: unused,
  useWorkspaces: unused, useWorkspaceAccess: unused, useRemoteAccess: unused,
  usePanelInfo: unused, useResource: unused, useContextMenu: unused }

/** Bind local accessory props once for a native tree occurrence. */
export const TreeFixture = defineComponent((props: FileTreeInput & { accessory?: Accessory | undefined; t?: typeof seats.t }) => {
  const useFactorySlot = (<N extends 'accessory'>(_name: N, fallback: FactoryLocalComponent<'sidebar.files.tree', N>) => defineComponent((local: SlotFactoryMap['sidebar.files.tree']['slots'][N]['props']) =>
    () => h((props.accessory ?? fallback) as Component<FactoryLocalComponentPropsOf<'sidebar.files.tree', 'accessory'>>, { ...seats, t: props.t ?? seats.t, entry: local.entry }),
  { props: ['entry'], inheritAttrs: false })) as FactoryComponentPropsOf<'sidebar.files.tree'>['useFactorySlot']
  return () => h(FileTree, { ...seats, ...props, t: props.t ?? seats.t, useFactorySlot })
}, { props: ['root', 'entries', 'expanded', 'onToggle', 'onOpen', 'canOpen', 'directories', 'current', 'currentRef', 'highlight', 'rowTriggerProps', 'accessory', 't'], inheritAttrs: false })
