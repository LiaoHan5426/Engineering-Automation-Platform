import { defineComponent, Fragment, h, type VNodeChild } from 'vue';
// Expanded bodies for the context disclosure, one per durable context form.
// The producer declares the form; this module only chooses a presentation for
// it. Every form falls back to OpaqueBody, which is the documented default for
// an absent, unknown, or malformed form — a resumed or foreign log must render
// even when this UI version has never seen its producer.
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ChatViewSlotProps } from '../contract/slots.ts';
import type { ContextMessageNode } from '../contract/snapshot.ts';
import type { KnownContextForm } from '@deepseek-ai/dsh-client-ui-conversation/client';
import css from './ContextBody.module.css';
/** Model-facing text stays bounded at the disclosure, not at the producer. */
const MAX_CHARS = 20000;
/** Rows a list body materializes before summarizing the remainder. */
const MAX_ENTRIES = 200;
type Translate = ChatViewSlotProps['t'];
/** One durable source narrowed to the readable-record shape; null for anything else. */
function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
/** One run of the model-facing content: adjacent text, or one unknown block. */
type ContentRun = {
    text: string;
} | {
    block: unknown;
};
/**
 * The content blocks as runs, IN THE ORDER the model received them.
 *
 * Adjacent text blocks join with no separator, matching how provider adapters
 * flatten them — inserting a line break would show the reader a line the model
 * never saw. An unknown block breaks the run and keeps its own fallback rather
 * than being hoisted past the text around it or vanishing; the block union is
 * merge-extensible, so a foreign log may interleave shapes this build does not
 * know.
 */
function contentRuns(content: ContextMessageNode['content']): ContentRun[] {
    const runs: ContentRun[] = [];
    for (const block of content) {
        if (block.type !== 'text') {
            runs.push({ block });
            continue;
        }
        const last = runs[runs.length - 1];
        if (last !== undefined && 'text' in last)
            last.text += block.text;
        else
            runs.push({ text: block.text });
    }
    return runs;
}
/** Only the blocks this UI version does not know, for bodies that replace the text. */
function unknownBlocks(content: ContextMessageNode['content']): unknown[] {
    return contentRuns(content).flatMap(run => 'block' in run ? [run.block] : []);
}
/** The model-facing text, truncated to the display bound. */
function boundedText(text: string, t: Translate): string {
    return text.length > MAX_CHARS
        ? `${text.slice(0, MAX_CHARS)}\n${t('json.truncated', { total: text.length })}`
        : text;
}
/**
 * One source field rendered as a value row; nested shapes stay compact JSON.
 * Bounded on its own, because source fields are as unbounded as the text: an unknown
 * producer may record an arbitrarily large string or array.
 */
function fieldValue(value: unknown, t: Translate): string {
    const text = typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value);
    return boundedText(text, t);
}
const SourceFields = defineComponent((props: {
    source: unknown;
    formRendered: boolean;
    t: Translate;
}) => {
    return () => {
        const { source, formRendered, t } = props;
        const record = asRecord(source);
        if (record === null)
            return null;
        const hidden = formRendered ? ['kind', 'form'] : ['kind'];
        const rows = Object.entries(record).filter(([key]) => !hidden.includes(key));
        if (rows.length === 0)
            return null;
        return (h("dl", { "class": css.fields, "data-context-fields": true }, [
            rows.map(([key, value]) => (h("div", { "key": key, "class": css.field }, [
                h("dt", { "class": css.fieldKey }, [
                    key
                ]),
                h("dd", { "class": css.fieldValue }, [
                    fieldValue(value, t)
                ])
            ])))
        ]));
    };
}, { name: "SourceFields", inheritAttrs: false, props: ["source", "formRendered", "t"] });
const UnknownBlocks = defineComponent((props: {
    blocks: readonly unknown[];
    t: Translate;
}) => {
    return () => {
        const { blocks, t } = props;
        return (h(Fragment, null, [
            blocks.map((block, index) => (h(JsonBlock, { "key": index, "label": t('message.unknownBlock'), "payload": block, "truncatedLabel": total => t('json.truncated', { total }) })))
        ]));
    };
}, { name: "UnknownBlocks", inheritAttrs: false, props: ["blocks", "t"] });
const ModelFacingContent = defineComponent((props: {
    content: ContextMessageNode['content'];
    t: Translate;
}) => {
    return () => {
        const { content, t } = props;
        return (h(Fragment, null, [
            contentRuns(content).map((run, index) => ('text' in run
                ? run.text !== '' && (h("pre", { "key": index, "class": css.text, "data-context-text": true }, [
                    boundedText(run.text, t)
                ]))
                : (h(JsonBlock, { "key": index, "label": t('message.unknownBlock'), "payload": run.block, "truncatedLabel": total => t('json.truncated', { total }) }))))
        ]));
    };
}, { name: "ModelFacingContent", inheritAttrs: false, props: ["content", "t"] });
/**
 * Default presentation: the model-facing text as text, with its real line
 * breaks, and the remaining source fields beneath it. This is what every form
 * this UI version does not recognize renders as.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The opaque context body.
 */
