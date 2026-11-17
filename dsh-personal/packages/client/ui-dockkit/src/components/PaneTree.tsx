import type { DockPointerEvent } from './pointer.ts'
/**
 * The docked split tree: nested flex runs sized by each split's fractions, with a
 * draggable divider between neighbours. A live divider drag renders from the
 * preview fractions instead of the recorded ones — the gesture only settles one
 * intent when it ends.
 */
import { Fragment, h } from 'vue'
import type { VNodeChild } from 'vue'
import clsx from 'clsx'
import type { LayoutState, NodeId, SplitId } from '../contract/types.ts'
import { getNode } from '../engine/tree.ts'
import type { PaneCallbacks } from './render.ts'
import { TabPanel } from './TabPanel.tsx'
import css from './dockkit.module.css'
/** Fractions a live divider drag is previewing for one split. */
export interface SizePreview {
  readonly splitId: SplitId
  readonly sizes: readonly number[]
}
/** One subtree of the docked layout. */
export interface PaneTreeProps {
  readonly state: LayoutState
  readonly nodeId: NodeId
  readonly callbacks: PaneCallbacks
  readonly preview: SizePreview | undefined
}
/** Render a split or pane node and everything under it. */
export function PaneTree({ state, nodeId, callbacks, preview }: PaneTreeProps): VNodeChild {
  const node = getNode(state, nodeId)
  if (node.kind === 'pane')
    return h(TabPanel, {
      state: state,
      pane: node,
      callbacks: callbacks,
    })
  const sizes = preview !== undefined && preview.splitId === node.id ? preview.sizes : node.sizes
  return h(
    'div',
    {
      class: clsx(css.split, node.axis === 'row' ? css.splitRow : css.splitColumn),
      'data-dockkit-split': node.id,
    },
    [
      node.children.map((childId, index) =>
        h(
          Fragment,
          {
            key: childId,
          },
          [
            index > 0 &&
              h(
                'div',
                {
                  class: css.divider,
                  'data-dockkit-divider': `${node.id}:${index - 1}`,
                  onPointerdown: (event: DockPointerEvent) => {
                    callbacks.onDividerPressed(node.id, index - 1, event)
                  },
                },
                [],
              ),
            h(
              'div',
              {
                class: css.splitCell,
                'data-dockkit-cell': `${node.id}:${index}`,
                style: { flexGrow: sizes[index] },
              },
              [
                h(PaneTree, {
                  state: state,
                  nodeId: childId,
                  callbacks: callbacks,
                  preview: preview,
                }),
              ],
            ),
          ],
        ),
      ),
    ],
  )
}
