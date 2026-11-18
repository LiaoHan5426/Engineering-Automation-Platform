// @vitest-environment jsdom
import { act, cleanup } from "@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts";
import { fireEvent as domFireEvent } from "@testing-library/dom";
import { h, Fragment, shallowRef, nextTick } from "vue";
const fireEvent = {
    async pointerEnter(...args: Parameters<typeof domFireEvent.pointerEnter>) {
        await nextTick();
        const value = domFireEvent.pointerEnter(...args);
        await nextTick();
        return value;
    },
    async focus(...args: Parameters<typeof domFireEvent.focus>) {
        await nextTick();
        const value = domFireEvent.focus(...args);
        await nextTick();
        return value;
    },
    async pointerDown(...args: Parameters<typeof domFireEvent.pointerDown>) {
        await nextTick();
        const value = domFireEvent.pointerDown(...args);
        await nextTick();
        return value;
    },
    async click(...args: Parameters<typeof domFireEvent.click>) {
        await nextTick();
        const value = domFireEvent.click(...args);
        await nextTick();
        return value;
    },
    async keyDown(...args: Parameters<typeof domFireEvent.keyDown>) {
        await nextTick();
        const value = domFireEvent.keyDown(...args);
        await nextTick();
        return value;
    },
    async contextMenu(...args: Parameters<typeof domFireEvent.contextMenu>) {
        await nextTick();
        const value = domFireEvent.contextMenu(...args);
        await nextTick();
        return value;
    }
};
import { afterEach, expect, it, onTestFinished, vi } from "vite-plus/test";
import { syncedConfig } from "@deepseek-ai/dsh-client-test-runtime";
import { SlotTestRuntime } from "@deepseek-ai/dsh-client-test-runtime";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { LocaleRuntime } from "@deepseek-ai/dsh-client-locale/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type { Context } from "@deepseek-ai/cordis";
import { apply, inject } from "../src/client/index.ts";
import type { ContextMenuTarget, MenuAction } from "../src/client/types.ts";
import { isContextMenuTrigger } from "../src/client/external-trigger.ts";
import { brandString } from "@deepseek-ai/dsh-brand";
declare module "@deepseek-ai/dsh-client-ui-context-menu/client" {
    interface ContextMenuTargetMap {
        header: {
            readonly sessionId: SessionId;
        };
        entity: {
            readonly id: string;
            readonly title: string;
        };
    }
}
const target = (id: string): ContextMenuTarget => ({
    kind: "header",
    value: {
        sessionId: brandString<SessionId>(id)
    }
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});
it("shows late registered kinds without preparing actions and withdraws them with the contributing fiber", async () => {
    const runtime = await SlotTestRuntime.create();
    onTestFinished(() => runtime.dispose());
    runtime.ctx.provide("shortcuts", {
        catalog: createSnapshotStore([])
    } as never);
    runtime.ctx.provide("locale", {
        register: () => () => {
        },
        bind: () => (key: string) => key
    } as never);
    await runtime.root.declare({}, ({ renderFactorySlot }) => h(Fragment, null, [
        renderFactorySlot("contextMenu.button", {
            target: target("header"),
            label: "Header menu",
            size: "sm"
        }),
        renderFactorySlot("contextMenu.button", {
            target: {
                kind: "session",
                value: {
                    sessionId: brandString<SessionId>("row"),
                    displayTitle: "Row"
                }
            },
            label: "Row menu",
            className: "row-control"
        })
    ]));
    const view = runtime.renderRoot();
    expect(view.queryByRole("button")).toBeNull();
    const plugin = await runtime.mount({
        inject, apply
    }, syncedConfig({
        resolutionTimeoutMs: 1000
    }));
    expect(view.queryByRole("button")).toBeNull();
    const resolve = vi.fn(() => new Promise<readonly MenuAction[]>(() => {
    }));
    const row = await runtime.mount({
        inject: [
            "contextMenus"
        ],
        apply: (ctx: Context) => {
            ctx.effect(() => ctx.contextMenus.register({
                id: "row",
                target: "session",
                order: 0,
                resolve: () => []
            }));
        }
    });
    expect(view.getByRole("button", {
        name: "Row menu"
    })).toBeTruthy();
    expect(view.queryByRole("button", {
        name: "Header menu"
    })).toBeNull();
    const contribution = await runtime.mount({
        inject: [
            "contextMenus"
        ],
        apply: (ctx: Context) => {
            ctx.effect(() => ctx.contextMenus.register({
                id: "header",
                target: "header",
                order: 0,
                resolve
            }));
        }
    });
    expect(view.getByRole("button", {
        name: "Header menu"
    }).getAttribute("aria-haspopup")).toBe("menu");
    expect(resolve).not.toHaveBeenCalled();
    const source = runtime.ctx.contextMenus.registeredKinds;
    await contribution.dispose();
    expect(view.queryByRole("button", {
        name: "Header menu"
    })).toBeNull();
    expect(view.getByRole("button", {
        name: "Row menu"
    })).toBeTruthy();
    await row.dispose();
    expect(view.queryByRole("button")).toBeNull();
    await plugin.dispose();
    expect(source.getSnapshot()).toEqual([]);
});
it("shows the label tooltip on the compact toolbar button but not on row buttons", async () => {
    const runtime = await SlotTestRuntime.create();
    onTestFinished(() => runtime.dispose());
    runtime.ctx.provide("shortcuts", {
        catalog: createSnapshotStore([])
    } as never);
    runtime.ctx.provide("locale", {
        register: () => () => {
        },
        bind: () => (key: string) => key
    } as never);
    await runtime.root.declare({}, ({ renderFactorySlot }) => h(Fragment, null, [
        renderFactorySlot("contextMenu.button", {
            target: target("header"),
            label: "Header menu",
            size: "sm"
        }),
        renderFactorySlot("contextMenu.button", {
            target: target("row"), label: "Row menu"
        })
    ]));
    await runtime.mount({
        inject, apply
    }, syncedConfig({
        resolutionTimeoutMs: 1000
    }));
    await runtime.mount({
        inject: [
            "contextMenus"
        ],
        apply: (ctx: Context) => {
            ctx.effect(() => ctx.contextMenus.register({
                id: "header",
                target: "header",
                order: 0,
                resolve: () => []
            }));
        }
    });
    const view = runtime.renderRoot();
    const row = view.getByRole("button", {
        name: "Row menu"
    });
    await fireEvent.pointerEnter(row);
    await fireEvent.focus(row);
    expect(view.queryByRole("tooltip")).toBeNull();
    await fireEvent.focus(view.getByRole("button", {
        name: "Header menu"
    }));
    expect(view.getByRole("tooltip").textContent).toBe("Header menu");
});
it("toggles moved buttons by target identity, replaces other targets, and preserves right-click distance rules", async () => {
    vi.useFakeTimers();
    const runtime = await SlotTestRuntime.create();
    onTestFinished(() => runtime.dispose());
    runtime.ctx.provide("shortcuts", {
        catalog: createSnapshotStore([])
    } as never);
    const locale = new LocaleRuntime(runtime.ctx);
    runtime.ctx.provide("locale", locale);
    runtime.slots.installLocale(locale);
    const clicked = vi.fn(), pressed = vi.fn();
    await runtime.root.declare({
        "shell.overlay": {
            kind: "list", scope: "root"
        }
    }, ({ renderFactorySlot, renderSlot, useContextMenu }) => {
        const { getTriggerProps } = useContextMenu();
        return h("div", {
            onClick: clicked, onPointerdown: pressed
        }, [
            renderFactorySlot("contextMenu.button", {
                target: target("one"),
                label: "First menu",
                size: "sm"
            }),
            renderFactorySlot("contextMenu.button", {
                target: target("one"),
                label: "Same target menu"
            }),
            renderFactorySlot("contextMenu.button", {
                target: target("two"), label: "Second menu"
            }),
            h("div", {
                ...getTriggerProps(target("one"))
            }, [
                "Right-click target"
            ]),
            renderSlot("shell.overlay", {})
        ]);
    });
    await runtime.mount({
        inject, apply
    }, syncedConfig({
        resolutionTimeoutMs: 1000
    }));
    await runtime.mount({
        inject: [
            "contextMenus"
        ],
        apply: (ctx: Context) => {
            ctx.effect(() => ctx.contextMenus.register({
                id: "header",
                target: "header",
                order: 0,
                resolve: () => [
                    {
                        id: "open", label: "Open"
                    }
                ]
            }));
        }
    });
    const view = runtime.renderRoot();
    const first = view.getByRole("button", {
        name: "First menu"
    });
    const same = view.getByRole("button", {
        name: "Same target menu"
    });
    const second = view.getByRole("button", {
        name: "Second menu"
    });
    let rect = new DOMRect(20, 30, 28, 28);
    first.getBoundingClientRect = () => rect;
    same.getBoundingClientRect = () => new DOMRect(300, 400, 20, 20);
    const focus = vi.spyOn(first, "focus");
    const open = vi.spyOn(runtime.ctx.contextMenus, "open");
    await fireEvent.pointerDown(first);
    await fireEvent.click(first);
    expect(clicked).not.toHaveBeenCalled();
    expect(pressed).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({
        preventScroll: true
    });
    expect(open.mock.lastCall?.slice(0, 2)).toEqual([
        target("one"),
        {
            x: 20, y: 58
        }
    ]);
    expect(typeof open.mock.lastCall?.[2]?.button).toBe("string");
    expect(first.getAttribute("aria-expanded")).toBe("true");
    expect(same.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("false");
    await act(() => vi.advanceTimersByTimeAsync(40));
    expect(view.getByRole("menuitem", {
        name: "Open"
    })).toBeTruthy();
    rect = new DOMRect(200, 300, 28, 28);
    await fireEvent.pointerDown(first.querySelector("svg")!);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(target("one"));
    await fireEvent.click(first);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(open).toHaveBeenCalledTimes(1);
    await fireEvent.click(first);
    await fireEvent.click(same);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(target("one"));
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(same.getAttribute("aria-expanded")).toBe("true");
    await fireEvent.click(same);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
    await fireEvent.click(first);
    await fireEvent.pointerDown(second);
    await fireEvent.click(second);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(target("two"));
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(second.getAttribute("aria-expanded")).toBe("true");
    await act(() => vi.advanceTimersByTimeAsync(40));
    await fireEvent.keyDown(document, {
        key: "Escape"
    });
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
    const region = view.getByText("Right-click target");
    await fireEvent.contextMenu(region, {
        clientX: 10, clientY: 10
    });
    await fireEvent.contextMenu(region, {
        clientX: 14, clientY: 10
    });
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
    await fireEvent.contextMenu(region, {
        clientX: 10, clientY: 10
    });
    await fireEvent.contextMenu(region, {
        clientX: 15, clientY: 10
    });
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(target("one"));
    await fireEvent.pointerDown(document.body);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
});
it("keeps an open button expanded after its owner updates display metadata in the target", async () => {
    const runtime = await SlotTestRuntime.create();
    onTestFinished(() => runtime.dispose());
    runtime.ctx.provide("shortcuts", {
        catalog: createSnapshotStore([])
    } as never);
    runtime.ctx.provide("locale", {
        register: () => () => {
        },
        bind: () => (key: string) => key
    } as never);
    const entity = (title: string): ContextMenuTarget => ({
        kind: "entity",
        value: {
            id: "same", title
        }
    });
    const current = shallowRef(entity("before"));
    const update = (target: ContextMenuTarget) => {
        current.value = target;
    };
    await runtime.root.declare({}, ({ renderFactorySlot }) => {
        return renderFactorySlot("contextMenu.button", {
            target: current.value, label: "Entity menu"
        });
    });
    await runtime.mount({
        inject, apply
    }, syncedConfig({
        resolutionTimeoutMs: 1000
    }));
    await runtime.mount({
        inject: [
            "contextMenus"
        ],
        apply: (ctx: Context) => {
            ctx.effect(() => ctx.contextMenus.register({
                id: "entity",
                target: "entity",
                order: 0,
                resolve: () => []
            }));
        }
    });
    const view = runtime.renderRoot(), button = view.getByRole("button", {
        name: "Entity menu"
    });
    await fireEvent.click(button);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(entity("before"));
    await act(() => {
        update(entity("after"));
    });
    expect(view.getByRole("button", {
        name: "Entity menu"
    })).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await fireEvent.click(button);
    expect(runtime.ctx.contextMenus.active.getSnapshot()).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
});
it("recognizes marked elements, SVG descendants and text without treating unrelated or detached nodes as triggers", () => {
    const button = document.createElement("button");
    button.setAttribute("data-context-menu-trigger", "");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const text = document.createTextNode("More");
    button.append(svg, text);
    expect(isContextMenuTrigger(button)).toBe(true);
    expect(isContextMenuTrigger(svg)).toBe(true);
    expect(isContextMenuTrigger(text)).toBe(true);
    expect(isContextMenuTrigger(document.body)).toBe(false);
    expect(isContextMenuTrigger(document)).toBe(false);
    expect(isContextMenuTrigger(document.createTextNode("Detached"))).toBe(false);
});
