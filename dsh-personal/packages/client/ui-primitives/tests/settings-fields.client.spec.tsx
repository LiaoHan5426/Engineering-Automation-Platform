// @vitest-environment jsdom
import { h } from 'vue';
import { fireEvent, screen } from '@testing-library/dom';
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsSecretField, SettingsValueField } from '../src/settings-form/fields.tsx';
afterEach(cleanup);
const frame = {
    id: 'field',
    label: 'Command timeout',
    hint: 'How long one command may run.',
    overriddenLabel: 'Overridden',
    resetLabel: 'Reset to default',
    invalidLabel: 'Enter a number.',
    disabled: false,
    overridden: false,
    invalid: false,
};
describe('SettingsValueField', () => {
    it('stages every keystroke without writing', async () => {
        const onEdit = vi.fn();
        await act(async () => render(h(SettingsValueField, { ...frame, "text": "60000", "onEdit": onEdit, "onReset": vi.fn() }, undefined)));
        await act(async () => fireEvent.input(screen.getByLabelText('Command timeout'), { target: { value: '9000' } }));
        expect(onEdit).toHaveBeenCalledWith('9000');
    });
    it('renders the staged text it is given rather than a draft of its own', async () => {
        const { rerender } = await act(async () => render(h(SettingsValueField, { ...frame, "text": "60000", "onEdit": vi.fn(), "onReset": vi.fn() }, undefined)));
        expect(screen.getByLabelText('Command timeout')).toHaveProperty('value', '60000');
        await act(async () => rerender(h(SettingsValueField, { ...frame, "text": "9000", "onEdit": vi.fn(), "onReset": vi.fn() }, undefined)));
        expect(screen.getByLabelText('Command timeout')).toHaveProperty('value', '9000');
    });
    it('offers the reset only while an override would stand', async () => {
        const onReset = vi.fn();
        const { rerender } = await act(async () => render(h(SettingsValueField, { ...frame, "text": "9000", "onEdit": vi.fn(), "onReset": onReset }, undefined)));
        expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
        await act(async () => rerender(h(SettingsValueField, { ...frame, "overridden": true, "text": "9000", "onEdit": vi.fn(), "onReset": onReset }, undefined)));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reset to default' })));
        expect(screen.getByText('Overridden')).toBeTruthy();
        expect(onReset).toHaveBeenCalledOnce();
    });
    it('replaces the hint with the reason an invalid draft cannot be saved', async () => {
        await act(async () => render(h(SettingsValueField, { ...frame, "invalid": true, "text": "soon", "onEdit": vi.fn(), "onReset": vi.fn() }, undefined)));
        expect(screen.getByText('Enter a number.')).toBeTruthy();
        expect(screen.queryByText('How long one command may run.')).toBeNull();
        expect(screen.getByLabelText('Command timeout').getAttribute('aria-invalid')).toBe('true');
    });
    it('hints a numeric keypad and renders a placeholder when asked', async () => {
        await act(async () => render(h(SettingsValueField, { ...frame, "numeric": true, "placeholder": "https://api.deepseek.com", "text": "", "onEdit": vi.fn(), "onReset": vi.fn() }, undefined)));
        const input = screen.getByLabelText('Command timeout');
        expect(input.getAttribute('inputmode')).toBe('numeric');
        expect(input).toHaveProperty('placeholder', 'https://api.deepseek.com');
    });
    it('disables the control and its reset while the document is read-only', async () => {
        await act(async () => render(h(SettingsValueField, { ...frame, "disabled": true, "overridden": true, "text": "9000", "onEdit": vi.fn(), "onReset": vi.fn() }, undefined)));
        expect(screen.getByLabelText('Command timeout')).toHaveProperty('disabled', true);
        expect(screen.getByRole('button', { name: 'Reset to default' })).toHaveProperty('disabled', true);
    });
});
describe('SettingsSecretField', () => {
    const secret = {
        id: 'key',
        label: 'API key',
        hint: 'Stored outside the settings file.',
        disabled: false,
    };
    it('stages the draft and never renders it', async () => {
        const onEdit = vi.fn();
        await act(async () => render(h(SettingsSecretField, { ...secret, "text": "", "configured": false, "stateLabel": "No key is configured.", "onEdit": onEdit }, undefined)));
        const input = screen.getByLabelText('API key');
        await act(async () => fireEvent.input(input, { target: { value: 'ds-secret' } }));
        expect(onEdit).toHaveBeenCalledWith('ds-secret');
        expect(input).toHaveProperty('type', 'password');
    });
    it('reports the configured state the Host holds', async () => {
        const { rerender } = await act(async () => render(h(SettingsSecretField, { ...secret, "text": "", "configured": false, "stateLabel": "No key is configured.", "onEdit": vi.fn() }, undefined)));
        expect(screen.getByText('No key is configured.')).toBeTruthy();
        await act(async () => rerender(h(SettingsSecretField, { ...secret, "text": "ds-secret", "configured": true, "stateLabel": "A key is configured.", "onEdit": vi.fn() }, undefined)));
        expect(screen.getByText('A key is configured.')).toBeTruthy();
        expect(screen.getByLabelText('API key')).toHaveProperty('value', 'ds-secret');
    });
    it('disables the control when it is told to', async () => {
        await act(async () => render(h(SettingsSecretField, { ...secret, "disabled": true, "text": "", "configured": true, "stateLabel": "A key is configured.", "onEdit": vi.fn() }, undefined)));
        expect(screen.getByLabelText('API key')).toHaveProperty('disabled', true);
    });
});
