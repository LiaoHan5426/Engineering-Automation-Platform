// @vitest-environment jsdom
import {
  defineComponent,
  shallowRef,
  computed,
  watch,
  h as vueH,
  Fragment,
  onMounted,
  type VNodeChild,
} from "vue";
import {} from "../src/client/vue-observable.ts";

// @vitest-environment jsdom
/**
 * createVueSlotRenderer machinery account over a behavioral fake host: root
 * outlet + per-kind child outlets, standard-kit synthesis (renderSlot
 * binding, session pair, global useSessions, store pair), inject execution
 * point (inside component bodies, contained per entry) and parameter
 * derivation, and cache granularity (entry x scope key). Ledger semantics
 * (declaration conflicts, store instance accounting) belong to the renderer
 * SlotRegistry suite, not here.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, within } from "@testing-library/dom";
import { flushVue as act, renderVue } from "../../ui-primitives/tests/vue-render.ts";
function render(node: Parameters<typeof renderVue>[0]) {
  const view = renderVue(node);
  return { ...view, ...within(document.body) };
}
import { Context } from "@deepseek-ai/cordis";
import type { SessionReference } from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import {
  SlotOwnershipError,
  StaleAuthorizationError,
  type ActionsDecl,
  type SessionProviderComponent,
  type SlotEntryDef,
  type SlotSpec,
  type StoreHandle,
  type StoredEntry,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {
  RenderOpts,
  ScopedStandardSourceBinding,
  SlotRendererHost,
  SlotScopeAdapter,
  StandardSourceBinding,
  StoreInstanceLike,
} from "@deepseek-ai/dsh-client-ui-renderer/client";
import { createVueSlotRenderer } from "../src/client/vue/slots.ts";
type AnyProps = Record<string, unknown>;
type RenderSlotFn = (key: string, owner: object, opts?: RenderOpts) => VNodeChild;
type RenderSlotChainFn = (
  key: string,
  owner: object,
  opts?: {
    fallback?: VNodeChild;
    fallbackOnly?: boolean;
    overlay?: boolean;
  },
) => VNodeChild;
type DeclaredSpec = SlotSpec<SlotEntryDef>;
/** Entry literal helper: fake entries default the mandatory options bag. */
const entryOf = (
  partial: Omit<StoredEntry, "options"> & {
    options?: StoredEntry["options"];
  },
): StoredEntry => ({ options: {}, ...partial });
/**
 * Minimal store handle satisfying the StoreDecl contract shape (spec +
 * create(scopeKey?) + instance with clearPersisted): the machinery consumes
 * only the StoreInstanceLike face (bare snapshot source + baked actions),
 * but entry.store is typed to the full contract — the real defineStore lives
 * in client-store, which UI-renderer tests must not import (dependency direction).
 */
function miniStore<T extends object>(
  init: () => T,
  mutators: Record<string, (state: T, ...params: never[]) => T>,
): StoreHandle<T, ActionsDecl<T>> {
  return {
    spec: { init, actions: {} },
    create: () => {
      let state = init();
      const listeners = new Set<() => void>();
      const actions: Record<string, (...params: never[]) => void> = {};
      for (const key of Object.keys(mutators)) {
        actions[key] = (...params: never[]) => {
          state = mutators[key]!(state, ...params);
          for (const fn of [...listeners]) fn();
        };
      }
      return {
        getSnapshot: () => state,
        subscribe: (fn) => {
          listeners.add(fn);
          return () => {
            listeners.delete(fn);
          };
        },
        actions,
        clearPersisted: () => {},
      } as StoreInstanceLike as ReturnType<StoreHandle<T, ActionsDecl<T>>["create"]>;
    },
  };
}
function observable<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    set: (next: T) => {
      value = next;
      for (const fn of [...subs]) fn();
    },
  };
}
/**
 * Behavioral SlotRendererHost fake: registration mutates entries, bumps the
 * key version, and notifies synchronously (batching semantics belong to the
 * registry host, not this package's outlets). Store instances resolve through
 * the entry's real handle, cached per (entry x scope key) like the real
 * ledger; session bindings are identity-stable per id.
 */
