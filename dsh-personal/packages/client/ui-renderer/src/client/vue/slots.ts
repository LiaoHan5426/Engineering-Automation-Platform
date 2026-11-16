/** Native Vue outlets over the existing slot ledger and store lifecycle. */
import {
  computed,
  camelize,
  Fragment,
  getCurrentInstance,
  h,
  inject,
  onBeforeUpdate,
  onBeforeUnmount,
  onErrorCaptured,
  onMounted,
  onScopeDispose,
  provide,
  shallowRef,
  useAttrs,
  useSlots,
  type Component,
  type InjectionKey,
  type Ref,
  type VNodeChild,
} from "vue";
import {
  SlotOwnershipError,
  StaleAuthorizationError,
  standardHookPropName,
  type ScopedStandardSourceBinding,
  type SlotRenderer,
  type SlotRendererHost,
  type StandardSourceBinding,
  type StoredEntry,
  type StoredFactory,
  type SlotScope,
  type SessionAreaProps,
} from "@deepseek-ai/dsh-client-ui-slots";
import { SlotAssemblyError } from "../errors.ts";
import { useObservableSelector } from "../vue-observable.ts";
import { defineSlotComponent } from "./components.ts";
import { bindSources, contextualSeat, keyedSeat, selectorSeat } from "./seats.ts";

type Face = Record<string, unknown>;
type Owner = StoredEntry | StoredFactory;

/** Keep framework capabilities out of native fallthrough attrs; caller attrs stay native. */
function componentInputPicker() {
  // Metadata belongs to this mounted occurrence, just like its other renderer caches.
  const cache = new WeakMap<object, { props: Set<string>; emits: Set<string> }>();
  return (component: Component, framework: Face, caller: object): Face => {
    let options: unknown = component;
    if (typeof component === "function") {
      // Functional components receive their complete input directly. Vue already
      // restricts their automatic fallthrough to class, style and event listeners.
      if (!("__vccOpts" in component)) return { ...framework, ...caller };
      options = component.__vccOpts;
    }
    let declared = cache.get(component);
    if (declared === undefined) {
      const inputs = { props: new Set<string>(), emits: new Set<string>() };
      const visited = new Set<object>();
      const collect = (value: unknown): void => {
        if (typeof value !== "object" || value === null || visited.has(value)) return;
        visited.add(value);
        if ("extends" in value) collect(value.extends);
        if ("mixins" in value && Array.isArray(value.mixins)) {
          for (const mixin of value.mixins) collect(mixin);
        }
        if ("props" in value) {
          const props = value.props;
          const names = Array.isArray(props)
            ? props
            : typeof props === "object" && props !== null
              ? Object.keys(props)
              : [];
          for (const name of names) if (typeof name === "string") inputs.props.add(camelize(name));
        }
        if ("emits" in value) {
          const emits = value.emits;
          const names = Array.isArray(emits)
            ? emits
            : typeof emits === "object" && emits !== null
              ? Object.keys(emits)
              : [];
          for (const name of names) if (typeof name === "string") inputs.emits.add(name);
        }
      };
      collect(options);
      declared = inputs;
      cache.set(component, declared);
    }
    const selected: Face = {};
    for (const [key, value] of Object.entries(framework)) {
      let accepted = declared.props.has(camelize(key));
      if (!accepted && /^on[^a-z]/.test(key)) {
        const event = key.slice(2).replace(/Once$/, "");
        accepted =
          declared.emits.has(event) ||
          declared.emits.has(event.replace(/\B([A-Z])/g, "-$1").toLowerCase()) ||
          declared.emits.has(event.charAt(0).toLowerCase() + event.slice(1));
      }
      if (accepted) selected[key] = value;
    }
    return { ...selected, ...caller };
  };
}
interface Tree {
  host: SlotRendererHost;
  contentErrors: Set<unknown>;
  resolveInject: (
    owner: Owner,
    binding: StandardSourceBinding | undefined,
    actions: unknown,
  ) => Face;
  keyOf: (identity: object) => number;
  localeRevision: Readonly<Ref<number | undefined>>;
  root: Readonly<Ref<StandardSourceBinding | undefined>>;
  scope: Readonly<Ref<StandardSourceBinding | undefined>>;
}
const treeKey: InjectionKey<Tree> = Symbol("vue slot tree");
interface Occurrence {
  definition: StoredFactory;
  caller: Owner;
  selected: Readonly<Ref<Readonly<Record<string, Component>>>>;
  registration: Readonly<Ref<Face>>;
}
const occurrenceKey: InjectionKey<Occurrence> = Symbol("vue factory occurrence");
const ancestryKey: InjectionKey<Readonly<Ref<ReadonlySet<string>>>> =
  Symbol("vue factory ancestry");