export const OpaqueBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        return (h(Fragment, null, [
            h(ModelFacingContent, { "content": content, "t": t }),
            h(SourceFields, { "source": source, "formRendered": false, "t": t })
        ]));
    };
}, { name: "OpaqueBody", inheritAttrs: false, props: ["content", "source", "t"] });
/** One reconciled instruction file, as the durable source records it. */
interface InstructionChange {
    action: 'set' | 'replace' | 'remove';
    path: string;
    digest?: string;
}
/**
 * Instruction changes read off the source, or null when the record is not a
 * usable instruction list.
 *
 * The read is all-or-nothing: silently dropping one unreadable entry would show
 * a confident, incomplete file list for a log this version cannot fully read.
 * Paths are deduplicated in first-seen order, matching how the header label is
 * derived from the same array.
 */
function instructionChanges(source: unknown): InstructionChange[] | null {
    const record = asRecord(source);
    const list = record === null ? undefined : record['changes'];
    if (!Array.isArray(list))
        return null;
    const changes: InstructionChange[] = [];
    const seen = new Set<string>();
    for (const entry of list as readonly unknown[]) {
        const change = asRecord(entry);
        if (change === null)
            return null;
        const path = change['path'];
        if (typeof path !== 'string' || path === '')
            return null;
        const action = change['action'];
        // The action decides which word the row shows, so an unrecognized one is
        // not a readable change — it would be presented as loaded or updated.
        if (action !== 'set' && action !== 'replace' && action !== 'remove')
            return null;
        const digest = change['digest'];
        if (seen.has(path))
            continue;
        seen.add(path);
        changes.push({ action, path, ...typeof digest === 'string' ? { digest } : {} });
    }
    return changes.length === 0 ? null : changes;
}
/**
 * Locale key for one reconciled file. The baseline loads a file; a later delta
 * distinguishes a newly reconciled path from a rewritten one, which `set` and
 * `replace` already separate at the producer.
 * @param action - the durable change action.
 * @param baseline - whether this context is the startup/resume baseline.
 * @returns the key naming what happened to that file.
 */
function instructionAction(action: InstructionChange['action'], baseline: boolean): 'message.context.instructions.removed' | 'message.context.instructions.loaded' | 'message.context.instructions.added' | 'message.context.instructions.updated' {
    if (action === 'remove')
        return 'message.context.instructions.removed';
    if (baseline)
        return 'message.context.instructions.loaded';
    return action === 'set' ? 'message.context.instructions.added' : 'message.context.instructions.updated';
}
/**
 * `instructions` form: the files this context reconciled, then their text.
 *
 * The text keeps its `<system-reminder>` framing verbatim — the framing is part
 * of what the model read, so hiding it would misreport the request.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The instructions context body, or the opaque body when the change
 * list is unreadable.
 */
