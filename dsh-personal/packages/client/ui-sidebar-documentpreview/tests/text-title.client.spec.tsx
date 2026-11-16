// @vitest-environment jsdom
import { h as vueH, shallowRef } from 'vue';
/** The chip title: the file type's sheet, then the name the registry captured. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { TextTitle } from '../src/client/TextTitle.tsx';
afterEach(cleanup);
function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
    return { useTabInfo: () => shallowRef(({ tab: { title } })) } as unknown as PropsRuntime<'sidebar.right.pane.tab.title'>;
}
describe('TextTitle', () => {
    it('draws the type sheet before the title text, sized to the chip line', () => {
        const { container } = render(vueH(TextTitle, {
            ...props('README.md')
        }));
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe('16');
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        expect(container.textContent).toBe('README.md');
    });
    it('picks the sheet from the title\'s extension', () => {
        const markdown = render(vueH(TextTitle, {
            ...props('notes.md')
        })).container.querySelector('svg')?.innerHTML;
        const pdf = render(vueH(TextTitle, {
            ...props('paper.pdf')
        })).container.querySelector('svg')?.innerHTML;
        expect(markdown).not.toBe(pdf);
    });
});
