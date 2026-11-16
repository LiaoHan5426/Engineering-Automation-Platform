import { nextTick } from 'vue';
import { h } from 'vue';
// @vitest-environment jsdom
import { cleanup, render } from './content-render.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownText } from './markdown-test-components.tsx';
afterEach(cleanup);
describe('compact MarkdownText', () => {
    it('retains the body variant semantics for headings, lists, quotes, links, code, tables, and math', async () => {
        const text = [
            '# First', '## Second', '### Third', '#### Fourth', '##### Fifth', '###### Sixth',
            'Paragraph with **strong** and `inline`.',
            '- one\n- two\n  - nested',
            '1. ordered\n2. next',
            '> quoted',
            '[reference](https://example.com)',
            '```ts\nconst answer = 42\n```',
            '---',
            '| Name | Value |\n| --- | --- |\n| answer | 42 |',
            '$x^2$',
            '$$\nx + y = z\n$$',
        ].join('\n\n');
        const body = render(h(MarkdownText, { "text": text }));
        await nextTick();
        const compact = render(h(MarkdownText, { "text": text, "variant": "compact" }));
        await nextTick();
        const bodyRoot = body.container.firstElementChild!;
        const compactRoot = compact.container.firstElementChild!;
        await nextTick();
        expect(bodyRoot.hasAttribute('data-markdown-variant')).toBe(false);
        await nextTick();
        expect(compactRoot.getAttribute('data-markdown-variant')).toBe('compact');
        await nextTick();
        expect(compactRoot.innerHTML).toBe(bodyRoot.innerHTML);
        await nextTick();
        expect(compactRoot.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(6);
        await nextTick();
        expect(compactRoot.querySelectorAll('ul')).toHaveLength(2);
        await nextTick();
        expect(compactRoot.querySelector('ol')).not.toBeNull();
        await nextTick();
        expect(compactRoot.querySelector('strong')?.textContent).toBe('strong');
        await nextTick();
        expect(compactRoot.querySelector('p > code')?.textContent).toBe('inline');
        await nextTick();
        expect(compactRoot.querySelector('blockquote')?.textContent?.trim()).toBe('quoted');
        await nextTick();
        expect(compactRoot.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
        await nextTick();
        expect(compactRoot.querySelector('pre code')?.textContent).toBe('const answer = 42');
        await nextTick();
        expect(compactRoot.querySelector('hr')).not.toBeNull();
        await nextTick();
        expect(compactRoot.querySelector('table')).not.toBeNull();
        await nextTick();
        expect(compactRoot.querySelectorAll('.katex')).toHaveLength(2);
    });
    it('keeps frozen blocks and highlighted lines mounted across growth and variant changes', async () => {
        const prefix = '# Heading\n\n**Completed** paragraph.\n\n- First\n\n';
        const initial = `${prefix}\`\`\`ts\nconst first = 1\nlet tail`;
        const grown = `${initial} = 2\n\`\`\``;
        const live = render(h(MarkdownText, { "text": initial, "streaming": true, "variant": "compact" }));
        await nextTick();
        const heading = live.container.querySelector('h1');
        const paragraph = live.container.querySelector('p');
        const firstLine = live.container.querySelector('pre .line');
        await nextTick();
        expect(heading?.textContent).toBe('Heading');
        await nextTick();
        expect(paragraph?.querySelector('strong')?.textContent).toBe('Completed');
        await nextTick();
        expect(firstLine?.textContent).toBe('const first = 1');
        live.rerender(h(MarkdownText, { "text": grown, "streaming": true, "variant": "compact" }));
        await nextTick();
        await nextTick();
        expect(live.container.querySelector('h1')).toBe(heading);
        await nextTick();
        expect(live.container.querySelector('p')).toBe(paragraph);
        await nextTick();
        expect(live.container.querySelector('pre .line')).toBe(firstLine);
        await nextTick();
        expect(live.container.querySelector('pre code')?.textContent).toBe('const first = 1\nlet tail = 2');
        live.rerender(h(MarkdownText, { "text": grown, "streaming": true, "variant": "body" }));
        await nextTick();
        await nextTick();
        expect(live.container.firstElementChild?.hasAttribute('data-markdown-variant')).toBe(false);
        await nextTick();
        expect(live.container.querySelector('h1')).toBe(heading);
        await nextTick();
        expect(live.container.querySelector('pre .line')).toBe(firstLine);
        live.rerender(h(MarkdownText, { "text": grown, "variant": "compact" }));
        await nextTick();
        await nextTick();
        expect(live.container.querySelector('h1')).toBe(heading);
        await nextTick();
        expect(live.container.querySelector('pre .line')).toBe(firstLine);
        await nextTick();
        expect(live.container.textContent).not.toContain('**Completed**');
    });
});