function tree(): Tree {
  const value = inject(treeKey);
  if (value === undefined)
    throw new SlotAssemblyError("slot machinery rendered outside the installed renderer tree");
  return value;
}
function scoped(value: StandardSourceBinding | undefined): ScopedStandardSourceBinding | undefined {
  return value?.key === undefined ? undefined : (value as ScopedStandardSourceBinding);
}
function live(host: SlotRendererHost, owner: Owner): boolean {
  return "name" in owner ? host.isFactoryLive(owner) : host.isLive(owner);
}

const Boundary = defineSlotComponent<{
  name: string;
  report: (error: unknown) => void;
  body: () => VNodeChild;
  factory?: boolean;
  hoc?: boolean;
  inline?: boolean;
  crashed?: () => VNodeChild;
}>(["name", "report", "body", "factory", "hoc", "inline", "crashed"], (props) => {
  const value = tree();
  const failed = shallowRef(false);
  let releasing = false;
  onBeforeUnmount(() => {
    releasing = true;
  });
  onErrorCaptured((error) => {
    if (
      releasing ||
      error instanceof SlotAssemblyError ||
      (props.hoc && value.contentErrors.has(error))
    )
      return;
    value.contentErrors.delete(error);
    failed.value = true;
    props.report(error);
    return false;
  });
  return () =>
    failed.value
      ? props.crashed === undefined
        ? h(props.inline ? "span" : "div", {
            [props.factory ? "data-factory-error" : "data-slot-error"]: props.name,
          })
        : props.crashed()
      : props.body();
});

const SessionProvider = defineSlotComponent<{
  session?: SessionAreaProps["session"];
  children?: VNodeChild;
  empty?: () => VNodeChild;
}>(["session", "children", "empty"], (props) => {
  const children = useSlots();
  const inherited = tree();
  const instance = getCurrentInstance();
  const updates = shallowRef(0);
  onBeforeUpdate(() => {
    updates.value += 1;
  });
  const explicit = computed(() => {
    void updates.value;
    void props.session;
    return Object.hasOwn(instance?.vnode.props ?? {}, "session");
  });
  const roster = useObservableSelector(
    () => inherited.host.scopeRevision,
    () => (value) => value,
  );
  const target = useObservableSelector(
    () => {
      void roster.value;
      const adapter = inherited.host.scope("session");
      if (adapter === undefined)
        throw new SlotAssemblyError("session provider has no scope adapter");
      return adapter.bindingSource(props.session);
    },
    () => (value) => value,
  );
  const binding = computed(() => (explicit.value ? target.value : inherited.scope.value));
  provide(treeKey, { ...inherited, scope: binding });
  return () => {
    void roster.value;
    const adapter = inherited.host.scope("session");
    if (adapter?.renderArea === undefined || binding.value === undefined)
      throw new SlotAssemblyError("scope 'session' adapter does not provide its area renderer");
    const group = (content: VNodeChild) =>
      h(Fragment, null, Array.isArray(content) ? content : [content]);
    return adapter.renderArea(binding.value, {
      children: group(props.children ?? children.default?.() ?? null),
      ...(props.empty === undefined ? {} : { empty: () => group(props.empty?.()) }),
    });
  };
});

