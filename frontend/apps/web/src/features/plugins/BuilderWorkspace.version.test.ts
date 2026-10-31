// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, nextTick, type App } from "vue";
import { runtimeApi, type PrototypeDeliveryRecord, type PrototypeVersionRecord } from "@eap/runtime-client";
import { i18n } from "../../lib/i18n";
import BuilderWorkspace from "./BuilderWorkspace.vue";
vi.mock('grapesjs', () => { throw new Error('Canvas is browser-tested'); });
import { createPluginHost, type PluginHost } from "./host";
import { memoryStore } from "./model";
import { emptyPrototypeSchema } from '../shell/prototypeSchema';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function version(id: string, title: string, presses = 2): PrototypeVersionRecord {
  return {
    id,
    sourceRef: "builder-alpha",
    title,
    body: "正文",
    buttonPresses: presses,
    interaction: "预览按钮使计数加一",
    acceptance: ["看标题"],
    contentHash: `hash-${id}`,
  };
}

async function settled() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

describe("builder version preview", () => {
  let app: App<Element> | null = null;
  let root: HTMLElement | null = null;
  let host: PluginHost | null = null;

  afterEach(() => {
    app?.unmount();
    root?.remove();
    app = null;
    root = null;
    host = null;
    vi.restoreAllMocks();
  });

  async function mount(items: PrototypeVersionRecord[] = [], surface = "versions") {
    vi.spyOn(runtimeApi, "handoffs").mockResolvedValue({ items: [] });
    vi.spyOn(runtimeApi, "missions").mockResolvedValue({ items: [] });
    vi.spyOn(runtimeApi, "prototypeVersions").mockResolvedValue({ items });
    host = createPluginHost(memoryStore());
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp(BuilderWorkspace, { instanceId: "alpha", host });
    app.use(i18n);
    app.mount(root);
    await settled();
    root.querySelector<HTMLButtonElement>(`[data-testid="builder-tab-${surface}"]`)?.click();
    await settled();
    return { host, root };
  }

  async function tab(id: string) {
    root!.querySelector<HTMLButtonElement>(`[data-testid="builder-tab-${id}"]`)!.click();
    await settled();
  }

  it("starts with only design and lazily retains drafts across the three shared tabs", async () => {
    await mount([], "design");
    expect(root!.querySelectorAll('.eap-tabs [role="tab"]')).toHaveLength(3);
    await vi.waitFor(() => expect(root!.querySelector('[data-testid="grapes-title"]')).not.toBeNull());
    expect(root!.querySelector('[data-testid="builder-layout-draft"]')).toBeNull();
    expect(root!.querySelector('[data-testid="draft-title"]')).toBeNull();
    expect(runtimeApi.handoffs).not.toHaveBeenCalled();
    const design = root!.querySelector<HTMLInputElement>('[data-testid="grapes-title"]')!;
    design.value = "未保存设计";
    design.dispatchEvent(new Event("input"));
    await tab("legacy");
    const legacy = root!.querySelector<HTMLInputElement>('[data-testid="draft-title"]')!;
    legacy.value = "未保存旧草稿";
    legacy.dispatchEvent(new Event("input"));
    expect(runtimeApi.handoffs).toHaveBeenCalledOnce();
    await tab("versions");
    expect(root!.querySelector<HTMLElement>('[data-testid="builder-design-panel"]')!.style.display).toBe("none");
    await tab("design");
    expect(root!.querySelector('[data-testid="grapes-title"]')).toBe(design);
    expect(design.value).toBe("未保存设计");
    await tab("legacy");
    expect(root!.querySelector('[data-testid="draft-title"]')).toBe(legacy);
    expect(legacy.value).toBe("未保存旧草稿");
    root!.querySelector<HTMLButtonElement>('[data-testid="builder-back-scenes"]')!.click();
    expect(window.location.hash).toBe("#scenes");
  });

  function openButton(title: string) {
    const item = [...root!.querySelectorAll('[data-testid="prototype-version"] li')].find((entry) =>
      entry.textContent?.includes(title),
    );
    if (!item) throw new Error(`missing version ${title}`);
    return item.querySelector<HTMLButtonElement>('[data-testid="open-version"]')!;
  }

  it("ignores an older version response after a newer one is shown", async () => {
    await mount([version("a", "版本甲"), version("b", "版本乙")]);
    const first = deferred<PrototypeVersionRecord>();
    const second = deferred<PrototypeVersionRecord>();
    vi.spyOn(runtimeApi, "prototypeVersion").mockImplementation((id: string) => (id === "a" ? first.promise : second.promise));
    openButton("版本甲").click();
    openButton("版本乙").click();
    second.resolve(version("b", "版本乙", 5));
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain("版本乙");
    first.resolve(version("a", "版本甲", 9));
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain("版本乙");
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).not.toContain("版本甲");
    expect(host!.readBuilder("alpha").buttonPresses).toBe(0);
  });

  it('renders semantic versions with real interactions instead of the legacy counter', async () => {
    const schema = emptyPrototypeSchema('语义设计');
    schema.root.children = [{ id: 'action', kind: 'button', props: { label: '语义按钮' }, children: [] }];
    const semantic = { ...version('semantic', '语义设计'), body: JSON.stringify({ format: 'eap-prototype-v1', schema }) };
    await mount([semantic]);
    vi.spyOn(runtimeApi, 'prototypeVersion').mockResolvedValue(semantic);
    openButton('语义设计').click(); await settled();
    const preview = root!.querySelector('[data-testid=version-preview]')!;
    expect(preview.querySelector('[data-testid=semantic-preview]')).not.toBeNull();
    expect(preview.querySelector('[data-testid=preview-button]')).toBeNull();
    (preview.querySelector('[data-testid=semantic-preview] button') as HTMLButtonElement).click();
    await settled(); expect(preview.querySelector('output')?.textContent).toBe('1');
    expect(host!.readBuilder('alpha').buttonPresses).toBe(0);
  });

  it('blocks unsupported semantic versions instead of treating them as legacy demos', async () => {
    const schema = emptyPrototypeSchema('未知设计');
    schema.root.children = [{ id: 'unknown', kind: 'unsupported', props: {}, children: [] }];
    const semantic = { ...version('unknown', '未知设计'), body: JSON.stringify({ format: 'eap-prototype-v1', schema }) };
    await mount([semantic]);
    vi.spyOn(runtimeApi, 'prototypeVersion').mockResolvedValue(semantic);
    openButton('未知设计').click(); await settled();
    expect(root!.querySelector('[data-testid=version-design-blocked]')).not.toBeNull();
    expect((root!.querySelector('[data-testid=prototype-to-code]') as HTMLButtonElement).disabled).toBe(true);
    expect((root!.querySelector('[data-testid=create-delivery]') as HTMLButtonElement).disabled).toBe(true);
    expect(root!.querySelector('[data-testid=version-preview] [data-testid=preview-button]')).toBeNull();
  });

  it("does not reopen a preview when the response arrives after close or unmount", async () => {
    await mount([version("a", "版本甲"), version("b", "版本乙")]);
    const opening = deferred<PrototypeVersionRecord>();
    vi.spyOn(runtimeApi, "prototypeVersion").mockImplementation(() => opening.promise);
    openButton("版本甲").click();
    await settled();
    opening.resolve(version("a", "版本甲"));
    await settled();
    const late = deferred<PrototypeVersionRecord>();
    vi.spyOn(runtimeApi, "prototypeVersion").mockImplementation(() => late.promise);
    openButton("版本乙").click();
    root!.querySelector<HTMLButtonElement>('[data-testid="close-version"]')!.click();
    await settled();
    late.resolve(version("b", "迟到的版本"));
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"]')).toBeNull();

    const afterClose = deferred<PrototypeVersionRecord>();
    vi.spyOn(runtimeApi, "prototypeVersion").mockImplementation(() => afterClose.promise);
    openButton("版本甲").click();
    app!.unmount();
    afterClose.resolve(version("a", "卸载后的版本"));
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"]')).toBeNull();
    expect(root!.textContent).not.toContain("卸载后的版本");
    app = null;
  });

  it("keeps a delivery for A off the preview after switching to B", async () => {
    await mount([version("a", "版本甲"), version("b", "版本乙")]);
    vi.spyOn(runtimeApi, "prototypeVersion").mockImplementation(async (id: string) => version(id, id === "a" ? "版本甲" : "版本乙"));
    openButton("版本甲").click();
    await settled();
    const delivery = deferred<PrototypeDeliveryRecord>();
    vi.spyOn(runtimeApi, "createPrototypeDelivery").mockImplementation(() => delivery.promise);
    root!.querySelector<HTMLButtonElement>('[data-testid="create-delivery"]')!.click();
    openButton("版本乙").click();
    await settled();
    delivery.resolve({ id: "sheet-a", versionId: "a" });
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"]')?.textContent).toContain("版本乙");
    expect(root!.querySelector('[data-testid="delivery-sheet"]')).toBeNull();
    expect(host!.readBuilder("alpha").draftTitle).toBe("结算页");
  });

  it("shows a failed open or list without clearing the draft or an older list", async () => {
    const listed = deferred<{ items: PrototypeVersionRecord[] }>();
    vi.spyOn(runtimeApi, "handoffs").mockResolvedValue({ items: [] });
    vi.spyOn(runtimeApi, "missions").mockResolvedValue({ items: [] });
    vi.spyOn(runtimeApi, "prototypeVersions").mockImplementation(() => listed.promise);
    host = createPluginHost(memoryStore());
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp(BuilderWorkspace, { instanceId: "alpha", host });
    app.use(i18n);
    app.mount(root);
    const reloaded = deferred<{ items: PrototypeVersionRecord[] }>();
    listed.resolve({ items: [version("a", "版本甲")] });
    await settled();
    await tab("legacy");
    vi.spyOn(runtimeApi, "prototypeVersions").mockImplementation(() => reloaded.promise);
    vi.spyOn(runtimeApi, "savePrototypeVersion").mockResolvedValue(version("saved", "已保存"));
    root.querySelector<HTMLButtonElement>('[data-testid="save-version"]')!.click();
    await settled();
    reloaded.reject(new Error("版本列表不可用"));
    await settled();
    expect(root.querySelector('[data-testid="version-list-error"]')?.textContent).toContain("版本列表不可用");
    expect(root.textContent).toContain("版本甲");
    expect((root.querySelector('[data-testid="draft-title"]') as HTMLInputElement).value).toBe("结算页");
    expect(host.readBuilder("alpha").buttonPresses).toBe(0);

    vi.spyOn(runtimeApi, "prototypeVersion").mockRejectedValue(new Error("版本打不开"));
    openButton("版本甲").click();
    await settled();
    expect(root.querySelector('[data-testid="version-note"]')?.textContent).toContain("版本打不开");
    expect(root.querySelector('[data-testid="version-preview"]')).toBeNull();
    expect(host.readBuilder("alpha").draftBody).toContain("手工编辑这段说明");
  });

  it("presses the opened version without writing the draft, and reopens at the saved count", async () => {
    await mount([version("a", "版本甲", 2)]);
    vi.spyOn(runtimeApi, "prototypeVersion").mockResolvedValue(version("a", "版本甲", 2));
    openButton("版本甲").click();
    await settled();
    root!.querySelector<HTMLButtonElement>('[data-testid="version-preview"] [data-testid="preview-button"]')!.click();
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"] [data-testid="press-count"]')?.textContent).toContain("3");
    expect(host!.readBuilder("alpha")).toMatchObject({
      draftTitle: "结算页",
      buttonPresses: 0,
      mockApproval: "none",
      mockRepositoryLabel: "模拟 · ledger",
    });
    root!.querySelector<HTMLButtonElement>('[data-testid="close-version"]')!.click();
    openButton("版本甲").click();
    await settled();
    expect(root!.querySelector('[data-testid="version-preview"] [data-testid="press-count"]')?.textContent).toContain("2");
    expect(host!.readBuilder("alpha").buttonPresses).toBe(0);
  });
});
