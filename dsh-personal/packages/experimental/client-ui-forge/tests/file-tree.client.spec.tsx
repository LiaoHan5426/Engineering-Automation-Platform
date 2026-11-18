import { defineComponent, h, shallowRef, nextTick, Teleport, type VNodeChild } from "vue";
// @vitest-environment jsdom
/** Changed-file directories, searching, and keyboard disclosure without reading repository contents. */
import { cleanupVue as cleanup, flushVue as act, renderVue as renderNative, } from "./vue-render.client.ts";
import { fireEvent as domFireEvent, within } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { makeTranslate } from "@deepseek-ai/dsh-client-test-runtime";
import type { ForgeDiffFile } from "../src/types.ts";
import { ChangedFiles, ChangedFilesMenu, type ChangedFilesState } from "../src/client/ChangedFiles.tsx";
import { changedFileTree, filesInTreeOrder, filterFileTree, viewedNodes } from "../src/client/file-tree.ts";
import { en } from "../src/client/locales.ts";
import { FileTreePane } from "../src/client/FileTreePane.tsx";
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
function file(path: string, previousPath: string | null = null): ForgeDiffFile {
    return {
        path,
        previousPath,
        status: previousPath === null ? "modified" : "renamed",
        binary: false,
        oversized: false,
        untracked: false,
        layer: "implementation",
        digest: "digest",
        additions: 1,
        deletions: 0,
        hunks: []
    };
}
it("compacts directory chains, sorts directories before files, and keeps identical basenames distinct", () => {
    const tree = changedFileTree([
        file("z.ts"),
        file("src/client/b.ts"),
        file("docs/a.ts"),
        file("src/client/a.ts")
    ]);
    expect(tree.map((node) => [
        node.kind, node.name
    ])).toEqual([
        [
            "directory",
            "docs"
        ],
        [
            "directory",
            "src/client"
        ],
        [
            "file",
            "z.ts"
        ]
    ]);
    expect(filesInTreeOrder(tree).map((file) => file.path)).toEqual([
        "docs/a.ts",
        "src/client/a.ts",
        "src/client/b.ts",
        "z.ts"
    ]);
    expect(filterFileTree(tree, "A.TS").map((node) => node.path)).toEqual([
        "docs",
        "src/client"
    ]);
    expect(filterFileTree(tree, " ")).toBe(tree);
    expect(filterFileTree(tree, "missing")).toEqual([]);
    expect(changedFileTree([])).toEqual([]);
    expect(filesInTreeOrder([])).toEqual([]);
});
it("finds the viewed files and the directories whose every file is viewed", () => {
    const tree = changedFileTree([
        file("z.ts"), file("src/client/b.ts"), file("src/client/a.ts"), file("src/server/c.ts"), file("docs/a.ts")
    ]);
    expect([
        ...viewedNodes(tree, new Set([
            "src/client/a.ts",
            "src/client/b.ts",
            "z.ts",
            "docs/missing.ts"
        ]))
    ].sort())
        .toEqual([
        "src/client",
        "src/client/a.ts",
        "src/client/b.ts",
        "z.ts"
    ]);
    expect([
        ...viewedNodes(tree, new Set([
            "src/client/a.ts",
            "src/client/b.ts",
            "src/server/c.ts"
        ]))
    ].sort())
        .toEqual([
        "src",
        "src/client",
        "src/client/a.ts",
        "src/client/b.ts",
        "src/server",
        "src/server/c.ts"
    ]);
    expect(viewedNodes(tree, new Set()).size).toBe(0);
});
it("draws viewed files and fully viewed directories subdued and says so to assistive technology", async () => {
    const files = [
        file("src/a.ts"), file("src/b.ts"), file("z.ts")
    ];
    const props = {
        files, t: makeTranslate(en), filter: vi.fn(), toggle: vi.fn(), jump: vi.fn(), state: {
            query: "", collapsed: {}, selected: null
        }
    };
    const view = await render(h(ChangedFiles, {
        ...props,
        viewed: new Set([
            "src/a.ts"
        ])
    }, undefined));
    const row = (path: string): HTMLElement => view.getByRole("button", {
        name: path
    });
    expect([
        row("src").hasAttribute("data-viewed"), row("src/a.ts").hasAttribute("data-viewed"), row("src/b.ts").hasAttribute("data-viewed")
    ])
        .toEqual([
        false, true, false
    ]);
    expect(row("src/a.ts").getAttribute("aria-description")).toBe(en["viewed.label"]);
    await view.rerender(h(ChangedFiles, {
        ...props,
        viewed: new Set([
            "src/a.ts",
            "src/b.ts"
        ])
    }, undefined));
    expect(row("src").getAttribute("aria-description")).toBe(en["viewed.directory"]);
    expect(row("z.ts").hasAttribute("aria-description")).toBe(false);
    await view.rerender(h(ChangedFiles, {
        ...props
    }, undefined));
    expect(view.container.querySelectorAll("[data-viewed]")).toHaveLength(0);
});
it("matches renamed paths and keeps file names containing backslashes literal", () => {
    const tree = changedFileTree([
        file("lib/new.ts", "src/old.ts"), file("a\\b.ts")
    ]);
    expect(filterFileTree(tree, "old.ts").map((node) => node.path)).toEqual([
        "lib"
    ]);
    expect(tree[1]).toMatchObject({
        kind: "file", path: "a\\b.ts"
    });
});
it("preserves input order for repeated paths with distinct file metadata", () => {
    const first = file("same.ts", "original.ts"), second = file("same.ts");
    expect(filesInTreeOrder(changedFileTree([
        file("z.ts"), first, file("a.ts"), second
    ]))).toEqual([
        file("a.ts"),
        first,
        second,
        file("z.ts")
    ]);
});
it("searches through folded directories and restores their fold state when search is cleared", async () => {
    const jump = vi.fn();
    const files = [
        file("src/a.ts"), file("src/b.ts"), file("README.md")
    ];
    const Harness = defineComponent(() => {
        const state = shallowRef<ChangedFilesState>({
            query: "", collapsed: {}, selected: null
        });
        const setState = (next: typeof state.value | ((previous: typeof state.value) => typeof state.value)) => {
            state.value = typeof next === "function" ? next(state.value) : next;
        };
        return () => h(ChangedFiles, {
            files: files,
            state: state.value,
            t: makeTranslate(en),
            jump: jump,
            filter: (query) => {
                setState((value) => ({
                    ...value, query
                }));
            },
            toggle: (path) => {
                setState((value) => ({
                    ...value,
                    collapsed: {
                        ...value.collapsed, [path]: !value.collapsed[path]
                    }
                }));
            }
        });
    });
    const view = await render(h(Harness, null));
    await fireEvent.keyDown(view.getByRole("button", {
        name: "src"
    }), {
        key: "ArrowRight"
    });
    await fireEvent.keyDown(view.getByRole("button", {
        name: "src"
    }), {
        key: "Enter"
    });
    await fireEvent.keyDown(view.getByRole("button", {
        name: "src/a.ts"
    }), {
        key: "ArrowLeft"
    });
    await fireEvent.click(view.getByRole("button", {
        name: "src"
    }));
    await fireEvent.click(view.getByRole("button", {
        name: "src"
    }));
    await fireEvent.keyDown(view.getByRole("button", {
        name: "src"
    }), {
        key: "ArrowLeft"
    });
    expect(view.queryByRole("button", {
        name: "src/a.ts"
    })).toBeNull();
    await fireEvent.input(view.getByRole("textbox"), {
        target: {
            value: "a.ts"
        }
    });
    await fireEvent.click(view.getByRole("button", {
        name: "src/a.ts"
    }));
    expect(jump).toHaveBeenCalledWith("src/a.ts");
    expect(view.queryByRole("button", {
        name: "README.md"
    })).toBeNull();
    await fireEvent.input(view.getByRole("textbox"), {
        target: {
            value: ""
        }
    });
    expect(view.queryByRole("button", {
        name: "src/a.ts"
    })).toBeNull();
    await fireEvent.keyDown(view.getByRole("button", {
        name: "src"
    }), {
        key: "ArrowRight"
    });
    expect(view.getByRole("button", {
        name: "src/a.ts"
    })).toBeTruthy();
    await fireEvent.input(view.getByRole("textbox"), {
        target: {
            value: "missing"
        }
    });
    expect(view.getByText("No matching files")).toBeTruthy();
});
it("keeps text-caret navigation in the filter while other keys bubble to the menu", async () => {
    const key = vi.fn();
    const view = await render(h("div", {
        onKeydown: key
    }, [
        h(ChangedFiles, {
            files: [
                file("new.ts", "old.ts")
            ],
            state: {
                query: "", collapsed: {}, selected: "new.ts"
            },
            t: makeTranslate(en),
            filter: vi.fn(),
            toggle: vi.fn(),
            jump: vi.fn()
        })
    ]));
    for (const name of [
        "Home",
        "End",
        "ArrowLeft",
        "ArrowRight"
    ])
        await fireEvent.keyDown(view.getByRole("textbox"), {
            key: name
        });
    expect(key).not.toHaveBeenCalled();
    await fireEvent.keyDown(view.getByRole("textbox"), {
        key: "ArrowDown"
    });
    expect(key).toHaveBeenCalledOnce();
    expect(view.getByRole("button").getAttribute("aria-current")).toBe("true");
});
it("centers the selected file on each menu opening and then follows selection steps by the least scroll", async () => {
    const files = [
        "a.ts",
        "b.ts",
        "c.ts",
        "d.ts",
        "e.ts",
        "f.ts",
        "g.ts",
        "h.ts",
        "i.ts",
        "j.ts"
    ].map((path) => file(path));
    // Layout: the rows show three 30px files from y = 100; each file moves up by the rows' scroll offset.
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(90);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const index = files.findIndex((item) => item.path === this.getAttribute("aria-label"));
        const scrolled = this.parentElement?.parentElement?.scrollTop ?? 0;
        return index < 0
            ? new DOMRect(0, 100, 200, 90)
            : new DOMRect(0, 100 + index * 30 - scrolled, 200, 30);
    });
    const rows = (): HTMLElement => document.querySelector<HTMLElement>("[data-forge-file-tree] > :last-child")!;
    const props = {
        files, t: makeTranslate(en), filter: vi.fn(), toggle: vi.fn(), jump: vi.fn()
    };
    const menu = await render(h(ChangedFilesMenu, {
        ...props,
        state: {
            query: "", collapsed: {}, selected: "f.ts"
        },
        visible: true
    }));
    const trigger = menu.getByRole("button", {
        name: "All 10 files"
    });
    for (const opening of [
        1, 2
    ]) {
        await fireEvent.click(trigger);
        // f.ts spans 250–280 and the view 100–190, so its middle moves to the view's middle.
        expect(rows().scrollTop, `opening ${opening}`).toBe(120);
        await fireEvent.click(trigger);
        expect(document.querySelector("[data-forge-file-tree]")).toBeNull();
    }
    await menu.rerender(h(ChangedFilesMenu, {
        ...props,
        state: {
            query: "", collapsed: {}, selected: "b.ts"
        },
        visible: true
    }));
    await fireEvent.click(trigger);
    expect(rows().scrollTop).toBe(0);
    menu.unmount();
    const pane = await render(h(ChangedFiles, {
        ...props, state: {
            query: "", collapsed: {}, selected: null
        }
    }));
    expect(rows().scrollTop).toBe(0);
    const select = async (selected: string) => {
        await pane.rerender(h(ChangedFiles, {
            ...props, state: {
                query: "", collapsed: {}, selected
            }
        }));
    };
    await select("h.ts");
    expect(rows().scrollTop).toBe(150);
    await select("a.ts");
    expect(rows().scrollTop).toBe(0);
    await select("c.ts");
    expect(rows().scrollTop).toBe(0);
    await select("h.ts");
    expect(rows().scrollTop).toBe(150);
    await pane.rerender(h(ChangedFiles, {
        ...props, state: {
            query: "ts", collapsed: {}, selected: "h.ts"
        }
    }));
    expect(rows().scrollTop).toBe(0);
    pane.unmount();
    // A navigation selects its file before the diff arrives; the rows then reveal it once they exist.
    const early = await render(h(ChangedFiles, {
        ...props, files: [], state: {
            query: "", collapsed: {}, selected: "h.ts"
        }
    }));
    expect(rows().scrollTop).toBe(0);
    await early.rerender(h(ChangedFiles, {
        ...props, state: {
            query: "", collapsed: {}, selected: "h.ts"
        }
    }));
    expect(rows().scrollTop).toBe(150);
    rows().scrollTop = 0;
    await early.rerender(h(ChangedFiles, {
        ...props,
        files: [
            ...files
        ],
        state: {
            query: "", collapsed: {}, selected: "h.ts"
        }
    }));
    expect(rows().scrollTop).toBe(0);
});
it("bounds pointer and keyboard resizing, retains hidden width, and stops cancelled drags", async () => {
    let containerWidth = 1000;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => containerWidth);
    let measure: ResizeObserverCallback = () => {
    };
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    // Capture the observer callback so a parent resize can be delivered without a layout engine.
    const NativeObserver = ResizeObserver;
    vi.stubGlobal("ResizeObserver", class extends NativeObserver {
        constructor(callback: ResizeObserverCallback) {
            super(callback);
            measure = callback;
        }
        override observe() {
        }
    });
    try {
        const props = {
            files: [
                file("a.ts")
            ],
            state: {
                query: "", collapsed: {}, selected: null
            },
            t: makeTranslate(en),
            filter: vi.fn(),
            toggle: vi.fn(),
            jump: vi.fn(),
            id: "tree",
            onWidth: vi.fn()
        };
        const view = await render(h(FileTreePane, {
            ...props, position: "right"
        }));
        const handle = view.getByRole("separator");
        const capture = vi.fn(), release = vi.fn();
        Object.defineProperties(handle, {
            setPointerCapture: {
                value: capture
            },
            releasePointerCapture: {
                value: release
            }
        });
        const width = () => Number(handle.getAttribute("aria-valuenow"));
        await fireEvent.keyDown(handle, {
            key: "Enter"
        });
        expect(width()).toBe(240);
        for (const [key, value] of [
            [
                "ArrowLeft",
                260
            ],
            [
                "ArrowRight",
                240
            ],
            [
                "Home",
                200
            ],
            [
                "End",
                600
            ]
        ] as const) {
            await fireEvent.keyDown(handle, {
                key
            });
            expect(width()).toBe(value);
        }
        await fireEvent.keyDown(handle, {
            key: "Home"
        });
        await fireEvent.pointerDown(handle, {
            button: 2, pointerId: 1, clientX: 500
        });
        expect(capture).not.toHaveBeenCalled();
        await fireEvent.pointerMove(handle, {
            pointerId: 1, clientX: 300
        });
        await fireEvent.pointerUp(handle, {
            pointerId: 1, clientX: 300
        });
        expect(width()).toBe(200);
        await fireEvent.pointerDown(handle, {
            button: 0, pointerId: 1, clientX: 500
        });
        await fireEvent.pointerMove(handle, {
            pointerId: 2, clientX: 300
        });
        expect(width()).toBe(200);
        await fireEvent.pointerMove(handle, {
            pointerId: 1, clientX: 400
        });
        expect(width()).toBe(300);
        await fireEvent.pointerUp(handle, {
            pointerId: 1, clientX: 350
        });
        expect(width()).toBe(350);
        expect(release).toHaveBeenCalledWith(1);
        for (const end of [
            async (...args: Parameters<typeof fireEvent.pointerCancel>) => await act(async () => await act(() => fireEvent.pointerCancel(...args))),
            async (...args: Parameters<typeof fireEvent.lostPointerCapture>) => await act(async () => await act(() => fireEvent.lostPointerCapture(...args)))
        ]) {
            await fireEvent.pointerDown(handle, {
                button: 0, pointerId: 1, clientX: 500
            });
            await end(handle, {
                pointerId: 1
            });
            await fireEvent.pointerMove(handle, {
                pointerId: 1, clientX: 300
            });
            expect(width()).toBe(350);
        }
        await view.rerender(h(FileTreePane, {
            ...props, position: "hidden"
        }));
        containerWidth = 0;
        await act(() => {
            measure([], new NativeObserver(() => {
            }));
        });
        expect(width()).toBe(350);
        containerWidth = 1000;
        await view.rerender(h(FileTreePane, {
            ...props, position: "right"
        }));
        await act(() => {
            measure([], new NativeObserver(() => {
            }));
        });
        expect(width()).toBe(350);
        await view.rerender(h(FileTreePane, {
            ...props, position: "left"
        }));
        expect(view.getByRole("separator")).toBe(handle);
        expect(width()).toBe(350);
        await fireEvent.keyDown(handle, {
            key: "ArrowRight"
        });
        expect(width()).toBe(370);
        await fireEvent.keyDown(handle, {
            key: "ArrowLeft"
        });
        expect(width()).toBe(350);
        await fireEvent.pointerDown(handle, {
            button: 0, pointerId: 1, clientX: 350
        });
        await fireEvent.pointerMove(handle, {
            pointerId: 1, clientX: 400
        });
        expect(width()).toBe(400);
        await fireEvent.pointerUp(handle, {
            pointerId: 1, clientX: 450
        });
        expect(width()).toBe(450);
        containerWidth = 600;
        await act(() => {
            measure([], new NativeObserver(() => {
            }));
        });
        expect(width()).toBe(280);
        view.unmount();
        expect(disconnect).toHaveBeenCalled();
    }
    finally {
        vi.unstubAllGlobals();
    }
});
it("keeps the width the cell above the tree needs as its least width", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 1000);
    const props = {
        files: [
            file("a.ts")
        ], state: {
            query: "", collapsed: {}, selected: null
        }, t: makeTranslate(en), filter: vi.fn(), toggle: vi.fn(), jump: vi.fn(), id: "tree", onWidth: vi.fn()
    };
    const view = await render(h(FileTreePane, {
        ...props,
        position: "left",
        least: 276
    }, undefined));
    const handle = view.getByRole("separator");
    expect([
        handle.getAttribute("aria-valuemin"), handle.getAttribute("aria-valuenow")
    ]).toEqual([
        "276",
        "276"
    ]);
    expect(props.onWidth).toHaveBeenLastCalledWith(276);
    await act(async () => await act(() => fireEvent.keyDown(handle, {
        key: "Home"
    })));
    expect(handle.getAttribute("aria-valuenow")).toBe("276");
    await view.rerender(h(FileTreePane, {
        ...props,
        position: "left",
        least: 150
    }, undefined));
    expect([
        handle.getAttribute("aria-valuemin"), handle.getAttribute("aria-valuenow")
    ]).toEqual([
        "200",
        "276"
    ]);
});
it("can mount into a detached fragment without measuring a nonexistent parent element", async () => {
    const observe = vi.spyOn(ResizeObserver.prototype, "observe");
    const view = await render(h(FileTreePane, {
        files: [],
        state: {
            query: "", collapsed: {}, selected: null
        },
        t: makeTranslate(en),
        filter: vi.fn(),
        toggle: vi.fn(),
        jump: vi.fn(),
        id: "detached-tree",
        position: "right",
        onWidth: vi.fn()
    }), {
        container: document.createDocumentFragment()
    });
    expect(observe).not.toHaveBeenCalled();
    view.unmount();
});
async function render(element: VNodeChild, options?: {
    container: DocumentFragment;
}) {
    const view = renderNative(options === undefined ? element : h(Teleport, {
        to: options.container
    }, [
        element
    ]));
    await nextTick();
    return { ...view, ...within(document.body) };
}
const fireEvent = {
    async keyDown(...args: Parameters<typeof domFireEvent.keyDown>) {
        await nextTick();
        const result = await domFireEvent.keyDown(...args);
        await nextTick();
        return result;
    },
    async click(...args: Parameters<typeof domFireEvent.click>) {
        await nextTick();
        const result = await domFireEvent.click(...args);
        await nextTick();
        return result;
    },
    async input(...args: Parameters<typeof domFireEvent.input>) {
        await nextTick();
        const result = await domFireEvent.input(...args);
        await nextTick();
        return result;
    },
    async pointerDown(...args: Parameters<typeof domFireEvent.pointerDown>) {
        await nextTick();
        const result = await domFireEvent.pointerDown(...args);
        await nextTick();
        return result;
    },
    async pointerMove(...args: Parameters<typeof domFireEvent.pointerMove>) {
        await nextTick();
        const result = await domFireEvent.pointerMove(...args);
        await nextTick();
        return result;
    },
    async pointerUp(...args: Parameters<typeof domFireEvent.pointerUp>) {
        await nextTick();
        const result = await domFireEvent.pointerUp(...args);
        await nextTick();
        return result;
    },
    async pointerCancel(...args: Parameters<typeof domFireEvent.pointerCancel>) {
        await nextTick();
        const result = await domFireEvent.pointerCancel(...args);
        await nextTick();
        return result;
    },
    async lostPointerCapture(...args: Parameters<typeof domFireEvent.lostPointerCapture>) {
        await nextTick();
        const result = await domFireEvent.lostPointerCapture(...args);
        await nextTick();
        return result;
    }
};