/** One mutable scope identity, with blank-to-first-session adoption. */
function incarnation(scope: Readonly<Ref<StandardSourceBinding | undefined>>): () => object {
  let adopted: object | undefined;
  let epoch: object = {};
  return () => {
    const identity = scoped(scope.value)?.ctx;
    if (adopted === undefined && identity !== undefined) adopted = identity;
    else if (adopted !== undefined && identity !== adopted) {
      adopted = identity;
      epoch = {};
    }
    return epoch;
  };
}

function sourcesKit(value: Tree, optional = false): Readonly<Ref<Face>> {
  const fixed = new Map<string, ReturnType<typeof selectorSeat>>();
  const keyed = new Map<string, ReturnType<typeof keyedSeat>>();
  return computed(() => {
    const kit: Face = {};
    const names = new Set([
      ...Object.keys(value.root.value?.hooks ?? {}),
      ...Object.keys(value.scope.value?.hooks ?? {}),
    ]);
    for (const name of names) {
      let seat = fixed.get(name);
      if (seat === undefined) {
        seat = selectorSeat(() => {
          const binding = value.scope.value;
          const owned = binding !== undefined && Object.hasOwn(binding.hooks, name);
          const rootOwned = Object.hasOwn(value.root.value?.hooks ?? {}, name);
          const source = owned ? binding.hooks[name] : value.root.value?.hooks[name];
          if (source === undefined && (owned ? !optional && binding.key !== undefined : rootOwned))
            throw new SlotAssemblyError(`strict standard hook '${name}' has no source`);
          return source;
        });
        fixed.set(name, seat);
      }
      kit[standardHookPropName(name)] = seat;
    }
    const keyedNames = new Set([
      ...Object.keys(value.root.value?.keyedHooks ?? {}),
      ...Object.keys(value.scope.value?.keyedHooks ?? {}),
    ]);
    for (const name of keyedNames) {
      let seat = keyed.get(name);
      if (seat === undefined) {
        seat = keyedSeat(
          () => {
            const binding = value.scope.value;
            const owned = binding !== undefined && Object.hasOwn(binding.keyedHooks, name);
            const rootOwned = Object.hasOwn(value.root.value?.keyedHooks ?? {}, name);
            const source = owned ? binding.keyedHooks[name] : value.root.value?.keyedHooks[name];
            if (
              source === undefined &&
              (owned ? !optional && binding.key !== undefined : rootOwned)
            )
              throw new SlotAssemblyError(
                `strict keyed standard hook '${name}' has no source resolver`,
              );
            return source;
          },
          () => value.scope.value?.key,
        );
        keyed.set(name, seat);
      }
      kit[standardHookPropName(name)] = seat;
    }
    return kit;
  });
}

function renderingKit(value: Tree, owner: Owner): Face {
  const { host } = value;
  if (
    Object.values(owner.children ?? {}).some((spec) => spec.scope !== "root") &&
    host.scope("session")?.renderArea === undefined
  ) {
    throw new SlotAssemblyError("scope 'session' adapter does not provide its area renderer");
  }
  const renderSlot = (key: string, input: object, options?: Options): VNodeChild => {
    if (!live(host, owner))
      throw new StaleAuthorizationError(
        `renderSlot('${key}') from a disposed ${"scope" in owner ? "Factory" : "registration"}`,
      );
    const declaration = owner.children?.[key];
    if (declaration === undefined)
      throw new SlotOwnershipError(`slot '${key}' is not declared by this registration`);
    if (declaration.kind === "chain")
      throw new SlotOwnershipError(`slot '${key}' is chain-kind — use renderSlotChain`);
    return h(Outlet, {
      name: key,
      input,
      ...(options === undefined ? {} : { options }),
      inline: declaration.inline === true,
    });
  };
  return {
    ...(owner.children === undefined ? {} : { renderSlot }),
    ...(Object.values(owner.children ?? {}).some((spec) => spec.kind === "chain")
      ? {
          renderSlotChain: (key: string, input: object, options?: Options) => {
            if (!live(host, owner))
              throw new StaleAuthorizationError(
                `renderSlotChain('${key}') from a disposed ${"scope" in owner ? "Factory" : "registration"}`,
              );
            if (owner.children?.[key]?.kind !== "chain")
              throw new SlotOwnershipError(`slot '${key}' is not 'chain'`);
            return h(Outlet, {
              name: key,
              input,
              ...(options === undefined ? {} : { options }),
              inline: owner.children[key]?.inline === true,
            });
          },
        }
      : {}),
    renderFactorySlot: (name: string, input: object, options?: FactoryOptions) => {
      if (!live(host, owner))
        throw new StaleAuthorizationError(
          `renderFactorySlot('${name}') from a disposed ${"scope" in owner ? "Factory" : "registration"}`,
        );
      return h(FactoryOutlet, {
        name,
        input,
        ...(options === undefined ? {} : { options }),
        caller: owner,
      });
    },
    ...(Object.values(owner.children ?? {}).some((spec) => spec.scope !== "root")
      ? { SessionProvider }
      : {}),
  };
}

