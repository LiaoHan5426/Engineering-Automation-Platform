// @vitest-environment jsdom
import { h } from 'vue';
import { fireEvent, screen } from '@testing-library/dom';
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfigField, type ConfigFieldProps } from '../src/ConfigField.tsx';
afterEach(cleanup);
it('shares controlled inputs and reset actions between generated and custom forms', async () => {
    const props: ConfigFieldProps = {
        label: 'Timeout', value: '500', secret: false, choices: [], disabled: false,
        overridden: true, invalid: false,
        labels: { reset: 'Reset', inherited: 'Inherited', invalid: 'Invalid value' },
        onChange: vi.fn(), onReset: vi.fn(),
    };
    const view = await act(async () => render(h(ConfigField, { ...props }, undefined)));
    await act(async () => fireEvent.input(screen.getByLabelText('Timeout'), { target: { value: '600' } }));
    expect(props.onChange).toHaveBeenCalledWith('600');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset' })));
    expect(props.onReset).toHaveBeenCalledOnce();
    await act(async () => view.rerender(h(ConfigField, { ...props, "choices": ['500', '600'], "invalid": true }, undefined)));
    expect(screen.getByRole('status').textContent).toBe('Invalid value');
    await act(async () => fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } }));
    await act(async () => fireEvent.change(screen.getByRole('combobox'), { target: { value: '600' } }));
    expect(props.onReset).toHaveBeenCalledTimes(2);
    expect(props.onChange).toHaveBeenCalledTimes(2);
    await act(async () => view.rerender(h(ConfigField, { ...props, "secret": true, "overridden": false }, undefined)));
    expect(screen.getByLabelText('Timeout').getAttribute('type')).toBe('password');
    await act(async () => fireEvent.input(screen.getByLabelText('Timeout'), { target: { value: 'hidden' } }));
    expect(props.onChange).toHaveBeenLastCalledWith('hidden');
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => view.rerender(h(ConfigField, { ...props, "secret": true, "disabled": true, "overridden": false }, undefined)));
    expect(screen.getByLabelText('Timeout').hasAttribute('disabled')).toBe(true);
});
