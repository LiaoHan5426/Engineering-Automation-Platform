import { nextTick } from 'vue';
import { h } from 'vue';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from './content-render.ts';
type ComponentProps<T extends abstract new (...args: never[]) => {
    $props: unknown;
}> = InstanceType<T>['$props'];
import { DEFAULT_READ_MAX_LINES, ReadBlock as LocalizedReadBlock, type ReadBlockLine } from '../src/index.ts';
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded } from '../src/markdown/highlight.ts';
import { readBlockLabels } from './labels.client.ts';
function ReadBlock(props: Omit<ComponentProps<typeof LocalizedReadBlock>, 'labels'>) {
    return h(LocalizedReadBlock, { ...props, "labels": readBlockLabels });
}
afterEach(cleanup);
beforeEach(() => {
    vi.useRealTimers();
});
function lines(count: number, first = 1): ReadBlockLine[] {
    return Array.from({ length: count }, (_value, index) => ({ number: first + index, text: `line ${first + index}` }));
}
function rowTexts(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[class^="_line_"]')].map(row => row.textContent ?? '');
}
function gutters(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[class^="_gutter_"]')].map(cell => cell.textContent ?? '');
}
describe('highlightLines', () => {
    it('tokenizes a registered grammar into per-line css-variables runs', async () => {
        const result = highlightLines('const x = 1\n// c', 'ts');
        await nextTick();
        expect(result).not.toBeUndefined();
        await nextTick();
        expect(result).toHaveLength(2);
        // The keyword run carries a color style through a --shiki-* custom property.
        const keyword = result![0]!.find(span => span.text === 'const');
        await nextTick();
        expect(keyword?.style?.color).toContain('var(--shiki-');
        await nextTick();
        // Whitespace between tokens is a run of its own; the comment is line two.
        expect(result![0]!.map(span => span.text).join('')).toBe('const x = 1');
        await nextTick();
        expect(result![1]!.map(span => span.text).join('')).toBe('// c');
    });
    it('colors every run through a --shiki-* custom property', () => {
        // The css-variables theme colors even the whitespace run (as the foreground
        // token), so every run is a styled span; the plain fallback is the whole
        // unknown-language path, not a per-run one.
        const result = highlightLines('const x = 1', 'ts');
        for (const span of result!)
            for (const run of span)
                expect(run.style.color).toContain('var(--shiki-');
    });
    it('drops the trailing terminator line so the run count matches the source lines', async () => {
        // `a\n` tokenizes to two lines in shiki (the second empty); the caller's own
        // line array has one entry, so the terminator line is dropped.
        const result = highlightLines('const a = 1\n', 'ts');
        await nextTick();
        expect(result).toHaveLength(1);
    });
    it('keeps a genuinely blank final line when the source ends in two newlines', async () => {
        const result = highlightLines('a\n\n', 'ts');
        await nextTick();
        expect(result).toHaveLength(2);
        await nextTick();
        expect(result![1]).toEqual([]);
    });
    it('returns undefined for an unknown or absent language', async () => {
        await nextTick();
        expect(highlightLines('x', 'cobol')).toBeUndefined();
        await nextTick();
        expect(highlightLines('x', undefined)).toBeUndefined();
    });
    it('loads a lazy grammar on first use: plain first, highlighted after it registers', async () => {
        // A boot grammar (ts) is ready synchronously; a lazy grammar (python) is
        // not, so the first call renders plain and imports the grammar, and a
        // subscriber fires once it registers, after which the same call highlights.
        let notified = 0;
        const stop = subscribeGrammarLoaded(() => { notified += 1; });
        await nextTick();
        // First touch: grammar not loaded yet, so plain fallback while it imports.
        expect(highlightLines('def f(): pass', 'py')).toBeUndefined();
        // The import + loadLanguageSync resolve on a microtask; wait for the notify.
        await vi.waitFor(async () => { await nextTick(); expect(notified).toBeGreaterThan(0); });
        await nextTick();
        expect(grammarLoadCount()).toBeGreaterThan(0);
        const result = highlightLines('def f(): pass', 'py');
        await nextTick();
        expect(result).not.toBeUndefined();
        // `def` is a python keyword and carries a --shiki-* color once highlighted.
        const keyword = result!.flat().find(span => span.text === 'def');
        await nextTick();
        expect(keyword?.style?.color).toContain('var(--shiki-');
        stop();
    });
});
describe('ReadBlock rows', () => {
    it('renders one gutter-numbered row per line, keeping the file line numbers', async () => {
        const view = render(h(ReadBlock, { "label": "a.ts", "lines": lines(3, 41), "totalLines": 3 }));
        await nextTick();
        await nextTick();
        expect(gutters(view.container)).toEqual(['41', '42', '43']);
        await nextTick();
        expect(rowTexts(view.container)).toEqual(['41line 41', '42line 42', '43line 43']);
    });
    it('highlights the content for a known language into token spans', async () => {
        const view = render(h(ReadBlock, { "label": "a.ts", "lang": "ts", "lines": [{ number: 1, text: 'const a = 1' }], "totalLines": 1 }));
        await nextTick();
        const content = view.container.querySelector('[class^="_content_"]');
        await nextTick();
        expect(content?.querySelectorAll('span[style]').length).toBeGreaterThan(1);
        await nextTick();
        expect(content?.textContent).toBe('const a = 1');
    });
    it('renders the content as bare text with no span wrappers for an unknown language', async () => {
        const view = render(h(ReadBlock, { "label": "a.cob", "lang": "cobol", "lines": [{ number: 1, text: 'IDENT DIVISION.' }], "totalLines": 1 }));
        await nextTick();
        const content = view.container.querySelector('[class^="_content_"]');
        await nextTick();
        expect(content?.querySelectorAll('span').length).toBe(0);
        await nextTick();
        expect(content?.textContent).toBe('IDENT DIVISION.');
    });
    it('renders bare text when no language is given', async () => {
        const view = render(h(ReadBlock, { "label": "x", "lines": [{ number: 1, text: 'plain' }], "totalLines": 1 }));
        await nextTick();
        const content = view.container.querySelector('[class^="_content_"]');
        await nextTick();
        expect(content?.querySelectorAll('span').length).toBe(0);
        await nextTick();
        expect(view.getByText('plain')).toBeTruthy();
    });
});
describe('ReadBlock banner', () => {
    it('shows the label, the language, and the count note when the read is a window', async () => {
        const view = render(h(ReadBlock, { "label": "src/a.ts", "lang": "ts", "lines": lines(3, 41), "totalLines": 180 }));
        await nextTick();
        await nextTick();
        expect(view.getByText('src/a.ts')).toBeTruthy();
        await nextTick();
        expect(view.getByText('ts')).toBeTruthy();
        await nextTick();
        expect(view.getByText('显示 3 / 180 行')).toBeTruthy();
    });
    it('omits the count note when the window is the whole file', async () => {
        const view = render(h(ReadBlock, { "label": "a.ts", "lines": lines(3), "totalLines": 3 }));
        await nextTick();
        await nextTick();
        expect(view.queryByText(/显示/u)).toBeNull();
    });
    it('uses the localized code title when no language is given', async () => {
        render(h(ReadBlock, { "lines": lines(1), "totalLines": 1 }));
        await nextTick();
        await nextTick();
        expect(screen.getByText('代码块')).toBeTruthy();
    });
});
describe('ReadBlock height cap', () => {
    it('renders every line and no expand control under the cap', async () => {
        const view = render(h(ReadBlock, { "label": "a", "lines": lines(4), "totalLines": 4, "maxLines": 4 }));
        await nextTick();
        await nextTick();
        expect(rowTexts(view.container)).toHaveLength(4);
        await nextTick();
        expect(view.container.querySelector('[aria-expanded]')).toBeNull();
    });
    it('slices head and tail over the cap and expands on click', async () => {
        const view = render(h(ReadBlock, { "label": "a", "lines": lines(10), "totalLines": 10, "maxLines": 4 }));
        await nextTick();
        await nextTick();
        // maxLines 4: head = ceil(4/2) = 2, tail = 4 - 2 = 2, 6 hidden.
        expect(gutters(view.container)).toEqual(['1', '2', '9', '10']);
        const toggle = view.getByRole('button', { name: '展开其余 6 行' });
        await nextTick();
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        await nextTick();
        expect(toggle.textContent).toBe('… 其余 6 行');
        await fireEvent.click(toggle);
        await nextTick();
        expect(rowTexts(view.container)).toHaveLength(10);
        const collapse = view.getByRole('button', { name: '收起内容' });
        await nextTick();
        expect(collapse.getAttribute('aria-expanded')).toBe('true');
        await nextTick();
        expect(collapse.textContent).toBe('收起');
        await fireEvent.click(collapse);
        await nextTick();
        expect(gutters(view.container)).toEqual(['1', '2', '9', '10']);
    });
    it('renders the head slice alone when the cap leaves no tail', async () => {
        const view = render(h(ReadBlock, { "label": "a", "lines": lines(5), "totalLines": 5, "maxLines": 1 }));
        await nextTick();
        await nextTick();
        expect(gutters(view.container)).toEqual(['1']);
        await nextTick();
        expect(view.getByRole('button', { name: '展开其余 4 行' })).toBeTruthy();
    });
    it('caps at the documented default when maxLines is absent', async () => {
        const view = render(h(ReadBlock, { "label": "a", "lines": lines(DEFAULT_READ_MAX_LINES + 1), "totalLines": DEFAULT_READ_MAX_LINES + 1 }));
        await nextTick();
        await nextTick();
        expect(rowTexts(view.container)).toHaveLength(DEFAULT_READ_MAX_LINES);
        await nextTick();
        expect(view.getByRole('button', { name: '展开其余 1 行' })).toBeTruthy();
    });
});
describe('ReadBlock copy', () => {
    it('copies the raw window text, joined by newlines, never the gutter numbers', async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        render(h(ReadBlock, { "label": "a", "lines": lines(3, 41), "totalLines": 180 }));
        await nextTick();
        await fireEvent.click(screen.getByRole('button', { name: '复制' }));
        await nextTick();
        expect(writeText).toHaveBeenCalledWith('line 41\nline 42\nline 43');
        await act(async () => {
            await Promise.resolve();
        });
        await nextTick();
        expect(screen.getByRole('button', { name: '复制成功' })).toBeTruthy();
        // While the ok label is showing, further clicks are no-ops.
        await fireEvent.click(screen.getByRole('button', { name: '复制成功' }));
        await nextTick();
        expect(writeText).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        await nextTick();
        expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
    });
    it('copies the whole window while the height cap hides its middle', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        render(h(ReadBlock, { "label": "a", "lines": lines(10), "totalLines": 10, "maxLines": 4 }));
        await nextTick();
        await fireEvent.click(screen.getByRole('button', { name: '复制' }));
        await nextTick();
        expect(writeText).toHaveBeenCalledWith(lines(10).map(line => line.text).join('\n'));
        await nextTick();
        expect(await screen.findByRole('button', { name: '复制成功' })).toBeTruthy();
    });
    it('does not claim success when the host refuses the write', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        render(h(ReadBlock, { "label": "a", "lines": lines(1), "totalLines": 1 }));
        await nextTick();
        await fireEvent.click(screen.getByRole('button', { name: '复制' }));
        await act(async () => {
            await Promise.resolve();
        });
        await nextTick();
        expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
        await nextTick();
        expect(screen.queryByRole('button', { name: '复制成功' })).toBeNull();
    });
    it('merges className onto the wrapper', async () => {
        const view = render(h(ReadBlock, { "className": "x", "label": "a", "lines": lines(1), "totalLines": 1 }));
        await nextTick();
        await nextTick();
        expect(view.container.firstElementChild?.classList.contains('x')).toBe(true);
    });
    it('hides the copy control for an empty window so it cannot wipe the clipboard', async () => {
        // A successful read of an empty file settles to lines: [] with card:'read',
        // so this branch is reachable; copying then would clear the clipboard.
        const view = render(h(ReadBlock, { "label": "empty.ts", "lines": [], "totalLines": 0 }));
        await nextTick();
        await nextTick();
        expect(view.queryByRole('button', { name: '复制' })).toBeNull();
    });
});