function injected(
  owner: Owner,
  binding: StandardSourceBinding | undefined,
  actions: unknown,
): Face {
  if (owner.inject === undefined) return {};
  const args: never[] = [];
  if (binding !== undefined) args.push(binding.key as never);
  if (actions !== undefined) args.push(actions as never);
  return owner.inject(...args);
}

const Entry = defineSlotComponent<{
  owner: Owner;
  input: object;
  scope: SlotScope;
  slotName?: string;
  options?: Options;
  factory?: boolean;
  caller?: Owner;
  selected?: Readonly<Record<string, Component>>;
  hocContent?: () => VNodeChild;
}>(
  ["owner", "input", "scope", "slotName", "options", "factory", "caller", "selected", "hocContent"],
  (props) => {
    const inherited = tree();
    const host = inherited.host;
    const owner = props.owner;
    const pickInput = componentInputPicker();
    const scope = props.scope;
    // Registry withdrawal is immediate; Vue removes the resident occurrence in
    // its next commit. Publications in that interval must not resolve dead owners.
    const binding = computed(() =>
      scope === "root" || !live(host, owner) ? undefined : inherited.scope.value,
    );
    const occurrence = {};
    const store = computed(() => {
      if (!live(host, owner)) return undefined;
      return props.factory
        ? host.factoryStoreOf(owner as StoredFactory, scoped(binding.value), occurrence)
        : host.storeOf(owner as StoredEntry, scoped(binding.value));
    });
    if (props.factory) {
      let release: (() => void) | undefined;
      onMounted(() => {
        release = host.retainFactoryOccurrence(owner as StoredFactory, occurrence);
      });
      onScopeDispose(() => {
        release?.();
      });
    }
    const entryTree =
      scope === "root" ? { ...inherited, scope: computed(() => undefined) } : inherited;
    const seats = sourcesKit(entryTree, scope === "session-maybe");
    const render = renderingKit(inherited, owner);
    const face = computed(() =>
      live(host, owner) ? inherited.resolveInject(owner, binding.value, store.value?.actions) : {},
    );
    const injectSeats = bindSources(
      () => face.value,
      () => binding.value?.key,
    );
    const standard = computed(() => ({
      ...inherited.root.value?.props,
      ...(scope === "root" ? {} : binding.value?.props),
      ...seats.value,
    }));
    const storeSeat = selectorSeat(() => store.value);
    const registration = computed(() => {
      if (!live(host, owner)) return {};
      const { hooks: _hooks, keyedHooks: _keyed, ...plain } = face.value;
      let locale: Face = {};
      if (owner.locale !== undefined) {
        void inherited.localeRevision.value;
        const provider = host.locale;
        if (provider === undefined)
          throw new SlotAssemblyError(
            `entry declares locale namespace '${owner.locale}' but no locale face is installed`,
          );
        const bound = provider.bind(owner.locale);
        locale = { t: (...args: Parameters<typeof bound>) => bound(...args) };
      }
      return {
        ...render,
        ...locale,
        ...(store.value === undefined ? {} : { actions: store.value.actions, useStore: storeSeat }),
        ...plain,
        ...injectSeats.value,
      };
    });
    const slotFace = computed(() =>
      props.slotName === undefined ? {} : ((host.specOf(props.slotName)?.inject ?? {}) as Face),
    );
    const bareSlotFace = computed(() => {
      const hooks = Object.fromEntries(
        Object.entries((slotFace.value["hooks"] ?? {}) as Face).filter(
          ([, source]) => typeof source !== "function",
        ),
      );
      return { ...slotFace.value, hooks };
    });
    const slotSeats = bindSources(
      () => bareSlotFace.value,
      () => binding.value?.key,
    );
    const contextualCache = new Map<string, ReturnType<typeof contextualSeat>>();
    const contextualSeats = computed(() => {
      const seats: Face = {};
      for (const [name, definition] of Object.entries((slotFace.value["hooks"] ?? {}) as Face)) {
        if (typeof definition !== "function") continue;
        let seat = contextualCache.get(name);
        if (seat === undefined) {
          seat = contextualSeat(
            () =>
              (
                (slotFace.value["hooks"] ?? {}) as Record<
                  string,
                  (standard: Face, context: unknown) => unknown
                >
              )[name]!,
            () => standard.value,
            () => {
              if (props.options === undefined || !Object.hasOwn(props.options, "hookContext"))
                throw new SlotAssemblyError(
                  `slot '${props.slotName}' has contextual injected Hooks but no hookContext`,
                );
              return props.options.hookContext;
            },
          );
          contextualCache.set(name, seat);
        }
        seats[standardHookPropName(name)] = seat;
      }
      return seats;
    });
    const kit = computed(() => {
      const { hooks: _hooks, keyedHooks: _keyed, ...plain } = slotFace.value;
      return {
        ...standard.value,
        ...registration.value,
        ...plain,
        ...slotSeats.value,
        ...contextualSeats.value,
      };
    });
    if (props.factory) {
      provide(occurrenceKey, {
        definition: owner as StoredFactory,
        caller: props.caller ?? owner,
        selected: computed(() => props.selected ?? {}),
        registration,
      });
    }
    return () => {
      if (!live(host, owner)) return null;
      if (scope === "session" && binding.value?.key === undefined)
        throw new SlotAssemblyError("strict session entry rendered without a scope binding");
      if (props.factory) {
        for (const name of Object.keys(props.input)) {
          if (name in kit.value || name === "useFactorySlot")
            throw new SlotAssemblyError(`factory received duplicate prop '${name}'`);
        }
      }
      return h(
        owner.component as Component,
        pickInput(
          owner.component as Component,
          { ...kit.value, ...(props.factory ? { useFactorySlot } : {}) },
          props.input,
        ),
        props.hocContent === undefined ? undefined : { default: props.hocContent },
      );
    };
  },
);