function makeHost() {
  const entries = new Map<string, StoredEntry[]>();
  const specs = new Map<string, DeclaredSpec>();
  const versions = new Map<string, number>();
  const subs = new Map<string, Set<() => void>>();
  const live = new Set<StoredEntry>();
  const abdicated = new Set<StoredEntry>();
  const storeCache = new Map<StoredEntry, Map<string, StoreInstanceLike>>();
  const list = observable<{
    ids: string[];
  }>({ ids: [] });
  const workspaces = observable<{
    ids: string[];
  }>({ ids: [] });
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: { session: undefined },
    keyedHooks: {},
    props: { sessionId: undefined },
  };
  const absent = observable<StandardSourceBinding>(absentBinding);
  const currentBinding = observable<StandardSourceBinding>(absentBinding);
  const targets = new Map<string, SessionReference>();
  const bindingSources = new Map<string, ReturnType<typeof observable<StandardSourceBinding>>>();
  let currentId: string | undefined;
  const sessionSources = new Map<string, ReturnType<typeof observable<unknown>>>();
  const root = observable<StandardSourceBinding>({
    key: undefined,
    hooks: { sessions: list, workspaces },
    keyedHooks: {},
    props: {},
  });
  const sessionAdapter: SlotScopeAdapter = {
    current: currentBinding,
    bindingSource: (target) =>
      target === undefined ? absent : bindingSources.get(target.sessionId)!,
    renderArea: (binding, { empty, children }) =>
      binding.key === undefined
        ? vueH(Fragment, null, [empty?.() ?? null])
        : vueH(Fragment, null, [children]),
  };
  const scopeRevision = observable(0);
  let activeScopeAdapter = sessionAdapter;
  const rootRevision = shallowRef(0);
  const bump = (key: string) => {
    if (key === "root") rootRevision.value += 1;
    versions.set(key, (versions.get(key) ?? 0) + 1);
    for (const fn of [...(subs.get(key) ?? [])]) fn();
  };
  const host: SlotRendererHost = {
    subscribe: (key, fn) => {
      const set = subs.get(key) ?? new Set();
      set.add(fn);
      subs.set(key, set);
      return () => {
        set.delete(fn);
      };
    },
    getVersion: (key) => versions.get(key) ?? 0,
    entriesOf: (key) => entries.get(key) ?? [],
    entriesOfSlot: (key) => {
      const all = entries.get(key) ?? [];
      const kind = specs.get(key)?.kind;
      if (kind === "chain") return all;
      // Mirror the ledger projection: first live (non-abdicated) entry per
      // cell (single — one cell; keyed — per key; list — per id).
      const heads: StoredEntry[] = [];
      const seen = new Set<string | undefined>();
      for (const entry of all) {
        if (abdicated.has(entry)) continue;
        const cell =
          kind === "keyed" ? entry.options.key : kind === "list" ? entry.options.id : undefined;
        if (seen.has(cell)) continue;
        seen.add(cell);
        heads.push(entry);
      }
      return heads;
    },
    reportEntryError: (key, entry, _error, info) => {
      if (!info.abdicate || abdicated.has(entry)) return;
      abdicated.add(entry);
      bump(key);
    },
    reportFactoryError: () => {},
    specOf: (key) => (key === "root" ? { kind: "single", scope: "root" } : specs.get(key)),
    isLive: (entry) => live.has(entry),
    storeOf: (entry, scopeBinding) => {
      if (entry.store === undefined) return undefined;
      let perScope = storeCache.get(entry);
      if (!perScope) {
        perScope = new Map();
        storeCache.set(entry, perScope);
      }
      const cacheKey = scopeBinding?.key ?? "";
      let instance = perScope.get(cacheKey);
      if (!instance) {
        // Fake entries always carry engine handles (never factories), and the
        // engine create() takes the scope key (persist suffixing).
        const handle = entry.store as {
          create(scopeKey?: string): StoreInstanceLike;
        };
        instance = handle.create(scopeBinding?.key);
        perScope.set(cacheKey, instance);
      }
      return instance;
    },
    factoryStoreOf: () => undefined,
    retainFactoryOccurrence: () => () => {},
    subscribeFactory: () => () => {},
    getFactoryVersion: () => 0,
    factoryOf: () => undefined,
    isFactoryLive: () => false,
    root,
    scopeRevision,
    scope: () => activeScopeAdapter,
  };
  return {
    host,
    rootRevision,
    list,
    workspaces,
    current: {
      getSnapshot: () => (currentId === undefined ? undefined : targets.get(currentId)),
      set: (id: string | undefined) => {
        currentId = id;
        currentBinding.set(
          id === undefined
            ? absentBinding
            : (bindingSources.get(id)?.getSnapshot() ?? absentBinding),
        );
      },
    },
    declare: (key: string, spec: DeclaredSpec) => {
      specs.set(key, spec);
      bump(key);
    },
    add: (
      key: string,
      partial: Omit<StoredEntry, "options"> & {
        options?: StoredEntry["options"];
      },
    ) => {
      const entry = entryOf(partial);
      const next = [...(entries.get(key) ?? []), entry];
      // Mirror the ledger contract: entries arrive priority-sorted (stable,
      // ascending; list refines equal priorities by order) — outlets iterate
      // entries() order as-is.
      next.sort(
        specs.get(key)?.kind === "list"
          ? (a, b) =>
              (a.options.priority ?? 0) - (b.options.priority ?? 0) ||
              (a.options.order ?? 0) - (b.options.order ?? 0)
          : (a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0),
      );
      entries.set(key, next);
      live.add(entry);
      bump(key);
      return () => {
        entries.set(
          key,
          (entries.get(key) ?? []).filter((e) => e !== entry),
        );
        live.delete(entry);
        bump(key);
      };
    },
    addSession: (id: string, initial: unknown = { sid: id }): ScopedStandardSourceBinding => {
      // Bare source per binding (identity-stable): the machinery binds useSession from it.
      const session = observable<unknown>(initial);
      const binding: ScopedStandardSourceBinding = {
        key: id,
        ctx: new Context(),
        hooks: { session },
        keyedHooks: {},
        props: { sessionId: id },
      };
      sessionSources.set(id, session);
      targets.set(id, { sessionId: id } as SessionReference);
      bindingSources.set(id, observable<StandardSourceBinding>(binding));
      if (currentId === id) currentBinding.set(binding);
      return binding;
    },
    setSession: (id: string, snapshot: unknown) => {
      const source = sessionSources.get(id);
      if (source === undefined) throw new Error(`unknown test session: ${id}`);
      source.set(snapshot);
    },
    replaceScope: (adapter: SlotScopeAdapter) => {
      activeScopeAdapter = adapter;
      scopeRevision.set(scopeRevision.getSnapshot() + 1);
    },
  };
}
type Fake = ReturnType<typeof makeHost>;
/** Mount a root entry whose component renders `body` with its kit renderSlot. */
async function mountRoot(
  h: Fake,
  children: Record<string, DeclaredSpec>,
  body: (renderSlot: RenderSlotFn, SessionProvider: SessionProviderComponent) => VNodeChild,
) {
  const dispose = h.add("root", {
    component: (props: { renderSlot: RenderSlotFn; SessionProvider: SessionProviderComponent }) => (
      h.rootRevision.value,
      vueH(Fragment, null, [body(props.renderSlot, props.SessionProvider)])
    ),
    children,
  });
  const renderer = createVueSlotRenderer();
  const view = render(vueH(Fragment, null, [renderer.renderRoot(h.host, {})]));
  await act(() => {});
  return { view, dispose };
}
const SINGLE_ROOT: DeclaredSpec = { kind: "single", scope: "root" };
const SINGLE_SESSION: DeclaredSpec = { kind: "single", scope: "session" };
const CHAIN_ROOT: DeclaredSpec = { kind: "chain", scope: "root" };
const CHAIN_SESSION: DeclaredSpec = { kind: "chain", scope: "session" };
/** Chain entry literal: top-level select, priority in the options bag (the StoredEntry chain shape). */
const chainEntryOf = (partial: {
  component: unknown;
  select: (owner: object) => unknown;
  priority?: number;
}): Omit<StoredEntry, "options"> & {
  options?: StoredEntry["options"];
} => ({
  component: partial.component,
  select: partial.select,
  ...(partial.priority !== undefined ? { options: { priority: partial.priority } } : {}),
});
/** Mount a root entry whose component renders `body` with its kit renderSlotChain. */
async function mountChainRoot(
  h: Fake,
  children: Record<string, DeclaredSpec>,
  body: (renderSlotChain: RenderSlotChainFn, Provider: SessionProviderComponent) => VNodeChild,
) {
  const dispose = h.add("root", {
    component: (props: {
      renderSlotChain: RenderSlotChainFn;
      SessionProvider: SessionProviderComponent;
    }) => (
      h.rootRevision.value,
      vueH(Fragment, null, [body(props.renderSlotChain, props.SessionProvider)])
    ),
    children,
  });
  const renderer = createVueSlotRenderer();
  const view = render(vueH(Fragment, null, [renderer.renderRoot(h.host, {})]));
  await act(() => {});
  return { view, dispose };
}
describe("root outlet", () => {
  it("renders the root registration and fails loud when root is unregistered (boot order)", async () => {
    const h = makeHost();
    h.add("root", { component: () => vueH("b", null, ["shell"]) });
    const renderer = createVueSlotRenderer();
    const view = render(vueH(Fragment, null, [renderer.renderRoot(h.host, {})]));
    await act(() => {});
    expect(view.container.textContent).toBe("shell");
    const empty = makeHost();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(empty.host, {})])),
    ).toThrow(/boot order/);
    spy.mockRestore();
  });
  it("passes renderRoot owner props into the root component", async () => {
    const h = makeHost();
    h.add("root", { component: ({ tag }: { tag?: string }) => vueH("b", null, [tag]) });
    const view = render(
      vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, { tag: "OWNER" })]),
    );
    await act(() => {});
    expect(view.container.textContent).toBe("OWNER");
  });
});
describe("child outlets and the renderSlot binding", () => {
  it("renders declared single slots live: fallback when empty, register, dispose back", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", {}, { fallback: vueH("i", null, ["none"]) }),
    );
    expect(view.container.textContent).toBe("none");
    let dispose = () => {};
    await act(() => {
      dispose = h.add("k.single", { component: () => vueH("b", null, ["SB"]) });
    });
    expect(view.container.textContent).toBe("SB");
    await act(() => {
      dispose();
    });
    expect(view.container.textContent).toBe("none");
  });
  it("renders an undeclared key as empty (declaring entry unloaded = natural blank, not a crash)", async () => {
    const h = makeHost();
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      vueH("main", null, [renderSlot("k.single", {}, { fallback: vueH("i", null, ["fb"]) })]),
    );
    // Declared by children (authorization) but absent from the ledger (specOf
    // undefined): the outlet renders nothing, not even the fallback path's spec dispatch.
    expect(view.container.querySelector("main")!.textContent).toBe("");
  });
  it("orders list entries, honors only-filter, dispatches keyed entries by entryKey", async () => {
    const h = makeHost();
    h.declare("k.list", { kind: "list", scope: "root" });
    h.declare("k.keyed", { kind: "keyed", scope: "root" });
    h.add("k.list", { component: () => vueH("span", null, ["b"]), options: { id: "b", order: 2 } });
    h.add("k.list", { component: () => vueH("span", null, ["a"]), options: { id: "a", order: 1 } });
    h.add("k.keyed", { component: () => vueH("span", null, ["goal"]), options: { key: "goal" } });
    const children = {
      "k.list": { kind: "list", scope: "root" } as DeclaredSpec,
      "k.keyed": { kind: "keyed", scope: "root" } as DeclaredSpec,
    };
    const { view } = await mountRoot(h, children, (renderSlot) =>
      vueH(Fragment, null, [
        vueH("main", null, [renderSlot("k.list", {})]),
        vueH("aside", null, [renderSlot("k.list", {}, { only: "b" })]),
        vueH("nav", null, [renderSlot("k.keyed", {}, { entryKey: "goal" })]),
        vueH("footer", null, [
          renderSlot("k.keyed", {}, { entryKey: "nope", fallback: vueH("i", null, ["fb"]) }),
        ]),
      ]),
    );
    expect(view.container.querySelector("main")!.textContent).toBe("ab");
    expect(view.container.querySelector("aside")!.textContent).toBe("b");
    expect(view.container.querySelector("nav")!.textContent).toBe("goal");
    expect(view.container.querySelector("footer")!.textContent).toBe("fb");
  });
  it("keeps the binding identity-stable across re-renders and throws SlotOwnershipError off-declaration", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const seen: RenderSlotFn[] = [];
    await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) => {
      seen.push(renderSlot);
      return renderSlot("k.single", {});
    });
    // Bump the 'root' key to force a root-entry re-render (the single-kind
    // outlet only reads entries[0], so the extra entry is inert).
    await act(() => {
      h.add("root", { component: () => null });
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(seen[0]);
    expect(() => seen[0]!("k.undeclared", {})).toThrow(SlotOwnershipError);
  });
  it("isolates a crashing entry without collapsing siblings", async () => {
    const h = makeHost();
    h.declare("k.list", { kind: "list", scope: "root" });
    h.add("k.list", {
      component: () => {
        throw new Error("entry boom");
      },
      options: { id: "bad", order: 1 },
    });
    h.add("k.list", {
      component: () => vueH("span", null, ["alive"]),
      options: { id: "ok", order: 2 },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { view } = await mountRoot(
      h,
      { "k.list": { kind: "list", scope: "root" } },
      (renderSlot) => renderSlot("k.list", {}),
    );
    spy.mockRestore();
    expect(view.container.textContent).toBe("alive");
    expect(view.container.querySelector("[data-slot-error]")).not.toBeNull();
  });
});
describe("chain outlets and the renderSlotChain binding", () => {
  it("elects the first non-null selector in order, injects matched, and skips decliners without mounting them", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    const declinerBody = vi.fn(() => vueH("span", null, ["never"]));
    h.add(
      "k.chain",
      chainEntryOf({
        component: declinerBody,
        select: () => null,
      }),
    );
    h.add(
      "k.chain",
      chainEntryOf({
        component: ({
          matched,
        }: {
          matched?: {
            label: string;
          };
        }) => vueH("b", null, [matched?.label]),
        select: (owner) => ({
          label: `hit:${
            (
              owner as {
                tag: string;
              }
            ).tag
          }`,
        }),
      }),
    );
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", { tag: "T" }),
    );
    // The declining entry never mounts: the routing decision is select-layer only.
    expect(view.container.textContent).toBe("hit:T");
    expect(declinerBody).not.toHaveBeenCalled();
  });
  it("contains a throwing selector to its entry: reported, treated as declined, chain and fallback intact", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("span", null, ["never"]),
        select: () => {
          throw new Error("selector boom");
        },
      }),
    );
    h.add(
      "k.chain",
      chainEntryOf({
        component: ({ matched }: { matched?: string }) => vueH("b", null, [matched]),
        select: (owner) =>
          (
            owner as {
              pick?: string;
            }
          ).pick ?? null,
      }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      vueH(Fragment, null, [
        vueH("main", null, [renderSlotChain("k.chain", { pick: "OK" })]),
        vueH("aside", null, [
          renderSlotChain("k.chain", {}, { fallback: vueH("i", null, ["fb"]) }),
        ]),
      ]),
    );
    // The breach never escapes to the owner region: later entries still get
    // tried, and an all-throw/all-null pass still lands on the fallback.
    expect(view.container.querySelector("main")!.textContent).toBe("OK");
    expect(view.container.querySelector("aside")!.textContent).toBe("fb");
    expect(spy.mock.calls.some(([msg]) => String(msg).includes("chain selector crashed"))).toBe(
      true,
    );
    spy.mockRestore();
  });
  it("remounts the boundary on re-election: a failed entry does not black out its replacement", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => {
          throw new Error("entry A boom");
        },
        select: (owner) =>
          (
            owner as {
              pick?: string;
            }
          ).pick === "A"
            ? {}
            : null,
      }),
    );
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["B-ok"]),
        select: (owner) =>
          (
            owner as {
              pick?: string;
            }
          ).pick === "B"
            ? {}
            : null,
      }),
    );
    let pick = "A";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", { pick }),
    );
    spy.mockRestore();
    expect(view.container.querySelector("[data-slot-error]")).not.toBeNull();
    // Re-elect entry B: the entry-keyed boundary remounts fresh instead of
    // holding A's failed state over the healthy replacement.
    pick = "B";
    await act(() => {
      h.add("root", { component: () => null });
    }); // root bump re-renders the dispatch site
    expect(view.container.textContent).toBe("B-ok");
    expect(view.container.querySelector("[data-slot-error]")).toBeNull();
  });
  it("falls to the owner fallback when every selector declines, and re-routes live", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.add(
      "k.chain",
      chainEntryOf({
        component: ({ matched }: { matched?: string }) => vueH("b", null, [matched]),
        select: (owner) =>
          (
            owner as {
              pick?: string;
            }
          ).pick ?? null,
      }),
    );
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      vueH(Fragment, null, [
        vueH("main", null, [
          renderSlotChain("k.chain", {}, { fallback: vueH("i", null, ["bar"]) }),
        ]),
        vueH("aside", null, [
          renderSlotChain("k.chain", { pick: "P" }, { fallback: vueH("i", null, ["bar"]) }),
        ]),
      ]),
    );
    // Same chain, two dispatch sites: all-null owner props fall back, matching ones elect.
    expect(view.container.querySelector("main")!.textContent).toBe("bar");
    expect(view.container.querySelector("aside")!.textContent).toBe("P");
  });
  it("renders the fallback for an empty chain and elects live once an entry registers", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", {}, { fallback: vueH("i", null, ["none"]) }),
    );
    expect(view.container.textContent).toBe("none");
    let dispose = () => {};
    await act(() => {
      dispose = h.add(
        "k.chain",
        chainEntryOf({
          component: () => vueH("b", null, ["IN"]),
          select: () => ({}),
        }),
      );
    });
    expect(view.container.textContent).toBe("IN");
    await act(() => {
      dispose();
    });
    expect(view.container.textContent).toBe("none");
  });
  it("orders the chain by ascending priority with registration sequence breaking ties", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    // Registered first but priority 2: must yield to the later priority-1 entry.
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["late"]),
        select: () => ({}),
        priority: 2,
      }),
    );
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["early"]),
        select: () => ({}),
        priority: 1,
      }),
    );
    // Tie pair at priority 1: registration order decides (early wins over tie).
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["tie"]),
        select: () => ({}),
        priority: 1,
      }),
    );
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", {}),
    );
    expect(view.container.textContent).toBe("early");
  });
  it("keeps the renderSlotChain binding identity-stable across re-renders", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    const seen: RenderSlotChainFn[] = [];
    await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) => {
      seen.push(renderSlotChain);
      return renderSlotChain("k.chain", {}, { fallback: vueH("i", null, ["fb"]) });
    });
    await act(() => {
      h.add("root", { component: () => null });
    }); // root bump re-renders the entry
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(seen[0]);
  });
  it("backstops off-declaration keys, kind mismatches both ways, and disposed registrations", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.declare("k.single", SINGLE_ROOT);
    let chainFn: RenderSlotChainFn | undefined;
    let slotFn: RenderSlotFn | undefined;
    const dispose = h.add("root", {
      component: (props: { renderSlot: RenderSlotFn; renderSlotChain: RenderSlotChainFn }) => {
        slotFn = props.renderSlot;
        chainFn = props.renderSlotChain;
        return null;
      },
      children: { "k.chain": CHAIN_ROOT, "k.single": SINGLE_ROOT },
    });
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    await act(() => {});
    expect(() => chainFn!("k.undeclared", {})).toThrow(SlotOwnershipError);
    expect(() => chainFn!("k.single", {})).toThrow(SlotOwnershipError); // non-chain key via chain face
    expect(() => slotFn!("k.chain", {})).toThrow(SlotOwnershipError); // chain key via plain face
    view.unmount();
    dispose();
    expect(() => chainFn!("k.chain", {})).toThrow(StaleAuthorizationError);
  });
  it("withholds the renderSlotChain seat from entries declaring no chain child", () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const seen: AnyProps[] = [];
    h.add("root", {
      component: (props: AnyProps) => {
        seen.push(props);
        return null;
      },
      children: { "k.single": SINGLE_ROOT },
    });
    render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    expect(seen.at(-1)!["renderSlotChain"]).toBeUndefined();
  });
});
describe("overlay chains (ChainRenderOpts.overlay)", () => {
  /** Fallback probe: counts mounts and holds uncontrolled DOM state (the
   *  composer-draft stand-in an unmount would wipe). */
  function fallbackProbe(onMount: () => void) {
    return defineComponent(
      (_props: {}) => {
        onMounted(() =>
          watch(
            () => [],
            (_value, _previous, onCleanup) => {
              const cleanup = onMount();
              if (typeof cleanup === "function") onCleanup(cleanup);
            },
            { immediate: true, flush: "post" },
          ),
        );
        return () =>
          vueH("input", {
            "aria-label": "probe",
            defaultValue: "",
          });
      },
      {
        props: [],
        inheritAttrs: false,
      },
    );
  }
  it("keeps the fallback mounted and state-holding through a takeover, hidden then restored", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["TAKEOVER"]),
        select: (owner) =>
          (
            owner as {
              take?: boolean;
            }
          ).take
            ? {}
            : null,
      }),
    );
    const mounted = vi.fn();
    const Probe = fallbackProbe(mounted);
    let take = false;
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", { take }, { fallback: vueH(Probe, null), overlay: true }),
    );
    const wrapper = () =>
      view.container.querySelector<HTMLElement>('[data-chain-overlay-fallback="k.chain"]')!;
    const input = () =>
      view.container.querySelector<HTMLInputElement>('input[aria-label="probe"]')!;
    // Resident phase: fallback visible through the layout-neutral wrapper.
    expect(wrapper().style.display).toBe("contents");
    await fireEvent.change(input(), { target: { value: "draft-in-flight" } });
    // Election: entry overlays, fallback hides in place — same DOM node, no remount.
    take = true;
    await act(() => {
      h.add("root", { component: () => null });
    }); // root bump re-renders the dispatch site
    expect(view.container.textContent).toContain("TAKEOVER");
    expect(wrapper().style.display).toBe("none");
    expect(input().value).toBe("draft-in-flight");
    // Takeover ends: fallback shows again with its state intact, still the original mount.
    take = false;
    await act(() => {
      h.add("root", { component: () => null });
    });
    expect(view.container.textContent).not.toContain("TAKEOVER");
    expect(wrapper().style.display).toBe("contents");
    expect(input().value).toBe("draft-in-flight");
    expect(mounted).toHaveBeenCalledTimes(1);
  });
  it("keeps an explicit fallback-only strict chain mounted until its Session scope exists", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_SESSION);
    h.addSession("s1");
    const select = vi.fn(() => null);
    h.add("k.chain", chainEntryOf({ component: () => vueH("b", null, ["never"]), select }));
    let fallbackOnly = true;
    const { view } = await mountChainRoot(
      h,
      { "k.chain": CHAIN_SESSION },
      (renderSlotChain, Provider) => {
        const content = renderSlotChain(
          "k.chain",
          {},
          {
            fallback: vueH("input", {
              "aria-label": "resident",
            }),
            fallbackOnly,
            overlay: true,
          },
        );
        return vueH(
          Provider,
          {
            session: h.current.getSnapshot(),
            empty: () => content,
          },
          {
            default: () => [content],
          },
        );
      },
    );
    const input = view.getByRole("textbox", { name: "resident" });
    expect(select).not.toHaveBeenCalled();
    fallbackOnly = false;
    await act(() => {
      h.current.set("s1");
      h.add("root", { component: () => null });
    });
    expect(view.getByRole("textbox", { name: "resident" })).toBe(input);
    expect(select).toHaveBeenCalledOnce();
  });
  it("leaves non-overlay chains on the unmount path: a takeover discards fallback state", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["TAKEOVER"]),
        select: (owner) =>
          (
            owner as {
              take?: boolean;
            }
          ).take
            ? {}
            : null,
      }),
    );
    const mounted = vi.fn();
    const Probe = fallbackProbe(mounted);
    let take = false;
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", { take }, { fallback: vueH(Probe, null) }),
    );
    await fireEvent.change(view.container.querySelector('input[aria-label="probe"]')!, {
      target: { value: "gone" },
    });
    expect(view.container.querySelector("[data-chain-overlay-fallback]")).toBeNull();
    take = true;
    await act(() => {
      h.add("root", { component: () => null });
    });
    expect(view.container.querySelector('input[aria-label="probe"]')).toBeNull(); // unmounted
    take = false;
    await act(() => {
      h.add("root", { component: () => null });
    });
    const remounted = view.container.querySelector<HTMLInputElement>('input[aria-label="probe"]')!;
    expect(remounted.value).toBe(""); // fresh mount, state discarded
    expect(mounted).toHaveBeenCalledTimes(2);
  });
  it("keeps election semantics under overlay: priority order, selector-crash decline, live dispose back to fallback", async () => {
    const h = makeHost();
    h.declare("k.chain", CHAIN_ROOT);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("span", null, ["never"]),
        select: () => {
          throw new Error("selector boom");
        },
        priority: 1,
      }),
    );
    const dispose = h.add(
      "k.chain",
      chainEntryOf({
        component: () => vueH("b", null, ["ELECTED"]),
        select: () => ({}),
        priority: 2,
      }),
    );
    const { view } = await mountChainRoot(h, { "k.chain": CHAIN_ROOT }, (renderSlotChain) =>
      renderSlotChain("k.chain", {}, { fallback: vueH("i", null, ["resident"]), overlay: true }),
    );
    expect(view.container.textContent).toContain("ELECTED");
    expect(spy.mock.calls.some(([msg]) => String(msg).includes("chain selector crashed"))).toBe(
      true,
    );
    spy.mockRestore();
    await act(() => {
      dispose();
    });
    const wrapper = view.container.querySelector<HTMLElement>(
      '[data-chain-overlay-fallback="k.chain"]',
    )!;
    expect(wrapper.style.display).toBe("contents");
    expect(view.container.textContent).toBe("resident");
  });
});
describe("standard-kit synthesis", () => {
  it("delivers a live useSessions hook to every slot component", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    h.add("k.single", {
      component: defineComponent(
        (props: {
          useSessions: <S>(
            select: (value: { ids: string[] }) => S,
          ) => Readonly<import("vue").Ref<S>>;
        }) => {
          const count = props.useSessions((value) => value.ids.length);
          return () => vueH("b", null, count.value);
        },
        { props: ["useSessions"], inheritAttrs: false },
      ),
    });
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", {}),
    );
    expect(view.container.textContent).toBe("0");
    await act(() => {
      h.list.set({ ids: ["a", "b"] });
    });
    expect(view.container.textContent).toBe("2");
  });
  it("delivers a live useWorkspaces hook to every slot component", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    h.add("k.single", {
      component: defineComponent(
        (props: {
          useWorkspaces: <S>(
            select: (value: { ids: string[] }) => S,
          ) => Readonly<import("vue").Ref<S>>;
        }) => {
          const count = props.useWorkspaces((value) => value.ids.length);
          return () => vueH("b", null, count.value);
        },
        { props: ["useWorkspaces"], inheritAttrs: false },
      ),
    });
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", {}),
    );
    expect(view.container.textContent).toBe("0");
    await act(() => {
      h.workspaces.set({ ids: ["w1"] });
    });
    expect(view.container.textContent).toBe("1");
  });
  it("delivers the session pair (bound useSession + sessionId) under SessionProvider", async () => {
    const h = makeHost();
    h.declare("k.session", SINGLE_SESSION);
    h.addSession("s1");
    const seen: AnyProps[] = [];
    h.add("k.session", {
      component: defineComponent(
        (props: {
          useSession: <S>(select: (value: { sid: string }) => S) => Readonly<import("vue").Ref<S>>;
          sessionId?: string;
        }) => {
          const read = props.useSession((value) => value.sid);
          return () => {
            seen.push({ ...props, read: read.value });
            return null;
          };
        },
        { props: ["useSession", "sessionId"], inheritAttrs: false },
      ),
    });
    await mountRoot(h, { "k.session": SINGLE_SESSION }, (renderSlot, SessionProvider) =>
      vueH(
        SessionProvider,
        {
          empty: () => vueH("i", null, ["empty"]),
        },
        {
          default: () => [renderSlot("k.session", {})],
        },
      ),
    );
    await act(() => {
      h.current.set("s1");
    });
    const props = seen.at(-1)!;
    // The hook is BOUND by the machinery from the cell's bare source: it
    // reads the source's snapshot and stays identity-stable across renders
    // (per-source cache), which the switch-back cache tests cover.
    expect(props["read"]).toBe("s1");
    expect(props["sessionId"]).toBe("s1");
  });
  it("binds only function-valued inject hooks to the standard kit and render occurrence context", async () => {
    const h = makeHost();
    const turnDataFactory = vi.fn((standard: AnyProps, turn: unknown) => (key: string) => {
      const useSession = standard["useSession"] as (
        select: (snapshot: unknown) => unknown,
      ) => Readonly<import("vue").Ref<unknown>>;
      return useSession(
        (snapshot) =>
          (snapshot as { turns: Record<number, Record<string, unknown>> }).turns[turn as number]?.[
            key
          ],
      );
    });
    const sessionSpec: DeclaredSpec = {
      kind: "single",
      scope: "session",
      inject: { hooks: { turnData: turnDataFactory } },
    };
    h.declare("k.session", sessionSpec);
    h.addSession("s1", {
      turns: { 1: { tail: "one" }, 2: { tail: "two" } },
      unrelated: 0,
    });
    const hooks = new Map<string, Array<(key: string) => unknown>>();
    let renders = 0;
    h.add("k.session", {
      component: defineComponent(
        (props: {
          label: string;
          useTurnData: (key: string) => Readonly<import("vue").Ref<unknown>>;
        }) => {
          const tail = props.useTurnData("tail");
          return () => {
            renders += 1;
            const seen = hooks.get(props.label) ?? [];
            seen.push(props.useTurnData);
            hooks.set(props.label, seen);
            return vueH("b", { "data-turn": props.label }, String(tail.value));
          };
        },
        { props: ["label", "useTurnData"], inheritAttrs: false },
      ),
    });
    const { view } = await mountRoot(
      h,
      { "k.session": sessionSpec },
      (renderSlot, SessionProvider) =>
        vueH(SessionProvider, null, {
          default: () => [
            vueH(Fragment, null, [
              renderSlot("k.session", { label: "one" }, { hookContext: 1 }),
              renderSlot("k.session", { label: "two" }, { hookContext: 2 }),
            ]),
          ],
        }),
    );
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("onetwo");
    expect(renders).toBe(2);
    // A session publication whose selected contextual value is identical is
    // filtered by the framework-bound selector.
    await act(() => {
      h.setSession("s1", {
        turns: { 1: { tail: "one" }, 2: { tail: "two" } },
        unrelated: 1,
      });
    });
    expect(renders).toBe(2);
    // Updating the selected contextual value re-renders through the returned
    // custom Hook; the factory itself and its Hook identity stay stable.
    await act(() => {
      h.setSession("s1", {
        turns: { 1: { tail: "updated" }, 2: { tail: "two" } },
        unrelated: 1,
      });
    });
    expect(view.container.textContent).toBe("updatedtwo");
    expect(renders).toBe(3);
    expect(hooks.get("one")![1]).toBe(hooks.get("one")![0]);
    expect(hooks.get("two")).toHaveLength(1);
    expect(hooks.get("one")![0]).not.toBe(hooks.get("two")![0]);
    expect(turnDataFactory).toHaveBeenCalledTimes(2);
  });
  it("hands the SessionProvider seat to entries declaring a session-scope child", async () => {
    const h = makeHost();
    h.declare("k.session", SINGLE_SESSION);
    h.declare("k.single", SINGLE_ROOT);
    h.addSession("s1");
    h.current.set("s1");
    h.add("k.session", {
      component: ({ sessionId }: { sessionId?: string }) => vueH("b", null, [sessionId]),
    });
    const rootSeen: AnyProps[] = [];
    // Root entry uses its INJECTED provider seat (no value import of SessionProvider).
    h.add("root", {
      component: (props: AnyProps) => {
        rootSeen.push(props);
        const Provider = props["SessionProvider"] as SessionProviderComponent;
        const renderSlot = props["renderSlot"] as RenderSlotFn;
        return vueH(
          Provider,
          {
            session: h.current.getSnapshot(),
            empty: () => vueH("i", null, ["empty"]),
          },
          {
            default: () => [renderSlot("k.session", {})],
          },
        );
      },
      children: { "k.session": SINGLE_SESSION },
    });
    const view = render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h.host, {})]));
    await act(() => {});
    expect(view.container.textContent).toBe("s1");
    // Entries whose children are all root-scope get no provider seat.
    const h2 = makeHost();
    h2.declare("k.single", SINGLE_ROOT);
    const seen2: AnyProps[] = [];
    h2.add("root", {
      component: (props: AnyProps) => {
        seen2.push(props);
        return null;
      },
      children: { "k.single": SINGLE_ROOT },
    });
    render(vueH(Fragment, null, [createVueSlotRenderer().renderRoot(h2.host, {})]));
    expect(seen2.at(-1)!["SessionProvider"]).toBeUndefined();
  });
  it("fails loud for a strict session slot while no session is current", async () => {
    const h = makeHost();
    h.declare("k.session", SINGLE_SESSION);
    h.add("k.session", { component: () => vueH("b", null, ["x"]) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      mountRoot(h, { "k.session": SINGLE_SESSION }, (renderSlot) => renderSlot("k.session", {})),
    ).rejects.toThrow("strict session slot 'k.session' rendered without a scope binding");
    spy.mockRestore();
  });
  it("delivers the store pair for store-declaring entries and writes through baked actions", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const handle = miniStore(() => ({ n: 0 }), { inc: (s) => ({ n: s.n + 1 }) });
    let bump = () => {};
    h.add("k.single", {
      component: defineComponent(
        (props: {
          useStore: <S>(sel: (s: { n: number }) => S) => Readonly<import("vue").ShallowRef<S>>;
          actions: {
            inc: () => void;
          };
        }) => {
          const useStore = computed(() => props.useStore);
          const actions = computed(() => props.actions);
          bump = actions.value.inc;
          const hookValue1 = useStore.value((s) => s.n);
          return () => vueH("b", null, [hookValue1.value]);
        },
        {
          props: ["useStore", "actions"],
          inheritAttrs: false,
        },
      ),
      store: handle,
    });
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", {}),
    );
    expect(view.container.textContent).toBe("0");
    await act(() => {
      bump();
    });
    expect(view.container.textContent).toBe("1");
  });
  it("resolves session-slot stores per scope key: values survive a switch-away and back", async () => {
    const h = makeHost();
    h.declare("k.session", SINGLE_SESSION);
    h.addSession("s1");
    h.addSession("s2");
    const handle = miniStore(() => ({ draft: "" }), {
      setDraft: (_s, text: string) => ({ draft: text }),
    });
    let setDraft: (text: string) => void = () => {};
    h.add("k.session", {
      component: defineComponent(
        (props: {
          useStore: <S>(sel: (s: { draft: string }) => S) => Readonly<import("vue").ShallowRef<S>>;
          actions: {
            setDraft: (text: string) => void;
          };
        }) => {
          const useStore = computed(() => props.useStore);
          const actions = computed(() => props.actions);
          setDraft = actions.value.setDraft;
          const hookValue1 = useStore.value((s) => s.draft);
          return () => vueH("b", null, [hookValue1.value || "(blank)"]);
        },
        {
          props: ["useStore", "actions"],
          inheritAttrs: false,
        },
      ),
      store: handle,
    });
    const { view } = await mountRoot(
      h,
      { "k.session": SINGLE_SESSION },
      (renderSlot, SessionProvider) =>
        vueH(SessionProvider, null, {
          default: () => [renderSlot("k.session", {})],
        }),
    );
    await act(() => {
      h.current.set("s1");
    });
    await act(() => {
      setDraft("draft-one");
    });
    expect(view.container.textContent).toBe("draft-one");
    await act(() => {
      h.current.set("s2");
    });
    expect(view.container.textContent).toBe("(blank)"); // distinct instance per session
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("draft-one"); // same scope key = same instance
  });
});
describe("inject: execution point, parameter derivation, cache granularity", () => {
  it("root inject runs once per entry with no arguments (no store declared)", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const inject = vi.fn(() => ({ tag: "FROM-INJECT" }));
    h.add("k.single", { component: ({ tag }: { tag?: string }) => vueH("b", null, [tag]), inject });
    const { view } = await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", {}),
    );
    expect(view.container.textContent).toBe("FROM-INJECT");
    await act(() => {
      h.add("k.single", { component: () => null });
    }); // sibling bump re-renders the outlet
    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenCalledWith();
  });
  it("binds the inject hooks compartment into use<Name> selector hooks (sources never reach the component)", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const badge = observable("cold");
    const seen: Record<string, unknown>[] = [];
    h.add("k.single", {
      component: defineComponent(
        (props: {
          useBadge: <S>(select: (value: string) => S) => Readonly<import("vue").Ref<S>>;
          hooks?: unknown;
          plain?: string;
        }) => {
          const read = props.useBadge((value) => value);
          return () => {
            seen.push({ hooks: props.hooks, plain: props.plain, read: read.value });
            return null;
          };
        },
        { props: ["useBadge", "hooks", "plain"], inheritAttrs: false },
      ),
      inject: () => ({ plain: "kept", hooks: { badge } }),
    });
    await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) => renderSlot("k.single", {}));
    // The raw compartment is consumed by the binding; the plain member passes through.
    expect(seen.at(-1)).toEqual({ hooks: undefined, plain: "kept", read: "cold" });
    await act(() => {
      badge.set("hot");
    });
    expect(seen.at(-1)!["read"]).toBe("hot");
  });
  it("binds the inject keyedHooks compartment without exposing source resolvers", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const badges = new Map([
      ["first", observable("cold")],
      ["second", observable("idle")],
    ]);
    const seen: Record<string, unknown>[] = [];
    h.add("k.single", {
      component: defineComponent(
        (props: {
          useBadge: (key: string) => Readonly<import("vue").Ref<string | undefined>>;
          keyedHooks?: unknown;
          plain?: string;
        }) => {
          const read = props.useBadge("first");
          return () => {
            seen.push({ keyedHooks: props.keyedHooks, plain: props.plain, read: read.value });
            return null;
          };
        },
        { props: ["useBadge", "keyedHooks", "plain"], inheritAttrs: false },
      ),
      inject: () => ({
        plain: "kept",
        keyedHooks: { badge: (key: string) => badges.get(key) },
      }),
    });
    await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) => renderSlot("k.single", {}));
    expect(seen.at(-1)).toEqual({ keyedHooks: undefined, plain: "kept", read: "cold" });
    await act(() => {
      badges.get("second")!.set("ignored");
    });
    expect(seen).toHaveLength(1);
    await act(() => {
      badges.get("first")!.set("hot");
    });
    expect(seen.at(-1)!["read"]).toBe("hot");
  });
  it("session inject receives sessionId and caches per (entry x session): switch-back reuses", async () => {
    const h = makeHost();
    h.declare("k.session", SINGLE_SESSION);
    h.addSession("s1");
    h.addSession("s2");
    const inject = vi.fn((sessionId: string) => ({ sid: sessionId }));
    h.add("k.session", {
      component: ({ sid }: { sid?: string }) => vueH("b", null, [sid]),
      inject: inject,
    });
    const { view } = await mountRoot(
      h,
      { "k.session": SINGLE_SESSION },
      (renderSlot, SessionProvider) =>
        vueH(SessionProvider, null, {
          default: () => [renderSlot("k.session", {})],
        }),
    );
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("s1");
    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenLastCalledWith("s1");
    await act(() => {
      h.current.set("s2");
    });
    expect(view.container.textContent).toBe("s2");
    expect(inject).toHaveBeenCalledTimes(2);
    await act(() => {
      h.current.set("s1");
    }); // back: (entry x cell) cache hit
    expect(view.container.textContent).toBe("s1");
    expect(inject).toHaveBeenCalledTimes(2);
  });
  it("store-declaring entries get baked actions appended to the inject parameters", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    h.declare("k.session", SINGLE_SESSION);
    h.addSession("s1");
    const handle = miniStore(() => ({ n: 0 }), { inc: (s) => ({ n: s.n + 1 }) });
    const rootInject = vi.fn((actions: { inc: () => void }) => ({ viaRoot: actions }));
    const sessionInject = vi.fn(
      (
        sessionId: string,
        actions: {
          inc: () => void;
        },
      ) => ({ sid: sessionId, viaSession: actions }),
    );
    const seenRoot: AnyProps[] = [];
    const seenSession: AnyProps[] = [];
    h.add("k.single", {
      component: (props: object) => {
        seenRoot.push(props as AnyProps);
        return null;
      },
      inject: rootInject,
      store: handle,
    });
    h.add("k.session", {
      component: (props: object) => {
        seenSession.push(props as AnyProps);
        return null;
      },
      inject: sessionInject,
      store: handle,
    });
    await mountRoot(
      h,
      { "k.single": SINGLE_ROOT, "k.session": SINGLE_SESSION },
      (renderSlot, SessionProvider) =>
        vueH(Fragment, null, [
          renderSlot("k.single", {}),
          vueH(SessionProvider, null, {
            default: () => [renderSlot("k.session", {})],
          }),
        ]),
    );
    await act(() => {
      h.current.set("s1");
    });
    // The inject-received actions are the same baked callbacks the component
    // gets as props.actions (one instance per entry x scope key).
    expect(rootInject).toHaveBeenCalledTimes(1);
    expect(seenRoot.at(-1)!["viaRoot"]).toBe(seenRoot.at(-1)!["actions"]);
    expect(sessionInject).toHaveBeenCalledTimes(1);
    expect(sessionInject.mock.calls[0]![0]).toBe("s1");
    expect(seenSession.at(-1)!["viaSession"]).toBe(seenSession.at(-1)!["actions"]);
  });
  it("contains a throwing inject factory to its own entry (runs inside the component body)", async () => {
    const h = makeHost();
    h.declare("k.list", { kind: "list", scope: "root" });
    h.add("k.list", {
      component: () => vueH("span", null, ["never"]),
      options: { id: "bad", order: 1 },
      inject: () => {
        throw new Error("inject boom");
      },
    });
    h.add("k.list", {
      component: () => vueH("span", null, ["alive"]),
      options: { id: "ok", order: 2 },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { view } = await mountRoot(
      h,
      { "k.list": { kind: "list", scope: "root" } },
      (renderSlot) => vueH("main", null, [renderSlot("k.list", {})]),
    );
    spy.mockRestore();
    // The failing entry blacks out alone; the sibling and the tree above survive.
    expect(view.container.querySelector("main")).not.toBeNull();
    expect(view.container.textContent).toBe("alive");
    expect(view.container.querySelector("[data-slot-error]")).not.toBeNull();
  });
  it("merges kit, inject, and owner props with owner winning", async () => {
    const h = makeHost();
    h.declare("k.single", SINGLE_ROOT);
    const seen: AnyProps[] = [];
    h.add("k.single", {
      component: (props: object) => {
        seen.push(props as AnyProps);
        return null;
      },
      inject: () => ({ fromInject: "inject", shared: "inject" }),
    });
    await mountRoot(h, { "k.single": SINGLE_ROOT }, (renderSlot) =>
      renderSlot("k.single", { owner: "owner", shared: "owner" }),
    );
    const props = seen.at(-1)!;
    expect(typeof props["useSessions"]).toBe("function"); // kit always present
    expect(typeof props["useWorkspaces"]).toBe("function");
    expect(props["fromInject"]).toBe("inject");
    expect(props["owner"]).toBe("owner");
    expect(props["shared"]).toBe("owner"); // owner overrides inject
  });
});
describe("session-maybe adoption identity", () => {
  const SINGLE_MAYBE: DeclaredSpec = { kind: "single", scope: "session-maybe" };
  /** Mount a maybe entry that records its mount count and local state. */
  async function mountMaybeCounter(h: Fake) {
    let mounts = 0;
    const seen: {
      sessionId: string | undefined;
      mount: number;
    }[] = [];
    h.declare("k.maybe", SINGLE_MAYBE);
    h.add("k.maybe", {
      component: defineComponent(
        (props: { sessionId?: string }) => {
          const sessionId = computed(() => props.sessionId);
          const mount = ++mounts;
          seen.push({ sessionId: sessionId.value, mount });
          return () => vueH("b", null, [`${sessionId.value ?? "blank"}#${mount}`]);
        },
        {
          props: ["sessionId"],
          inheritAttrs: false,
        },
      ),
    });
    const { view } = await mountRoot(h, { "k.maybe": SINGLE_MAYBE }, (renderSlot) =>
      renderSlot("k.maybe", {}),
    );
    return { view, seen };
  }
  it("adopts the first session: blank → first id keeps the incarnation (no remount)", async () => {
    const h = makeHost();
    h.addSession("s1");
    const { view } = await mountMaybeCounter(h);
    expect(view.container.textContent).toBe("blank#1");
    await act(() => {
      h.current.set("s1");
    });
    // Same incarnation (#1): the blank shell adopted s1.
    expect(view.container.textContent).toBe("s1#1");
  });
  it("remounts on a post-adoption session switch (local state must not leak across sessions)", async () => {
    const h = makeHost();
    h.addSession("s1");
    h.addSession("s2");
    const { view } = await mountMaybeCounter(h);
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("s1#1");
    await act(() => {
      h.current.set("s2");
    });
    // New incarnation (#2): strict-session behavior after adoption.
    expect(view.container.textContent).toBe("s2#2");
  });
  it("remounts into a fresh blank incarnation on session loss, then adopts anew", async () => {
    const h = makeHost();
    h.addSession("s1");
    h.addSession("s2");
    const { view } = await mountMaybeCounter(h);
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("s1#1");
    await act(() => {
      h.current.set(undefined);
    });
    // The adopted incarnation dies with its session; blank state is fresh.
    expect(view.container.textContent).toBe("blank#2");
    await act(() => {
      h.current.set("s2");
    });
    // The fresh blank adopts again — still incarnation #2, no flash.
    expect(view.container.textContent).toBe("s2#2");
  });
  it("keeps the incarnation across a no-op republish of the same session", async () => {
    const h = makeHost();
    h.addSession("s1");
    const { view } = await mountMaybeCounter(h);
    await act(() => {
      h.current.set("s1");
    });
    await act(() => {
      h.current.set("s1");
    });
    expect(view.container.textContent).toBe("s1#1");
  });
  it("rebinds mounted scope consumers when the installed adapter changes", async () => {
    const h = makeHost();
    const { view } = await mountMaybeCounter(h);
    expect(view.container.textContent).toBe("blank#1");
    const binding: ScopedStandardSourceBinding = {
      key: "replacement",
      ctx: new Context(),
      hooks: { session: observable({ sid: "replacement" }) },
      keyedHooks: {},
      props: { sessionId: "replacement" },
    };
    await act(() => {
      const source = observable<StandardSourceBinding>(binding);
      h.replaceScope({
        current: source,
        bindingSource: () => source,
        renderArea: (_binding, { children }) => vueH(Fragment, null, [children]),
      });
    });
    expect(view.container.textContent).toBe("replacement#1");
  });
});
