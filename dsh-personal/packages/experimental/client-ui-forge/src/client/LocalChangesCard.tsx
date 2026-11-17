/**
 * The panel card of the checkout's `branch` scope changes, independent of
 * change request bindings: file counts and paths open the local changes view,
 * and an optional action asks the Agent for a change request.
 */
import { defineComponent, h, shallowRef } from 'vue'
import { Button, IconChevronDownOutlineRegular, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeLocalChanges } from '../types.ts'
import { Counts } from './DiffFile.tsx'
import { FileLabel } from './FileLabel.tsx'
import type { NS } from './locales.ts'
import css from './ChangesTab.module.css'
/** Props of the local changes card. */
export interface LocalChangesCardProps {
  /** Files the `branch` scope changes and the ref it compares with. */
  readonly local: ForgeLocalChanges
  /** Whether the card offers to create a change request. */
  readonly creatable: boolean
  /** Open the changes view, scrolled to `path` when given. */
  readonly view: (path?: string) => void
  /** Ask the Agent to create a change request for the changes. */
  readonly create: () => void
  /** Forge panel copy. */
  readonly t: PropsLocale<typeof NS>['t']
}
/**
 * Render the local changes card; the file list starts collapsed.
 * @param props - the changes, the view and create actions, and copy.
 * @returns the card.
 */
export const LocalChangesCard = defineComponent((props: LocalChangesCardProps) => {
  const open = shallowRef(false)
  return () => {
    let additions = 0
    let deletions = 0
    for (const file of props.local.files) {
      additions += file.additions
      deletions += file.deletions
    }
    const count = props.local.files.length
    return (h('section', {
      'class': css.local,
      'data-forge-local': '',
    }, [h('div', {
      'class': css.localHead,
    }, [h('button', {
      'type': 'button',
      'class': css.localToggle,
      'aria-expanded': open.value,
      'onClick': () => { open.value = (value => !value)(open.value) },
    }, [props.t('changes.local.title'), h(IconChevronDownOutlineRegular, {
      'size': 12,
    })]), h('span', {
      'class': css.localRefs,
    }, [props.t('changes.local.refs', { head: 'HEAD', base: props.local.base })])]), h('div', {
      'class': css.localRow,
    }, [h('button', {
      'type': 'button',
      'class': css.localView,
      'aria-label': props.t('changes.local.viewAria', { count, added: additions, deleted: deletions }),
      'onClick': () => { props.view() },
    }, [h(IconListPenOutlineRegular, {
      'size': 15,
    }), h(Counts, {
      'file': { additions, deletions, binary: false },
      't': props.t,
    }), h('span', {
      'aria-hidden': 'true',
    }, ['\u00B7']), h('span', {}, [props.t('changes.local.files', { count })])]), props.creatable && (h(Button, {
      'size': 'sm',
      'variant': 'outline',
      'className': css.localCreate ?? '',
      'onClick': props.create,
    }, {
      default: () => [props.t('changes.local.create')],
    }))]), open.value && (h('ul', {
      'class': css.localFiles,
    }, [props.local.files.map(file => (h('li', {
      'key': file.path,
    }, [h('button', {
      'type': 'button',
      'class': css.localFile,
      'onClick': () => { props.view(file.path) },
    }, [h(FileLabel, {
      'path': file.path,
      'className': css.menuPath ?? '',
    }), h(Counts, {
      'file': file,
      't': props.t,
    })])])))]))]))
  }
}, { name: 'LocalChangesCard', inheritAttrs: false, props: ['local', 'creatable', 'view', 'create', 't'] })