function useFactorySlot(name: string, fallback: Component): Component {
  const occurrence = inject(occurrenceKey);
  if (occurrence === undefined)
    throw new SlotAssemblyError("useFactorySlot() called outside a Factory occurrence");
  const value = tree();
  if (!value.host.isFactoryLive(occurrence.definition))
    throw new StaleAuthorizationError(`useFactorySlot('${name}') from a disposed Factory`);
  const declaration = occurrence.definition.slots?.[name];
  if (declaration === undefined) throw new SlotOwnershipError(`undeclared local slot '${name}'`);
  return defineSlotComponent<Face>([], (_props) => {
    const local = tree();
    const active = inject(occurrenceKey);
    if (active === undefined || active.definition !== occurrence.definition)
      throw new SlotOwnershipError(`local slot '${name}' rendered outside its defining Factory`);
    const attrs = useAttrs();
    const pickInput = componentInputPicker();
    const localSeats = sourcesKit(
      declaration.scope === "root" ? { ...local, scope: computed(() => undefined) } : local,
      declaration.scope === "session-maybe",
    );
    const fallbackFactory = renderingKit(local, active.definition)["renderFactorySlot"];
    const selectedFactory = renderingKit(local, active.caller)["renderFactorySlot"];
    const epoch = incarnation(local.scope);
    return () => {
      if (!value.host.isFactoryLive(active.definition))
        throw new StaleAuthorizationError(`local slot '${name}' from disposed Factory`);
      const binding = declaration.scope === "root" ? undefined : local.scope.value;
      if (declaration.scope === "session" && binding?.key === undefined)
        throw new SlotAssemblyError(`strict session local slot '${name}' has no scope binding`);
      const identity =
        declaration.scope === "session"
          ? scoped(binding)?.ctx
          : declaration.scope === "session-maybe"
            ? epoch()
            : active.definition;
      const selected = active.selected.value[name];
      const provided = {
        ...active.registration.value,
        renderFactorySlot: selected === undefined ? fallbackFactory : selectedFactory,
      };
      const standard = { ...local.root.value?.props, ...binding?.props, ...localSeats.value };
      assertNoOverlap(provided, standard);
      const combined = { ...provided, ...standard };
      assertNoOverlap(combined, attrs);
      return h(Boundary, {
        name: `${active.definition.name}:${name}`,
        factory: true,
        key: `${value.keyOf(identity ?? active.definition)}:${value.keyOf(selected ?? fallback)}`,
        report: (error) =>
          value.host.reportFactoryError(
            active.definition.name,
            selected === undefined ? active.definition : active.caller,
            error,
          ),
        body: () => h(selected ?? fallback, pickInput(selected ?? fallback, combined, attrs)),
      });
    };
  });
}

