// @vitest-environment jsdom
/**
 * ReferenceChip visual face: icon selection per appearance, the trigger
 * marker fallback, label truncation container, and invalid styling.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { within } from '@testing-library/dom';
import { cleanupVue as cleanup, renderVue } from '../../ui-primitives/tests/vue-render.ts';
import { h } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...within(document.body) }; }
import { ReferenceChip } from '../src/client/input/editor/ReferenceChip.tsx';
afterEach(cleanup);
describe('ReferenceChip', () => {
    it('renders the domain icon and the label', () => {
        const { container, getByTitle } = render(h(ReferenceChip, {
            "label": "Research notes",
            "appearance": "session",
            "invalid": false
        }));
        expect(getByTitle('Research notes')).toBeTruthy();
        expect(container.querySelector('svg')).not.toBeNull();
        expect(container.textContent).toBe('Research notes');
    });
    it('falls back to the trigger marker without an appearance', () => {
        const { container } = render(h(ReferenceChip, {
            "label": "commit-helper",
            "invalid": false
        }));
        expect(container.querySelector('svg')).toBeNull();
        expect(container.textContent).toBe('@commit-helper');
    });
    it('applies the invalid styling bit', () => {
        const { container } = render(h(ReferenceChip, {
            "label": "gone",
            "appearance": "folder",
            "invalid": true
        }));
        const chip = container.firstElementChild;
        expect(chip).not.toBeNull();
        expect([...(chip?.classList ?? [])].some(name => name.includes('invalid'))).toBe(true);
    });
});