export const InstructionsBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        const changes = instructionChanges(source);
        if (changes === null)
            return h(OpaqueBody, { "content": content, "source": source, "t": t });
        const baseline = asRecord(source)?.['baseline'] === true;
        return (h(Fragment, null, [
            h("ul", { "class": css.files, "data-context-files": true }, [
                changes.map(change => (h("li", { "key": change.path, "class": css.file, "title": change.digest }, [
                    h("span", { "class": css.filePath }, [
                        change.path
                    ]),
                    h("span", { "class": css.fileAction }, [
                        t(instructionAction(change.action, baseline))
                    ])
                ])))
            ]),
            h(ModelFacingContent, { "content": content, "t": t })
        ]));
    };
}, { name: "InstructionsBody", inheritAttrs: false, props: ["content", "source", "t"] });
/** One catalog entry, as the durable source records it. */
interface CatalogEntry {
    name: string;
    description: string;
}
/**
 * Catalog entries read off the source, or null when the record is not a usable
 * catalog. All-or-nothing for the same reason as the instruction list: this body
 * replaces the model-facing text, so a partial list would hide the only complete
 * account of what the model read.
 */
function catalogEntries(source: unknown): CatalogEntry[] | null {
    const record = asRecord(source);
    const list = record === null ? undefined : record['entries'];
    if (!Array.isArray(list))
        return null;
    const entries: CatalogEntry[] = [];
    for (const item of list as readonly unknown[]) {
        const entry = asRecord(item);
        if (entry === null)
            return null;
        const name = entry['name'];
        const description = entry['description'];
        if (typeof name !== 'string' || name === '' || typeof description !== 'string')
            return null;
        entries.push({ name, description });
    }
    // An empty list is a real catalog: a replacement with no entries retires
    // every earlier name. Only an unreadable shape falls back.
    return entries;
}
/**
 * `catalog` form: the published entries as a list, read from the source rather
 * than re-parsed out of the model-facing prose.
 *
 * A catalog whose source carries no usable entries falls through to the opaque
 * body, so an older or hand-edited log still shows its text.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The catalog context body, or the opaque body when the entry list is
 * unreadable.
 */
export const CatalogBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        const entries = catalogEntries(source);
        if (entries === null)
            return h(OpaqueBody, { "content": content, "source": source, "t": t });
        const update = asRecord(source)?.['update'] === true;
        // Entry count is unbounded (a provider may publish any number of skills), and
        // the scrollport bounds height, not node count — so the list bounds itself.
        const shown = entries.slice(0, MAX_ENTRIES);
        const rest = unknownBlocks(content);
        return (h(Fragment, null, [
            update && h("p", { "class": css.catalogNotice, "data-context-catalog-update": true }, [
                t('message.context.catalog.replaced')
            ]),
            h("ul", { "class": css.entries, "data-context-entries": true }, [
                shown.map((entry, index) => (h("li", { "key": index, "class": css.entry }, [
                    h("code", { "class": css.entryName }, [
                        entry.name
                    ]),
                    h("span", { "class": css.entryDescription }, [
                        entry.description
                    ])
                ])))
            ]),
            shown.length < entries.length && (h("p", { "class": css.catalogNotice, "data-context-entries-truncated": true }, [
                t('message.context.catalog.more', { count: entries.length - shown.length })
            ])),
            h(UnknownBlocks, { "blocks": rest, "t": t })
        ]));
    };
}, { name: "CatalogBody", inheritAttrs: false, props: ["content", "source", "t"] });
/** One named contribution to a runtime snapshot, as the durable source records it. */
interface SnapshotSection {
    name: string;
    text: string;
}
/** Snapshot sections read off the source, or null when the record is unusable. */
function snapshotSections(source: unknown): SnapshotSection[] | null {
    const record = asRecord(source);
    const list = record === null ? undefined : record['sections'];
    if (!Array.isArray(list))
        return null;
    const sections: SnapshotSection[] = [];
    for (const item of list as readonly unknown[]) {
        const section = asRecord(item);
        if (section === null)
            return null;
        const name = section['name'];
        const text = section['text'];
        if (typeof name !== 'string' || name === '' || typeof text !== 'string')
            return null;
        sections.push({ name, text });
    }
    return sections.length === 0 ? null : sections;
}
/**
 * `snapshot` form: the named contributions this snapshot assembled, in order.
 *
 * The sections are the same bytes the model read, split at the boundaries the
 * producer assembled them on, so a reader sees which subsystem contributed
 * which state instead of one undifferentiated wall.
 *
 * One sentence of the model-facing text is NOT in any section: the producer's
 * framing line declaring that this snapshot supersedes earlier ones. Unlike the
 * `<system-reminder>` wrapper an instruction context carries — which wraps
 * content and cannot be separated from it — that line states the form's own
 * semantics, so the body states them as a caption instead of reprinting the
 * joined prose beside the sections it was split from.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The snapshot context body, or the opaque body when unreadable.
 */