interface Options {
  entryKey?: string;
  only?: string;
  fallback?: VNodeChild;
  hookContext?: unknown;
  children?: VNodeChild;
  overlay?: boolean;
  fallbackOnly?: boolean;
}
interface FactoryOptions {
  slots?: Readonly<Record<string, Component>>;
  fallback?: VNodeChild;
}
const HocContent = defineSlotComponent<{ body: VNodeChild }>(["body"], (props) => {
  const value = tree();
  onErrorCaptured((error) => {
    if (!(error instanceof SlotAssemblyError)) value.contentErrors.add(error);
  });
  return () => props.body;
});
const Outlet = defineSlotComponent<{
  name: string;
  input: object;
  options?: Options;
  inline?: boolean;
}>(["name", "input", "options", "inline"], (props) => {
  const value = tree();
  const version = useObservableSelector(
    () => ({
      getSnapshot: () => value.host.getVersion(props.name),
      subscribe: (listener) => value.host.subscribe(props.name, listener),
    }),
    () => (tick) => tick,
  );
  const epoch = incarnation(value.scope);
  return () => {
    void version.value;
    const { host } = value;
    const spec = host.specOf(props.name);
    const anchor = (spec?.inline ?? props.inline) ? "span" : "div";
    let content: VNodeChild = null;
    if (spec !== undefined) {
      if (
        spec.scope === "session" &&
        value.scope.value?.key === undefined &&
        !(spec.kind === "chain" && props.options?.fallbackOnly)
      ) {
        throw new SlotAssemblyError(
          `strict session slot '${props.name}' rendered without a scope binding`,
        );
      }
      const entries = host.entriesOf(props.name);
      if (props.name === "root" && entries.length === 0)
        throw new SlotAssemblyError(
          "renderSlot('root') before any 'root' registration (boot order)",
        );
      const winners = host.entriesOfSlot(props.name);
      const dead = (key?: string) =>
        h(anchor, { "data-slot-error": props.name, ...(key === undefined ? {} : { key }) });
      const guarded = (
        entry: StoredEntry,
        input = props.input,
        inner?: () => VNodeChild,
      ): VNodeChild => {
        const scopeIdentity =
          spec.scope === "root"
            ? entry
            : spec.scope === "session"
              ? scoped(value.scope.value)?.ctx
              : epoch();
        return h(Boundary, {
          key: `${value.keyOf(entry)}:${scopeIdentity === undefined ? "absent" : value.keyOf(scopeIdentity)}`,
          name: props.name,
          inline: spec.inline === true,
          hoc: spec.kind === "hoc",
          ...(inner === undefined ? {} : { crashed: inner }),
          report: (error) =>
            host.reportEntryError(props.name, entry, error, {
              abdicate: spec.kind !== "chain" && spec.kind !== "hoc",
            }),
          body: () =>
            h(Entry, {
              owner: entry,
              input: inner === undefined ? input : { ...input, children: inner() },
              ...(inner === undefined ? {} : { hocContent: inner }),
              scope: spec.scope,
              slotName: props.name,
              ...(props.options === undefined ? {} : { options: props.options }),
            }),
        });
      };
      if (spec.kind === "single") {
        const winner = winners[0];
        content =
          winner === undefined
            ? entries.length > 0
              ? dead()
              : (props.options?.fallback ?? null)
            : guarded(winner);
      } else if (spec.kind === "keyed") {
        const winner = winners.find((entry) => entry.options.key === props.options?.entryKey);
        content =
          winner === undefined
            ? entries.some((entry) => entry.options.key === props.options?.entryKey)
              ? dead()
              : (props.options?.fallback ?? null)
            : guarded(winner);
      } else if (spec.kind === "chain") {
        let elected: VNodeChild = null;
        if (!props.options?.fallbackOnly) {
          for (const entry of entries) {
            let matched: unknown;
            try {
              matched = entry.select?.(props.input as never);
            } catch (error) {
              console.error(
                `chain selector crashed in '${props.name}', treating as declined:`,
                error,
              );
              continue;
            }
            if (matched !== null) {
              elected = guarded(entry, { ...props.input, matched });
              break;
            }
          }
        }
        content = props.options?.overlay
          ? [
              h(
                anchor,
                {
                  key: "fallback",
                  "data-chain-overlay-fallback": props.name,
                  style: { display: elected === null ? "contents" : "none" },
                },
                [props.options.fallback ?? null],
              ),
              elected,
            ]
          : (elected ?? props.options?.fallback ?? null);
      } else if (spec.kind === "hoc") {
        const exactIds = new Set(
          winners
            .filter(
              (entry) =>
                props.options?.entryKey !== undefined &&
                entry.options.key === props.options.entryKey,
            )
            .map((entry) => entry.options.id),
        );
        const layers = winners
          .filter((entry) =>
            entry.options.key === undefined
              ? !exactIds.has(entry.options.id)
              : entry.options.key === props.options?.entryKey,
          )
          .sort((a, b) => (a.options.order ?? 0) - (b.options.order ?? 0));
        let inner = (): VNodeChild => h(HocContent, { body: props.options?.children ?? null });
        for (const entry of layers.toReversed()) {
          const next = inner;
          inner = () => guarded(entry, props.input, next);
        }
        content = inner();
      } else {
        const rows = winners.map((entry) => ({
          entry: entry as StoredEntry | undefined,
          id: entry.options.id,
          order: entry.options.order ?? 0,
        }));
        const seen = new Set(rows.map((row) => row.id));
        for (const entry of entries) {
          if (seen.has(entry.options.id)) continue;
          seen.add(entry.options.id);
          rows.push({ entry: undefined, id: entry.options.id, order: entry.options.order ?? 0 });
        }
        const visible = rows
          .sort((a, b) => a.order - b.order)
          .filter((row) => props.options?.only === undefined || row.id === props.options.only);
        content =
          visible.length === 0
            ? (props.options?.fallback ?? null)
            : visible.map((row) =>
                row.entry === undefined ? dead(`dry:${row.id}`) : guarded(row.entry),
              );
      }
    }
    return h(anchor, { "data-slot": props.name, style: { display: "contents" } }, [content]);
  };
});

