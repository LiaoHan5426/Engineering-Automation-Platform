// @vitest-environment jsdom
import { h as vueH } from 'vue';
/** Excel preview lifecycle and read-only renderer settings. */
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime';
import { Config } from '../src/config.ts';
import { en, zh } from '../src/client/excel/locales.ts';
import type { ExcelBodyProps, LoadedExcelBodyProps } from '../src/client/excel/LazyExcelBody.tsx';
const mocked = vi.hoisted(() => ({ parse: vi.fn(), workbook: vi.fn((_props: unknown) => null) }));
vi.mock('../src/client/excel/parse.ts', () => ({ parseExcel: mocked.parse }));
vi.mock('../src/client/excel/Workbook.tsx', () => ({ Workbook: mocked.workbook }));
import { ExcelBody } from '../src/client/excel/excel.tsx';
import { LazyExcelBody } from '../src/client/excel/LazyExcelBody.tsx';
import { LoadingIndicator } from '../src/client/LoadingIndicator.tsx';
const props = { content: { kind: 'bytes', data: new Uint8Array([1]) }, limits: Config({}).excel, t: makeTranslate(en), resourceAddress: 'dsh-resource://file/session/s1/book.xlsx' } as ExcelBodyProps;
const loadedProps = { ...props, format: 'xlsx', loading: vueH(LoadingIndicator, {
        "label": en.loading
    }) } satisfies LoadedExcelBodyProps;
const value = { sheets: [{ name: 'Budget', celldata: [] }], missingResults: 0, unsupportedFeatures: [] };
const formulaValue = { sheets: [{ name: 'Budget', celldata: [{ r: 0, c: 0, v: { f: '=SUM(1,2)', m: '' } }] }], missingResults: 1, unsupportedFeatures: [] };
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('shows loading then a workbook with editing and recalculation disabled', async () => {
    mocked.parse.mockResolvedValue(formulaValue);
    const view = render(vueH(ExcelBody, {
        ...loadedProps
    }));
    expect(screen.getByRole('status', { name: en.loading })).toBeDefined();
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledOnce(); });
    expect(screen.getByRole('button', { name: en.formulaWarning })).toBeDefined();
    expect(screen.queryByRole('note')).toBeNull();
    expect(mocked.workbook.mock.calls[0]![0]).toMatchObject({ sheets: formulaValue.sheets, language: 'en', label: en.title });
    const signal = mocked.parse.mock.calls[0]![3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
});
it('opens the formula warning by touch and closes it on an outside press', async () => {
    vi.stubGlobal('ResizeObserver', class {
        observe() { }
        unobserve() { }
        disconnect() { }
    });
    mocked.parse.mockResolvedValue(formulaValue);
    const view = render(vueH(ExcelBody, {
        ...loadedProps
    }));
    const warning = await screen.findByRole('button', { name: en.formulaWarning });
    await act(() => fireEvent.pointerEnter(warning, { pointerType: 'touch' }));
    await act(() => fireEvent.pointerDown(warning, { pointerType: 'touch' }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(() => fireEvent.click(warning));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(en.formulaWarning);
    expect(view.container.querySelector('[role="tooltip"]')).toBeNull();
    await act(() => fireEvent.pointerDown(document.body, { pointerType: 'touch' }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
});
it.each([en, zh])('lists only detected unsupported content and clears the notice on file replacement', async (dictionary) => {
    const t = makeTranslate(dictionary);
    mocked.parse.mockResolvedValueOnce({ ...formulaValue, unsupportedFeatures: ['charts', 'images', 'shapes', 'conditionalFormatting'] })
        .mockResolvedValueOnce(value);
    const view = render(vueH(ExcelBody, {
        ...loadedProps,
        "t": t
    }));
    const notice = await screen.findByRole('note');
    expect(notice.textContent).toBe(t('unsupportedNotice', {
        features: [dictionary.charts, dictionary.images, dictionary.shapes, dictionary.conditionalFormatting].join(dictionary.featureSeparator),
    }));
    expect(screen.getByRole('button', { name: dictionary.formulaWarning })).toBeDefined();
    await view.rerender(vueH(ExcelBody, {
        ...loadedProps,
        "t": t,
        "content": { kind: 'bytes', data: new Uint8Array([2]) }
    }));
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledTimes(2); });
    expect(screen.queryByRole('note')).toBeNull();
});
it('does not list undetected unsupported features', async () => {
    mocked.parse.mockResolvedValueOnce({ ...value, unsupportedFeatures: ['charts'] });
    render(vueH(ExcelBody, {
        ...loadedProps
    }));
    expect((await screen.findByRole('note')).textContent).toBe(makeTranslate(en)('unsupportedNotice', { features: en.charts }));
});
it('ignores a retired file result and cancels parsing when the bytes change', async () => {
    let finish!: (value: unknown) => void;
    mocked.parse.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(value);
    const view = render(vueH(ExcelBody, {
        ...loadedProps
    }));
    const signal = mocked.parse.mock.calls[0]![3] as AbortSignal;
    await view.rerender(vueH(ExcelBody, {
        ...loadedProps,
        "content": { kind: 'bytes', data: new Uint8Array([2]) }
    }));
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledTimes(1); });
    expect(signal.aborted).toBe(true);
    finish(value);
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledTimes(1); });
});
it.each(['invalid', 'tooLarge', 'timeout', 'encoding', 'unexpected'])('shows localized %s errors and retries explicitly', async (error) => {
    mocked.parse.mockRejectedValueOnce(new Error(error)).mockResolvedValueOnce(value);
    render(vueH(ExcelBody, {
        ...loadedProps
    }));
    const key = error === 'tooLarge' || error === 'timeout' || error === 'encoding' ? error : 'invalid';
    await screen.findByText(en[key]);
    await act(() => fireEvent.click(screen.getByRole('button', { name: en.retry })));
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledOnce(); });
    expect(mocked.parse).toHaveBeenCalledTimes(2);
});
it('rejects non-byte content without allocating a parser', () => {
    render(vueH(ExcelBody, {
        ...loadedProps,
        "content": { kind: 'text', text: '', pages: [], eof: true }
    }));
    expect(screen.getByRole('alert').textContent).toBe(en.invalid);
    expect(mocked.parse).not.toHaveBeenCalled();
});
it.each(['xlsx', 'xls', 'csv', 'tsv'])('loads the spreadsheet chunk for %s', async (format) => {
    mocked.parse.mockResolvedValue(value);
    render(vueH(LazyExcelBody, {
        ...props,
        "resourceAddress": `dsh-resource://file/session/s1/book.${format}`
    }));
    await waitFor(() => { expect(mocked.workbook).toHaveBeenCalledOnce(); });
    expect(screen.queryByRole('button', { name: en.formulaWarning })).toBeNull();
    expect(mocked.parse.mock.calls[0]![1]).toBe(format);
});
it('uses generic guidance for non-Error failures and ignores rejection after unmount', async () => {
    mocked.parse.mockRejectedValueOnce('parser failure');
    const view = render(vueH(ExcelBody, {
        ...loadedProps
    }));
    await screen.findByText(en.invalid);
    view.unmount();
    let reject!: (error: Error) => void;
    mocked.parse.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = render(vueH(ExcelBody, {
        ...loadedProps
    }));
    const signal = mocked.parse.mock.calls[1]![3] as AbortSignal;
    pending.unmount();
    reject(new Error('closed'));
    await waitFor(() => { expect(signal.aborted).toBe(true); });
});
