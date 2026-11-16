/**
 * A controlled file tree Component Factory over flat entries. The caller owns
 * the data, which directories are expanded, each directory's listing
 * state, and what a click does; the tree derives each entry's level from its
 * path, adds the directories the paths imply, orders every drawn level, and
 * draws the rows and their icons. It redraws when its
 * props or the occurrence's local selection change, and orders a drawn level
 * again only when the names or directory kinds in that level change. Given a
 * query to highlight, it marks each occurrence of the query inside a name.
 */
import { defineComponent, h, Fragment, computed, type VNodeChild } from 'vue';
import clsx from 'clsx';
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client';
import { FileTypeIcon, classifyFileType, IconFolderCloseRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from './locales.ts';
import { matchRanges } from './search-tree.ts';
import css from './FileTree.module.css';
/** What a row is: a directory toggles, a file opens, and anything else is listed without either. */
export type TreeEntryKind = 'file' | 'directory' | 'other';
/** The standard facts the tree reads about an entry; every field is optional. */
export interface TreeEntryMeta {
    /** What the entry is. Without it, an entry with other entries below its path is a directory, and any other is a file. */
    readonly kind?: TreeEntryKind;
    /** The row is drawn subdued; the entry and those below it are still listed. */
    readonly hidden?: boolean;
    /** Size in bytes; absent means unknown. The tree does not draw it. */
    readonly size?: number;
}
/**
 * One tree entry. `path` identifies it and places it: its parent is the part
 * before the last `/`, or the tree's root when it has no `/`. `name` is what
 * the row shows and need not be the end of `path`.
 */
export interface TreeEntry {
    /** The entry's key; only `/` separates levels. */
    readonly path: string;
    /** The name drawn on the row. */
    readonly name: string;
    /** The standard facts the tree reads. */
    readonly meta?: TreeEntryMeta;
}
/** What the caller knows about one directory's listing besides its entries; every field is optional. */
export interface TreeDirectoryState {
    /** The listing is not known yet; the directory shows a loading line instead of its entries. */
    readonly loading?: true;
    /** Why the directory could not be listed, already localized; the entries known so far still show. */
    readonly failure?: string;
    /** Entries are missing from the listing. */
    readonly truncated?: true;
    /**
     * The caller left entries out, which changes what the directory says while
     * none is drawn: `hidden` says that its hidden entries are not shown, and
     * `unmatched`, for entries that are a selection such as search matches, says
     * nothing instead of that it is empty.
     */
    readonly omitted?: 'hidden' | 'unmatched';
}
/** The `sidebar.files.tree` Factory's input: data and callbacks only. */
export interface FileTreeInput {
    /** The root's key; the root itself has no row and its entries are always shown. */
    readonly root: string;
    /**
     * Every entry the caller knows, in any order, each `path` once. Entries
     * whose `path` equals `root` are ignored, including when both are empty.
     * A parent key below the root without an entry of its own gets a directory
     * entry named after the key's last segment; the empty
     * key is never added. An entry under neither the root nor an expanded
     * directory is not drawn.
     */
    readonly entries: readonly TreeEntry[];
    /** Keys of the expanded directories. */
    readonly expanded: readonly string[];
    /** Listing state by directory key, root included; a directory absent here is listed and complete. */
    readonly directories?: Readonly<Record<string, TreeDirectoryState>> | undefined;
    /** Text whose occurrences inside each name are highlighted, ignoring case; nothing is highlighted without it. */
    readonly highlight?: string | undefined;
    /** Key of the file to mark as current, when it is drawn. */
    readonly current?: string | undefined;
    /** Receives the current file's main button while drawn. @param row - the button, or `null` once it goes. */
    readonly currentRef?: ((row: HTMLElement | null) => void) | undefined;
    /**
     * A directory row was pressed.
     * @param entry - the caller's directory entry, or the one the tree added.
     * @param expanded - whether the press asks to expand it.
     */
    readonly onToggle: (entry: TreeEntry, expanded: boolean) => void;
    /**
     * An openable file row was pressed.
     * @param entry - the caller's entry.
     */
    readonly onOpen: (entry: TreeEntry) => void;
    /**
     * Whether a file opens; a file it refuses is dimmed and titled with the localized no-viewer message. Every file opens without it.
     * @param entry - the caller's entry.
     * @returns `false` to refuse it.
     */
    readonly canOpen?: ((entry: TreeEntry) => boolean) | undefined;
    /**
     * Context menu handlers for a directory row or an openable file row's main button.
     * @param entry - the caller's entry, or the directory the tree added.
     * @param kind - the kind the tree resolved for the row.
     * @returns the handlers spread onto the row's button.
     */
    readonly rowTriggerProps?: ((entry: TreeEntry, kind: 'file' | 'directory') => ContextMenuTriggerProps) | undefined;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotFactoryMap {
        /** A controlled file tree over caller-supplied entries; the caller decides what a click does. */
        'sidebar.files.tree': {
            scope: 'root';
            props: FileTreeInput;
            locale: 'sidebarFiles';
            slots: {
                /** Independent content beside each row's main action. */
                accessory: {
                    scope: 'root';
                    props: {
                        readonly entry: TreeEntry;
                    };
                };
            };
        };
    }
}
/** No row accessory unless the caller selects a local Component. */
function EmptyAccessory(): null {
    return null;
}
/** One entry with the kind the tree resolved for it. */
interface TreeNode {
    readonly entry: TreeEntry;
    readonly kind: TreeEntryKind;
}
/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/**
 * The key of the level an entry is listed in.
 * @param path - the entry's key.
 * @param root - the root's key.
 * @returns the part of `path` before its last `/`, or `root` when it has none.
 */
function parentOf(path: string, root: string): string {
    const slash = path.lastIndexOf('/');
    return slash < 0 ? root : path.slice(0, slash);
}
/**
 * Group entries under their parent keys, adding the directories their paths imply.
 * @param entries - the caller's entries; a repeated `path` keeps its first entry.
 * @param root - the root's key.
 * @returns each parent key's children.
 */
function levelsOf(entries: readonly TreeEntry[], root: string): ReadonlyMap<string, readonly TreeNode[]> {
    const byPath = new Map<string, TreeEntry>();
    for (const entry of entries)
        if (entry.path !== root && !byPath.has(entry.path))
            byPath.set(entry.path, entry);
    for (const entry of entries) {
        if (entry.path === root)
            continue;
        for (let parent = parentOf(entry.path, root); parent !== root && parent !== '' && !byPath.has(parent); parent = parentOf(parent, root)) {
            byPath.set(parent, { path: parent, name: parent.slice(parent.lastIndexOf('/') + 1), meta: { kind: 'directory' } });
        }
    }
    const groups = new Map<string, TreeEntry[]>();
    for (const entry of byPath.values()) {
        const parent = parentOf(entry.path, root);
        const group = groups.get(parent);
        if (group === undefined)
            groups.set(parent, [entry]);
        else
            group.push(entry);
    }
    const levels = new Map<string, readonly TreeNode[]>();
    for (const [parent, group] of groups) {
        levels.set(parent, group.map(entry => ({ entry, kind: entry.meta?.kind ?? (groups.has(entry.path) ? 'directory' : 'file') })));
    }
    return levels;
}
/**
 * One level's display order: directories first, then everything else, each by name.
 * @param level - one parent key's children.
 * @returns the children's indices in display order.
 */
function orderOf(level: readonly TreeNode[]): readonly number[] {
    return level.map((node, index) => ({ node, index })).sort(({ node: left }, { node: right }) => {
        const group = Number(right.kind === 'directory') - Number(left.kind === 'directory');
        return group !== 0 ? group : byName.compare(left.entry.name, right.entry.name);
    }).map(({ index }) => index);
}
/** What every level shares: the grouped entries, input, locale, and accessory. */
interface TreeContext {
    readonly levels: ReadonlyMap<string, readonly TreeNode[]>;
    readonly expanded: ReadonlySet<string>;
    readonly input: FileTreeInput;
    readonly t: FactoryComponentPropsOf<'sidebar.files.tree'>['t'];
    readonly Accessory: ReturnType<FactoryComponentPropsOf<'sidebar.files.tree'>['useFactorySlot']>;
}
/** One entry's name, with the occurrences of the text to highlight marked. */
function Name({ name, highlight }: {
    name: string;
    highlight: string | undefined;
}): VNodeChild {
    const ranges = highlight === undefined ? [] : matchRanges(name, highlight);
    if (ranges.length === 0)
        return h("span", {
            "class": css.name
        }, [
            name
        ]);
    const parts: VNodeChild[] = [];
    let at = 0;
    for (const [start, end] of ranges) {
        if (start > at)
            parts.push(name.slice(at, start));
        parts.push(h("mark", {
            "key": start,
            "class": css.match
        }, [
            name.slice(start, end)
        ]));
        at = end;
    }
    if (at < name.length)
        parts.push(name.slice(at));
    return h("span", {
        "class": css.name
    }, [
        parts
    ]);
}
/** One entry's row, and its children when it is an expanded directory. */
function Entry({ node, tree }: {
    node: TreeNode;
    tree: TreeContext;
}): VNodeChild {
    const { input, Accessory } = tree;
    const { entry, kind } = node;
    const hidden = entry.meta?.hidden === true && css.hidden;
    const label = h(Name, {
        "name": entry.name,
        "highlight": input.highlight
    }, {
        "default": () => []
    });
    if (kind === 'directory') {
        const expanded = tree.expanded.has(entry.path);
        return (h("li", {
            "class": css.item,
            "data-files-entry": "directory",
            "data-files-path": entry.path
        }, [
            h("div", {
                "class": css.row
            }, [
                h("button", {
                    "type": "button",
                    "class": clsx(css.action, hidden),
                    "aria-expanded": expanded,
                    "onClick": () => { input.onToggle(entry, !expanded); },
                    ...input.rowTriggerProps?.(entry, 'directory')
                }, [
                    expanded ? h(IconFolderOpenRegular, {
                        "class": css.icon
                    }, {
                        "default": () => []
                    }) : h(IconFolderCloseRegular, {
                        "class": css.icon
                    }, {
                        "default": () => []
                    }),
                    label
                ]),
                h("div", {
                    "class": css.accessory
                }, [
                    h(Accessory, {
                        "entry": entry
                    }, {
                        "default": () => []
                    })
                ])
            ]),
            expanded && h("ul", {
                "class": css.level
            }, [
                h(Level, {
                    "path": entry.path,
                    "tree": tree
                }, {
                    "default": () => []
                })
            ])
        ]));
    }
    if (kind === 'file' && input.canOpen?.(entry) !== false) {
        const current = entry.path === input.current;
        return (h("li", {
            "class": css.item,
            "data-files-entry": "file",
            "data-files-path": entry.path
        }, [
            h("div", {
                "class": clsx(css.row, current && css.current)
            }, [
                h("button", {
                    "type": "button",
                    "class": clsx(css.action, hidden),
                    "aria-current": current || undefined,
                    ...(current && input.currentRef !== undefined ? { ref: (element: Element | import('vue').ComponentPublicInstance | null) => { input.currentRef?.(element instanceof HTMLElement ? element : null); } } : {}),
                    ...input.rowTriggerProps?.(entry, 'file'),
                    "onClick": () => { input.onOpen(entry); }
                }, [
                    h(FileTypeIcon, {
                        "kind": classifyFileType(entry.name),
                        "size": 16,
                        "class": css.fileIcon
                    }, {
                        "default": () => []
                    }),
                    label
                ]),
                h("div", {
                    "class": css.accessory
                }, [
                    h(Accessory, {
                        "entry": entry
                    }, {
                        "default": () => []
                    })
                ])
            ])
        ]));
    }
    // A file the caller refuses is listed like anything else that does not open.
    const file = kind === 'file';
    return (h("li", {
        "class": css.item,
        "data-files-entry": kind,
        "data-files-path": entry.path
    }, [
        h("div", {
            "class": clsx(css.row, css.inactive)
        }, [
            h("span", {
                "class": clsx(css.action, hidden, css.other),
                "aria-disabled": "true",
                "title": tree.t(file ? 'entry.noViewer' : 'entry.other')
            }, [
                file && h(FileTypeIcon, {
                    "kind": classifyFileType(entry.name),
                    "size": 16,
                    "class": css.fileIcon
                }, {
                    "default": () => []
                }),
                label
            ]),
            h("div", {
                "class": css.accessory
            }, [
                h(Accessory, {
                    "entry": entry
                }, {
                    "default": () => []
                })
            ])
        ])
    ]));
}
/** No entries, shared so that an empty level orders nothing. */
const NO_ENTRIES: readonly never[] = [];
/** One directory's rows: a loading line until it is listed, then its entries and notes. */
const Level = defineComponent((props: { path: string; tree: TreeContext }) => {
    let previousSortKey: string | undefined;
    let order: readonly number[] = [];
    return () => {
    const { path, tree } = props;
    const { t } = tree;
    const state = tree.input.directories?.[path];
    const level = tree.levels.get(path) ?? NO_ENTRIES;
    // The order reads only each child's name and whether it is a directory, so
    // it is kept while those are unchanged; the rows draw this render's entries.
    const sortKey = JSON.stringify(level.map(node => [node.kind === 'directory', node.entry.name]));
    if (sortKey !== previousSortKey) { order = orderOf(level); previousSortKey = sortKey; }
    if (state?.loading === true)
        return h("li", {
            "class": css.note,
            "data-files-row": "loading"
        }, [
            t('loading')
        ]);
    return (h(Fragment, null, [
        state?.failure !== undefined && h("li", {
            "class": css.note,
            "data-files-row": "failed"
        }, [
            state.failure
        ]),
        level.length === 0 && state?.failure === undefined && state?.omitted !== 'unmatched' && (state?.omitted === 'hidden'
            ? h("li", {
                "class": css.note,
                "data-files-row": "hidden-only"
            }, [
                t('emptyHidden')
            ]) : h("li", {
            "class": css.note,
            "data-files-row": "empty"
        }, [
            t('empty')
        ])),
        order.map(index => level[index]).filter(node => node !== undefined)
            .map(node => h(Entry, {
            "key": node.entry.path,
            "node": node,
            "tree": tree
        }, {
            "default": () => []
        })),
        state?.truncated === true && h("li", {
            "class": css.note,
            "data-files-row": "truncated"
        }, [
            t('truncated')
        ])
    ]));
    };
}, { name: 'FileTreeLevel', props: ['path', 'tree'], inheritAttrs: false });
/**
 * The tree from its root.
 * @param props - the caller's entries, expansion, states, callbacks, and framework seats.
 * @returns the root level's list.
 */
export const FileTree = defineComponent((props: FactoryComponentPropsOf<'sidebar.files.tree'>) => {
    const Accessory = props.useFactorySlot('accessory', EmptyAccessory);
    const levels = computed(() => levelsOf(props.entries, props.root));
    const expanded = computed(() => new Set(props.expanded));
    return () => {
        const tree: TreeContext = { levels: levels.value, expanded: expanded.value, input: props, t: props.t, Accessory };
        return h('ul', { class: css.level }, [h(Level, { path: props.root, tree })]);
    };
}, { name: 'FileTree', props: ['root', 'entries', 'expanded', 'directories', 'highlight', 'current', 'currentRef', 'onToggle', 'onOpen', 'canOpen', 'rowTriggerProps', 't', 'useFactorySlot'], inheritAttrs: false });
