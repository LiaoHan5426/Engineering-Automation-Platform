import { h, defineComponent } from 'vue';
import clsx from 'clsx';
import { MarkdownText, type MarkdownLabels } from './markdown/MarkdownText.tsx';
import { LinkIconMedium } from './LinkIcon.tsx';
import css from './WebBlock.module.css';
/**
 * One citeable source drawn in a search card: the projection of the contract's
 * `WebSource`, with the optional fields kept optional so a provider that
 * returned only a URL still renders (its hostname becomes the label).
 */
export interface WebSourceView {
    /** The source URL; becomes a safe external link when it is http(s). */
    url: string;
    /** The source title; when absent the URL's hostname labels the link. */
    title?: string | undefined;
    /** A short excerpt or summary shown under the link. */
    snippet?: string | undefined;
    /** Publication/crawl timestamp, a provider-supplied string shown under the link. */
    publishedAt?: string | undefined;
}
/** A `web_search` card: an optional answer over a capped citation list. */
export interface WebSearchBlockProps {
    kind: 'search';
    url?: never;
    statusCode?: never;
    /** Localized chrome supplied by the owning render site. */
    labels: WebBlockLabels;
    /** The provider-generated answer, rendered as markdown above the sources. */
    answer?: string | undefined;
    /** The cited sources, in provider order. */
    sources: WebSourceView[];
    /** True when the tool cut the source list to its result cap. */
    truncated: boolean;
    /** Extra class merged onto the wrapper (callers position; this component draws). */
    className?: string | undefined;
}
/** A `web_fetch` card: the retrieval summary for one fetched URL. */
export interface WebFetchBlockProps {
    kind: 'fetch';
    answer?: never;
    sources?: never;
    /** Localized chrome supplied by the owning render site. */
    labels: WebBlockLabels;
    /** The final URL after allowed redirects; becomes a safe external link when http(s). */
    url: string;
    /** HTTP status code of the fetched response. */
    statusCode: number;
    /** True when the provider or the output cap cut the fetched content. */
    truncated: boolean;
    /** Extra class merged onto the wrapper (callers position; this component draws). */
    className?: string | undefined;
}
/** A completed web retrieval card, discriminated by `kind`. */
export type WebBlockProps = WebSearchBlockProps | WebFetchBlockProps;
/** Localized chrome for {@link WebBlock}. */
export interface WebBlockLabels {
    noResults: string;
    sourcesTruncated: string;
    http: string;
    contentTruncated: string;
    markdown: MarkdownLabels;
}
/**
 * The URL to link to, or undefined when the URL must render as plain text. Only
 * http(s) becomes a navigable external anchor, so a `javascript:`/`data:`/`file:`
 * URL or an unparseable string never reaches the DOM as an href. This is the
 * http(s) subset of the allowlist MarkdownText applies to untrusted links —
 * MarkdownText also permits `mailto:`, deliberately excluded here since a
 * retrieval URL is never a mail address.
 * @param url - the source or fetch URL, from tool result content.
 * @returns the href to use, or undefined for plain text.
 */
function safeHref(url: string): string | undefined {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:' ? url : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * The link's visible label: the title when the provider gave one, otherwise the
 * URL's hostname, falling back to the raw URL when it does not parse OR parses
 * to an empty hostname (a `file:`/`data:`/`javascript:` URL), so a label is
 * never blank.
 * @param url - the source URL.
 * @param title - the provider title, if any.
 * @returns the label text.
 */
function linkLabel(url: string, title: string | undefined): string {
    if (title !== undefined && title !== '')
        return title;
    try {
        const { hostname } = new URL(url);
        return hostname === '' ? url : hostname;
    }
    catch {
        return url;
    }
}
const SafeLink = defineComponent((props: {
    url: string;
    label: string;
    className?: string | undefined;
}) => {
    return () => {
        const { url, label, className } = props;
        const href = safeHref(url);
        if (href === undefined)
            return h("span", { "class": className }, [label]);
        return (h("a", { "class": className, "href": href, "target": "_blank", "rel": "noopener noreferrer" }, [h(LinkIconMedium, { "kind": "url", "href": href, "className": css.linkIcon }), label]));
    };
}, { "name": "SafeLink", "props": ["url", "label", "className"] });
const SourceItem = defineComponent((props: {
    source: WebSourceView;
    ordinal: number;
}) => {
    return () => {
        const { source, ordinal } = props;
        return (h("li", { "class": css.source, "value": ordinal }, [h(SafeLink, { "url": source.url, "label": linkLabel(source.url, source.title), "className": css.sourceLink }), source.snippet !== undefined && source.snippet !== '' && (h("div", { "class": css.snippet }, [source.snippet])), source.publishedAt !== undefined && source.publishedAt !== '' && (h("div", { "class": css.published }, [source.publishedAt]))]));
    };
}, { "name": "SourceItem", "props": ["source", "ordinal"] });
const WebSearchBlock = defineComponent((props: WebSearchBlockProps) => {
    return () => {
        const { answer, sources, truncated, labels, className } = props;
        // A provider may legitimately return no answer and no sources; the chat WebRow
        // does not show the raw result content, so without this the user would see an
        // empty card. Mirror the backend's `No results found.` render text.
        const empty = (answer === undefined || answer === '') && sources.length === 0;
        return (h("div", { "class": clsx(css.block, className), "data-web": "search" }, [answer !== undefined && answer !== '' && (h("div", { "class": css.answer }, [h(MarkdownText, { "text": answer, "labels": labels.markdown })])), empty ? (h("div", { "class": css.empty }, [labels.noResults])) : (h("ol", { "class": css.sources }, [sources.map((source, index) => h(SourceItem, { "key": index, "source": source, "ordinal": index + 1 }))])), truncated && h("div", { "class": css.truncated }, [labels.sourcesTruncated])]));
    };
}, { "name": "WebSearchBlock", "props": ["answer", "sources", "truncated", "labels", "className"] });
const WebFetchBlock = defineComponent((props: WebFetchBlockProps) => {
    return () => {
        const { url, statusCode, truncated, labels, className } = props;
        return (h("div", { "class": clsx(css.block, css.fetch, className), "data-web": "fetch" }, [h(SafeLink, { "url": url, "label": url, "className": css.fetchUrl }), h("div", { "class": css.fetchMeta }, [h("span", { "class": css.status }, [labels.http, ' ', statusCode]), truncated && h("span", { "class": css.truncated }, [labels.contentTruncated])])]));
    };
}, { "name": "WebFetchBlock", "props": ["url", "statusCode", "truncated", "labels", "className"] });
/**
 * Render a completed web retrieval as a structured card.
 * @param props - see {@link WebBlockProps}; `kind` selects the search or fetch body.
 * @returns the web card element.
 */
export const WebBlock = defineComponent((props: WebBlockProps) => {
    return () => {
        return props.kind === 'search' ? h(WebSearchBlock, { ...props }) : h(WebFetchBlock, { ...props });
    };
}, { "name": "WebBlock", "props": ["kind", "answer", "sources", "url", "statusCode", "truncated", "labels", "className"] });
