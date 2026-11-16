// @vitest-environment jsdom
/** The menu extension preserves notifications while onboarding hides their presentation. */
import { fireEvent, screen } from '@testing-library/dom';
import { h } from 'vue';
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts';
import { within as queriesWithin } from '@testing-library/dom';
import { nextTick } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) }; }
import { computed } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots';
import { AccountNotifications, type AccountNotificationsProps } from '../src/client/AccountNotifications.tsx';
import { notification } from './notification-fixture.ts';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows retained cards inside the menu and opens account settings without dismissing them', async () => {
    vi.stubGlobal('IntersectionObserver', class {
        observe() { }
        disconnect() { }
    });
    const notices = [notification('notice', { actions: [
                { label: 'View account', style: 'primary', target: { type: 'app_route', name: 'account' } },
            ] })];
    const openAccount = vi.fn();
    const dismiss = vi.fn();
    const ctaClicked = vi.fn();
    const props: AccountNotificationsProps = {
        ...({} as GlobalStandardProps), active: false, openAccount, ctaClicked, dismiss, shown: vi.fn(),
        useNotices: select => computed(() => select(notices)), t: () => 'Close',
    };
    const view = render(h(AccountNotifications, {
        ...props
    }));
    expect(screen.queryByRole('status')).toBeNull();
    await act(() => view.rerender(h(AccountNotifications, {
        ...props,
        "active": true
    })));
    {
        fireEvent.click(screen.getByRole('button', { name: 'View account' }));
        await nextTick();
    }
    expect(openAccount).toHaveBeenCalledOnce();
    expect(ctaClicked).toHaveBeenCalledExactlyOnceWith('notice');
    expect(screen.getByRole('status')).toBeTruthy();
    expect(dismiss).not.toHaveBeenCalled();
    await act(() => view.rerender(h(AccountNotifications, {
        ...props,
        "active": false
    })));
    expect(screen.queryByRole('status')).toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
    await act(() => view.rerender(h(AccountNotifications, {
        ...props,
        "active": true
    })));
    expect(screen.getByRole('button', { name: 'View account' })).toBeTruthy();
});
