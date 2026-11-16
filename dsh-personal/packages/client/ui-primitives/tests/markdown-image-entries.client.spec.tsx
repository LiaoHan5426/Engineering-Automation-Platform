import { nextTick } from 'vue';
import { h } from 'vue';
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from './content-render.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path';
import { MarkdownDelegateProvider } from '../src/markdown/MarkdownDelegate.tsx';
import { MarkdownText } from './markdown-test-components.tsx';
import { parseGfm, parseGfmWithMath } from '../src/markdown/parse.ts';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const fileDrag = { prepare: vi.fn(async () => ({ start: () => true, release: () => { } })), reportFailure: vi.fn() };
const labels = { dragFailed: 'Image drag failed', open: 'View full image', dialog: 'Image preview', close: 'Close preview', loading: 'Loading image', failed: 'Image unavailable' };
const fileImages = { fileDrag, resolve: (path: string) => `https://example.com/api/file?path=${encodeURIComponent('/workspace/' + path)}`, labels };
function mount(text: string, streaming = false) {
    const openFile = vi.fn();
    const view = render(h(MarkdownDelegateProvider, { "openFile": openFile, "fileImages": fileImages }, { "default": () => [h(MarkdownText, { "text": text, "streaming": streaming })] }));
    return { ...view, openFile };
}
it('loads Desktop inline and hover previews through the file route after streaming settles', async () => {
    vi.useFakeTimers();
    const path = '/work/测试 图片#100%.png';
    const src = fileMediaUrl('dsh-app://app/', path)!;
    const images = { fileDrag, resolve: (value: string) => fileMediaUrl('dsh-app://app/', value), labels };
    const text = `![图片](<${encodeURI(path).replace('#', '%23')}>)\n\n[打开图片](<${encodeURI(path).replace('#', '%23')}>)`;
    const openFile = vi.fn();
    const content = (streaming: boolean) => h(MarkdownDelegateProvider, { "fileImages": images, "openFile": openFile }, { "default": () => [h(MarkdownText, { "text": text, "streaming": streaming })] });
    const view = render(content(true));
    await nextTick();
    await nextTick();
    expect(view.container.querySelector('img')).toBeNull();
    view.rerender(content(false));
    await nextTick();
    const inline = screen.getByRole('img').getAttribute('src');
    await nextTick();
    expect(inline?.replace(/&load=\d+$/u, '')).toBe(src);
    const trigger = screen.getByRole('button', { name: 'View full image: 图片' });
    trigger.focus();
    await fireEvent.click(trigger);
    await nextTick();
    expect(screen.getByRole('dialog').querySelector('img')?.getAttribute('src')).toBe(inline);
    await fireEvent.keyDown(window, { key: 'Escape' });
    await nextTick();
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    const link = screen.getByRole('button', { name: '打开图片' });
    await fireEvent.pointerEnter(link.parentElement!);
    await act(() => { vi.advanceTimersByTime(500); });
    await nextTick();
    expect(screen.getByAltText(path).getAttribute('src')?.replace(/&load=\d+$/u, '')).toBe(src);
    await fireEvent.error(screen.getByAltText(path));
    await nextTick();
    expect(screen.getByText(labels.failed)).toBeTruthy();
    await fireEvent.click(link);
    await nextTick();
    expect(openFile).toHaveBeenCalledWith(path, undefined);
});
it('opens inline images in the shared lightbox, restores focus, and never opens the sidebar', async () => {
    const { openFile } = mount('![Compare](<.artifacts/对比 image.png>)');
    const trigger = screen.getByRole('button', { name: 'View full image: Compare' });
    trigger.focus();
    await nextTick();
    expect(new URL(screen.getByRole('img').getAttribute('src')!).searchParams.get('path')).toBe('/workspace/.artifacts/对比 image.png');
    await fireEvent.click(trigger);
    await nextTick();
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'Tab' });
    await nextTick();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close preview' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    await nextTick();
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    await nextTick();
    expect(openFile).not.toHaveBeenCalled();
});
it.each([
    ['assets/my%20photo.png', 'my photo.png'],
    ['assets/%E5%9B%BE%E7%89%87.png', '图片.png'],
    ['C:%5Cassets%5Cmy%20photo.png', 'my photo.png'],
])('prepares the decoded basename for %s', async (destination, name) => {
    fileDrag.prepare.mockClear();
    mount(`![source](${destination})`);
    await act(async () => { await fireEvent.pointerEnter(screen.getByRole('img')); });
    await nextTick();
    expect(fileDrag.prepare).toHaveBeenCalledWith(expect.objectContaining({ name }), expect.any(AbortSignal));
});
it('loads a link preview only after hover dwell and keeps its existing sidebar activation', async () => {
    vi.useFakeTimers();
    const { openFile } = mount('[View comparison](.artifacts/对比%20image.png)');
    const link = screen.getByRole('button', { name: 'View comparison' });
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
    await fireEvent.pointerEnter(link.parentElement!);
    await act(() => { vi.advanceTimersByTime(499); });
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
    await act(() => { vi.advanceTimersByTime(1); });
    const image = screen.getByRole('img');
    await nextTick();
    expect(new URL(image.getAttribute('src')!).searchParams.get('path')).toBe('/workspace/.artifacts/对比 image.png');
    await fireEvent.load(image);
    await nextTick();
    expect(screen.queryByText('Loading image')).toBeNull();
    await fireEvent.pointerDown(link);
    await fireEvent.click(link);
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
    await nextTick();
    expect(openFile).toHaveBeenCalledWith('.artifacts/对比 image.png', undefined);
});
it('supports keyboard previews, Escape dismissal, and an inert failure state', async () => {
    mount('[View comparison](graph.png)');
    const link = screen.getByRole('button', { name: 'View comparison' });
    // jsdom does not model keyboard input modality for :focus-visible.
    vi.spyOn(link, 'matches').mockReturnValue(true);
    await act(() => { link.focus(); });
    await fireEvent.error(screen.getByRole('img'));
    await nextTick();
    expect(screen.getByText('Image unavailable')).toBeTruthy();
    await fireEvent.keyDown(link, { key: 'Escape' });
    await nextTick();
    expect(screen.queryByText('Image unavailable')).toBeNull();
});
it('leaves non-image links and streaming paths without a preview', async () => {
    mount('[Report](report.pdf)');
    await fireEvent.focus(screen.getByRole('button', { name: 'Report' }));
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
    cleanup();
    mount('![Compare](image.png)', true);
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
});
it('keeps image-only links as one activation target', async () => {
    const { container, openFile } = mount('[![Compare](image.png)](image.png)');
    await nextTick();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button'));
    await nextTick();
    expect(openFile).toHaveBeenCalledWith('image.png', undefined);
    await nextTick();
    expect(screen.queryByRole('dialog')).toBeNull();
});
it.each([parseGfm, parseGfmWithMath])('recovers standalone bare-space paths without promoting code or escaped syntax', async (parse) => {
    const source = '![图](/work/test workspace/测试文件/图.png)';
    await nextTick();
    expect(parse(source).children[0]).toMatchObject({ children: [{ type: 'image', url: '/work/test workspace/测试文件/图.png' }] });
    for (const example of ['`' + source + '`', '```md\n' + source + '\n```', '\\' + source, 'Example: ' + source,
        '![图](https://example.com/test image.png)', '![图](/work/test (image).png)']) {
        await nextTick();
        expect(JSON.stringify(parse(example))).not.toContain('"type":"image"');
    }
});
it('keeps an unavailable image link navigable without showing a hover preview', async () => {
    const openFile = vi.fn();
    render(h(MarkdownDelegateProvider, { "openFile": openFile, "fileImages": { ...fileImages, resolve: () => undefined } }, { "default": () => [h(MarkdownText, { "text": "[Image](relative.png)" })] }));
    await nextTick();
    const link = screen.getByRole('button', { name: 'Image' });
    await fireEvent.focus(link);
    await nextTick();
    expect(screen.queryByRole('img')).toBeNull();
    await fireEvent.click(link);
    await nextTick();
    expect(openFile).toHaveBeenCalledWith('relative.png', undefined);
});
it('emits an unparsable file image URL unchanged', async () => {
    render(h(MarkdownDelegateProvider, { "openFile": vi.fn(), "fileImages": { ...fileImages, resolve: () => 'relative.png' } }, { "default": () => [h(MarkdownText, { "text": "![Compare](image.png)" })] }));
    await nextTick();
    await nextTick();
    expect(screen.getByRole('img').getAttribute('src')).toBe('relative.png');
});
it('labels empty-alt image activation and retains a localized failure description', async () => {
    mount('![](image.png)');
    await nextTick();
    expect(screen.getByRole('button', { name: 'View full image' })).toBeTruthy();
    await fireEvent.error(document.querySelector('img')!);
    await nextTick();
    expect(screen.getByText('Image unavailable · image.png')).toBeTruthy();
    await nextTick();
    expect(screen.queryByRole('button')).toBeNull();
});
it.each([parseGfm, parseGfmWithMath])('uses the shared image categories for bare-space recovery', async (parse) => {
    for (const extension of ['avif', 'tif', 'tiff', 'heic', 'heif']) {
        await nextTick();
        expect(parse(`![图](/work/test dir/photo.${extension})`).children[0])
            .toMatchObject({ children: [{ type: 'image', url: `/work/test dir/photo.${extension}` }] });
    }
    await nextTick();
    expect(JSON.stringify(parse('![report](/work/test dir/report.pdf)'))).not.toContain('"type":"image"');
});
it('uses the fallback filename for an external image URL without a path', async () => {
    mount('![Remote](https://example.com/)');
    await nextTick();
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/');
});