export const SnapshotBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        const sections = snapshotSections(source);
        /* v8 ignore next -- contextBody reads the sections before choosing this body. */
        if (sections === null)
            return h(OpaqueBody, { "content": content, "source": source, "t": t });
        return (h(Fragment, null, [
            h("p", { "class": css.catalogNotice, "data-context-snapshot-supersedes": true }, [
                t('message.context.snapshot.supersedes')
            ]),
            h("dl", { "class": css.sections, "data-context-sections": true }, [
                sections.map((section, index) => (h("div", { "key": index, "class": css.section }, [
                    h("dt", { "class": css.sectionName }, [
                        section.name
                    ]),
                    h("dd", { "class": css.sectionText }, [
                        boundedText(section.text, t)
                    ])
                ])))
            ])
        ]));
    };
}, { name: "SnapshotBody", inheritAttrs: false, props: ["content", "source", "t"] });
/**
 * `notice` form: what just happened, with the model-facing text beneath it.
 *
 * The one-line account also rides the collapsed row ({@link contextBody}), so a
 * notice is usually readable without expanding at all.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The notice context body.
 */
export const NoticeBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, t } = props;
        return h(ModelFacingContent, { "content": content, "t": t });
    };
}, { name: "NoticeBody", inheritAttrs: false, props: ["content", "t"] });
/**
 * `relay` form: which agent sent this, then what it said.
 *
 * The sender is an opaque session id; it is shown as a field rather than a
 * label, because this client cannot resolve it to a title.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The relay context body.
 */
export const RelayBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        const sender = relaySender(source);
        /* v8 ignore next -- contextBody resolves the sender before choosing this body. */
        if (sender === null)
            return h(OpaqueBody, { "content": content, "source": source, "t": t });
        return (h(Fragment, null, [
            h("p", { "class": css.relaySender, "data-context-relay-sender": true }, [
                t('message.context.relay.from', { session: sender })
            ]),
            h(ModelFacingContent, { "content": content, "t": t })
        ]));
    };
}, { name: "RelayBody", inheritAttrs: false, props: ["content", "source", "t"] });
/** The sending agent's session id, or null when the record does not name one. */
function relaySender(source: unknown): string | null {
    const sender = asRecord(source)?.['senderSessionId'];
    return typeof sender === 'string' && sender !== '' ? sender : null;
}
/** One recalled session, as the durable source records it. */
interface RecalledSession {
    label: string;
    retained: number;
    omitted: number;
    truncated: boolean;
}
/** Recalled sessions read off the source, or null when the record is unusable. */
function recalledSessions(source: unknown): RecalledSession[] | null {
    const record = asRecord(source);
    const list = record === null ? undefined : record['references'];
    if (!Array.isArray(list))
        return null;
    const sessions: RecalledSession[] = [];
    for (const item of list as readonly unknown[]) {
        const reference = asRecord(item);
        if (reference === null)
            return null;
        const label = reference['label'];
        const retained = reference['retainedMessages'];
        const omitted = reference['omittedMessages'];
        const truncated = reference['truncated'];
        // Completeness is the fact this card exists to report, so a reference that
        // cannot state it is not a readable recall — showing the label alone would
        // present a confident card over unknown loss.
        if (typeof label !== 'string' || label === ''
            || typeof retained !== 'number' || typeof omitted !== 'number'
            || typeof truncated !== 'boolean')
            return null;
        sessions.push({ label, retained, omitted, truncated });
    }
    return sessions.length === 0 ? null : sessions;
}
/**
 * `recall` form: which sessions this material came from and how much of each
 * survived the read, then the material itself.
 *
 * Completeness is the fact a reader needs first: recalled context is bounded on
 * the way in, so a card that hid the omitted count would overstate what the
 * model received.
 * @param props - Durable content, its source, and the locale seat.
 * @returns The recall context body, or the opaque body when unreadable.
 */