const FactoryOutlet = defineSlotComponent<{
  name: string;
  input: object;
  options?: FactoryOptions;
  caller: Owner;
}>(["name", "input", "options", "caller"], (props) => {
  const value = tree();
  const ancestors = inject(
    ancestryKey,
    computed(() => new Set<string>()),
  );
  provide(
    ancestryKey,
    computed(() => new Set(ancestors.value).add(props.name)),
  );
  const version = useObservableSelector(
    () => ({
      getSnapshot: () => value.host.getFactoryVersion(props.name),
      subscribe: (listener) => value.host.subscribeFactory(props.name, listener),
    }),
    () => (tick) => tick,
  );
  const epoch = incarnation(value.scope);
  return () => {
    void version.value;
    const definition = value.host.factoryOf(props.name);
    if (definition === undefined) return props.options?.fallback ?? null;
    if (ancestors.value.has(props.name))
      throw new SlotOwnershipError(`recursive render of factory '${props.name}'`);
    for (const name of Object.keys(props.options?.slots ?? {})) {
      if (definition.slots?.[name] === undefined)
        throw new SlotOwnershipError(`local slot '${name}' is not declared`);
    }
    const identity =
      definition.scope === "root"
        ? definition
        : definition.scope === "session"
          ? scoped(value.scope.value)?.ctx
          : epoch();
    return h(Boundary, {
      name: props.name,
      factory: true,
      key: `${value.keyOf(definition)}:${identity === undefined ? "absent" : value.keyOf(identity)}`,
      report: (error) => value.host.reportFactoryError(props.name, definition, error),
      body: () =>
        h(Entry, {
          owner: definition,
          input: props.input,
          scope: definition.scope,
          factory: true,
          caller: props.caller,
          ...(props.options?.slots === undefined ? {} : { selected: props.options.slots }),
        }),
    });
  };
});

