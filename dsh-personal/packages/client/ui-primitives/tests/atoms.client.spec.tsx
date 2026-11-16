// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/dom';
import { h } from 'vue';
import { cleanupVue as cleanup, flushVue as act, renderVue } from './vue-render.ts';
import { within as queriesWithin } from '@testing-library/dom';
import { nextTick } from 'vue';
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) }; }
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ConnectionIndicator } from '@deepseek-ai/dsh-client-ui-primitives';
import { focusWithoutRing } from '../src/focus.ts';
afterEach(cleanup);
describe('isMobileDevice', () => {
    beforeEach(() => { vi.resetModules(); });
    it.each([
        { name: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5, mobile: true },
        { name: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5, mobile: true },
        { name: 'iPod', userAgent: 'Mozilla/5.0 (iPod; U; CPU like Mac OS X; en)', platform: 'iPod', maxTouchPoints: 5, mobile: true },
        { name: 'Android phone', userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Mobile', platform: 'Linux armv8l', maxTouchPoints: 0, mobile: true },
        { name: 'Android tablet', userAgent: 'Mozilla/5.0 (Linux; Android 10; K)', platform: 'Linux armv8l', maxTouchPoints: 5, mobile: true },
        { name: 'desktop-mode iPad', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5, mobile: true },
        { name: 'Mac', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0, mobile: false },
        { name: 'Windows touchscreen', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 5, mobile: false },
        { name: 'native networking UA', userAgent: 'DeepSeek%20Chat/0 CFNetwork/3860.400.51 Darwin/25.3.0', platform: '', maxTouchPoints: 0, mobile: false },
        { name: 'unknown UA', userAgent: 'Unrecognized/1.0', platform: '', maxTouchPoints: 0, mobile: false },
    ])('classifies $name', async ({ userAgent, platform, maxTouchPoints, mobile }) => {
        for (const [name, value] of Object.entries({ userAgent, platform, maxTouchPoints })) {
            const descriptor = Object.getOwnPropertyDescriptor(navigator, name);
            Object.defineProperty(navigator, name, { configurable: true, value });
            onTestFinished(() => {
                if (descriptor === undefined)
                    Reflect.deleteProperty(navigator, name);
                else
                    Object.defineProperty(navigator, name, descriptor);
            });
        }
        const { isMobileDevice } = await import('../src/focus.ts');
        expect(isMobileDevice()).toBe(mobile);
    });
    it.each([true, false])('shares a cached %s result between callers until the module reloads', async (mobile) => {
        const mobileUA = 'Mozilla/5.0 (iPhone)';
        const desktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
        const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(mobile ? mobileUA : desktopUA);
        onTestFinished(() => { ua.mockRestore(); });
        const first = await import('../src/focus.ts');
        expect(first.isMobileDevice()).toBe(mobile);
        ua.mockReturnValue(mobile ? desktopUA : mobileUA);
        const other = await import('@deepseek-ai/dsh-client-ui-primitives/src/focus.ts');
        expect(other.isMobileDevice()).toBe(mobile);
        expect(ua).toHaveBeenCalledTimes(1);
        vi.resetModules();
        const reloaded = await import('../src/focus.ts');
        expect(reloaded.isMobileDevice()).toBe(!mobile);
        expect(ua).toHaveBeenCalledTimes(2);
    });
});
it('retains automatic focus styling while typing and restores it for keyboard navigation', async () => {
    render(h("button", {}, ["Automatic destination"]));
    const button = screen.getByRole('button');
    focusWithoutRing(button);
    {
        fireEvent.keyDown(button, { key: 'a' });
        await nextTick();
    }
    expect(button.hasAttribute('data-dsh-automatic-focus')).toBe(true);
    {
        fireEvent.keyDown(button, { key: 'ArrowDown' });
        await nextTick();
    }
    expect(button.hasAttribute('data-dsh-automatic-focus')).toBe(false);
});
describe('ConnectionIndicator', () => {
    it('renders outage, attempt progress, and recovered states without a native tooltip', async () => {
        const reconnect = vi.fn();
        const labels = {
            disconnectedLabel: 'Disconnected, retry',
            connectingLabel: 'Connecting',
            recoveredLabel: 'Connected',
            reconnectActionLabel: 'Disconnected, reconnect now',
            restartActionLabel: 'Connecting, restart now',
            onReconnect: reconnect,
        };
        const { container, rerender } = render(h(ConnectionIndicator, {
            "state": undefined,
            ...labels
        }));
        expect(container.children).toHaveLength(0);
        await act(() => rerender(h(ConnectionIndicator, {
            "state": "disconnected",
            ...labels
        })));
        const indicator = screen.getByRole('button', { name: 'Disconnected, reconnect now' });
        expect(indicator.textContent).toContain('Disconnected, retry');
        expect(indicator.hasAttribute('title')).toBe(false);
        expect(indicator.querySelector('svg')).toBeTruthy();
        {
            fireEvent.click(indicator);
            await nextTick();
        }
        expect(reconnect).toHaveBeenCalledOnce();
        await act(() => rerender(h(ConnectionIndicator, {
            "state": "connecting",
            ...labels
        })));
        const connecting = screen.getByRole('button', { name: 'Connecting, restart now' });
        expect(connecting.textContent).toContain('Connecting...');
        expect(connecting.querySelector('[data-state="ongoing"]')).not.toBeNull();
        await act(() => rerender(h(ConnectionIndicator, {
            "state": "recovered",
            ...labels
        })));
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByRole('status', { name: 'Connected' })).toBeTruthy();
    });
    it('fades out for the exit duration before unmounting', async () => {
        vi.useFakeTimers();
        try {
            const labels = {
                disconnectedLabel: 'Disconnected, retry',
                connectingLabel: 'Connecting',
                recoveredLabel: 'Connected',
                reconnectActionLabel: 'Disconnected, reconnect now',
                restartActionLabel: 'Connecting, restart now',
                onReconnect: vi.fn(),
            };
            const { container, rerender } = render(h(ConnectionIndicator, {
                "state": "disconnected",
                ...labels
            }));
            await act(() => rerender(h(ConnectionIndicator, {
                "state": undefined,
                ...labels
            })));
            expect(screen.getByRole('button', { name: 'Disconnected, reconnect now' })).toBeTruthy();
            await act(() => { vi.advanceTimersByTime(150); });
            expect(container.children).toHaveLength(0);
        }
        finally {
            vi.useRealTimers();
        }
    });
});
