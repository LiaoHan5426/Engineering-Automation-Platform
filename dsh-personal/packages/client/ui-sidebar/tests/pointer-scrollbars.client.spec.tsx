// @vitest-environment jsdom
import { h as vueH, shallowRef } from "vue";
import { contextMenuHook } from "@deepseek-ai/dsh-client-test-runtime";
/**
 * Pointer-revealed scrollbars, the shell's half: which class state the column
 * carries as the pointer crosses it. The stylesheet rule that state drives is
 * asserted in scrollbar-quiet-styles.spec.ts (node environment — a jsdom spec
 * has no file: module URL to read the sheet through).
 */
import type { GlobalStandardProps } from "@deepseek-ai/dsh-client-ui-slots";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fireEvent } from "@testing-library/dom";
import { cleanup, render } from "../../../test-support/client-runtime/src/vue-test.ts";
import { allowAllAccess } from "@deepseek-ai/dsh-client-test-runtime";
import type { SidebarRootComponentProps, SidebarSectionOwnerProps } from "../src/client/contract/slots.ts";
import { SidebarRoot } from "../src/client/SidebarRoot.tsx";
import { en } from "../src/client/locales.ts";
// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => {
    throw new Error("unused resource hook");
}) as GlobalStandardProps["useResource"];
const usePanelInfo: GlobalStandardProps["usePanelInfo"] = (selector) => shallowRef(selector({
    activePanelId: null
}));
/** Pinned column box; the shell compares pointer coordinates against it. */
const COLUMN_WIDTH = 280;
const COLUMN_HEIGHT = 600;
const t: SidebarRootComponentProps["t"] = (key) => (en as Record<string, string>)[key] ?? key;
/** The shell never reads the global hooks; the props share carries them regardless. */
const neverHook = (() => {
    throw new Error("shell must not read global hooks");
}) as never;
type AttentionSnapshot = Parameters<Parameters<SidebarRootComponentProps["useSessionStatus"]>[0]>[0];
const noAttention: AttentionSnapshot = new Map();
const useSessionStatus: SidebarRootComponentProps["useSessionStatus"] = (selector) => shallowRef(selector(noAttention));
afterEach(() => {
    cleanup();
});
/**
 * Render the shell and expose its column element.
 * @returns the column element and whether it currently carries the quiet state.
 */
function mountColumn(): {
    column: HTMLElement;
    quiet: () => boolean;
} {
    const view = render(vueH(SidebarRoot, {
        drawer: false,
        collapsed: false,
        width: 300,
        useSessions: neverHook,
        useSessionStatus: useSessionStatus,
        useSessionRetainInfo: neverHook,
        usePanelInfo: usePanelInfo,
        selectPanel: () => {
        },
        usePanels: (selector) => shallowRef(selector([])),
        useEntryPins: (selector) => shallowRef(selector([])),
        useEntryActions: (selector) => shallowRef(selector(false)),
        setPinned: vi.fn(),
        useShortcuts: (selector) => shallowRef(selector([])),
        useContextMenu: contextMenuHook(),
        useResource: useResource,
        useWorkspaces: neverHook,
        ...allowAllAccess,
        startSession: vi.fn(),
        toggleSidebar: vi.fn(),
        trackEntryClick: vi.fn(),
        t: t,
        renderFactorySlot: () => null,
        renderSlot: ((_key: string, owner: SidebarSectionOwnerProps) => vueH("div", {
            "data-testid": "region", "data-wide": owner.wide
        }, [])) as SidebarRootComponentProps["renderSlot"]
    }, {
        default: () => []
    }));
    const column = view.container.firstElementChild;
    if (!(column instanceof HTMLElement))
        throw new Error("sidebar column not rendered");
    // jsdom lays nothing out, and the leave decision is geometric: pin the box
    // the shell reads so a coordinate can be inside or outside it.
    Object.defineProperty(column, "getBoundingClientRect", {
        value: () => ({
            left: 0,
            top: 0,
            right: COLUMN_WIDTH,
            bottom: COLUMN_HEIGHT,
            x: 0,
            y: 0,
            width: COLUMN_WIDTH,
            height: COLUMN_HEIGHT,
            toJSON: () => ({})
        })
    });
    // CSS-module locals are hashed in this bench, so the state is read as a
    // substring of the class list rather than as an exact local name.
    return {
        column, quiet: () => [
            ...column.classList
        ].some((name) => name.includes("quietBars"))
    };
}
/**
 * Cross the pointer into or out of the column. React synthesizes
 * `pointerenter`/`pointerleave` from `pointerover`/`pointerout`, so the raw
 * enter and leave events it does not listen to would assert nothing.
 * @param column - the sidebar column element.
 * @param direction - `in` to enter the column, `out` to leave it.
 */
async function movePointer(column: HTMLElement, direction: "in" | "out") {
    const outside = document.body;
    if (direction === "in")
        await fireEvent.pointerEnter(column, {
            relatedTarget: outside, clientX: 40, clientY: 300
        });
    else
        await fireEvent.pointerLeave(column, {
            relatedTarget: outside, clientX: COLUMN_WIDTH + 40, clientY: 300
        });
}
/**
 * Move the pointer over a descendant of the column, as a pointer crossing a
 * fixed-position overlay rendered inside it does: the move bubbles to the
 * column without any leave.
 * @param target - the descendant the pointer is over.
 * @param x - client x coordinate.
 * @param y - client y coordinate.
 */
async function movePointerOver(target: Element, x: number, y: number): Promise<void> {
    await fireEvent.pointerMove(target, {
        clientX: x, clientY: y
    });
}
describe("SidebarRoot pointer-revealed scrollbars", () => {
    it("draws them only while the pointer is inside", async () => {
        const { column, quiet } = mountColumn();
        // At rest — the pointer has never been over the column — the bars are off.
        expect(quiet()).toBe(true);
        await movePointer(column, "in");
        expect(quiet()).toBe(false);
        // The quiet state applies on the leave itself; its stylesheet owns the
        // delay and fade (scrollbar-quiet-styles.client.spec.ts).
        await movePointer(column, "out");
        expect(quiet()).toBe(true);
        await movePointer(column, "in");
        expect(quiet()).toBe(false);
    });
    it("follows the column box while the pointer is over a descendant overlay", async () => {
        // ui-settings renders its full-viewport panel as a fixed-position
        // DESCENDANT of the column, so DOM containment reports the pointer as
        // still inside while it is visually somewhere else entirely.
        const { column, quiet } = mountColumn();
        const overlay = column.querySelector("[data-testid=\"region\"]");
        if (overlay === null)
            throw new Error("region not rendered");
        await movePointer(column, "in");
        await movePointerOver(overlay, COLUMN_WIDTH + 400, 300);
        expect(quiet()).toBe(true);
        await movePointerOver(overlay, COLUMN_WIDTH - 10, COLUMN_HEIGHT - 10);
        expect(quiet()).toBe(false);
        await movePointerOver(overlay, 10, COLUMN_HEIGHT + 10);
        expect(quiet()).toBe(true);
    });
});
