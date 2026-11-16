import { h } from 'vue';
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts';
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime';
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts';
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx';
import { useDetailedPresentation } from './presentation-fixture.client.ts';
import { unusedImageLoader } from './reasoning-component-fixture.tsx';
import { useDisclosure } from '../src/client/chat/use-disclosure.ts';
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts';
import { zh } from '../src/client/locale.ts';
const t: AssistantMarkdownProps['t'] = makeTranslate(zh, commonZh);
afterEach(cleanup);
describe('tails', () => {
    it('enables quoting on the existing Markdown root without replacing streamed content', async () => {
        const body = (textInteractionSource: boolean, streaming: boolean) => (h(AssistantMarkdown, { "renderSlot": () => null, "useDisclosure": useDisclosure, "useGroupAction": useSearchableHidden, "usePresentation": useDetailedPresentation, "t": t, "loadImage": unusedImageLoader, "blocks": [{ kind: 'text', text: 'source words' }], "textInteractionSource": textInteractionSource, "streaming": streaming }));
        const view = await render(body(false, true));
        const paragraph = view.getByText('source words');
        const markdown = paragraph.parentElement;
        expect(view.container.querySelector('[data-text-interaction-source]')).toBeNull();
        await view.rerender(body(true, false));
        expect(view.container.querySelector('[data-text-interaction-source]')).toBe(markdown);
        expect(view.getByText('source words')).toBe(paragraph);
        await view.rerender(body(false, false));
        expect(view.container.querySelector('[data-text-interaction-source]')).toBeNull();
        expect(view.getByText('source words').parentElement).toBe(markdown);
    });
    it('AssistantMarkdown renders reasoning as a Think row and unknown blocks as JSON fallback', async () => {
        const view = await render(h(AssistantMarkdown, { "renderSlot": () => null, "useDisclosure": useDisclosure, "useGroupAction": useSearchableHidden, "usePresentation": useDetailedPresentation, "t": t, "blocks": [
                { kind: 'reasoning', text: 'thinking hard\nsecond line' },
                { kind: 'tool-call', callId: 'c', name: 'bash', argsRaw: '{}' },
                { kind: 'other', block: { type: 'mystery' } },
            ], "streaming": true, "loadImage": unusedImageLoader }));
        expect(view.getByText('思考')).toBeTruthy();
        expect(view.getByText('thinking hard')).toBeTruthy();
        expect(view.getByText(/未知内容块/)).toBeTruthy();
        const stopped = await render(h(AssistantMarkdown, { "renderSlot": () => null, "useDisclosure": useDisclosure, "useGroupAction": useSearchableHidden, "usePresentation": useDetailedPresentation, "t": t, "blocks": [{ kind: 'text', text: 'partial words' }], "streaming": false, "interrupted": true, "loadImage": unusedImageLoader }));
        expect(stopped.getByText('已停止')).toBeTruthy();
    });
    it('AssistantMarkdown skips the root shell when only tool-call heads remain', async () => {
        // Tool heads are drawn by ChatView's tool groups; an empty root between
        // groups is layout noise (no text, no pulse, no interrupted marker).
        const empty = await render(h(AssistantMarkdown, { "renderSlot": () => null, "useDisclosure": useDisclosure, "useGroupAction": useSearchableHidden, "usePresentation": useDetailedPresentation, "t": t, "blocks": [{ kind: 'tool-call', callId: 'c', name: 'todo_write', argsRaw: '{}' }], "streaming": false, "loadImage": unusedImageLoader }));
        expect(empty.container.firstElementChild).toBeNull();
        const blank = await render(h(AssistantMarkdown, { "renderSlot": () => null, "useDisclosure": useDisclosure, "useGroupAction": useSearchableHidden, "usePresentation": useDetailedPresentation, "t": t, "blocks": [], "streaming": false, "loadImage": unusedImageLoader }));
        expect(blank.container.firstElementChild).toBeNull();
    });
});