const Root = defineSlotComponent<{
  host: SlotRendererHost;
  input: object;
  resolveInject: Tree["resolveInject"];
}>(["host", "input", "resolveInject"], (props) => {
  const localeRevision = useObservableSelector(
    () => props.host.locale,
    () => (value) => value.revision,
  );
  const root = useObservableSelector(
    () => props.host.root,
    () => (value) => value,
  );
  const roster = useObservableSelector(
    () => props.host.scopeRevision,
    () => (value) => value,
  );
  const scope = useObservableSelector(
    () => {
      void roster.value;
      const adapter = props.host.scope("session-maybe");
      if (adapter === undefined) throw new SlotAssemblyError("session scope adapter is missing");
      return adapter.current;
    },
    () => (value) => value,
  );
  let serial = 0;
  const keys = new WeakMap<object, number>();
  const keyOf = (identity: object): number => {
    let key = keys.get(identity);
    if (key === undefined) {
      key = ++serial;
      keys.set(identity, key);
    }
    return key;
  };
  provide(treeKey, {
    host: props.host,
    root,
    scope,
    keyOf,
    localeRevision,
    contentErrors: new Set(),
    resolveInject: props.resolveInject,
  });
  return () => h(Outlet, { name: "root", input: props.input });
});

/** Build the native Vue renderer installed in the existing SlotRegistry.
 * @returns the renderer with scope-owned source and inject bindings.
 */
export function createVueSlotRenderer(): SlotRenderer {
  const roots = new WeakMap<StoredEntry, Face>();
  const scopes = new WeakMap<StoredEntry, WeakMap<StandardSourceBinding, Face>>();
  const resolveInject: Tree["resolveInject"] = (owner, binding, actions) => {
    // Exclusive Factory stores give each occurrence a distinct actions face.
    if ("name" in owner) return injected(owner, binding, actions);
    if (binding === undefined) {
      let face = roots.get(owner);
      if (face === undefined) {
        face = injected(owner, undefined, actions);
        roots.set(owner, face);
      }
      return face;
    }
    let byBinding = scopes.get(owner);
    if (byBinding === undefined) {
      byBinding = new WeakMap();
      scopes.set(owner, byBinding);
    }
    let face = byBinding.get(binding);
    if (face === undefined) {
      face = injected(owner, binding, actions);
      byBinding.set(binding, face);
    }
    return face;
  };
  return { renderRoot: (host, input) => h(Root, { host, input, resolveInject }) };
}

function assertNoOverlap(provided: Face, received: object): void {
  for (const key of Object.keys(received)) {
    if (Object.hasOwn(provided, key))
      throw new SlotAssemblyError(`factory received duplicate prop '${key}'`);
  }
}
