// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createApp, nextTick, type App } from "vue";
import { runtimeApi, type PrototypeDeliveryRecord, type PrototypeVersionRecord } from "@eap/runtime-client";
import { i18n } from "../../lib/i18n";
import BuilderWorkspace from "./BuilderWorkspace.vue";
import { createPluginHost, type PluginHost } from "./host";
import { memoryStore } from "./model";

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

  async function mount(items: PrototypeVersionRecord[] = []) {
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
    return { host, root };
  }

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
    const counts = [...root!.querySelectorAll('[data-testid="press-count"]')].map((node) => node.textContent);
    expect(counts[0]).toContain("0");
    expect(counts[1]).toContain("3");
    expect(host!.readBuilder("alpha")).toMatchObject({
      draftTitle: "结算页",
      buttonPresses: 0,
      mockApproval: "none",
      mockRepositoryLabel: "模拟 · ledger",
    });
    root!.querySelector<HTMLButtonElement>('[data-testid="close-version"]')!.click();
    openButton("版本甲").click();
    await settled();
    const reopened = [...root!.querySelectorAll('[data-testid="press-count"]')].map((node) => node.textContent);
    expect(reopened[1]).toContain("2");
    expect(host!.readBuilder("alpha").buttonPresses).toBe(0);
  });
});
