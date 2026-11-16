// @vitest-environment jsdom
import { shallowRef } from 'vue';
import { h } from 'vue';
import { fireEvent, screen } from '@testing-library/dom';
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailDocument, detailDocumentState, useDetailDocumentLabels, type DetailDocumentCopy, type DetailDocumentLabels } from '../src/DetailDocument.tsx';
afterEach(cleanup);
const LABELS: DetailDocumentLabels = {
    title: 'Details', loading: 'Reading details', retry: 'Retry',
    markdown: { code: { copyLabel: 'Copy', copiedLabel: 'Copied' }, footnotes: 'Footnotes' },
};
it('shows a placeholder, the document with resolved images, or a failure with a retry, and nothing without a document', async () => {
    const onRetry = vi.fn();
    const view = await act(async () => render(h(DetailDocument, { "state": { status: 'loading' }, "labels": LABELS, "onRetry": onRetry }, undefined)));
    // The section has no heading of its own; its title names the document region.
    expect(screen.queryByRole('heading', { name: 'Details' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Reading details' })).toBeTruthy();
    await act(async () => view.rerender(h(DetailDocument, { "state": { status: 'found', markdown: '# A\n\n![i](a.png) [doc](guide.md) <b>bold</b> kept\n\n<div align="center"><img src="x.png"></div>' }, "labels": LABELS, "images": { resolve: value => `https://host.example/${value}` }, "onRetry": onRetry }, undefined)));
    expect(screen.getByRole('heading', { name: 'A' })).toBeTruthy();
    // The document scrolls inside a keyboard-focusable region named by the section heading.
    const region = screen.getByRole('region', { name: 'Details' });
    expect(region.tabIndex).toBe(0);
    expect(region.contains(screen.getByRole('heading', { name: 'A' }))).toBe(true);
    expect(screen.getByRole('img', { name: 'i' }).getAttribute('src')).toBe('https://host.example/a.png');
    expect(screen.queryByRole('link', { name: 'doc' })).toBeNull();
    // Raw HTML renders nothing: neither markup nor its literal text.
    expect(view.container.textContent).not.toContain('<');
    expect(view.container.textContent).toContain('bold kept');
    expect(view.container.querySelector('div[align]')).toBeNull();
    await act(async () => view.rerender(h(DetailDocument, { "state": { status: 'error', message: 'Could not read' }, "labels": LABELS, "onRetry": onRetry }, undefined)));
    expect(screen.getByRole('alert').textContent).toBe('Could not read');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(onRetry).toHaveBeenCalledOnce();
    await act(async () => view.rerender(h(DetailDocument, { "state": { status: 'none' }, "labels": LABELS, "onRetry": onRetry }, undefined)));
    expect(view.container.textContent).toBe('');
});
it('maps owner reads to shown states', () => {
    expect(detailDocumentState(undefined)).toEqual({ status: 'loading' });
    expect(detailDocumentState({ status: 'loading' })).toEqual({ status: 'loading' });
    expect(detailDocumentState({ status: 'ready', markdown: '# A' })).toEqual({ status: 'found', markdown: '# A' });
    expect(detailDocumentState({ status: 'ready', markdown: undefined })).toEqual({ status: 'none' });
    expect(detailDocumentState({ status: 'error', message: 'm' })).toEqual({ status: 'error', message: 'm' });
});
it('keeps label identity while the translated strings stay equal', async () => {
    const copy: DetailDocumentCopy = {
        title: 'Details', loading: 'Reading', retry: 'Retry', copy: 'Copy', copied: 'Copied', codeBlock: 'Code', wrap: 'Wrap', unwrap: 'Unwrap', footnotes: 'Notes',
    };
    const source = shallowRef(copy);
    const result = useDetailDocumentLabels(() => source.value);
    const rerender = (next: DetailDocumentCopy) => { source.value = next; };
    const first = result.value;
    expect(first).toEqual({
        title: 'Details', loading: 'Reading', retry: 'Retry',
        markdown: { code: { copyLabel: 'Copy', copiedLabel: 'Copied', toolbarLabels: { codeLabel: 'Code', wrapLabel: 'Wrap', unwrapLabel: 'Unwrap' } }, footnotes: 'Notes' },
    });
    await act(async () => rerender({ ...copy }));
    expect(result.value).toBe(first);
    await act(async () => rerender({ ...copy, title: 'Detail' }));
    expect(result.value.markdown).toBe(first.markdown);
});