export const RecallBody = defineComponent((props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}) => {
    return () => {
        const { content, source, t } = props;
        const sessions = recalledSessions(source);
        if (sessions === null)
            return h(OpaqueBody, { "content": content, "source": source, "t": t });
        return (h(Fragment, null, [
            h("ul", { "class": css.recalls, "data-context-recalls": true }, [
                sessions.map((session, index) => (h("li", { "key": index, "class": css.recall }, [
                    h("span", { "class": css.recallLabel }, [
                        session.label
                    ]),
                    h("span", { "class": css.recallCounts }, [
                        t('message.context.recall.counts', {
                            retained: session.retained,
                            omitted: session.omitted,
                        })
                    ]),
                    session.truncated && (h("span", { "class": css.recallCounts }, [
                        t('message.context.recall.truncated')
                    ]))
                ])))
            ]),
            h(ModelFacingContent, { "content": content, "t": t })
        ]));
    };
}, { name: "RecallBody", inheritAttrs: false, props: ["content", "source", "t"] });
/** The one-line account a `notice` puts on its collapsed row, when it records one. */
function noticeSummary(source: unknown): string | null {
    const summary = asRecord(source)?.['summary'];
    return typeof summary === 'string' && summary !== '' ? summary : null;
}
/**
 * Choose the body for one context node.
 *
 * Returns the form the body actually rendered as, which is not always the
 * declared one: a declared form whose fields are unreadable falls back to
 * opaque, and the caller labels the row with what it really shows.
 * `summary` is the collapsed row's one-line account, which only a `notice`
 * records: its whole point is being readable without expanding.
 * @param form - the producer-declared form projected onto the node.
 * @param props - durable content, its source, and the locale seat.
 * @returns the rendered form (null for opaque), its collapsed summary, and its body.
 */
export function contextBody(form: ContextMessageNode['form'], props: {
    content: ContextMessageNode['content'];
    source: unknown;
    t: Translate;
}): {
    rendered: KnownContextForm | null;
    summary: string | null;
    body: VNodeChild;
} {
    const opaque = { rendered: null, summary: null, body: h(OpaqueBody, { ...props }) };
    switch (form) {
        case 'instructions':
            return instructionChanges(props.source) === null
                ? opaque
                : { rendered: 'instructions', summary: null, body: h(InstructionsBody, { ...props }) };
        case 'catalog':
            return catalogEntries(props.source) === null
                ? opaque
                : { rendered: 'catalog', summary: null, body: h(CatalogBody, { ...props }) };
        case 'snapshot':
            return snapshotSections(props.source) === null
                ? opaque
                : { rendered: 'snapshot', summary: null, body: h(SnapshotBody, { ...props }) };
        case 'notice': {
            const summary = noticeSummary(props.source);
            return summary === null
                ? opaque
                : { rendered: 'notice', summary, body: h(NoticeBody, { ...props }) };
        }
        case 'relay':
            return relaySender(props.source) === null
                ? opaque
                : { rendered: 'relay', summary: null, body: h(RelayBody, { ...props }) };
        case 'recall':
            return recalledSessions(props.source) === null
                ? opaque
                : { rendered: 'recall', summary: null, body: h(RecallBody, { ...props }) };
        case null:
            return opaque;
        /* v8 ignore next 4 -- closed-union backstop; the compiler rejects a new
        KnownContextForm here rather than letting it degrade to opaque silently. */
        default: {
            const unreachable: never = form;
            throw new Error(`unreachable context form: ${String(unreachable)}`);
        }
    }
}
