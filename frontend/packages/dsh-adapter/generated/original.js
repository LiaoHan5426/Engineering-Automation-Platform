var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// upstream/packages/client/ui-context-menu/src/client/index.ts.snapshot
var index_ts_exports = {};
__export(index_ts_exports, {
  Config: () => Config,
  apply: () => apply,
  createMenuStore: () => createMenuStore,
  inject: () => inject
});

// ../../node_modules/.pnpm/zustand@5.0.8_@types+react@18.3.27_immer@10.1.3_react@18.3.1/node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);

// ../../node_modules/.pnpm/zustand@5.0.8_@types+react@18.3.27_immer@10.1.3_react@18.3.1/node_modules/zustand/esm/middleware.mjs
var subscribeWithSelectorImpl = (fn) => (set2, get, api) => {
  const origSubscribe = api.subscribe;
  api.subscribe = ((selector, optListener, options) => {
    let listener = selector;
    if (optListener) {
      const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
      let currentSlice = selector(api.getState());
      listener = (state) => {
        const nextSlice = selector(state);
        if (!equalityFn(currentSlice, nextSlice)) {
          const previousSlice = currentSlice;
          optListener(currentSlice = nextSlice, previousSlice);
        }
      };
      if (options == null ? void 0 : options.fireImmediately) {
        optListener(currentSlice, currentSlice);
      }
    }
    return origSubscribe(listener);
  });
  const initialState = fn(set2, get, api);
  return initialState;
};
var subscribeWithSelector = subscribeWithSelectorImpl;

// ../../node_modules/.pnpm/immer@10.1.3/node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
var errors = true ? [
  // All error codes, starting by 0:
  function(plugin) {
    return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`;
  },
  function(thing) {
    return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`;
  },
  "This object has been frozen and should not be mutated",
  function(data) {
    return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + data;
  },
  "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",
  "Immer forbids circular references",
  "The first or second argument to `produce` must be a function",
  "The third argument to `produce` must be a function or undefined",
  "First argument to `createDraft` must be a plain object, an array, or an immerable object",
  "First argument to `finishDraft` must be a draft returned by `createDraft`",
  function(thing) {
    return `'current' expects a draft, got: ${thing}`;
  },
  "Object.defineProperty() cannot be used on an Immer draft",
  "Object.setPrototypeOf() cannot be used on an Immer draft",
  "Immer only supports deleting array indices",
  "Immer only supports setting array indices and the 'length' property",
  function(thing) {
    return `'original' expects a draft, got: ${thing}`;
  }
  // Note: if more errors are added, the errorOffset in Patches.ts should be increased
  // See Patches.ts for additional errors
] : [];
function die(error, ...args) {
  if (true) {
    const e = errors[error];
    const msg = typeof e === "function" ? e.apply(null, args) : e;
    throw new Error(`[Immer] ${msg}`);
  }
  throw new Error(
    `[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
  );
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value) {
  return !!value && !!value[DRAFT_STATE];
}
function isDraftable(value) {
  if (!value)
    return false;
  return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = Object.prototype.constructor.toString();
function isPlainObject(value) {
  if (!value || typeof value !== "object")
    return false;
  const proto = getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  if (Ctor === Object)
    return true;
  return typeof Ctor == "function" && Function.toString.call(Ctor) === objectCtorString;
}
function each(obj, iter) {
  if (getArchtype(obj) === 0) {
    Reflect.ownKeys(obj).forEach((key) => {
      iter(key, obj[key], obj);
    });
  } else {
    obj.forEach((entry, index) => iter(index, entry, obj));
  }
}
function getArchtype(thing) {
  const state = thing[DRAFT_STATE];
  return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
  return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function set(thing, propOrOldValue, value) {
  const t = getArchtype(thing);
  if (t === 2)
    thing.set(propOrOldValue, value);
  else if (t === 3) {
    thing.add(value);
  } else
    thing[propOrOldValue] = value;
}
function is(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function isMap(target) {
  return target instanceof Map;
}
function isSet(target) {
  return target instanceof Set;
}
function latest(state) {
  return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
  if (isMap(base)) {
    return new Map(base);
  }
  if (isSet(base)) {
    return new Set(base);
  }
  if (Array.isArray(base))
    return Array.prototype.slice.call(base);
  const isPlain = isPlainObject(base);
  if (strict === true || strict === "class_only" && !isPlain) {
    const descriptors = Object.getOwnPropertyDescriptors(base);
    delete descriptors[DRAFT_STATE];
    let keys = Reflect.ownKeys(descriptors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const desc = descriptors[key];
      if (desc.writable === false) {
        desc.writable = true;
        desc.configurable = true;
      }
      if (desc.get || desc.set)
        descriptors[key] = {
          configurable: true,
          writable: true,
          // could live with !!desc.set as well here...
          enumerable: desc.enumerable,
          value: base[key]
        };
    }
    return Object.create(getPrototypeOf(base), descriptors);
  } else {
    const proto = getPrototypeOf(base);
    if (proto !== null && isPlain) {
      return { ...base };
    }
    const obj = Object.create(proto);
    return Object.assign(obj, base);
  }
}
function freeze(obj, deep = false) {
  if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj))
    return obj;
  if (getArchtype(obj) > 1) {
    Object.defineProperties(obj, {
      set: { value: dontMutateFrozenCollections },
      add: { value: dontMutateFrozenCollections },
      clear: { value: dontMutateFrozenCollections },
      delete: { value: dontMutateFrozenCollections }
    });
  }
  Object.freeze(obj);
  if (deep)
    Object.values(obj).forEach((value) => freeze(value, true));
  return obj;
}
function dontMutateFrozenCollections() {
  die(2);
}
function isFrozen(obj) {
  return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
  const plugin = plugins[pluginKey];
  if (!plugin) {
    die(0, pluginKey);
  }
  return plugin;
}
var currentScope;
function getCurrentScope() {
  return currentScope;
}
function createScope(parent_, immer_) {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0
  };
}
function usePatchesInScope(scope, patchListener) {
  if (patchListener) {
    getPlugin("Patches");
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}
function revokeScope(scope) {
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  scope.drafts_ = null;
}
function leaveScope(scope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}
function enterScope(immer2) {
  return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft) {
  const state = draft[DRAFT_STATE];
  if (state.type_ === 0 || state.type_ === 1)
    state.revoke_();
  else
    state.revoked_ = true;
}
function processResult(result, scope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length;
  const baseDraft = scope.drafts_[0];
  const isReplaced = result !== void 0 && result !== baseDraft;
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope);
      die(4);
    }
    if (isDraftable(result)) {
      result = finalize(scope, result);
      if (!scope.parent_)
        maybeFreeze(scope, result);
    }
    if (scope.patches_) {
      getPlugin("Patches").generateReplacementPatches_(
        baseDraft[DRAFT_STATE].base_,
        result,
        scope.patches_,
        scope.inversePatches_
      );
    }
  } else {
    result = finalize(scope, baseDraft, []);
  }
  revokeScope(scope);
  if (scope.patches_) {
    scope.patchListener_(scope.patches_, scope.inversePatches_);
  }
  return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value, path) {
  if (isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  if (!state) {
    each(
      value,
      (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path)
    );
    return value;
  }
  if (state.scope_ !== rootScope)
    return value;
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true);
    return state.base_;
  }
  if (!state.finalized_) {
    state.finalized_ = true;
    state.scope_.unfinalizedDrafts_--;
    const result = state.copy_;
    let resultEach = result;
    let isSet2 = false;
    if (state.type_ === 3) {
      resultEach = new Set(result);
      result.clear();
      isSet2 = true;
    }
    each(
      resultEach,
      (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2)
    );
    maybeFreeze(rootScope, result, false);
    if (path && rootScope.patches_) {
      getPlugin("Patches").generatePatches_(
        state,
        path,
        rootScope.patches_,
        rootScope.inversePatches_
      );
    }
  }
  return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
  if (childValue === targetObject)
    die(5);
  if (isDraft(childValue)) {
    const path = rootPath && parentState && parentState.type_ !== 3 && // Set objects are atomic since they have no keys.
    !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0;
    const res = finalize(rootScope, childValue, path);
    set(targetObject, prop, res);
    if (isDraft(res)) {
      rootScope.canAutoFreeze_ = false;
    } else
      return;
  } else if (targetIsSet) {
    targetObject.add(childValue);
  }
  if (isDraftable(childValue) && !isFrozen(childValue)) {
    if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
      return;
    }
    finalize(rootScope, childValue);
    if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop)))
      maybeFreeze(rootScope, childValue);
  }
}
function maybeFreeze(scope, value, deep = false) {
  if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
    freeze(value, deep);
  }
}
function createProxyProxy(base, parent) {
  const isArray = Array.isArray(base);
  const state = {
    type_: isArray ? 1 : 0,
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope(),
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null,
    // set below
    // The base copy with any updated values.
    copy_: null,
    // Called by the `produce` function.
    revoke_: null,
    isManual_: false
  };
  let target = state;
  let traps = objectTraps;
  if (isArray) {
    target = [state];
    traps = arrayTraps;
  }
  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy;
  state.revoke_ = revoke;
  return proxy;
}
var objectTraps = {
  get(state, prop) {
    if (prop === DRAFT_STATE)
      return state;
    const source = latest(state);
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop);
    }
    const value = source[prop];
    if (state.finalized_ || !isDraftable(value)) {
      return value;
    }
    if (value === peek(state.base_, prop)) {
      prepareCopy(state);
      return state.copy_[prop] = createProxy(value, state);
    }
    return value;
  },
  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(state, prop, value) {
    const desc = getDescriptorFromProto(latest(state), prop);
    if (desc?.set) {
      desc.set.call(state.draft_, value);
      return true;
    }
    if (!state.modified_) {
      const current2 = peek(latest(state), prop);
      const currentState = current2?.[DRAFT_STATE];
      if (currentState && currentState.base_ === value) {
        state.copy_[prop] = value;
        state.assigned_[prop] = false;
        return true;
      }
      if (is(value, current2) && (value !== void 0 || has(state.base_, prop)))
        return true;
      prepareCopy(state);
      markChanged(state);
    }
    if (state.copy_[prop] === value && // special case: handle new props with value 'undefined'
    (value !== void 0 || prop in state.copy_) || // special case: NaN
    Number.isNaN(value) && Number.isNaN(state.copy_[prop]))
      return true;
    state.copy_[prop] = value;
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop) {
    if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      delete state.assigned_[prop];
    }
    if (state.copy_) {
      delete state.copy_[prop];
    }
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc)
      return desc;
    return {
      writable: true,
      configurable: state.type_ !== 1 || prop !== "length",
      enumerable: desc.enumerable,
      value: owner[prop]
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  }
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function(state, prop) {
  if (isNaN(parseInt(prop)))
    die(13);
  return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
  if (prop !== "length" && isNaN(parseInt(prop)))
    die(14);
  return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
  const state = draft[DRAFT_STATE];
  const source = state ? latest(state) : draft;
  return source[prop];
}
function readPropFromProto(state, source, prop) {
  const desc = getDescriptorFromProto(source, prop);
  return desc ? `value` in desc ? desc.value : (
    // This is a very special case, if the prop is a getter defined by the
    // prototype, we should invoke it with the draft as context!
    desc.get?.call(state.draft_)
  ) : void 0;
}
function getDescriptorFromProto(source, prop) {
  if (!(prop in source))
    return void 0;
  let proto = getPrototypeOf(source);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc)
      return desc;
    proto = getPrototypeOf(proto);
  }
  return void 0;
}
function markChanged(state) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}
function prepareCopy(state) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(
      state.base_,
      state.scope_.immer_.useStrictShallowCopy_
    );
  }
}
var Immer2 = class {
  constructor(config) {
    this.autoFreeze_ = true;
    this.useStrictShallowCopy_ = false;
    this.produce = (base, recipe, patchListener) => {
      if (typeof base === "function" && typeof recipe !== "function") {
        const defaultBase = recipe;
        recipe = base;
        const self = this;
        return function curriedProduce(base2 = defaultBase, ...args) {
          return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
        };
      }
      if (typeof recipe !== "function")
        die(6);
      if (patchListener !== void 0 && typeof patchListener !== "function")
        die(7);
      let result;
      if (isDraftable(base)) {
        const scope = enterScope(this);
        const proxy = createProxy(base, void 0);
        let hasError = true;
        try {
          result = recipe(proxy);
          hasError = false;
        } finally {
          if (hasError)
            revokeScope(scope);
          else
            leaveScope(scope);
        }
        usePatchesInScope(scope, patchListener);
        return processResult(result, scope);
      } else if (!base || typeof base !== "object") {
        result = recipe(base);
        if (result === void 0)
          result = base;
        if (result === NOTHING)
          result = void 0;
        if (this.autoFreeze_)
          freeze(result, true);
        if (patchListener) {
          const p = [];
          const ip = [];
          getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
          patchListener(p, ip);
        }
        return result;
      } else
        die(1, base);
    };
    this.produceWithPatches = (base, recipe) => {
      if (typeof base === "function") {
        return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
      }
      let patches, inversePatches;
      const result = this.produce(base, recipe, (p, ip) => {
        patches = p;
        inversePatches = ip;
      });
      return [result, patches, inversePatches];
    };
    if (typeof config?.autoFreeze === "boolean")
      this.setAutoFreeze(config.autoFreeze);
    if (typeof config?.useStrictShallowCopy === "boolean")
      this.setUseStrictShallowCopy(config.useStrictShallowCopy);
  }
  createDraft(base) {
    if (!isDraftable(base))
      die(8);
    if (isDraft(base))
      base = current(base);
    const scope = enterScope(this);
    const proxy = createProxy(base, void 0);
    proxy[DRAFT_STATE].isManual_ = true;
    leaveScope(scope);
    return proxy;
  }
  finishDraft(draft, patchListener) {
    const state = draft && draft[DRAFT_STATE];
    if (!state || !state.isManual_)
      die(9);
    const { scope_: scope } = state;
    usePatchesInScope(scope, patchListener);
    return processResult(void 0, scope);
  }
  /**
   * Pass true to automatically freeze all copies created by Immer.
   *
   * By default, auto-freezing is enabled.
   */
  setAutoFreeze(value) {
    this.autoFreeze_ = value;
  }
  /**
   * Pass true to enable strict shallow copy.
   *
   * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
   */
  setUseStrictShallowCopy(value) {
    this.useStrictShallowCopy_ = value;
  }
  applyPatches(base, patches) {
    let i;
    for (i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      if (patch.path.length === 0 && patch.op === "replace") {
        base = patch.value;
        break;
      }
    }
    if (i > -1) {
      patches = patches.slice(i + 1);
    }
    const applyPatchesImpl = getPlugin("Patches").applyPatches_;
    if (isDraft(base)) {
      return applyPatchesImpl(base, patches);
    }
    return this.produce(
      base,
      (draft) => applyPatchesImpl(draft, patches)
    );
  }
};
function createProxy(value, parent) {
  const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
  const scope = parent ? parent.scope_ : getCurrentScope();
  scope.drafts_.push(draft);
  return draft;
}
function current(value) {
  if (!isDraft(value))
    die(10, value);
  return currentImpl(value);
}
function currentImpl(value) {
  if (!isDraftable(value) || isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  let copy;
  if (state) {
    if (!state.modified_)
      return state.base_;
    state.finalized_ = true;
    copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
  } else {
    copy = shallowCopy(value, true);
  }
  each(copy, (key, childValue) => {
    set(copy, key, currentImpl(childValue));
  });
  if (state) {
    state.finalized_ = false;
  }
  return copy;
}
var immer = new Immer2();
var produce = immer.produce;

// upstream/packages/client/store/src/index.ts.snapshot
function notifySubscribers(listeners, label, ...args) {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch (error) {
      console.error(`${label} subscriber failed:`, error);
    }
  }
}
function rafBatch(notify) {
  const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
    requestAnimationFrame(() => {
      fn();
    });
  } : (fn) => {
    queueMicrotask(fn);
  };
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      notify();
    });
  };
}
function createSnapshotStore(init, opts) {
  const withSelector = subscribeWithSelector(() => init);
  const api = createStore()(withSelector);
  if (opts?.persist) attachPersistence(api, opts.persist.name);
  let subscribe = (fn) => api.subscribe(() => {
    notifySubscribers([fn], "[client-store]");
  });
  if (opts?.flush === "raf") {
    const listeners = /* @__PURE__ */ new Set();
    const flush = rafBatch(() => {
      notifySubscribers(listeners, "[client-store]");
    });
    api.subscribe(flush);
    subscribe = (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    };
  }
  return {
    getSnapshot: () => api.getState(),
    subscribe: (fn) => subscribe(fn),
    update: (mutator) => {
      api.setState(produce(api.getState(), (draft) => {
        mutator(draft);
      }), true);
    },
    set: (next) => {
      api.setState(devFreeze(next), true);
    }
  };
}
function attachPersistence(api, name) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(name);
    if (raw !== null) {
      api.setState(devFreeze(JSON.parse(raw)), true);
    }
  } catch (error) {
    console.error(`snapshot store '${name}' rehydration failed:`, error);
  }
  api.subscribe((state) => {
    try {
      localStorage.setItem(name, JSON.stringify(state));
    } catch (error) {
      console.error(`snapshot store '${name}' persistence failed:`, error);
    }
  });
}
function devFreeze(value) {
  if (false) return value;
  return freeze(value, true);
}
function defineStore(decl) {
  return {
    spec: decl,
    create(scopeKey) {
      const persistKey = decl.persist === void 0 ? void 0 : scopeKey === void 0 ? decl.persist : `${decl.persist}.${scopeKey}`;
      const store = createSnapshotStore(
        decl.init(),
        persistKey !== void 0 ? { persist: { name: persistKey } } : void 0
      );
      const actions = {};
      for (const key of Object.keys(decl.actions)) {
        const mutate = decl.actions[key];
        actions[key] = (...params) => {
          store.update((draft) => {
            mutate(draft, ...params);
          });
        };
      }
      return {
        actions,
        getSnapshot: () => store.getSnapshot(),
        subscribe: (fn) => store.subscribe(fn),
        store,
        clearPersisted: () => {
          if (persistKey === void 0 || typeof localStorage === "undefined") return;
          try {
            localStorage.removeItem(persistKey);
          } catch {
          }
        }
      };
    }
  };
}

// upstream/packages/client/ui-context-menu/src/client/index.ts.snapshot
import z from "@deepseek-ai/schemastery";

// upstream/packages/client/ui-primitives/src/Menu.tsx.snapshot
import { useEffect as useEffect4, useId as useId5, useLayoutEffect as useLayoutEffect4, useMemo, useRef as useRef6, useState as useState3 } from "react";
import { createPortal as createPortal4 } from "react-dom";
import clsx5 from "clsx";

// upstream/packages/client/ui-primitives/src/useMenuSubmenu.ts.snapshot
import { useId, useLayoutEffect, useRef as useRef2, useState } from "react";

// upstream/packages/client/ui-primitives/src/menu-submenu-position.ts.snapshot
var SUBMENU_GAP = 4;
var SUBMENU_MARGIN = 12;
function submenuNeedsPage(parent, width, viewportWidth) {
  const right = parent.right + SUBMENU_GAP + width <= viewportWidth - SUBMENU_MARGIN;
  const left = parent.left - SUBMENU_GAP - width >= SUBMENU_MARGIN;
  return !right && !left;
}

// upstream/packages/client/ui-primitives/src/pointer-grace.ts.snapshot
import { useCallback, useEffect, useRef } from "react";
var POINTER_GRACE_MS = 200;
function usePointerGrace(close) {
  const timerRef = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const arm = useCallback(() => {
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      closeRef.current();
    }, POINTER_GRACE_MS);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { arm, cancel };
}

// upstream/packages/client/ui-primitives/src/useMenuSubmenu.ts.snapshot
function menuHoverAllowed(event) {
  return event.pointerType !== "touch" && window.matchMedia("(any-hover: hover)").matches;
}
function useMenuSubmenu(options) {
  const { open, items, footer, listRef, refocusAnchor } = options;
  const [expanded, setExpanded] = useState(null);
  const panelRef = useRef2(null);
  const pendingFocus = useRef2(null);
  const entry = [...items, ...footer ?? []].find((item) => !("type" in item) && item.id === expanded?.id && item.disabled !== true && item.submenu !== void 0 && item.submenu.length > 0);
  const trigger = expanded?.trigger ?? null;
  const anchorId = useId().replaceAll(":", "");
  const parentAnchor = `--dsh-submenu-parent-${anchorId}`;
  const [needsPage, setNeedsPage] = useState(null);
  const contains = (node) => panelRef.current?.contains(node) === true;
  const invalidated = expanded !== null && entry === void 0;
  const active = document.activeElement;
  const restoreInvalidatedFocus = open && invalidated && (contains(active) || trigger === active);
  const backWasFocused = contains(active) && active?.hasAttribute("data-menu-back") === true;
  const measured = needsPage !== null;
  const page = entry !== void 0 && expanded?.activated === true && needsPage === true;
  const hidden = !measured || needsPage && !page;
  const visible = open && entry !== void 0;
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const parent = listRef.current;
    if (!visible || panel === null || parent === null || trigger === null) {
      setNeedsPage(null);
      return;
    }
    const measureRow = () => {
      panel.style.setProperty("--dsh-submenu-row-offset", `${trigger.getBoundingClientRect().top - parent.getBoundingClientRect().top}px`);
    };
    const measure = () => {
      const layout = panel.getAttribute("data-submenu-layout");
      panel.removeAttribute("data-submenu-layout");
      const width = panel.offsetWidth;
      panel.style.setProperty("--dsh-submenu-height", `${panel.offsetHeight}px`);
      if (layout !== null) panel.setAttribute("data-submenu-layout", layout);
      measureRow();
      const viewport = document.documentElement.clientWidth || window.innerWidth;
      setNeedsPage(submenuNeedsPage(parent.getBoundingClientRect(), width, viewport));
    };
    measure();
    window.addEventListener("resize", measure);
    parent.addEventListener("scroll", measureRow, true);
    const observer = new ResizeObserver(measure);
    for (const element of [parent, trigger, panel]) observer.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      parent.removeEventListener("scroll", measureRow, true);
      observer.disconnect();
    };
  }, [visible, entry, trigger, listRef]);
  const focusFirstChild = () => {
    const panel = panelRef.current;
    const first = panel?.querySelector('button[role="menuitem"]:not(:disabled):not([data-menu-back])') ?? panel?.querySelector("button:not(:disabled)");
    first?.focus();
  };
  const returnToParent = () => {
    cancelClose();
    pendingFocus.current = trigger;
    setExpanded(null);
  };
  const collapse = () => {
    cancelClose();
    if (contains(document.activeElement)) returnToParent();
    else setExpanded(null);
  };
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(() => {
    if (!page) collapse();
  });
  const openChild = (id, target, enter = false) => {
    cancelClose();
    if (trigger !== target && contains(document.activeElement)) {
      pendingFocus.current = target;
      target.focus();
      pendingFocus.current = null;
    }
    pendingFocus.current = enter ? "child" : null;
    setExpanded((current2) => current2?.id === id ? enter && !current2.activated ? { ...current2, activated: true } : current2 : { id, trigger: target, activated: enter });
    if (enter) focusFirstChild();
  };
  useLayoutEffect(() => {
    if (!open || invalidated) {
      cancelClose();
      pendingFocus.current = null;
      setExpanded(null);
      if (restoreInvalidatedFocus && (document.activeElement === document.body || document.activeElement === trigger)) {
        const target = trigger?.isConnected === true && !trigger.disabled ? trigger : listRef.current?.querySelector("button:not(:disabled)");
        pendingFocus.current = target ?? null;
        if (target != null) target.focus();
        else refocusAnchor();
        pendingFocus.current = null;
      }
      return;
    }
    if (entry === void 0 && pendingFocus.current instanceof HTMLButtonElement) {
      pendingFocus.current.focus();
      pendingFocus.current = null;
    }
    if (entry === void 0 || hidden) return;
    if (pendingFocus.current === "child" || page && listRef.current?.contains(document.activeElement) || !page && backWasFocused) {
      focusFirstChild();
      pendingFocus.current = null;
    }
  }, [open, entry, needsPage, page, hidden, invalidated, restoreInvalidatedFocus, backWasFocused, cancelClose]);
  const collapseFrom = (event) => {
    const row = event.target.closest('button[role="menuitem"]');
    if (row === null || row.getAttribute("aria-haspopup") === "menu") return;
    if (row.closest('[role="menu"]') === event.currentTarget) collapse();
  };
  return {
    entry,
    panelRef,
    parentAnchor,
    measured,
    page,
    hidden,
    contains,
    activeList: (focused) => page || contains(focused) ? panelRef.current : listRef.current,
    returnToParent: () => {
      if (entry === void 0 || hidden) return false;
      returnToParent();
      return true;
    },
    openChild,
    focusParent: (id, target) => {
      if (pendingFocus.current !== target) openChild(id, target);
    },
    leave: () => {
      if (!page) armClose();
    },
    cancelClose,
    collapseFrom
  };
}

// upstream/packages/client/ui-primitives/src/MenuRow.tsx.snapshot
import { useId as useId3 } from "react";
import clsx2 from "clsx";

// upstream/packages/client/ui-primitives/src/icons/artwork.ts.snapshot
var ICON_REGULAR_STROKE = 1;
var ICON_MEDIUM_STROKE = 1.3;
var ICON_ARTWORK = {
  "mail-unread-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5H3C2.44772 3.5 2 3.94772 2 4.5V11.5C2 12.0523 2.44772 12.5 3 12.5H13C13.5523 12.5 14 12.0523 14 11.5V7" stroke="currentColor"></path><path d="M2.5 4.5L8 8.5L10.5 6.7" stroke="currentColor"></path><circle cx="12.5" cy="3.5" r="1.5" fill="currentColor"></circle></svg>` },
  "mail-read-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5L7.4 2.45C7.75556 2.18333 8.24444 2.18333 8.6 2.45L14 6.5V12.5C14 13.0523 13.5523 13.5 13 13.5H3C2.44772 13.5 2 13.0523 2 12.5V6.5Z" stroke="currentColor"></path><path d="M2.5 7L8 10.5L13.5 7M2.5 13L6 9.5M13.5 13L10 9.5" stroke="currentColor"></path></svg>` },
  "layers-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="M8.481371 2.304371 a1.159971 1.159971 0 0 0-.962742 0 L2.547971 4.566371 a.580029 .580029 0 0 0 0 1.0614 l4.9764 2.267829 a1.159971 1.159971 0 0 0 .962829 0 l4.9764-2.262 a.580029 .580029 0 0 0 0-1.0614Z" stroke="currentColor"></path><path d="M2.199971 8 a.580029 .580029 0 0 0 .336429 .527829 l4.987971 2.267742 a1.159971 1.159971 0 0 0 .957 0 l4.9764-2.262 A.580029 .580029 0 0 0 13.800029 8" stroke="currentColor"></path><path d="M2.199971 10.899971 a.580029 .580029 0 0 0 .336429 .527829 l4.987971 2.267829 a1.159971 1.159971 0 0 0 .957 0 l4.9764-2.262 A.580029 .580029 0 0 0 13.800029 10.899971" stroke="currentColor"></path></svg>` },
  "save-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round"><path d="M2.5 1.5h8l3 3v9a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"></path><path d="M4.5 1.5v4h6v-4M4 14.5v-6h7v6"></path></svg>` },
  "new-chat-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337" stroke="currentColor"></path><path d="M8 5V11" stroke="currentColor"></path><path d="M5 8H11" stroke="currentColor"></path></svg>` },
  "search-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z" stroke="currentColor"></path><path d="M10.2991 10.3933L14.7783 14.8725" stroke="currentColor"></path></svg>` },
  "eye-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.5 8C3.36 4.41 5.52 2.63 8 2.63C10.48 2.63 12.64 4.41 14.5 8C12.64 11.59 10.48 13.37 8 13.37C5.52 13.37 3.36 11.59 1.5 8Z" stroke="currentColor"></path><circle cx="8" cy="8" r="2.25" stroke="currentColor"></circle></svg>` },
  "eye-off-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.25 2.25L13.75 13.75" stroke="currentColor"></path><path d="M6.35 3.03C6.88 2.76 7.42 2.63 8 2.63C10.48 2.63 12.64 4.41 14.5 8C13.75 9.48 12.95 10.6 12.08 11.36" stroke="currentColor"></path><path d="M10.28 12.81C9.54 13.19 8.78 13.37 8 13.37C5.52 13.37 3.36 11.59 1.5 8C2.26 6.49 3.08 5.36 3.97 4.6" stroke="currentColor"></path><path d="M6.55 6.55A2.05 2.05 0 0 0 9.45 9.45" stroke="currentColor"></path></svg>` },
  "globe-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z" stroke="currentColor"></path><path d="M2.34619 8H13.6538" stroke="currentColor" stroke-linecap="square"></path><path d="M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138" stroke="currentColor"></path><path d="M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138" stroke="currentColor"></path></svg>` },
  "settings-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z" stroke="currentColor"></path><path d="M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z" stroke="currentColor" stroke-miterlimit="10"></path></svg>` },
  "panel-left-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z" stroke="currentColor"></path><path d="M5.5 1.5V14.5" stroke="currentColor"></path></svg>` },
  "ellipsis-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z" fill="currentColor"></path><path d="M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z" fill="currentColor"></path><path d="M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z" fill="currentColor"></path></svg>` },
  "plus-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 2V14" stroke="currentColor"></path><path d="M2 8H14" stroke="currentColor"></path></svg>` },
  "check-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4" stroke="currentColor"></path></svg>` },
  "branch-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564" stroke="currentColor"></path><path d="M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944" stroke="currentColor"></path><circle cx="12.4502" cy="3.3079" r="1.56962" stroke="currentColor"></circle><circle cx="12.4502" cy="12.6921" r="1.56962" stroke="currentColor"></circle></svg>` },
  "chevron-down-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor"></path></svg>` },
  "chevron-left-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M10 4L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12" stroke="currentColor"></path></svg>` },
  "chevron-right-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4" stroke="currentColor"></path></svg>` },
  "triangle-right-fill": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z" fill="currentColor"></path></svg>` },
  "chevron-up-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10" stroke="currentColor"></path></svg>` },
  "close-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.5 2.5L13.5 13.5" stroke="currentColor"></path><path d="M13.5 2.5L2.5 13.5" stroke="currentColor"></path></svg>` },
  "close-fill": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.5 3.5L12.5 12.5" stroke="currentColor"></path><path d="M12.5 3.5L3.5 12.5" stroke="currentColor"></path></svg>` },
  "close-circle-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path fill-rule="evenodd" clip-rule="evenodd" d="M15 8A7 7 0 1 1 1 8A7 7 0 1 1 15 8ZM6.409 10.652L5.348 9.591L6.939 8L5.348 6.409L6.409 5.348L8 6.939L9.591 5.348L10.652 6.409L9.061 8L10.652 9.591L9.591 10.652L8 9.061Z" fill="currentColor"></path></svg>` },
  "copy-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke="currentColor"></rect><path d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z" fill="currentColor"></path></svg>` },
  "refresh-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1" stroke="currentColor"></path><path d="M14.4999 1.5V5.1H10.8999" stroke="currentColor"></path></svg>` },
  "like-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z" stroke="currentColor"></path></svg>` },
  "like-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z" fill="currentColor" stroke="currentColor"></path></svg>` },
  "dislike-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z" stroke="currentColor"></path></svg>` },
  "dislike-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z" fill="currentColor" stroke="currentColor"></path></svg>` },
  "share-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.1256 7.58723C14.3483 7.81942 14.3482 8.18589 14.1254 8.41799L8.6646 14.1077C8.53985 14.2377 8.32031 14.1494 8.32031 13.9692L8.32035 10.2039C8.32035 10.1943 8.31534 10.1864 8.30592 10.1849C8.08306 10.148 5.30067 9.7729 1.50993 13.2904C1.49711 13.3023 1.47561 13.2943 1.4757 13.2768C1.49273 9.87168 3.42001 5.07166 8.29999 5.05835C8.31103 5.05832 8.32035 5.04937 8.32035 5.03832L8.32031 2.03109C8.32031 1.85088 8.53993 1.76259 8.66466 1.89266L14.1256 7.58723Z" stroke="currentColor"></path></svg>` },
  "deliver-doc": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.15479 4.91687H9.84543" stroke="currentColor"></path><path d="M11.8798 9.55347V2.71525C11.8798 2.37416 11.564 2.09766 11.1744 2.09766H4.82577C4.43618 2.09766 4.12036 2.37416 4.12036 2.71525V9.55347" stroke="currentColor"></path><path d="M2.28735 13.8022V8.84792C2.28735 8.77514 2.36262 8.72673 2.42884 8.75693L13.2936 13.7112C13.3914 13.7558 13.3596 13.9022 13.2521 13.9022H2.38735C2.33213 13.9022 2.28735 13.8575 2.28735 13.8022Z" stroke="currentColor"></path><path d="M7.46929 10.979L13.5783 8.7416C13.6435 8.7177 13.7126 8.76601 13.7126 8.83551L13.7125 13.8022C13.7125 13.8574 13.6678 13.9022 13.6125 13.9022H7.99999" stroke="currentColor"></path><path d="M6.15479 7.2395H9.05644" stroke="currentColor"></path></svg>` },
  "edit-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z" fill="currentColor"></path><path d="M7.7849 8.23878L13.888 2.13574" stroke="currentColor"></path></svg>` },
  "think-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z" stroke="currentColor"></path><path d="M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z" stroke="currentColor"></path><path d="M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z" fill="currentColor"></path></svg>` },
  "agent-preset-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.51867 12.3282C7.29816 12.6011 8.16475 12.6514 9.02269 12.4216C9.57879 12.2726 10.0784 12.0185 10.5087 11.6888C10.7819 12.0555 11.1606 12.3304 11.5913 12.4805C10.9688 13.029 10.2149 13.4478 9.35911 13.6771C8.13946 14.0038 6.90632 13.8971 5.82126 13.4533C6.15821 13.1562 6.4021 12.7652 6.51867 12.3282ZM9.17629 2.89409C11.1101 3.34433 12.739 4.81872 13.2889 6.87043C13.4219 7.3665 13.4811 7.8649 13.4774 8.35466C13.0924 8.13213 12.6422 8.01837 12.1741 8.05276L12.1711 8.05257C12.1539 7.77199 12.109 7.48889 12.0334 7.20684C11.6363 5.72533 10.5048 4.6372 9.13549 4.22844C9.25559 3.87667 9.29214 3.49087 9.22309 3.09892C9.2108 3.02922 9.19451 2.96108 9.17629 2.89409ZM4.7311 3.89107L4.78302 4.11879C4.87648 4.4488 5.04146 4.74263 5.25579 4.98896C3.98078 6.01355 3.35848 7.72904 3.8089 9.41059C3.81828 9.44559 3.82866 9.48025 3.83885 9.51479C3.38217 9.61268 2.98548 9.84137 2.68107 10.1556C2.63414 10.022 2.5897 9.88632 2.55244 9.74726C1.93301 7.43489 2.86717 5.07173 4.71504 3.76697L4.7311 3.89107Z" fill="currentColor"></path><path d="M7.99136 5.28105C8.87501 5.28105 9.59136 4.56471 9.59136 3.68105C9.59136 2.7974 8.87501 2.08105 7.99136 2.08105C7.1077 2.08105 6.39136 2.7974 6.39136 3.68105C6.39136 4.56471 7.1077 5.28105 7.99136 5.28105Z" stroke="currentColor"></path><path d="M3.94009 12.9417C4.82374 12.9417 5.54009 12.2254 5.54009 11.3417C5.54009 10.458 4.82374 9.7417 3.94009 9.7417C3.05643 9.7417 2.34009 10.458 2.34009 11.3417C2.34009 12.2254 3.05643 12.9417 3.94009 12.9417Z" stroke="currentColor"></path><path d="M12.0851 12.9417C12.9688 12.9417 13.6851 12.2254 13.6851 11.3417C13.6851 10.458 12.9688 9.7417 12.0851 9.7417C11.2015 9.7417 10.4851 10.458 10.4851 11.3417C10.4851 12.2254 11.2015 12.9417 12.0851 12.9417Z" stroke="currentColor"></path></svg>` },
  "browse-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z" fill="currentColor"></path></svg>` },
  "context-injection-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5 2.5H3.5C3.23478 2.5 2.98043 2.60536 2.79289 2.79289C2.60536 2.98043 2.5 3.23478 2.5 3.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V3.5C13.5 3.23478 13.3946 2.98043 13.2071 2.79289C13.0196 2.60536 12.7652 2.5 12.5 2.5H11" stroke="currentColor"></path><path d="M8 0.5V7.5" stroke="currentColor"></path><path d="M5.5 5L8 7.5L10.5 5" stroke="currentColor"></path><path d="M5.5 11H10.5" stroke="currentColor"></path></svg>` },
  "link-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.59961 9.40051C6.82779 9.6334 7.10015 9.81842 7.40074 9.94472C7.70132 10.071 8.02409 10.1361 8.35013 10.1361C8.67618 10.1361 8.99894 10.071 9.29953 9.94472C9.60011 9.81842 9.87247 9.6334 10.1007 9.40051L12.9015 6.59967C13.3658 6.13541 13.6266 5.50572 13.6266 4.84915C13.6266 4.19258 13.3658 3.56289 12.9015 3.09863C12.4372 2.63436 11.8075 2.37354 11.151 2.37354C10.4944 2.37354 9.86472 2.63436 9.40045 3.09863L9.05034 3.44873" stroke="currentColor"></path><path d="M9.40051 6.59959C9.17233 6.3667 8.89997 6.18169 8.59939 6.05538C8.2988 5.92907 7.97603 5.86401 7.64999 5.86401C7.32395 5.86401 7.00118 5.92907 6.70059 6.05538C6.40001 6.18169 6.12765 6.3667 5.89946 6.59959L3.09863 9.40043C2.63436 9.8647 2.37354 10.4944 2.37354 11.151C2.37354 11.8075 2.63436 12.4372 3.09863 12.9015C3.56289 13.3657 4.19258 13.6266 4.84915 13.6266C5.50572 13.6266 6.13541 13.3657 6.59967 12.9015L6.94978 12.5514" stroke="currentColor"></path></svg>` },
  "right-up-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M11.7256 2.77441C12.5538 2.77469 13.2256 3.44616 13.2256 4.27441V10.1416H12.2256V4.27441C12.2256 3.99844 12.0015 3.77469 11.7256 3.77441H5.7207V2.77441H11.7256Z" fill="currentColor"></path><path d="M2.77441 13.2255L12.3756 3.62427" stroke="currentColor"></path></svg>` },
  "enhance-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.98486 2.95374H14.0151" stroke="currentColor"></path><path d="M1.98486 6.31787H14.0151" stroke="currentColor"></path><path d="M1.98486 9.68213H14.0151" stroke="currentColor"></path><path d="M1.98486 13.0463H8.4627" stroke="currentColor"></path></svg>` },
  "trash-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.28149 3.88831H14.7187" stroke="currentColor"></path><path d="M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833" stroke="currentColor"></path><path d="M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831" stroke="currentColor"></path><path d="M6.44946 6.98926V11.1238" stroke="currentColor"></path><path d="M9.55054 6.98926V11.1238" stroke="currentColor"></path></svg>` },
  "warning-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M8 4.29199V9.79199" stroke="currentColor"></path><path d="M8 10.708V11.708" stroke="currentColor"></path></svg>` },
  "check-circle-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" stroke-width="${strokeWidth}"><path d="M28.1936 14.6936L19.8066 23.0806C19.2373 23.65 18.7159 24.1742 18.24 24.5571C17.7389 24.9602 17.1365 25.3359 16.3657 25.458C15.9581 25.5225 15.5428 25.5225 15.1353 25.458C14.3645 25.3359 13.7621 24.9602 13.261 24.5571C12.7851 24.1742 12.2637 23.65 11.6943 23.0806L7.80737 19.1936L10.1936 16.8074L14.0806 20.6943C14.7033 21.317 15.0763 21.6873 15.377 21.9292C15.6523 22.1507 15.7109 22.1325 15.6626 22.1248C15.7208 22.1339 15.7802 22.1339 15.8384 22.1248C15.7901 22.1325 15.8486 22.1507 16.124 21.9292C16.4247 21.6873 16.7977 21.317 17.4204 20.6943L25.8074 12.3074L28.1936 14.6936Z" fill="currentColor"></path><path d="M32.8496 18.0005C32.8496 9.79906 26.2019 3.15137 18.0005 3.15137C9.79906 3.15137 3.15137 9.79906 3.15137 18.0005C3.15137 26.2019 9.79906 32.8496 18.0005 32.8496C26.2019 32.8496 32.8496 26.2019 32.8496 18.0005ZM35.7764 18.0005C35.7764 27.8173 27.8173 35.7764 18.0005 35.7764C8.18363 35.7764 0.224609 27.8173 0.224609 18.0005C0.224609 8.18363 8.18363 0.224609 18.0005 0.224609C27.8173 0.224609 35.7764 8.18363 35.7764 18.0005Z" fill="currentColor"></path></svg>` },
  "warning-triangle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="M6.87 2.6a1.33 1.33 0 0 1 2.26 0l5.34 9.33A1.33 1.33 0 0 1 13.33 14H2.67a1.33 1.33 0 0 1-1.14-2.07Z" stroke="currentColor"></path><path d="M8 6v3m0 2.33h.01" stroke="currentColor"></path></svg>` },
  "user-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 8.25C9.51878 8.25 10.75 7.01878 10.75 5.5C10.75 3.98122 9.51878 2.75 8 2.75C6.48122 2.75 5.25 3.98122 5.25 5.5C5.25 7.01878 6.48122 8.25 8 8.25Z" stroke="currentColor"></path><path d="M2.5 14.5C2.5 11.5 5.25 10.25 8 10.25C10.75 10.25 13.5 11.5 13.5 14.5" stroke="currentColor"></path></svg>` },
  // Users has inset contours in the 16px box; only coordinates, never stroke widths, carry the inset.
  "users-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.18 8.2275C7.5620898 8.2275 8.6825 7.1070898 8.6825 5.725C8.6825 4.3429102 7.5620898 3.2225 6.18 3.2225C4.7979102 3.2225 3.6775 4.3429102 3.6775 5.725C3.6775 7.1070898 4.7979102 8.2275 6.18 8.2275Z" stroke="currentColor"></path><path d="M1.63 13.915C1.63 11.185 3.905 10.0475 6.18 10.0475C8.455 10.0475 10.73 11.185 10.73 13.915" stroke="currentColor"></path><path d="M10.275 3.359C11.3215 3.7685 12.0495 4.6785 12.0495 5.725C12.0495 6.7715 11.3215 7.6815 10.275 8.091" stroke="currentColor"></path><path d="M12.004 10.366C13.369 11.003 14.37 12.186 14.37 13.915" stroke="currentColor"></path></svg>` },
  "paper-plane-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.74024 9.11029L1.82882 7.79865C1.75022 7.76323 1.75026 7.65161 1.82889 7.61626L12.9665 2.60943C13.0354 2.57846 13.1125 2.63213 13.1073 2.70749L12.3914 13.1388C12.3864 13.2117 12.3073 13.2548 12.2433 13.2194L6.12677 9.83657" stroke="currentColor"></path><path d="M8.44336 11.0825L6.2832 13.2843C6.22048 13.3482 6.11182 13.3038 6.11182 13.2143V9.86772C6.11182 9.84165 6.122 9.8166 6.1402 9.79793L12.972 2.78748" stroke="currentColor"></path></svg>` },
  "stop-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5H12.5C13.0523 13.5 13.5 13.0523 13.5 12.5V3.5C13.5 2.94772 13.0523 2.5 12.5 2.5Z" fill="currentColor"></path></svg>` },
  "paperclip-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.75 4.5V9.5C12.75 10.7598 12.2496 11.968 11.3588 12.8588C10.468 13.7496 9.25978 14.25 8 14.25C6.74022 14.25 5.53204 13.7496 4.64124 12.8588C3.75045 11.968 3.25 10.7598 3.25 9.5V5C3.25 4.13805 3.59241 3.3114 4.2019 2.7019C4.8114 2.09241 5.63805 1.75 6.5 1.75C7.36195 1.75 8.1886 2.09241 8.7981 2.7019C9.40759 3.3114 9.75 4.13805 9.75 5V9.5C9.75 9.96413 9.56563 10.4092 9.23744 10.7374C8.90925 11.0656 8.46413 11.25 8 11.25C7.53587 11.25 7.09075 11.0656 6.76256 10.7374C6.43437 10.4092 6.25 9.96413 6.25 9.5V5.5" stroke="currentColor"></path></svg>` },
  "loading-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.596 12.596C11.687 13.5049 10.5288 14.1239 9.26798 14.3747C8.00716 14.6255 6.70028 14.4968 5.51261 14.0048C4.32494 13.5129 3.30981 12.6798 2.59557 11.611C1.88134 10.5421 1.50008 9.2855 1.5 7.99998C1.50008 6.71446 1.88134 5.45783 2.59557 4.38898C3.30981 3.32013 4.32494 2.48707 5.51261 1.99513C6.70028 1.50319 8.00716 1.37447 9.26798 1.62524C10.5288 1.87602 11.687 2.49502 12.596 3.40398" stroke="currentColor"></path></svg>` },
  "download-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 1.95317V10.0469" stroke="currentColor"></path><path d="M4.25 6.29688L8 10.0469L11.75 6.29688" stroke="currentColor"></path><path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor"></path></svg>` },
  "upload-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 10.0469V1.95317" stroke="currentColor"></path><path d="M4.25 5.70317L8 1.95317L11.75 5.70317" stroke="currentColor"></path><path d="M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469" stroke="currentColor"></path></svg>` },
  "play-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M10.3329 7.91346C10.3996 7.95195 10.3996 8.04818 10.3329 8.08667L6.78304 10.1362C6.71638 10.1747 6.63304 10.1266 6.63304 10.0496L6.63304 5.95055C6.63304 5.87357 6.71638 5.82546 6.78304 5.86395L10.3329 7.91346Z" stroke="currentColor"></path></svg>` },
  "pause-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M6.5 5V11" stroke="currentColor"></path><path d="M9.5 5V11" stroke="currentColor"></path></svg>` },
  "fullscreen-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.33154 9.40576V13.1685C2.3318 13.4444 2.55556 13.6685 2.83154 13.6685H6.49463V14.6685H2.83154C2.00328 14.6685 1.3318 13.9967 1.33154 13.1685V9.40576H2.33154ZM13.1685 1.33154C13.9964 1.33199 14.6683 2.00352 14.6685 2.83154V6.40576H13.6685V2.83154C13.6683 2.5558 13.4441 2.33199 13.1685 2.33154H9.49463V1.33154H13.1685Z" fill="currentColor"></path><path d="M9.4292 6.57077L13.914 2.08594" stroke="currentColor"></path><path d="M6.57077 9.4292L2.08594 13.914" stroke="currentColor"></path></svg>` },
  "code-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.27612 1.5L4.52612 14.5" stroke="currentColor"></path><path d="M11.4739 1.5L9.72388 14.5" stroke="currentColor"></path><path d="M2.39868 5.5H14.0681" stroke="currentColor"></path><path d="M1.93188 10.5H13.6013" stroke="currentColor"></path></svg>` },
  "cordis-plugin-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.16143 6.59068L1.75205 8.00006L3.10619 9.35419L2.39908 10.0613L0.832948 8.49517C0.559581 8.2218 0.559582 7.77831 0.832948 7.50494L2.45432 5.88357L3.16143 6.59068ZM8.49511 15.1671C8.22176 15.4405 7.77826 15.4404 7.50489 15.1671L5.93461 13.5968L6.64172 12.8897L8 14.248L9.40938 12.8386L10.1165 13.5457L8.49511 15.1671ZM15.1671 7.50494C15.4403 7.7782 15.4401 8.22179 15.1671 8.49517L13.652 10.0102L12.9449 9.30309L14.248 8.00006L12.8897 6.64178L13.5968 5.93467L15.1671 7.50494ZM9.35414 3.10624L8 1.7521L6.69696 3.05514L5.98986 2.34803L7.50489 0.833003C7.77828 0.559981 8.22186 0.559752 8.49511 0.833003L10.0612 2.39913L9.35414 3.10624Z" fill="currentColor"></path><circle cx="8" cy="8" r="1.76221" stroke="currentColor"></circle></svg>` },
  "api-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3 4L7 8L3 12" stroke="currentColor"></path><path d="M9 12H13" stroke="currentColor"></path></svg>` },
  "personalization-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.25 7.16357C3.20417 7.32247 3.17778 7.48993 3.17773 7.66357C3.17773 7.83698 3.20336 8.00486 3.24902 8.16357H1.85742V7.16357H3.25ZM14.1426 8.16357H6.71484C6.76052 8.00485 6.78613 7.837 6.78613 7.66357C6.78609 7.48991 6.75971 7.32249 6.71387 7.16357H14.1426V8.16357Z" fill="currentColor"></path><path d="M9.1377 11.9092C9.08596 12.0666 9.05668 12.2344 9.05664 12.4092C9.05664 12.5838 9.08606 12.7518 9.1377 12.9092H1.85742V11.9092H9.1377ZM14.1426 12.9092H12.1816C12.2332 12.7519 12.2617 12.5838 12.2617 12.4092C12.2617 12.2345 12.2333 12.0666 12.1816 11.9092H14.1426V12.9092Z" fill="currentColor"></path><path d="M9.1123 3.09106C9.06138 3.24865 9.03324 3.41653 9.0332 3.59106C9.0332 3.76549 9.06148 3.93355 9.1123 4.09106H1.85742V3.09106H9.1123ZM14.1426 4.09106H12.207C12.2578 3.93358 12.2861 3.76545 12.2861 3.59106C12.2861 3.41657 12.2579 3.24862 12.207 3.09106H14.1426V4.09106Z" fill="currentColor"></path><circle cx="4.97065" cy="7.66401" r="1.35151" stroke="currentColor"></circle><circle cx="10.6596" cy="12.4091" r="1.35151" stroke="currentColor"></circle><circle cx="10.6596" cy="3.59101" r="1.35151" stroke="currentColor"></circle></svg>` },
  "project-add-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.54492 2.06738C5.91034 2.06754 6.26318 2.20149 6.53711 2.44336L7.94043 3.68164V4.7998C7.71462 4.74105 7.50367 4.63139 7.32617 4.47461L5.87598 3.19238C5.78477 3.11185 5.66658 3.06754 5.54492 3.06738H2.94922C2.67322 3.06738 2.44946 3.29145 2.44922 3.56738V12.4326C2.44927 12.7087 2.67311 12.9326 2.94922 12.9326H12.9326C13.2086 12.9325 13.4326 12.7086 13.4326 12.4326V8.53613H14.4326V12.4326C14.4326 13.2609 13.7609 13.9325 12.9326 13.9326H2.94922C2.12083 13.9326 1.44927 13.261 1.44922 12.4326V3.56738C1.44946 2.73916 2.12094 2.06738 2.94922 2.06738H5.54492Z" fill="currentColor"></path><path d="M9.75977 4.50208H14.5509" stroke="currentColor"></path><path d="M12.1492 6.89758L12.1492 2.10642" stroke="currentColor"></path></svg>` },
  "folder-open-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.3994 13.5986H2.04956C1.49728 13.5986 1.04956 13.1509 1.04956 12.5986V3.40137C1.04956 2.84908 1.49728 2.40137 2.04956 2.40137H4.76632C5.01016 2.40137 5.24561 2.49046 5.42836 2.6519L6.94088 3.98799C7.12364 4.14943 7.35908 4.23852 7.60293 4.23852H12.3994C12.9517 4.23852 13.3994 4.68624 13.3994 5.23852V7.16991" stroke="currentColor"></path><path d="M2.55911 7.93683C2.67584 7.49906 3.07229 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55911 7.93683Z" stroke="currentColor"></path></svg>` },
  "folder-open": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z" fill="currentColor" opacity="0.16"></path><path d="M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z" fill="currentColor"></path><path d="M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z" fill="currentColor"></path></svg>` },
  "folder-close": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z" stroke="currentColor"></path><path d="M3.63501 7.66614H12.3647" stroke="currentColor"></path></svg>` },
  "tree-corner": { size: 10, aspect: [8, 10], svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 11" fill="none" stroke-width="${strokeWidth}"><path d="M0.5 0V7C0.5 7.79565 0.81607 8.55871 1.37868 9.12132C1.94129 9.68393 2.70435 10 3.5 10H8.5" stroke="currentColor"></path></svg>` },
  "light-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8.00007 11.8117C10.1052 11.8117 11.8117 10.1052 11.8117 8.00007C11.8117 5.89499 10.1052 4.18848 8.00007 4.18848C5.89499 4.18848 4.18848 5.89499 4.18848 8.00007C4.18848 10.1052 5.89499 11.8117 8.00007 11.8117Z" stroke="currentColor"></path><path d="M13.3899 8H15.1499" stroke="currentColor"></path><path d="M11.8115 11.8115L13.0556 13.0556" stroke="currentColor"></path><path d="M8 13.3901V15.1501" stroke="currentColor"></path><path d="M4.18868 11.8115L2.94458 13.0556" stroke="currentColor"></path><path d="M2.6101 8H0.850098" stroke="currentColor"></path><path d="M4.18868 4.18856L2.94458 2.94446" stroke="currentColor"></path><path d="M8 2.6101V0.850098" stroke="currentColor"></path><path d="M11.8115 4.18856L13.0556 2.94446" stroke="currentColor"></path></svg>` },
  "dark-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.1127 8.70663C14.2576 8.60602 14.4627 8.71355 14.4386 8.88834C14.2901 9.96567 13.8731 10.9912 13.2229 11.8692C12.479 12.8735 11.4613 13.6421 10.2917 14.0829C9.1222 14.5236 7.85038 14.6179 6.62865 14.3543C5.40692 14.0907 4.28709 13.4805 3.40332 12.5967C2.51955 11.7129 1.90931 10.5931 1.64572 9.37135C1.38212 8.14962 1.47635 6.87779 1.91711 5.70825C2.35787 4.5387 3.12647 3.52103 4.13083 2.77714C5.00878 2.12689 6.03433 1.70994 7.11166 1.5614C7.28645 1.5373 7.39397 1.74238 7.29337 1.88734C6.68703 2.76099 6.37885 3.81241 6.42313 4.88345C6.47392 6.11194 6.98471 7.27645 7.85413 8.14587C8.72355 9.01529 9.88805 9.52608 11.1166 9.57687C12.1876 9.62114 13.239 9.31296 14.1127 8.70663Z" stroke="currentColor"></path></svg>` },
  "followsystem-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V11.5C1.5 12.0523 1.94772 12.5 2.5 12.5H13.5C14.0523 12.5 14.5 12.0523 14.5 11.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z" stroke="currentColor"></path><path d="M5 14.5H11" stroke="currentColor"></path></svg>` },
  "data-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z" fill="currentColor"></path><path d="M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z" stroke="currentColor" stroke-miterlimit="10"></path></svg>` },
  "database-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z" stroke="currentColor"></path><path d="M2 3.80371V11.7848" stroke="currentColor"></path><path d="M14 3.80371V11.7848" stroke="currentColor"></path><path d="M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396" stroke="currentColor"></path><path d="M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847" stroke="currentColor"></path></svg>` },
  "clock-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="currentColor"></path><path d="M8 4.31V8.46L11 10.08" stroke="currentColor"></path></svg>` },
  "gauge-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096" stroke="currentColor"></path><path d="M8 8.49994L11.6114 4.88855" stroke="currentColor"></path><path d="M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z" fill="currentColor"></path></svg>` },
  "send-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.97211 1.94476C7.55785 1.35914 8.50767 1.35919 9.09343 1.94476L13.921 6.77228L13.2138 7.47939L8.38632 2.65187C8.19108 2.45682 7.87443 2.45677 7.67922 2.65187L2.74397 7.58711L2.03687 6.88L6.97211 1.94476Z" fill="currentColor"></path><path d="M7.97571 14.5732L8.02421 2.34139" stroke="currentColor"></path></svg>` },
  "queue-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5 6.75H11" stroke="currentColor"></path><path d="M5 9H8" stroke="currentColor"></path><path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334" stroke="currentColor"></path></svg>` },
  "checklist-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M3.75 6.25C4.7165 6.25 5.5 5.4665 5.5 4.5C5.5 3.5335 4.7165 2.75 3.75 2.75C2.7835 2.75 2 3.5335 2 4.5C2 5.4665 2.7835 6.25 3.75 6.25Z" stroke="currentColor"></path><path d="M7.5 4.5H13.5" stroke="currentColor"></path><path d="M3.75 13.25C4.7165 13.25 5.5 12.4665 5.5 11.5C5.5 10.5335 4.7165 9.75 3.75 9.75C2.7835 9.75 2 10.5335 2 11.5C2 12.4665 2.7835 13.25 3.75 13.25Z" stroke="currentColor"></path><path d="M7.5 11.5H13.5" stroke="currentColor"></path></svg>` },
  "list-pen-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z" fill="currentColor"></path><path d="M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z" fill="currentColor"></path><path d="M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z" fill="currentColor"></path></svg>` },
  "goal-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5" stroke="currentColor"></path><path d="M11.5 8C11.5001 8.69227 11.2948 9.36901 10.9102 9.94463C10.5257 10.5202 9.97901 10.9689 9.33944 11.2338C8.69986 11.4987 7.99609 11.5681 7.31712 11.433C6.63816 11.2979 6.01449 10.9645 5.52501 10.475C5.03548 9.98552 4.70209 9.36185 4.56702 8.68289C4.43195 8.00392 4.50127 7.30015 4.76619 6.66057C5.03112 6.021 5.47976 5.47436 6.05538 5.08978C6.631 4.70519 7.30774 4.49995 8.00001 4.5" stroke="currentColor"></path><path d="M8.00024 7.99976L11.2 4.80005" stroke="currentColor"></path><path d="M12.4719 5.62245C12.4246 5.66972 12.3569 5.69025 12.2913 5.67715L10.7814 5.37555C10.7022 5.35972 10.6402 5.29781 10.6244 5.2186L10.3228 3.70866C10.3097 3.6431 10.3302 3.57533 10.3775 3.52806L12.1826 1.723C12.2863 1.61929 12.4627 1.65879 12.5122 1.79684L12.9271 2.95225C12.9472 3.00847 12.9915 3.05272 13.0477 3.07291L14.2031 3.48774C14.3412 3.5373 14.3807 3.71368 14.277 3.81739L12.4719 5.62245Z" stroke="currentColor"></path></svg>` },
  "sparkle": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z" stroke="currentColor"></path><path d="M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z" stroke="currentColor"></path><path d="M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z" stroke="currentColor"></path></svg>` },
  "inspect-outline": { size: 12, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.67398 4.25061L1.36094 7.86484C1.29085 7.9413 1.29085 8.05866 1.36094 8.13513L4.67398 11.7494" stroke="currentColor"></path><path d="M11.3262 4.25061L14.6392 7.86484C14.7093 7.9413 14.7093 8.05866 14.6392 8.13513L11.3262 11.7494" stroke="currentColor"></path><path d="M9.56222 3.62573L6.43774 12.3743" stroke="currentColor"></path></svg>` },
  "skill-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="none" stroke-width="${strokeWidth}"><path d="M4.57788 5.77124H10.7029" stroke="currentColor"></path><path d="M4.57788 8.89819H7.91879" stroke="currentColor"></path><path d="M12.1404 1.19446C12.9442 1.19446 13.6404 1.81999 13.6404 2.64465V8.89856H12.6404V2.64465C12.6404 2.42015 12.4411 2.19446 12.1404 2.19446H3.14038C2.83968 2.19446 2.64038 2.42015 2.64038 2.64465V13.0929C2.64082 13.3172 2.84001 13.5421 3.14038 13.5421H8.88159V14.5421H3.14038C2.33675 14.5421 1.6408 13.9172 1.64038 13.0929V2.64465C1.64038 1.81999 2.33651 1.19446 3.14038 1.19446H12.1404Z" fill="currentColor"></path><path d="M12.0051 15.1056C12.0051 13.6395 10.8166 12.451 9.35059 12.451C10.8166 12.451 12.0051 11.2626 12.0051 9.79651C12.0051 11.2626 13.1936 12.451 14.6597 12.451C13.1936 12.451 12.0051 13.6395 12.0051 15.1056Z" stroke="currentColor"></path></svg>` },
  "question-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M5.75 6.69646C5.75 6.29865 5.88196 5.90976 6.12919 5.57899C6.37643 5.24821 6.72783 4.99041 7.13896 4.83817C7.5501 4.68593 8.0025 4.6461 8.43895 4.72371C8.87541 4.80132 9.27632 4.99289 9.59099 5.27419C9.90566 5.55549 10.12 5.91388 10.2068 6.30406C10.2936 6.69423 10.249 7.09866 10.0787 7.4662C9.90843 7.83373 9.62004 8.14787 9.25003 8.36889C9.19476 8.4019 9.13803 8.43262 9.08004 8.46099C8.52566 8.73217 8 9.20817 8 9.82532" stroke="currentColor"></path><path d="M8 10.7416V11.7416" stroke="currentColor"></path></svg>` },
  "info-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="none" stroke-width="${strokeWidth}"><path d="M12.5757 7.00012C12.5757 3.92085 10.0794 1.42463 7.00012 1.42456C3.9208 1.42456 1.42456 3.9208 1.42456 7.00012C1.42463 10.0794 3.92085 12.5757 7.00012 12.5757C10.0793 12.5756 12.5756 10.0793 12.5757 7.00012ZM13.8002 7.00012C13.8001 10.7559 10.7559 13.8001 7.00012 13.8002C3.2443 13.8002 0.199291 10.7559 0.199219 7.00012C0.199219 3.24426 3.24426 0.199219 7.00012 0.199219C10.7559 0.199291 13.8002 3.2443 13.8002 7.00012Z" fill="currentColor"></path><path d="M7.6127 3.18921V4.55986H6.38735V3.18921H7.6127Z" fill="currentColor"></path><path d="M7.6127 5.68921V10.8109H6.38735V5.68921H7.6127Z" fill="currentColor"></path></svg>` },
  "plugin-pinwheel-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942" stroke="currentColor"></path><path d="M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037" stroke="currentColor"></path><path d="M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798" stroke="currentColor"></path><path d="M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723" stroke="currentColor"></path></svg>` },
  "alarm-clock-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="none" stroke-width="${strokeWidth}"><path d="M4.09372 11.9895L3.11865 14.0387" stroke="currentColor"></path><path d="M12.1392 11.9895L13.1143 14.0387" stroke="currentColor"></path><path d="M8.11646 4.78442V8.03442L10.6165 9.53442" stroke="currentColor"></path><path d="M8.11646 13.4094C11.154 13.4094 13.6165 10.947 13.6165 7.90942C13.6165 4.87186 11.154 2.40942 8.11646 2.40942C5.07889 2.40942 2.61646 4.87186 2.61646 7.90942C2.61646 10.947 5.07889 13.4094 8.11646 13.4094Z" stroke="currentColor"></path><path d="M1.75952 4.74323C2.30657 3.65639 3.12646 2.73047 4.12926 2.05542" stroke="currentColor"></path><path d="M14.3345 4.74323C13.7874 3.65639 12.9675 2.73047 11.9647 2.05542" stroke="currentColor"></path></svg>` },
  "archive-outline": { size: 20, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z" stroke="currentColor"></path><path d="M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5" stroke="currentColor"></path><path d="M6.5 9.5H9.5" stroke="currentColor"></path></svg>` },
  "wrap-lines-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M2.3457 3.19299H13.6541" stroke="currentColor"></path><path d="M2.3457 7.46497H9.19332" stroke="currentColor"></path><path d="M2.3457 11.7369H6.4849" stroke="currentColor"></path><path d="M9.1936 7.46497H11.5183C12.6981 7.46497 13.6544 8.42132 13.6544 9.60103C13.6544 10.7808 12.6981 11.7371 11.5183 11.7371H9.1936" stroke="currentColor"></path><path d="M10.9505 9.7677L9.12262 11.5956C9.04452 11.6737 9.04452 11.8003 9.12262 11.8784L10.9505 13.7063" stroke="currentColor"></path></svg>` },
  "nowrap-fill": { size: 16, svg: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M2 15H1V1H2V15Z" fill="currentColor"></path><path d="M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z" fill="currentColor"></path><path d="M15 15H14V1H15V15Z" fill="currentColor"></path></svg>' },
  "wrap-fill": { size: 16, svg: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M10.9999 8C10.9999 6.89543 10.1046 6 9 6H4.5V5H9C10.6568 5 11.9999 6.34315 11.9999 8C11.9999 9.65685 10.6568 11 9 11H6.20703L6.85351 11.6465L6.14648 12.3535L4.64652 10.8536C4.45126 10.6583 4.45126 10.3417 4.64652 10.1464L6.14648 8.64648L6.85351 9.35352L6.20703 10H9C10.1046 10 10.9999 9.10457 10.9999 8Z" fill="currentColor"></path><path d="M2 15H1V1H2V15Z" fill="currentColor"></path><path d="M15 15H14V1H15V15Z" fill="currentColor"></path></svg>' },
  "compare-split-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H6C6.55228 14.5 7 14.0523 7 13.5V2.5C7 1.94772 6.55228 1.5 6 1.5Z" stroke="currentColor"></path><path d="M13.5 1.5H10C9.44772 1.5 9 1.94772 9 2.5V13.5C9 14.0523 9.44772 14.5 10 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z" stroke="currentColor"></path></svg>` },
  "plan-outline": { size: 14, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M4.9375 5.90295H11.0625" stroke="currentColor"></path><path d="M4.9375 9.02991H8.27841" stroke="currentColor"></path><path d="M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z" fill="currentColor"></path><path d="M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z" fill="currentColor"></path><path d="M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z" fill="currentColor"></path></svg>` },
  "compact-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path opacity="0.35" d="M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z" stroke="currentColor"></path><path d="M8 1.5C8.85359 1.5 9.69883 1.66813 10.4874 1.99478C11.2761 2.32144 11.9926 2.80022 12.5962 3.40381C13.1998 4.00739 13.6786 4.72394 14.0052 5.51256C14.3319 6.30117 14.5 7.14641 14.5 8" stroke="currentColor"></path></svg>` },
  "shield-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M6.80132 2.14853C7.70663 1.80917 8.70422 1.80919 9.60952 2.14859L14.1296 3.84317V7.11961C14.1296 11.6089 10.7615 13.5975 8.20543 14.5779C5.64931 13.5975 2.28052 11.6089 2.28052 7.11961V3.84317L6.80132 2.14853Z" stroke="currentColor" stroke-linejoin="round"></path></svg>` },
  "check-circle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z" fill="currentColor"></path><path d="M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z" fill="currentColor"></path></svg>` },
  "unarchive-outline": { size: 20, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke-width="${strokeWidth}"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"></path><path d="M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path></svg>` },
  "pin-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" stroke="currentColor" stroke-linejoin="round"></path><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"></path></svg>` },
  "pin-fill": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="${strokeWidth}"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"></path><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"></path></svg>` },
  "flat-list-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M6 3.5h7.5M6 8h7.5M6 12.5h7.5"></path><path d="M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01"></path></svg>` },
  "workspace-tree-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="M14 12.05c0 .8-.65 1.45-1.46 1.45H3.46C2.65 13.5 2 12.85 2 12.05v-8.1c0-.8.65-1.45 1.46-1.45h2.4c.49 0 .94.24 1.21.65l.5.73c.27.4.73.65 1.21.65h3.76c.8 0 1.46.65 1.46 1.45v6.02Z"></path><path d="M8.7 8.1v3M11.2 8.1v3"></path></svg>` },
  "chevrons-up-down-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><path d="m5.1 6 2.9-2.9L10.9 6"></path><path d="m5.1 10 2.9 2.9 2.9-2.9"></path></svg>` },
  "drag-handle-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M4 5h8M4 8h8M4 11h8"></path></svg>` },
  "archive-off-outline": { size: 16, svg: (strokeWidth) => strokeWidth === ICON_MEDIUM_STROKE ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><mask id="dsw-icon-archive-off-outline-medium-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect x="0" y="0" width="16" height="16" fill="white" stroke="none"></rect><path d="m2.2 1.3 11.6 12.8" stroke="black" stroke-width="4.3"></path></mask><g mask="url(#dsw-icon-archive-off-outline-medium-mask)"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path></g><path d="m2.2 1.3 11.6 12.8"></path></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><mask id="dsw-icon-archive-off-outline-regular-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16"><rect x="0" y="0" width="16" height="16" fill="white" stroke="none"></rect><path d="m2.2 1.3 11.6 12.8" stroke="black" stroke-width="4"></path></mask><g mask="url(#dsw-icon-archive-off-outline-regular-mask)"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path></g><path d="m2.2 1.3 11.6 12.8"></path></svg>` },
  "archive-check-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeWidth}"><rect x="1.9" y="2.1" width="12.2" height="3.4" rx="1.1"></rect><path d="M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7"></path><path d="m6 9.35 1.4 1.4 2.6-2.6"></path></svg>` },
  "sliders-two-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"><path d="M2.3 5h5.85M12.05 5h1.65"></path><circle cx="9.95" cy="5" r="1.45"></circle><path d="M2.3 11h1.65M7.85 11h5.85"></path><circle cx="5.75" cy="11" r="1.45"></circle></svg>` },
  "microphone-outline": { size: 16, svg: (strokeWidth) => strokeWidth === ICON_MEDIUM_STROKE ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="5.15" y="1.65" width="5.7" height="8.7" rx="2.85"></rect><path d="M2.35 8.675C3.075 11.3 5.2 13.125 8 13.125C10.8 13.125 12.925 11.3 13.65 8.675M8 13.125V15"></path></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="5" y="1.5" width="6" height="9" rx="3"></rect><path d="M2.35 8.675C3.075 11.3 5.2 13.125 8 13.125C10.8 13.125 12.925 11.3 13.65 8.675M8 13.125V15"></path></svg>` },
  "apps-add-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="2.25" y="2.25" width="4" height="4" rx="1"></rect><rect x="2.25" y="9.75" width="4" height="4" rx="1"></rect><rect x="9.75" y="9.75" width="4" height="4" rx="1"></rect><path d="M11.75 1.75v5M9.25 4.25h5"></path></svg>` },
  "apps-add-compact-outline": { size: 16, svg: (strokeWidth) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="${strokeWidth}"><rect x="2.75" y="2.75" width="4" height="4" rx="1"></rect><rect x="2.75" y="9.25" width="4" height="4" rx="1"></rect><rect x="9.25" y="9.25" width="4" height="4" rx="1"></rect><path d="M11.25 2.25v5M8.75 4.75h5"></path></svg>` }
};
var STROKES = { regular: ICON_REGULAR_STROKE, medium: ICON_MEDIUM_STROKE };
function iconSymbolId(glyph, weight) {
  return `dsw-icon-${glyph}-${weight}`;
}
var ICON_SYMBOLS = Object.freeze(Object.fromEntries(
  Object.entries(ICON_ARTWORK).flatMap(([glyph, artwork]) => Object.keys(STROKES).map((weight) => [iconSymbolId(glyph, weight), artwork.svg(STROKES[weight])]))
));

// upstream/packages/client/ui-primitives/src/icons/index.tsx.snapshot
import { jsx } from "react/jsx-runtime";
function productIcon(glyph, weight) {
  const { size: defaultSize, aspect: [width, height] = [1, 1] } = ICON_ARTWORK[glyph];
  const id = iconSymbolId(glyph, weight);
  return ({ size = defaultSize, className }) => /* @__PURE__ */ jsx("svg", { width: size * width / height, height: size, className, "data-icon": id, "aria-hidden": "true", children: /* @__PURE__ */ jsx("use", { href: `#${id}` }) });
}
var IconLayersOutlineRegular = productIcon("layers-outline", "regular");
var IconLayersOutlineMedium = productIcon("layers-outline", "medium");
var IconNewChatOutlineRegular = productIcon("new-chat-outline", "regular");
var IconNewChatOutlineMedium = productIcon("new-chat-outline", "medium");
var IconSearchOutlineRegular = productIcon("search-outline", "regular");
var IconSearchOutlineMedium = productIcon("search-outline", "medium");
var IconEyeOutlineRegular = productIcon("eye-outline", "regular");
var IconEyeOutlineMedium = productIcon("eye-outline", "medium");
var IconEyeOffOutlineRegular = productIcon("eye-off-outline", "regular");
var IconEyeOffOutlineMedium = productIcon("eye-off-outline", "medium");
var IconGlobeOutlineRegular = productIcon("globe-outline", "regular");
var IconGlobeOutlineMedium = productIcon("globe-outline", "medium");
var IconSettingsOutlineRegular = productIcon("settings-outline", "regular");
var IconSettingsOutlineMedium = productIcon("settings-outline", "medium");
var IconPanelLeftOutlineRegular = productIcon("panel-left-outline", "regular");
var IconPanelLeftOutlineMedium = productIcon("panel-left-outline", "medium");
var IconEllipsisOutlineRegular = productIcon("ellipsis-outline", "regular");
var IconEllipsisOutlineMedium = productIcon("ellipsis-outline", "medium");
var IconPlusOutlineRegular = productIcon("plus-outline", "regular");
var IconPlusOutlineMedium = productIcon("plus-outline", "medium");
var IconCheckOutlineRegular = productIcon("check-outline", "regular");
var IconCheckOutlineMedium = productIcon("check-outline", "medium");
var IconMailUnreadOutlineRegular = productIcon("mail-unread-outline", "regular");
var IconMailUnreadOutlineMedium = productIcon("mail-unread-outline", "medium");
var IconMailReadOutlineRegular = productIcon("mail-read-outline", "regular");
var IconMailReadOutlineMedium = productIcon("mail-read-outline", "medium");
var IconBranchOutlineRegular = productIcon("branch-outline", "regular");
var IconBranchOutlineMedium = productIcon("branch-outline", "medium");
var IconChevronDownOutlineRegular = productIcon("chevron-down-outline", "regular");
var IconChevronDownOutlineMedium = productIcon("chevron-down-outline", "medium");
var IconChevronLeftOutlineRegular = productIcon("chevron-left-outline", "regular");
var IconChevronLeftOutlineMedium = productIcon("chevron-left-outline", "medium");
var IconChevronRightOutlineRegular = productIcon("chevron-right-outline", "regular");
var IconChevronRightOutlineMedium = productIcon("chevron-right-outline", "medium");
var IconTriangleRightFillRegular = productIcon("triangle-right-fill", "regular");
var IconTriangleRightFillMedium = productIcon("triangle-right-fill", "medium");
var IconChevronUpOutlineRegular = productIcon("chevron-up-outline", "regular");
var IconChevronUpOutlineMedium = productIcon("chevron-up-outline", "medium");
var IconCloseOutlineRegular = productIcon("close-outline", "regular");
var IconCloseOutlineMedium = productIcon("close-outline", "medium");
var IconCloseFillRegular = productIcon("close-fill", "regular");
var IconCloseFillMedium = productIcon("close-fill", "medium");
var IconCloseCircleFillRegular = productIcon("close-circle-fill", "regular");
var IconCloseCircleFillMedium = productIcon("close-circle-fill", "medium");
var IconCopyOutlineRegular = productIcon("copy-outline", "regular");
var IconCopyOutlineMedium = productIcon("copy-outline", "medium");
var IconRefreshOutlineRegular = productIcon("refresh-outline", "regular");
var IconRefreshOutlineMedium = productIcon("refresh-outline", "medium");
var IconLikeOutlineRegular = productIcon("like-outline", "regular");
var IconLikeOutlineMedium = productIcon("like-outline", "medium");
var IconLikeFillRegular = productIcon("like-fill", "regular");
var IconLikeFillMedium = productIcon("like-fill", "medium");
var IconDislikeOutlineRegular = productIcon("dislike-outline", "regular");
var IconDislikeOutlineMedium = productIcon("dislike-outline", "medium");
var IconDislikeFillRegular = productIcon("dislike-fill", "regular");
var IconDislikeFillMedium = productIcon("dislike-fill", "medium");
var IconShareOutlineRegular = productIcon("share-outline", "regular");
var IconShareOutlineMedium = productIcon("share-outline", "medium");
var IconDeliverDocRegular = productIcon("deliver-doc", "regular");
var IconDeliverDocMedium = productIcon("deliver-doc", "medium");
var IconEditOutlineRegular = productIcon("edit-outline", "regular");
var IconEditOutlineMedium = productIcon("edit-outline", "medium");
var IconThinkOutlineRegular = productIcon("think-outline", "regular");
var IconThinkOutlineMedium = productIcon("think-outline", "medium");
var IconAgentPresetOutlineRegular = productIcon("agent-preset-outline", "regular");
var IconAgentPresetOutlineMedium = productIcon("agent-preset-outline", "medium");
var IconBrowseOutlineRegular = productIcon("browse-outline", "regular");
var IconBrowseOutlineMedium = productIcon("browse-outline", "medium");
var IconContextInjectionOutlineRegular = productIcon("context-injection-outline", "regular");
var IconContextInjectionOutlineMedium = productIcon("context-injection-outline", "medium");
var IconLinkOutlineRegular = productIcon("link-outline", "regular");
var IconLinkOutlineMedium = productIcon("link-outline", "medium");
var IconRightUpOutlineRegular = productIcon("right-up-outline", "regular");
var IconRightUpOutlineMedium = productIcon("right-up-outline", "medium");
var IconEnhanceOutlineRegular = productIcon("enhance-outline", "regular");
var IconEnhanceOutlineMedium = productIcon("enhance-outline", "medium");
var IconTrashOutlineRegular = productIcon("trash-outline", "regular");
var IconTrashOutlineMedium = productIcon("trash-outline", "medium");
var IconWarningOutlineRegular = productIcon("warning-outline", "regular");
var IconWarningOutlineMedium = productIcon("warning-outline", "medium");
var IconCheckCircleFillRegular = productIcon("check-circle-fill", "regular");
var IconCheckCircleFillMedium = productIcon("check-circle-fill", "medium");
var IconWarningTriangleOutlineRegular = productIcon("warning-triangle-outline", "regular");
var IconWarningTriangleOutlineMedium = productIcon("warning-triangle-outline", "medium");
var IconUserOutlineRegular = productIcon("user-outline", "regular");
var IconUserOutlineMedium = productIcon("user-outline", "medium");
var IconUsersOutlineRegular = productIcon("users-outline", "regular");
var IconUsersOutlineMedium = productIcon("users-outline", "medium");
var IconPaperPlaneOutlineRegular = productIcon("paper-plane-outline", "regular");
var IconPaperPlaneOutlineMedium = productIcon("paper-plane-outline", "medium");
var IconStopFillRegular = productIcon("stop-fill", "regular");
var IconStopFillMedium = productIcon("stop-fill", "medium");
var IconPaperclipOutlineRegular = productIcon("paperclip-outline", "regular");
var IconPaperclipOutlineMedium = productIcon("paperclip-outline", "medium");
var IconLoadingOutlineRegular = productIcon("loading-outline", "regular");
var IconLoadingOutlineMedium = productIcon("loading-outline", "medium");
var IconDownloadOutlineRegular = productIcon("download-outline", "regular");
var IconDownloadOutlineMedium = productIcon("download-outline", "medium");
var IconUploadOutlineRegular = productIcon("upload-outline", "regular");
var IconUploadOutlineMedium = productIcon("upload-outline", "medium");
var IconPlayOutlineRegular = productIcon("play-outline", "regular");
var IconPlayOutlineMedium = productIcon("play-outline", "medium");
var IconPauseOutlineRegular = productIcon("pause-outline", "regular");
var IconPauseOutlineMedium = productIcon("pause-outline", "medium");
var IconFullscreenOutlineRegular = productIcon("fullscreen-outline", "regular");
var IconFullscreenOutlineMedium = productIcon("fullscreen-outline", "medium");
var IconCodeOutlineRegular = productIcon("code-outline", "regular");
var IconCodeOutlineMedium = productIcon("code-outline", "medium");
var IconCordisPluginOutlineRegular = productIcon("cordis-plugin-outline", "regular");
var IconCordisPluginOutlineMedium = productIcon("cordis-plugin-outline", "medium");
var IconApiOutlineRegular = productIcon("api-outline", "regular");
var IconApiOutlineMedium = productIcon("api-outline", "medium");
var IconPersonalizationOutlineRegular = productIcon("personalization-outline", "regular");
var IconPersonalizationOutlineMedium = productIcon("personalization-outline", "medium");
var IconProjectAddOutlineRegular = productIcon("project-add-outline", "regular");
var IconProjectAddOutlineMedium = productIcon("project-add-outline", "medium");
var IconFolderOpenOutlineRegular = productIcon("folder-open-outline", "regular");
var IconFolderOpenOutlineMedium = productIcon("folder-open-outline", "medium");
var IconFolderOpenRegular = productIcon("folder-open", "regular");
var IconFolderOpenMedium = productIcon("folder-open", "medium");
var IconFolderCloseRegular = productIcon("folder-close", "regular");
var IconFolderCloseMedium = productIcon("folder-close", "medium");
var IconTreeCornerRegular = productIcon("tree-corner", "regular");
var IconTreeCornerMedium = productIcon("tree-corner", "medium");
var IconLightOutlineRegular = productIcon("light-outline", "regular");
var IconLightOutlineMedium = productIcon("light-outline", "medium");
var IconDarkOutlineRegular = productIcon("dark-outline", "regular");
var IconDarkOutlineMedium = productIcon("dark-outline", "medium");
var IconFollowsystemOutlineRegular = productIcon("followsystem-outline", "regular");
var IconFollowsystemOutlineMedium = productIcon("followsystem-outline", "medium");
var IconDataOutlineRegular = productIcon("data-outline", "regular");
var IconDataOutlineMedium = productIcon("data-outline", "medium");
var IconDatabaseOutlineRegular = productIcon("database-outline", "regular");
var IconDatabaseOutlineMedium = productIcon("database-outline", "medium");
var IconClockOutlineRegular = productIcon("clock-outline", "regular");
var IconClockOutlineMedium = productIcon("clock-outline", "medium");
var IconGaugeOutlineRegular = productIcon("gauge-outline", "regular");
var IconGaugeOutlineMedium = productIcon("gauge-outline", "medium");
var IconSendOutlineRegular = productIcon("send-outline", "regular");
var IconSendOutlineMedium = productIcon("send-outline", "medium");
var IconQueueOutlineRegular = productIcon("queue-outline", "regular");
var IconQueueOutlineMedium = productIcon("queue-outline", "medium");
var IconChecklistOutlineRegular = productIcon("checklist-outline", "regular");
var IconChecklistOutlineMedium = productIcon("checklist-outline", "medium");
var IconListPenOutlineRegular = productIcon("list-pen-outline", "regular");
var IconListPenOutlineMedium = productIcon("list-pen-outline", "medium");
var IconGoalOutlineRegular = productIcon("goal-outline", "regular");
var IconGoalOutlineMedium = productIcon("goal-outline", "medium");
var IconSparkleRegular = productIcon("sparkle", "regular");
var IconSparkleMedium = productIcon("sparkle", "medium");
var IconInspectOutlineRegular = productIcon("inspect-outline", "regular");
var IconInspectOutlineMedium = productIcon("inspect-outline", "medium");
var IconSkillOutlineRegular = productIcon("skill-outline", "regular");
var IconSkillOutlineMedium = productIcon("skill-outline", "medium");
var IconQuestionOutlineRegular = productIcon("question-outline", "regular");
var IconQuestionOutlineMedium = productIcon("question-outline", "medium");
var IconInfoOutlineRegular = productIcon("info-outline", "regular");
var IconInfoOutlineMedium = productIcon("info-outline", "medium");
var IconPluginPinwheelOutlineRegular = productIcon("plugin-pinwheel-outline", "regular");
var IconPluginPinwheelOutlineMedium = productIcon("plugin-pinwheel-outline", "medium");
var IconAlarmClockOutlineRegular = productIcon("alarm-clock-outline", "regular");
var IconAlarmClockOutlineMedium = productIcon("alarm-clock-outline", "medium");
var IconArchiveOutlineRegular = productIcon("archive-outline", "regular");
var IconArchiveOutlineMedium = productIcon("archive-outline", "medium");
var IconWrapLinesOutlineRegular = productIcon("wrap-lines-outline", "regular");
var IconWrapLinesOutlineMedium = productIcon("wrap-lines-outline", "medium");
var IconNowrapFillRegular = productIcon("nowrap-fill", "regular");
var IconNowrapFillMedium = productIcon("nowrap-fill", "medium");
var IconWrapFillRegular = productIcon("wrap-fill", "regular");
var IconWrapFillMedium = productIcon("wrap-fill", "medium");
var IconCompareSplitOutlineRegular = productIcon("compare-split-outline", "regular");
var IconCompareSplitOutlineMedium = productIcon("compare-split-outline", "medium");
var IconPlanOutlineRegular = productIcon("plan-outline", "regular");
var IconPlanOutlineMedium = productIcon("plan-outline", "medium");
var IconCompactOutlineRegular = productIcon("compact-outline", "regular");
var IconCompactOutlineMedium = productIcon("compact-outline", "medium");
var IconShieldOutlineRegular = productIcon("shield-outline", "regular");
var IconShieldOutlineMedium = productIcon("shield-outline", "medium");
var IconCheckCircleOutlineRegular = productIcon("check-circle-outline", "regular");
var IconCheckCircleOutlineMedium = productIcon("check-circle-outline", "medium");
var IconUnarchiveOutlineRegular = productIcon("unarchive-outline", "regular");
var IconUnarchiveOutlineMedium = productIcon("unarchive-outline", "medium");
var IconPinOutlineRegular = productIcon("pin-outline", "regular");
var IconPinOutlineMedium = productIcon("pin-outline", "medium");
var IconPinFillRegular = productIcon("pin-fill", "regular");
var IconPinFillMedium = productIcon("pin-fill", "medium");
var IconFlatListOutlineRegular = productIcon("flat-list-outline", "regular");
var IconFlatListOutlineMedium = productIcon("flat-list-outline", "medium");
var IconWorkspaceTreeOutlineRegular = productIcon("workspace-tree-outline", "regular");
var IconWorkspaceTreeOutlineMedium = productIcon("workspace-tree-outline", "medium");
var IconChevronsUpDownOutlineRegular = productIcon("chevrons-up-down-outline", "regular");
var IconChevronsUpDownOutlineMedium = productIcon("chevrons-up-down-outline", "medium");
var IconDragHandleOutlineRegular = productIcon("drag-handle-outline", "regular");
var IconDragHandleOutlineMedium = productIcon("drag-handle-outline", "medium");
var IconArchiveOffOutlineRegular = productIcon("archive-off-outline", "regular");
var IconArchiveOffOutlineMedium = productIcon("archive-off-outline", "medium");
var IconArchiveCheckOutlineRegular = productIcon("archive-check-outline", "regular");
var IconArchiveCheckOutlineMedium = productIcon("archive-check-outline", "medium");
var IconSlidersTwoOutlineRegular = productIcon("sliders-two-outline", "regular");
var IconSlidersTwoOutlineMedium = productIcon("sliders-two-outline", "medium");
var IconMicrophoneOutlineRegular = productIcon("microphone-outline", "regular");
var IconMicrophoneOutlineMedium = productIcon("microphone-outline", "medium");
function appsAddIcon(weight) {
  const Wide = productIcon("apps-add-outline", weight);
  const Compact = productIcon("apps-add-compact-outline", weight);
  return ({ compact = false, ...props }) => compact ? /* @__PURE__ */ jsx(Compact, { ...props }) : /* @__PURE__ */ jsx(Wide, { ...props });
}
var IconAppsAddOutlineRegular = appsAddIcon("regular");
var IconAppsAddOutlineMedium = appsAddIcon("medium");
var IconSaveOutlineRegular = productIcon("save-outline", "regular");
var IconSaveOutlineMedium = productIcon("save-outline", "medium");

// upstream/packages/client/ui-primitives/src/ShortcutKeys.module.css.snapshot
var ShortcutKeys_module_css_default = {
  keys: "ShortcutKeys_module_css_keys",
  key: "ShortcutKeys_module_css_key",
  tooltip: "ShortcutKeys_module_css_tooltip",
  separator: "ShortcutKeys_module_css_separator",
  joined: "ShortcutKeys_module_css_joined"
};

// upstream/packages/client/ui-primitives/src/ShortcutKeys.tsx.snapshot
import clsx from "clsx";
import { jsx as jsx2 } from "react/jsx-runtime";
function ShortcutKeys({ keys, variant = "plain", className }) {
  return /* @__PURE__ */ jsx2("span", { className: clsx(ShortcutKeys_module_css_default.keys, variant === "tooltip" && ShortcutKeys_module_css_default.tooltip, variant === "tooltip" && keys.includes("+") && ShortcutKeys_module_css_default.joined, className), children: keys.map((key, index) => /* @__PURE__ */ jsx2("kbd", { className: key === "+" ? ShortcutKeys_module_css_default.separator : ShortcutKeys_module_css_default.key, children: key }, index)) });
}

// upstream/packages/client/ui-primitives/src/Tooltip.tsx.snapshot
import { cloneElement, createContext, useCallback as useCallback2, useContext, useEffect as useEffect3, useId as useId2, useRef as useRef3, useState as useState2 } from "react";
import { createPortal } from "react-dom";

// upstream/packages/client/ui-primitives/src/tooltip-placement.ts.snapshot
var opposite = { right: "left", left: "right", top: "bottom", bottom: "top" };
function placeTooltip(input) {
  const { anchor, viewportWidth, viewportHeight, side, align, gap } = input;
  let { width, height } = input;
  const margin = 12;
  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const maxHeight = Math.max(0, viewportHeight - margin * 2);
  width = Math.min(width, maxWidth);
  height = Math.min(height, maxHeight);
  const clampX = (x) => Math.max(margin, Math.min(x, viewportWidth - margin - width));
  const clampY = (y) => Math.max(margin, Math.min(y, viewportHeight - margin - height));
  const horizontal = side === "right" || side === "left";
  const candidates = [side, opposite[side], ...horizontal ? ["bottom", "top"] : ["right", "left"]];
  const positions = {
    right: { left: anchor.right + 10, top: clampY((anchor.top + anchor.bottom - height) / 2) },
    left: { left: anchor.left - 10 - width, top: clampY((anchor.top + anchor.bottom - height) / 2) },
    bottom: { left: clampX(align === "end" ? anchor.right - width : (anchor.left + anchor.right - width) / 2), top: anchor.bottom + gap },
    top: { left: clampX(align === "end" ? anchor.right - width : (anchor.left + anchor.right - width) / 2), top: anchor.top - gap - height }
  };
  for (const candidate of candidates) {
    const position2 = positions[candidate];
    if (position2.left >= margin && position2.top >= margin && position2.left + width <= viewportWidth - margin && position2.top + height <= viewportHeight - margin) {
      return { ...position2, side: candidate, width, height, overflow: false };
    }
  }
  const position = positions[side];
  return { left: clampX(position.left), top: clampY(position.top), side, width, height, overflow: true };
}

// upstream/packages/client/ui-primitives/src/useDismissOnOutsidePointer.ts.snapshot
import { useEffect as useEffect2 } from "react";
function useDismissOnOutsidePointer(root, open, setOpen, portal) {
  useEffect2(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true && portal?.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [root, open, setOpen, portal]);
}

// upstream/packages/client/ui-primitives/src/Tooltip.module.css.snapshot
var Tooltip_module_css_default = {
  bubble: "Tooltip_module_css_bubble",
  "tooltip-in": "Tooltip_module_css_tooltip-in",
  label: "Tooltip_module_css_label"
};

// upstream/packages/client/ui-primitives/src/input-modality.ts.snapshot
var INPUT_MODALITY = { pointer: "pointer", keyboard: "keyboard" };
var INPUT_MODALITY_ATTRIBUTE = "data-input-modality";
var FOCUS_NAVIGATION = /* @__PURE__ */ new Set(["Tab", "Home", "End", "PageUp", "PageDown"]);
var pointer = false;
var pointerOwnsFocus = false;
var keyFocusOrigin;
function publish() {
  document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, pointerOwnsFocus ? INPUT_MODALITY.pointer : INPUT_MODALITY.keyboard);
}
function pointerModality() {
  return pointer;
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    pointer = true;
    pointerOwnsFocus = true;
    keyFocusOrigin = void 0;
    publish();
  }, true);
  window.addEventListener("keydown", (event) => {
    pointer = false;
    if (event.isComposing) {
      keyFocusOrigin = void 0;
      return;
    }
    keyFocusOrigin = event.composedPath()[0];
    if (!FOCUS_NAVIGATION.has(event.key) && !event.key.startsWith("Arrow")) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("focusin", (event) => {
    if (keyFocusOrigin === void 0 || event.composedPath()[0] === keyFocusOrigin) return;
    keyFocusOrigin = void 0;
    if (!pointerOwnsFocus) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("blur", () => {
    keyFocusOrigin = void 0;
  });
}

// upstream/packages/client/ui-primitives/src/Tooltip.tsx.snapshot
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
var TooltipSuppression = createContext(null);
function clipped(anchor) {
  return [anchor, ...anchor.querySelectorAll("*")].some((el) => el instanceof HTMLElement && el.scrollWidth > el.clientWidth);
}
function Tooltip({ label, shortcutKeys, side = "right", align = "center", delayMs = 0, focusDelayMs = 0, gap = 8, disabled = false, portal = false, maxWidth, openOnClick = false, onlyWhenClipped = false, children }) {
  const id = useId2();
  const [pinned, setPinned] = useState2(false);
  const anchor = useRef3(null);
  const childRef = children.ref;
  const mergedRef = useCallback2((el) => {
    anchor.current = el;
    if (typeof childRef === "function") childRef(el);
    else if (childRef != null) childRef.current = el;
  }, [childRef]);
  const [pos, setPos] = useState2(null);
  const bubble = useRef3(null);
  const resolvedLabel = pos === null ? null : typeof label === "function" ? label() : label;
  const showTimer = useRef3(null);
  const triggers = useRef3({ hover: false, focus: false });
  const suppressAncestors = useContext(TooltipSuppression);
  const [suppressed, setSuppressed] = useState2(false);
  const announce = useCallback2((active) => {
    suppressAncestors?.(active);
  }, [suppressAncestors]);
  const visible = pos !== null && !disabled;
  useEffect3(() => {
    const el = bubble.current;
    if (pos === null || !visible || suppressed || el === null) return;
    let size;
    let anchorRect = pos;
    const fit = () => {
      if (size === void 0) return;
      const placement = placeTooltip({
        anchor: anchorRect,
        width: size.inlineSize,
        height: size.blockSize,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        side,
        align,
        gap
      });
      const horizontal = placement.side === "right" || placement.side === "left";
      const offsetX = horizontal ? 0 : align === "end" ? placement.width : placement.width / 2;
      const offsetY = horizontal ? placement.height / 2 : placement.side === "top" ? placement.height : 0;
      el.style.left = `${placement.left + offsetX}px`;
      el.style.top = `${placement.top + offsetY}px`;
      el.dataset.side = placement.side;
      el.style.visibility = "visible";
    };
    const onResize = () => {
      if (anchor.current !== null) anchorRect = anchor.current.getBoundingClientRect();
      fit();
    };
    const observer = new ResizeObserver((entries) => {
      size = entries[0]?.borderBoxSize[0];
      fit();
    });
    observer.observe(el, { box: "border-box" });
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [align, gap, pos, side, suppressed, visible]);
  useEffect3(() => {
    announce(visible);
    return () => {
      announce(false);
    };
  }, [announce, visible]);
  const cancelShow = useCallback2(() => {
    if (showTimer.current === null) return;
    clearTimeout(showTimer.current);
    showTimer.current = null;
  }, []);
  useEffect3(() => {
    if (pinned && (disabled || !openOnClick)) setPinned(false);
    if (disabled) {
      cancelShow();
      triggers.current = { hover: false, focus: false };
      setPos(null);
    }
    return cancelShow;
  }, [cancelShow, disabled, openOnClick, pinned]);
  const show = () => {
    if (disabled) return;
    const el = anchor.current;
    if (el === null) return;
    if (onlyWhenClipped && !clipped(el)) return;
    setPos(el.getBoundingClientRect());
    announce(true);
  };
  const showAfterDelay = (delay) => {
    cancelShow();
    if (delay <= 0) {
      show();
      return;
    }
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      show();
    }, delay);
  };
  const withdraw = useCallback2(() => {
    setPinned(false);
    setPos(null);
    announce(false);
  }, [announce]);
  const hide = () => {
    cancelShow();
    if (!triggers.current.hover && !triggers.current.focus && !pinned) withdraw();
  };
  const dismiss = useCallback2(() => {
    cancelShow();
    triggers.current = { hover: false, focus: false };
    withdraw();
  }, [cancelShow, withdraw]);
  useDismissOnOutsidePointer(anchor, openOnClick && visible, dismiss, bubble);
  useEffect3(() => {
    if (!openOnClick || !visible) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dismiss, openOnClick, visible]);
  const content = visible && !suppressed && /* @__PURE__ */ jsxs(
    "span",
    {
      ref: bubble,
      id: openOnClick ? id : void 0,
      className: Tooltip_module_css_default.bubble,
      "data-side": side,
      "data-portal": portal || void 0,
      "data-pinned": pinned || void 0,
      "data-align": align,
      "data-has-shortcut": shortcutKeys?.length ? true : void 0,
      style: { left: pos.left, top: pos.top, visibility: "hidden", ...maxWidth === void 0 ? {} : { maxWidth: `min(${maxWidth}px, calc(100vw - 24px))` } },
      role: "tooltip",
      "aria-label": shortcutKeys?.length ? [resolvedLabel, shortcutKeys.join(" ")].filter(Boolean).join(" ") : void 0,
      children: [
        resolvedLabel && /* @__PURE__ */ jsx3("span", { className: Tooltip_module_css_default.label, children: resolvedLabel }),
        shortcutKeys !== void 0 && shortcutKeys.length > 0 && /* @__PURE__ */ jsx3(ShortcutKeys, { keys: shortcutKeys, variant: "tooltip" })
      ]
    }
  );
  return /* @__PURE__ */ jsxs(TooltipSuppression.Provider, { value: setSuppressed, children: [
    cloneElement(children, {
      ref: mergedRef,
      "aria-describedby": openOnClick && visible ? [children.props["aria-describedby"], id].filter(Boolean).join(" ") : children.props["aria-describedby"],
      onPointerEnter: (e) => {
        children.props.onPointerEnter?.(e);
        if (e.pointerType === "touch") return;
        if (e.pointerType === "mouse" && !window.matchMedia("(any-hover: hover)").matches) return;
        triggers.current.hover = true;
        showAfterDelay(delayMs);
      },
      onPointerLeave: (e) => {
        children.props.onPointerLeave?.(e);
        triggers.current.hover = false;
        cancelShow();
        if (!pinned) withdraw();
      },
      onPointerDown: (e) => {
        children.props.onPointerDown?.(e);
        if (e.pointerType === "touch" && !pinned) dismiss();
      },
      // Activating an ordinary action dismisses the bubble: it often changes
      // what the anchor now does (pin → unpin), and the click leaves the
      // anchor focused, which would otherwise pin the relabelled bubble up.
      onClick: (e) => {
        children.props.onClick?.(e);
        triggers.current.focus = false;
        cancelShow();
        if (openOnClick && !disabled && !pinned) {
          setPinned(true);
          show();
        } else withdraw();
      },
      onFocus: (e) => {
        children.props.onFocus?.(e);
        if (pointerModality()) return;
        triggers.current.focus = true;
        showAfterDelay(focusDelayMs);
      },
      onBlur: (e) => {
        children.props.onBlur?.(e);
        triggers.current.focus = false;
        hide();
      }
    }),
    portal ? content !== false && createPortal(content, document.body) : content
  ] });
}

// upstream/packages/client/ui-primitives/src/Menu.module.css.snapshot
var Menu_module_css_default = {
  root: "Menu_module_css_root",
  list: "Menu_module_css_list",
  submenu: "Menu_module_css_submenu",
  portal: "Menu_module_css_portal",
  sideTop: "Menu_module_css_sideTop",
  alignEnd: "Menu_module_css_alignEnd",
  scrollable: "Menu_module_css_scrollable",
  viewport: "Menu_module_css_viewport",
  footer: "Menu_module_css_footer",
  separator: "Menu_module_css_separator",
  itemWrap: "Menu_module_css_itemWrap",
  item: "Menu_module_css_item",
  denseList: "Menu_module_css_denseList",
  label: "Menu_module_css_label",
  compactList: "Menu_module_css_compactList",
  itemIcon: "Menu_module_css_itemIcon",
  check: "Menu_module_css_check",
  itemLabel: "Menu_module_css_itemLabel",
  shortcut: "Menu_module_css_shortcut",
  shortcutKeys: "Menu_module_css_shortcutKeys",
  selected: "Menu_module_css_selected",
  selectedFill: "Menu_module_css_selectedFill",
  danger: "Menu_module_css_danger",
  submenuAnchor: "Menu_module_css_submenuAnchor",
  parentPage: "Menu_module_css_parentPage"
};

// upstream/packages/client/ui-primitives/src/MenuRow.tsx.snapshot
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
function MenuRow({
  children,
  icon,
  shortcut,
  current: current2,
  disabled = false,
  disabledReason,
  danger,
  separatorBefore,
  selected,
  selection = "check",
  reserveIcon,
  decorativeIcon = true,
  wrapperProps,
  ...button
}) {
  const reasonId = useId3();
  const explained = disabled && disabledReason !== void 0;
  return /* @__PURE__ */ jsxs2("div", { ...wrapperProps, className: Menu_module_css_default.itemWrap, children: [
    separatorBefore && /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.separator, role: "separator" }),
    /* @__PURE__ */ jsx4(Tooltip, { label: disabledReason ?? "", disabled: !explained, side: "bottom", delayMs: 500, maxWidth: 300, portal: true, children: /* @__PURE__ */ jsxs2(
      "button",
      {
        ...button,
        type: "button",
        role: "menuitem",
        className: clsx2(Menu_module_css_default.item, selected && (selection === "fill" ? Menu_module_css_default.selectedFill : Menu_module_css_default.selected), danger && Menu_module_css_default.danger),
        disabled: disabled && !explained,
        "aria-disabled": explained || void 0,
        "aria-describedby": explained ? reasonId : void 0,
        "aria-keyshortcuts": shortcut?.aria,
        "aria-current": current2 === true ? "page" : void 0,
        onClick: explained ? void 0 : button.onClick,
        children: [
          (icon !== void 0 || reserveIcon) && /* @__PURE__ */ jsx4("span", { "aria-hidden": decorativeIcon || void 0, className: Menu_module_css_default.itemIcon, children: icon }),
          /* @__PURE__ */ jsx4("span", { className: Menu_module_css_default.itemLabel, children }),
          shortcut !== void 0 && /* @__PURE__ */ jsx4("span", { "aria-hidden": "true", className: Menu_module_css_default.shortcut, children: /* @__PURE__ */ jsx4(ShortcutKeys, { keys: shortcut.keys, className: Menu_module_css_default.shortcutKeys }) }),
          selected && selection === "check" && /* @__PURE__ */ jsx4(IconCheckOutlineRegular, { className: Menu_module_css_default.check }),
          button["aria-haspopup"] === "menu" && /* @__PURE__ */ jsx4(IconChevronRightOutlineRegular, { "aria-hidden": "true", className: Menu_module_css_default.check })
        ]
      }
    ) }),
    explained && /* @__PURE__ */ jsx4("span", { id: reasonId, hidden: true, children: disabledReason })
  ] });
}
function menuIconColumns(entries, contextual) {
  const aligned = /* @__PURE__ */ new Set();
  if (!contextual) return aligned;
  let group = [];
  const finish = () => {
    if (group.some((entry) => !("type" in entry) && entry.icon !== void 0)) {
      for (const entry of group) aligned.add(entry);
    }
    group = [];
  };
  for (const entry of entries) {
    if ("type" in entry && entry.type === "separator") finish();
    else group.push(entry);
  }
  finish();
  return aligned;
}
function renderMenuDecoration(entry) {
  return entry.type === "separator" ? /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.separator, role: "separator" }, entry.id) : /* @__PURE__ */ jsx4("div", { className: Menu_module_css_default.label, role: "presentation", children: entry.text }, entry.id);
}

// upstream/packages/client/ui-primitives/src/SubmenuPanel.tsx.snapshot
import { createPortal as createPortal3 } from "react-dom";
import clsx4 from "clsx";

// upstream/packages/client/ui-primitives/src/MenuSurface.tsx.snapshot
import { forwardRef, useId as useId4, useLayoutEffect as useLayoutEffect2, useRef as useRef4 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import clsx3 from "clsx";

// upstream/packages/client/ui-primitives/src/MenuSurface.module.css.snapshot
var MenuSurface_module_css_default = {
  surface: "MenuSurface_module_css_surface",
  backing: "MenuSurface_module_css_backing",
  compact: "MenuSurface_module_css_compact",
  material: "MenuSurface_module_css_material",
  "dsh-context-menu-in": "MenuSurface_module_css_dsh-context-menu-in",
  "dsh-context-menu-out": "MenuSurface_module_css_dsh-context-menu-out"
};

// upstream/packages/client/ui-primitives/src/MenuSurface.tsx.snapshot
import { Fragment, jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
var MENU_TRANSITION_MS = Object.freeze({ enter: 40, dismiss: 80, replace: 10, prepare: 20 });
var MenuSurface = forwardRef(function MenuSurface2({
  compact = false,
  phase,
  className,
  style,
  children,
  ...props
}, ref) {
  const id = useId4();
  const backingRef = useRef4(null);
  useLayoutEffect2(() => {
    document.body.appendChild(backingRef.current);
  }, []);
  const anchorStyle = {
    "--dsh-menu-anchor": `--dsh-menu-${id.replaceAll(":", "")}`,
    "--dsh-menu-enter": `${MENU_TRANSITION_MS.enter}ms`,
    "--dsh-menu-dismiss": `${MENU_TRANSITION_MS.dismiss}ms`,
    "--dsh-menu-replace": `${MENU_TRANSITION_MS.replace}ms`
  };
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsxs3(
      "div",
      {
        ...props,
        ref,
        "data-menu-material": "translucent",
        "data-menu-phase": phase,
        className: clsx3(MenuSurface_module_css_default.surface, compact && MenuSurface_module_css_default.compact, className),
        style: { ...style, ...anchorStyle },
        children: [
          /* @__PURE__ */ jsx5("div", { "aria-hidden": "true", className: MenuSurface_module_css_default.material }),
          children
        ]
      }
    ),
    createPortal2(
      /* @__PURE__ */ jsx5(
        "div",
        {
          ref: backingRef,
          "aria-hidden": "true",
          "data-menu-backing": "",
          "data-menu-phase": phase,
          className: clsx3(MenuSurface_module_css_default.backing, compact && MenuSurface_module_css_default.compact),
          style: { ...anchorStyle, visibility: style?.visibility }
        }
      ),
      document.body
    )
  ] });
});

// upstream/packages/client/ui-primitives/src/SubmenuPanel.tsx.snapshot
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
function anchors(submenu, hidden) {
  return { "--dsh-submenu-parent": submenu.parentAnchor, ...hidden ? { visibility: "hidden" } : {} };
}
function SubmenuPanel({ entry, submenu, compact, dense, contextual, backLabel, onSelect, onClose, afterSelection }) {
  const columns = menuIconColumns(entry.submenu, contextual);
  return createPortal3(/* @__PURE__ */ jsxs4(
    MenuSurface,
    {
      ref: submenu.panelRef,
      compact,
      className: clsx4(Menu_module_css_default.submenu, Menu_module_css_default.scrollable, dense && Menu_module_css_default.denseList, compact && Menu_module_css_default.compactList),
      style: anchors(submenu, submenu.hidden),
      "data-submenu-layout": submenu.measured ? submenu.page ? "page" : "side" : void 0,
      "data-contextual": contextual ? "" : void 0,
      role: "menu",
      onPointerEnter: submenu.cancelClose,
      onPointerLeave: (event) => {
        if (menuHoverAllowed(event)) submenu.leave();
      },
      onContextMenu: contextual ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } : void 0,
      onClick: (event) => {
        event.stopPropagation();
        afterSelection();
      },
      children: [
        submenu.page && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx6(
            MenuRow,
            {
              "data-menu-back": "",
              icon: /* @__PURE__ */ jsx6(IconChevronLeftOutlineRegular, { className: Menu_module_css_default.check }),
              onClick: submenu.returnToParent,
              children: backLabel
            }
          ),
          /* @__PURE__ */ jsx6("div", { className: Menu_module_css_default.separator, role: "separator" })
        ] }),
        /* @__PURE__ */ jsx6("div", { className: Menu_module_css_default.viewport, role: "presentation", children: entry.submenu.map((sub) => "type" in sub ? renderMenuDecoration(sub) : /* @__PURE__ */ jsx6(
          MenuRow,
          {
            icon: sub.icon,
            reserveIcon: columns.has(sub),
            disabled: sub.disabled,
            danger: sub.danger,
            shortcut: sub.shortcut,
            onClick: () => {
              onSelect?.(sub.id);
            },
            children: sub.label
          },
          sub.id
        )) })
      ]
    }
  ), document.body);
}

// upstream/packages/client/ui-primitives/src/useModalLayer.ts.snapshot
import { useLayoutEffect as useLayoutEffect3, useRef as useRef5 } from "react";

// upstream/packages/client/ui-primitives/src/keyboard-composition.ts.snapshot
function observeComposition(document2) {
  let composing = false;
  let ended = false;
  const start = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
    ended = true;
  };
  const release = () => {
    ended = false;
  };
  const blur = () => {
    composing = false;
    ended = false;
  };
  document2.addEventListener("compositionstart", start, true);
  document2.addEventListener("compositionend", end, true);
  document2.addEventListener("keyup", release, true);
  document2.defaultView?.addEventListener("blur", blur);
  return {
    guards: (event) => {
      const guarded = composing || ended || event.isComposing || event.keyCode === 229;
      ended = false;
      return guarded;
    },
    dispose: () => {
      document2.removeEventListener("compositionstart", start, true);
      document2.removeEventListener("compositionend", end, true);
      document2.removeEventListener("keyup", release, true);
      document2.defaultView?.removeEventListener("blur", blur);
    }
  };
}

// upstream/packages/client/ui-primitives/src/focus.ts.snapshot
var releases = /* @__PURE__ */ new WeakMap();
var navigationKeys = /* @__PURE__ */ new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
function focusWithoutRing(element, options) {
  releases.get(element)?.();
  const release = () => {
    element.removeAttribute("data-dsh-automatic-focus");
    element.removeEventListener("blur", release);
    element.removeEventListener("keydown", navigate, true);
    releases.delete(element);
  };
  const navigate = (event) => {
    if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key)) release();
  };
  releases.set(element, release);
  element.setAttribute("data-dsh-automatic-focus", "");
  element.addEventListener("blur", release);
  element.addEventListener("keydown", navigate, true);
  element.focus(options);
  if (!element.matches(":focus")) release();
}

// upstream/packages/client/ui-primitives/src/useModalLayer.ts.snapshot
var modalSelector = '[role="dialog"][aria-modal="true"], [role="menu"]';
var layers = /* @__PURE__ */ new WeakMap();
function isBehindModal(anchor) {
  if (anchor === null) return false;
  const top = layers.get(anchor.ownerDocument)?.at(-1);
  return top !== void 0 && !top.element.contains(anchor);
}

// upstream/packages/client/ui-primitives/src/Menu.tsx.snapshot
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
function Menu({ open, anchor, items = [], children, submenuBackLabel, selectedId, selectedIds, onSelect, onClose, align = "start", side = "bottom", portal = false, closeOnPointerLeave = false, dense = false, compact = false, autoFocus = false, selection = "check", anchorRef, anchorPoint, minWidthFromAnchor = false, footer, className, listClassName, contextual = false, exiting, returnFocus, isExternalTrigger }) {
  const rootRef = useRef6(null);
  const listRef = useRef6(null);
  const menuId = useId5();
  const pointX = anchorPoint?.x;
  const pointY = anchorPoint?.y;
  const point = useMemo(() => {
    if (pointX === void 0 || pointY === void 0) return void 0;
    const visualOrigin = open && typeof window.CSS !== "undefined" && window.CSS.supports("-webkit-backdrop-filter", "none");
    const viewport = visualOrigin ? window.visualViewport : void 0;
    return { x: pointX + (viewport?.offsetLeft ?? 0), y: pointY + (viewport?.offsetTop ?? 0) };
  }, [open, pointX, pointY]);
  useLayoutEffect4(() => {
    const trigger = returnFocus?.();
    if (!open || !contextual || trigger == null) return;
    const previous = trigger.getAttribute("aria-controls");
    trigger.setAttribute("aria-controls", [previous, menuId].filter(Boolean).join(" "));
    return () => {
      if (previous === null) trigger.removeAttribute("aria-controls");
      else trigger.setAttribute("aria-controls", previous);
    };
  }, [open, contextual, returnFocus, menuId]);
  const walkIndex = useRef6(null);
  const triggerRef = useRef6(null);
  const selectingWithTab = useRef6(false);
  const refocusAnchor = (navigation = false) => {
    const remembered = triggerRef.current;
    const trigger = returnFocus?.() ?? (remembered?.isConnected ? remembered : anchorRef?.current) ?? null;
    const target = trigger !== null && document.contains(trigger) && !trigger.disabled ? trigger : rootRef.current?.querySelector("button:not(:disabled)");
    if (target == null) return;
    if (navigation) target.focus();
    else focusWithoutRing(target);
  };
  const refocusAfterSelection = () => {
    const navigation = selectingWithTab.current;
    queueMicrotask(() => {
      if (openRef.current && exitingRef.current === void 0) return;
      const active = document.activeElement;
      if (active === null || active === document.body || listRef.current?.contains(active) === true || submenu.contains(active)) refocusAnchor(navigation);
    });
  };
  const exitingRef = useRef6(exiting);
  exitingRef.current = exiting;
  const openRef = useRef6(open);
  openRef.current = open;
  const submenu = useMenuSubmenu({ open: open && exiting === void 0, items, footer, listRef, refocusAnchor });
  const submenuEvents = useRef6(submenu);
  submenuEvents.current = submenu;
  const close = useRef6(onClose);
  close.current = onClose;
  const anchorName = `--dsh-menu-trigger-${menuId.replaceAll(":", "")}`;
  const [externalAnchor, setExternalAnchor] = useState3(null);
  const positioned = !portal || anchorRef === void 0 || externalAnchor !== null;
  useEffect4(() => {
    if (!open || !portal || anchorRef === void 0) {
      setExternalAnchor(null);
      return;
    }
    const element = anchorRef.current;
    setExternalAnchor(element);
    if (element === null) return;
    const previous = element.style.getPropertyValue("anchor-name");
    const priority = element.style.getPropertyPriority("anchor-name");
    element.style.setProperty("anchor-name", anchorName);
    return () => {
      element.style.setProperty("anchor-name", previous, priority);
    };
  });
  useEffect4(() => {
    if (!open || !portal || exiting !== void 0) return;
    const currentAnchor = () => returnFocus?.() ?? (anchorRef === void 0 ? rootRef.current : anchorRef.current);
    const element = currentAnchor();
    if (element === null) return;
    let dismissed = false;
    const check = () => {
      const current2 = currentAnchor();
      if (dismissed || current2 !== null && current2.isConnected && current2.closest("[inert], [hidden]") === null) return;
      dismissed = true;
      close.current();
    };
    const observer = new MutationObserver(check);
    observer.observe(element.ownerDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["inert", "hidden"]
    });
    check();
    return () => {
      observer.disconnect();
    };
  }, [open, portal, exiting, anchorRef, externalAnchor, returnFocus]);
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(onClose);
  useEffect4(() => {
    if (!open) return;
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && active !== document.body && (anchorRef !== void 0 || anchorPoint !== void 0 || rootRef.current?.contains(active) === true) ? active : null;
  }, [open]);
  useEffect4(() => {
    if (!open || !positioned || exiting !== void 0 || !autoFocus || listRef.current?.contains(document.activeElement) || submenu.contains(document.activeElement)) return;
    const first = listRef.current?.querySelector("button:not(:disabled)");
    walkIndex.current = first === void 0 || first === null ? null : 0;
    if (first != null) focusWithoutRing(first);
  }, [open, autoFocus, items.length, footer?.length, positioned, exiting]);
  useEffect4(() => {
    if (!open || exiting !== void 0) {
      walkIndex.current = null;
      return;
    }
    const composition = observeComposition(document);
    const onPointerDown = (e) => {
      if (!(e.target instanceof Node) || contextual && e.button === 2) return;
      if (rootRef.current?.contains(e.target) === true || anchorRef?.current?.contains(e.target) === true) return;
      if (isExternalTrigger?.(e.target) === true) return;
      if (listRef.current?.contains(e.target) === true || submenuEvents.current.contains(e.target)) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (composition.guards(e) || isBehindModal(triggerRef.current ?? rootRef.current) || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const focused = document.activeElement;
      const insideList = listRef.current?.contains(focused) === true || submenuEvents.current.contains(focused);
      const anchored = focused === returnFocus?.() || anchorRef?.current?.contains(focused) === true || rootRef.current?.contains(focused) === true || insideList;
      if (e.key === "Escape" && !e.shiftKey) {
        e.preventDefault();
        if (e.repeat) return;
        if (submenuEvents.current.returnToParent()) return;
        onClose();
        if (anchored || autoFocus) refocusAnchor();
      }
      if (e.key === "ArrowLeft" && anchored && submenuEvents.current.returnToParent()) {
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight" && insideList && focused instanceof HTMLButtonElement && focused.getAttribute("aria-haspopup") === "menu") {
        e.preventDefault();
        focused.click();
        return;
      }
      if (e.key === "Tab") {
        const list3 = submenuEvents.current.activeList(focused);
        if (list3 === null || !anchored) return;
        if (e.shiftKey) {
          e.preventDefault();
          onClose();
          refocusAnchor(true);
          return;
        }
        if (insideList) {
          if (focused instanceof Element && focused.getAttribute("role") === "menuitem") {
            e.preventDefault();
            if (focused.getAttribute("aria-disabled") === "true") {
              onClose();
              refocusAnchor(true);
              return;
            }
            selectingWithTab.current = true;
            try {
              focused.click();
            } finally {
              selectingWithTab.current = false;
            }
          }
          return;
        }
        const row = list3.querySelector("button:not(:disabled)");
        if (row === null) return;
        e.preventDefault();
        row.focus();
        walkIndex.current = 0;
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list2 = submenuEvents.current.activeList(focused);
      if (list2 === null || !anchored) return;
      const buttons = Array.from(list2.querySelectorAll("button:not(:disabled)"));
      if (buttons.length === 0) return;
      const index = buttons.indexOf(focused);
      const from = index >= 0 ? index : walkIndex.current;
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : from === null ? e.key === "ArrowDown" ? 0 : buttons.length - 1 : (from + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      e.preventDefault();
      walkIndex.current = next;
      buttons[next]?.focus();
    };
    const onWindowBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    const onEscape = (event) => {
      if (event.key === "Escape") onKeyDown(event);
    };
    const onOtherKey = (event) => {
      if (event.key !== "Escape") onKeyDown(event);
    };
    document.addEventListener("keydown", onOtherKey);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      composition.dispose();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onOtherKey);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [open, onClose, autoFocus, contextual, exiting, anchorRef, returnFocus, isExternalTrigger]);
  useLayoutEffect4(() => {
    if (exiting === "dismiss" && listRef.current?.contains(document.activeElement)) refocusAnchor();
  }, [exiting]);
  useEffect4(() => {
    if (!open) cancelClose();
  }, [open, cancelClose]);
  const itemColumns = menuIconColumns(items, contextual);
  const footerColumns = menuIconColumns(footer ?? [], contextual);
  const renderEntry = (entry, columns) => {
    if ("type" in entry) return renderMenuDecoration(entry);
    const hasSub = entry.submenu !== void 0 && entry.submenu.length > 0;
    return /* @__PURE__ */ jsx7(
      MenuRow,
      {
        icon: entry.icon,
        reserveIcon: columns.has(entry),
        disabled: entry.disabled,
        danger: entry.danger,
        shortcut: entry.shortcut,
        selected: entry.id === selectedId || selectedIds?.includes(entry.id) === true,
        selection,
        "aria-haspopup": hasSub ? "menu" : void 0,
        "aria-expanded": hasSub ? submenu.entry?.id === entry.id && !submenu.hidden : void 0,
        wrapperProps: hasSub ? {
          onPointerEnter: (event) => {
            if (!menuHoverAllowed(event) || entry.disabled) return;
            const trigger = event.currentTarget.querySelector("button");
            if (trigger !== null) submenu.openChild(entry.id, trigger);
          },
          onPointerLeave: (event) => {
            if (menuHoverAllowed(event)) submenu.leave();
          }
        } : void 0,
        onFocus: hasSub ? (event) => {
          submenu.focusParent(entry.id, event.currentTarget);
        } : void 0,
        onClick: (event) => {
          if (hasSub) submenu.openChild(entry.id, event.currentTarget, true);
          else onSelect?.(entry.id);
        },
        children: entry.label
      },
      entry.id
    );
  };
  const list = open && positioned && /* @__PURE__ */ jsxs5(
    MenuSurface,
    {
      compact,
      id: contextual ? menuId : void 0,
      ref: listRef,
      className: clsx5(Menu_module_css_default.list, listClassName, dense && Menu_module_css_default.denseList, compact && Menu_module_css_default.compactList, Menu_module_css_default.scrollable, submenu.page && Menu_module_css_default.parentPage, portal && Menu_module_css_default.portal, side === "top" && !portal && Menu_module_css_default.sideTop, align === "end" && !portal && Menu_module_css_default.alignEnd),
      style: portal ? { positionAnchor: anchorName } : void 0,
      "data-anchor-side": portal ? side : void 0,
      "data-anchor-align": portal ? align : void 0,
      "data-match-anchor-width": portal && minWidthFromAnchor ? "" : void 0,
      role: exiting === void 0 && !submenu.page ? "menu" : void 0,
      "aria-hidden": exiting === void 0 && !submenu.page ? void 0 : true,
      "data-context-menu": contextual ? "" : void 0,
      phase: contextual ? exiting ?? "enter" : void 0,
      onClick: (e) => {
        e.stopPropagation();
        const row = e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null;
        if (row !== null && row.getAttribute("aria-haspopup") !== "menu") refocusAfterSelection();
      },
      onContextMenu: contextual ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } : void 0,
      onPointerOver: (event) => {
        if (menuHoverAllowed(event)) submenu.collapseFrom(event);
      },
      onFocus: submenu.collapseFrom,
      children: [
        submenu.entry !== void 0 && /* @__PURE__ */ jsx7("span", { "aria-hidden": "true", className: Menu_module_css_default.submenuAnchor, style: { anchorName: submenu.parentAnchor } }),
        /* @__PURE__ */ jsxs5("div", { className: Menu_module_css_default.viewport, role: "presentation", children: [
          items.map((entry) => renderEntry(entry, itemColumns)),
          children
        ] }),
        footer !== void 0 && footer.length > 0 && /* @__PURE__ */ jsx7("div", { className: Menu_module_css_default.footer, role: "presentation", children: footer.map((entry) => renderEntry(entry, footerColumns)) })
      ]
    }
  );
  return /* @__PURE__ */ jsxs5(
    "span",
    {
      ref: rootRef,
      className: clsx5(Menu_module_css_default.root, className),
      style: { anchorName: anchorRef === void 0 ? anchorName : void 0, ...point === void 0 ? {} : {
        position: "fixed",
        left: point.x,
        top: point.y,
        width: 0,
        height: 0
      } },
      onPointerEnter: closeOnPointerLeave ? cancelClose : void 0,
      onPointerLeave: closeOnPointerLeave ? (event) => {
        if (open && menuHoverAllowed(event)) armClose();
      } : void 0,
      children: [
        anchor,
        portal ? list !== false && createPortal4(list, document.body) : list,
        open && exiting === void 0 && submenu.entry !== void 0 && /* @__PURE__ */ jsx7(
          SubmenuPanel,
          {
            entry: submenu.entry,
            submenu,
            compact,
            dense,
            contextual,
            backLabel: submenuBackLabel ?? submenu.entry.label,
            onSelect,
            onClose,
            afterSelection: refocusAfterSelection
          },
          submenu.entry.id
        )
      ]
    }
  );
}

// upstream/packages/client/ui-primitives/src/Toast.tsx.snapshot
import { Fragment as Fragment3, useEffect as useEffect5, useLayoutEffect as useLayoutEffect5, useRef as useRef7, useState as useState4 } from "react";
import { createPortal as createPortal5 } from "react-dom";

// upstream/packages/client/ui-primitives/src/Toast.module.css.snapshot
var Toast_module_css_default = {
  toast: "Toast_module_css_toast",
  "dsh-toast-in": "Toast_module_css_dsh-toast-in",
  "dsh-toast-fade": "Toast_module_css_dsh-toast-fade",
  icon: "Toast_module_css_icon",
  success: "Toast_module_css_success",
  text: "Toast_module_css_text",
  action: "Toast_module_css_action"
};

// upstream/packages/client/ui-primitives/src/Toast.tsx.snapshot
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
var HOLD_MS = 3e3;
var FADE_MS = 1e3;
function Toast({ text, icon, tone, anchor, holdMs = HOLD_MS, actions, onDone }) {
  const latestOnDone = useRef7(onDone);
  useLayoutEffect5(() => {
    latestOnDone.current = onDone;
  }, [onDone]);
  useEffect5(() => {
    const timer = setTimeout(() => {
      latestOnDone.current();
    }, holdMs + FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [holdMs]);
  const [left, setLeft] = useState4(null);
  useLayoutEffect5(() => {
    if (anchor == null) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      setLeft(rect.left + rect.width / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [anchor]);
  return createPortal5(
    /* @__PURE__ */ jsxs6(
      "div",
      {
        className: Toast_module_css_default.toast,
        role: "alert",
        style: {
          ...left === null ? {} : { left },
          "--dsh-toast-hold": `${String(holdMs)}ms`
        },
        children: [
          tone === "success" ? /* @__PURE__ */ jsx8("span", { className: `${Toast_module_css_default.icon} ${Toast_module_css_default.success}`, "aria-hidden": true, children: /* @__PURE__ */ jsx8(IconCheckCircleOutlineRegular, {}) }) : icon !== void 0 && /* @__PURE__ */ jsx8("span", { className: Toast_module_css_default.icon, "aria-hidden": true, children: icon }),
          /* @__PURE__ */ jsxs6("span", { className: Toast_module_css_default.text, children: [
            text,
            actions?.map((action) => /* @__PURE__ */ jsxs6(Fragment3, { children: [
              action.prefix,
              /* @__PURE__ */ jsx8("button", { type: "button", className: Toast_module_css_default.action, onClick: action.onClick, children: action.label })
            ] }, action.label))
          ] })
        ]
      }
    ),
    document.body
  );
}

// upstream/packages/client/ui-primitives/src/Button.tsx.snapshot
import { forwardRef as forwardRef2 } from "react";
import clsx6 from "clsx";

// upstream/packages/client/ui-primitives/src/Button.module.css.snapshot
var Button_module_css_default = {
  button: "Button_module_css_button",
  md: "Button_module_css_md",
  sm: "Button_module_css_sm",
  primary: "Button_module_css_primary",
  ghost: "Button_module_css_ghost",
  outline: "Button_module_css_outline",
  toolbar: "Button_module_css_toolbar",
  icon: "Button_module_css_icon"
};

// upstream/packages/client/ui-primitives/src/Button.tsx.snapshot
import { jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var Button = forwardRef2(function Button2({
  variant = "ghost",
  size = "md",
  icon,
  className,
  children,
  ...rest
}, ref) {
  return /* @__PURE__ */ jsxs7("button", { ref, type: "button", className: clsx6(Button_module_css_default.button, Button_module_css_default[variant], Button_module_css_default[size], className), ...rest, children: [
    icon != null && /* @__PURE__ */ jsx9("span", { className: Button_module_css_default.icon, children: icon }),
    children
  ] });
});

// upstream/packages/client/ui-context-menu/src/client/target-key.ts.snapshot
function menuTargetKey(target) {
  return JSON.stringify(target, (_key, value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  });
}

// upstream/packages/client/ui-context-menu/src/client/registry.ts.snapshot
var MenuRegistry = class {
  constructor(failed, timeoutMs) {
    this.failed = failed;
    this.timeoutMs = timeoutMs;
  }
  kindsSource = createSnapshotStore([]);
  /** Registered target kinds, independent of asynchronous action availability. */
  registeredKinds = this.kindsSource;
  providers = /* @__PURE__ */ new Map();
  occurrences = /* @__PURE__ */ new Set();
  disposed = false;
  /**
   * Register actions for subsequent openings.
   * @param input - provider definition.
   * @returns removal of this contribution and its pending resolutions.
   */
  register(input) {
    if (this.disposed) throw new Error("Menu registry is disposed");
    const key = `${encodeURIComponent(input.target)}/${encodeURIComponent(input.id)}`;
    if (this.providers.has(key)) throw new Error(`Duplicate menu contribution: ${key}`);
    const provider = {
      id: input.id,
      kind: input.target,
      order: input.order,
      lifetime: new AbortController(),
      observe: (target) => input.observe?.(target.value) ?? [],
      resolve: (target, signal) => input.resolve(target.value, signal)
    };
    this.providers.set(key, provider);
    this.publishKinds();
    return () => {
      if (provider.lifetime.signal.aborted) return;
      this.providers.delete(key);
      this.publishKinds();
      provider.lifetime.abort();
    };
  }
  /**
   * Resolve an independently owned occurrence.
   * @param target - captured clicked identity.
   * @returns presentation, selection, and disposal.
   */
  resolve(target) {
    if (this.disposed) throw new Error("Menu registry is disposed");
    const lifetime = new AbortController();
    const source = createSnapshotStore([]);
    const resolved = /* @__PURE__ */ new Map();
    const callbacks = /* @__PURE__ */ new Map();
    const providers = [...this.providers.values()].filter((p) => p.kind === target.kind).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const refresh = () => {
      source.set(providers.flatMap((provider) => provider.lifetime.signal.aborted ? [] : resolved.get(provider) ?? []));
    };
    const cleanup = [];
    const dispose = () => {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      for (const detach of cleanup) detach();
      callbacks.clear();
      this.occurrences.delete(dispose);
    };
    this.occurrences.add(dispose);
    const pending = [];
    for (const provider of providers) {
      let preparation;
      let actionIds = [];
      let preparing;
      const clear = () => {
        for (const id of actionIds) callbacks.delete(id);
        actionIds = [];
        resolved.delete(provider);
        refresh();
      };
      const prepare = () => {
        preparation?.abort();
        const deadline = new AbortController();
        preparation = deadline;
        const signal = AbortSignal.any([lifetime.signal, provider.lifetime.signal, deadline.signal]);
        const accept = (actions) => {
          if (signal.aborted) return;
          const next = /* @__PURE__ */ new Map();
          const project = (action, parent) => {
            const id = `${parent}/${encodeURIComponent(action.id)}`;
            if (next.has(id)) throw new Error(`Duplicate menu action: ${id}`);
            next.set(id, action);
            const { run: _run, failureLabel: _failureLabel, children, ...view } = action;
            return { ...view, id, ...children === void 0 ? {} : { children: children.map((child) => project(child, id)) } };
          };
          const views = actions.map((action) => project(action, encodeURIComponent(provider.id)));
          for (const id of actionIds) callbacks.delete(id);
          for (const [id, action] of next) callbacks.set(id, { provider, action });
          actionIds = [...next.keys()];
          resolved.set(provider, views);
          refresh();
        };
        preparing = void 0;
        try {
          const result = provider.resolve(target, signal);
          if (result instanceof Promise) clear();
          preparing = result instanceof Promise ? new Promise((settle) => {
            const timer = this.timeoutMs === void 0 ? void 0 : setTimeout(() => {
              deadline.abort();
              this.failed();
            }, this.timeoutMs);
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", finish);
              settle();
            };
            signal.addEventListener("abort", finish, { once: true });
            void result.then(accept).catch(() => {
              if (!signal.aborted) this.failed();
            }).finally(finish);
          }) : void 0;
          if (!(result instanceof Promise)) accept(result);
        } catch (_error) {
          if (!signal.aborted) {
            clear();
            this.failed();
          }
        }
      };
      const subscriptions = [];
      const withdraw = () => {
        preparation?.abort();
        for (const detach of subscriptions.splice(0)) detach();
        clear();
      };
      provider.lifetime.signal.addEventListener("abort", withdraw, { once: true });
      cleanup.push(() => {
        provider.lifetime.signal.removeEventListener("abort", withdraw);
        withdraw();
      });
      try {
        for (const input of provider.observe(target)) subscriptions.push(input.subscribe(prepare));
        prepare();
      } catch (_error) {
        if (!lifetime.signal.aborted && !provider.lifetime.signal.aborted) this.failed();
      }
      pending.push((async () => {
        let current2;
        do {
          current2 = preparing;
          await current2;
        } while (current2 !== preparing);
      })());
    }
    return {
      source,
      dispose,
      ready: Promise.all(pending).then(() => {
      }),
      select: (id) => {
        const selected = callbacks.get(id);
        if (lifetime.signal.aborted || selected === void 0 || selected.provider.lifetime.signal.aborted || selected.action.disabled || selected.action.children !== void 0) return;
        const run = selected.action.run;
        dispose();
        try {
          void Promise.resolve(run?.()).catch(() => {
            this.failed(selected.action.failureLabel);
          });
        } catch (_error) {
          this.failed(selected.action.failureLabel);
        }
      }
    };
  }
  /** Cancel every occurrence and reject further registrations or resolutions. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.occurrences) dispose();
    for (const provider of this.providers.values()) provider.lifetime.abort();
    this.providers.clear();
    this.publishKinds();
  }
  publishKinds() {
    const kinds = [...new Set([...this.providers.values()].map((provider) => provider.kind))].sort();
    const previous = this.kindsSource.getSnapshot();
    if (kinds.length === previous.length && kinds.every((kind, index) => kind === previous[index])) return;
    this.kindsSource.set(kinds);
  }
};

// upstream/packages/client/ui-context-menu/src/client/store.ts.snapshot
function createMenuStore() {
  return defineStore({
    init: () => ({ occurrence: 0, closing: false, replacing: false, target: null, point: { x: 0, y: 0 }, items: [], notice: null }),
    actions: {
      open(draft, target, point) {
        draft.occurrence++;
        draft.closing = false;
        draft.replacing = false;
        draft.target = target;
        draft.point = point;
        draft.items = [];
      },
      items(draft, items) {
        draft.items = items;
      },
      exit(draft, replacing) {
        draft.closing = true;
        draft.replacing = replacing;
      },
      close(draft) {
        draft.target = null;
        draft.items = [];
      },
      notify(draft, notice) {
        draft.notice = notice;
      }
    }
  });
}

// upstream/packages/client/ui-context-menu/src/client/locales.ts.snapshot
var dictionaries = {
  zh: { back: "\u8FD4\u56DE", failed: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" },
  en: { back: "Back", failed: "Could not complete the action. Try again." },
  ja: { back: "\u623B\u308B", failed: "\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" },
  es: { back: "Atr\xE1s", failed: "No se pudo completar la acci\xF3n. Int\xE9ntelo de nuevo." },
  fr: { back: "Retour", failed: "Impossible de terminer l\u2019action. R\xE9essayez." },
  de: { back: "Zur\xFCck", failed: "Die Aktion konnte nicht abgeschlossen werden. Versuchen Sie es erneut." },
  ru: { back: "\u041D\u0430\u0437\u0430\u0434", failed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u043F\u044B\u0442\u043A\u0443." },
  pt: { back: "Voltar", failed: "N\xE3o foi poss\xEDvel concluir a a\xE7\xE3o. Tente novamente." }
};

// upstream/packages/client/ui-context-menu/src/client/external-trigger.ts.snapshot
function isContextMenuTrigger(node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[data-context-menu-trigger]") != null;
}

// upstream/packages/client/ui-context-menu/src/client/View.tsx.snapshot
import { Fragment as Fragment4, jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function menuEntries(actions, catalog, renderSlot) {
  return actions.flatMap((action) => {
    const shortcut = catalog.find((entry) => entry.id === action.commandId);
    const item = {
      id: action.id,
      label: action.label,
      ...shortcut === void 0 ? {} : { shortcut },
      ...action.disabled === void 0 ? {} : { disabled: action.disabled },
      ...action.danger === void 0 ? {} : { danger: action.danger },
      ...action.icon === void 0 ? {} : {
        icon: renderSlot("contextMenu.icon", { icon: action.icon }, { entryKey: action.icon.key })
      },
      ...action.children === void 0 ? {} : { submenu: menuEntries(action.children, catalog, renderSlot) }
    };
    return action.separatorBefore ? [{ type: "separator", id: `${action.id}:separator` }, item] : [item];
  });
}
function MenuOverlay({ useStore, actions, renderSlot, close, select, returnFocus, useCatalog, t }) {
  const catalog = useCatalog((value) => value);
  const { target, point, items, notice, occurrence, closing, replacing } = useStore((s) => s);
  return /* @__PURE__ */ jsxs8(Fragment4, { children: [
    /* @__PURE__ */ jsx10(
      Menu,
      {
        open: target !== null,
        anchor: null,
        portal: true,
        autoFocus: true,
        contextual: true,
        returnFocus,
        submenuBackLabel: t("back"),
        isExternalTrigger: isContextMenuTrigger,
        exiting: closing ? replacing ? "replace" : "dismiss" : void 0,
        anchorPoint: point,
        items: menuEntries(items.filter((item) => !item.afterContent), catalog, renderSlot),
        footer: menuEntries(items.filter((item) => item.afterContent), catalog, renderSlot),
        onClose: close,
        onSelect: select,
        children: target !== null && renderSlot("contextMenu.content", { target, dismiss: close }, { entryKey: target.kind })
      },
      occurrence
    ),
    notice !== null && /* @__PURE__ */ jsx10(
      Toast,
      {
        text: notice.text,
        ...notice.action === void 0 ? {} : { actions: [notice.action] },
        ...notice.success ? { tone: "success" } : {},
        onDone: () => {
          actions.notify(null);
        }
      },
      notice.id
    )
  ] });
}

// upstream/packages/client/ui-context-menu/src/client/Button.tsx.snapshot
import { useId as useId6 } from "react";
import { jsx as jsx11 } from "react/jsx-runtime";
function ContextMenuButton({ target, label, className, size, useOpener, useRegisteredKinds, toggle }) {
  const id = useId6();
  const expanded = useOpener((opener) => opener === id);
  const available = useRegisteredKinds((kinds) => kinds.includes(target.kind));
  if (!available) return null;
  const attributes = {
    className,
    "data-context-menu-trigger": "",
    "aria-label": label,
    "aria-haspopup": "menu",
    "aria-expanded": expanded,
    onPointerDown: (event) => {
      event.stopPropagation();
    },
    onClick: (event) => {
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      const rect = event.currentTarget.getBoundingClientRect();
      toggle(id, target, { x: rect.left, y: rect.bottom });
    }
  };
  if (size !== "sm") return /* @__PURE__ */ jsx11("button", { ...attributes, type: "button", children: /* @__PURE__ */ jsx11(IconEllipsisOutlineRegular, {}) });
  return /* @__PURE__ */ jsx11(Tooltip, { label, side: "bottom", align: "end", portal: true, children: /* @__PURE__ */ jsx11(Button, { ...attributes, size: "sm", icon: /* @__PURE__ */ jsx11(IconEllipsisOutlineRegular, {}) }) });
}

// upstream/packages/client/ui-context-menu/src/client/trigger.ts.snapshot
function createContextMenuBindings(open, active) {
  return {
    getTriggerProps(target, handlers = {}) {
      if (target === void 0) return handlers;
      const show = (event, x, y) => {
        if (event.defaultPrevented || !active()) return;
        const captured = typeof target === "function" ? target() : target;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        open(captured, { x, y });
      };
      return {
        ...handlers,
        tabIndex: handlers.tabIndex ?? 0,
        onContextMenu(event) {
          handlers.onContextMenu?.(event);
          const rect = event.clientX === 0 && event.clientY === 0 ? event.currentTarget.getBoundingClientRect() : void 0;
          show(event, rect?.left ?? event.clientX, rect?.bottom ?? event.clientY);
        },
        onKeyDown(event) {
          handlers.onKeyDown?.(event);
          if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey || !(event.key === "ContextMenu" || event.key === "F10" && event.shiftKey)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          show(event, rect.left, rect.bottom);
        }
      };
    }
  };
}

// upstream/packages/client/ui-context-menu/src/client/index.ts.snapshot
var Config = z.object({ resolutionTimeoutMs: z.natural().min(1).default(1e3) });
var inject = ["slots", "locale", "shortcuts"];
function apply(ctx, config = Config({})) {
  ctx.effect(() => ctx.locale.register("contextMenu", dictionaries), "context menu: locale");
  const t = ctx.locale.bind("contextMenu");
  const handle = createMenuStore();
  const instance = handle.create();
  const store = { ...handle, create: () => instance };
  const targetSource = createSnapshotStore(null);
  const opener = createSnapshotStore(null);
  let sequence = 0;
  let active;
  let closeTimer;
  let openingTimer;
  let finishOpening;
  let returnFocus = null;
  let disposed = false;
  const notify = (text, success = false, action) => {
    if (disposed) return;
    const id = ++sequence;
    instance.actions.notify({ id, text, success, ...action === void 0 ? {} : { action: {
      label: action.label,
      onClick: () => {
        if (disposed || instance.getSnapshot().notice?.id !== id) return;
        instance.actions.notify(null);
        try {
          void Promise.resolve(action.run()).catch(() => {
            notify(action.failureLabel);
          });
        } catch (_error) {
          notify(action.failureLabel);
        }
      }
    } } });
  };
  const registry = new MenuRegistry((message) => {
    notify(message ?? t("failed"));
  }, config.resolutionTimeoutMs);
  const cancelOpening = () => {
    clearTimeout(openingTimer);
    finishOpening?.();
    finishOpening = void 0;
    active?.unsubscribe();
    active?.resolution.dispose();
    active = void 0;
    targetSource.set(null);
    opener.set(null);
  };
  const dismiss = (replacing) => {
    cancelOpening();
    clearTimeout(closeTimer);
    if (instance.getSnapshot().target === null) return;
    instance.actions.exit(replacing);
    closeTimer = setTimeout(() => {
      instance.actions.close();
    }, replacing ? MENU_TRANSITION_MS.replace : MENU_TRANSITION_MS.dismiss);
  };
  const close = () => {
    dismiss(false);
  };
  const contextMenus = {
    active: targetSource,
    registeredKinds: registry.registeredKinds,
    register: (input) => registry.register(input),
    resolve: (target) => registry.resolve(target),
    notify,
    close,
    open: (target, point, options) => {
      const previous = active;
      if (options === void 0 && previous !== void 0 && Math.hypot(previous.point.x - point.x, previous.point.y - point.y) <= 4 && menuTargetKey(previous.target) === menuTargetKey(target)) {
        close();
        return;
      }
      show(target, point);
      if (options !== void 0) opener.set(options.button);
    }
  };
  function show(target, point) {
    const focused = document.activeElement;
    if (!(focused instanceof Element) || focused.closest("[data-context-menu]") === null) {
      returnFocus = focused instanceof HTMLElement ? focused : null;
    }
    dismiss(true);
    const resolution = registry.resolve(target);
    targetSource.set(target);
    let displayed = false;
    const publish2 = () => {
      if (displayed) instance.actions.items(resolution.source.getSnapshot());
    };
    const occurrence = { resolution, unsubscribe: resolution.source.subscribe(publish2), target, point };
    active = occurrence;
    const delay = new Promise((resolve) => {
      finishOpening = resolve;
      openingTimer = setTimeout(resolve, MENU_TRANSITION_MS.prepare);
    });
    void Promise.all([resolution.ready, delay]).then(() => {
      if (active !== occurrence) return;
      clearTimeout(closeTimer);
      instance.actions.open(target, point);
      displayed = true;
      publish2();
    });
  }
  ctx.provide("contextMenus", contextMenus);
  ctx.slots.registerFactory({
    name: "contextMenu.button",
    scope: "root",
    inject: () => ({
      hooks: { opener, registeredKinds: registry.registeredKinds },
      toggle: (button, target, point) => {
        if (disposed) return;
        if (opener.getSnapshot() === button) {
          close();
          return;
        }
        contextMenus.open(target, point, { button });
      }
    })
  }, ContextMenuButton);
  const bindings = createContextMenuBindings((target, point) => {
    contextMenus.open(target, point);
  }, () => !disposed);
  ctx.slots.provideRoot({ props: { useContextMenu: () => bindings } });
  ctx.effect(() => {
    const outside = (event) => {
      if (event.button === 2 || event.target instanceof Node && isContextMenuTrigger(event.target) || event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      close();
    };
    const context = (event) => {
      if (!event.defaultPrevented) close();
    };
    const escape = (event) => {
      if (active !== void 0 && instance.getSnapshot().target === null && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("contextmenu", context);
    window.addEventListener("keydown", escape, true);
    return () => {
      disposed = true;
      cancelOpening();
      clearTimeout(closeTimer);
      registry.dispose();
      instance.actions.close();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("contextmenu", context);
      window.removeEventListener("keydown", escape, true);
    };
  }, "context menu: lifetime");
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "context-menu",
    store,
    locale: "contextMenu",
    children: {
      "contextMenu.content": { kind: "keyed", scope: "root" },
      "contextMenu.icon": { kind: "keyed", scope: "root", inline: true }
    },
    inject: () => ({ hooks: { catalog: ctx.shortcuts.catalog }, close, returnFocus: () => returnFocus, select: (id) => {
      const selected = active?.resolution;
      active?.unsubscribe();
      active = void 0;
      targetSource.set(null);
      opener.set(null);
      dismiss(false);
      selected?.select(id);
      selected?.dispose();
    } })
  }, MenuOverlay));
}

// upstream/packages/client/modules/src/client/manifest.ts.snapshot
function optionalStringArray(subject, field, value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`client-modules: ${subject} ${field} must be a string array`);
  }
  return value;
}
function stripClientSuffix(spec) {
  return spec.endsWith("/client") ? spec.slice(0, -"/client".length) : spec;
}
function parseBootManifest(wire) {
  if (typeof wire !== "object" || wire === null) {
    throw new Error("client-modules: window.__DSH_BOOT__ is missing or not an object");
  }
  const graph = wire;
  if (typeof graph.rev !== "string") {
    throw new Error("client-modules: boot manifest rev must be a string");
  }
  const release = decodeRelease(graph.release);
  if (release === null) {
    throw new Error("client-modules: boot manifest release must carry a string version and an optional string commit");
  }
  if (!Array.isArray(graph.entries)) {
    throw new Error("client-modules: boot manifest entries must be an array");
  }
  if (!Array.isArray(graph.batches)) {
    throw new Error("client-modules: boot manifest batches must be an array");
  }
  const moduleFields = [];
  const plugins2 = [];
  const seenEntryIds = /* @__PURE__ */ new Set();
  for (const value of graph.entries) {
    if (typeof value !== "object" || value === null) {
      throw new Error("client-modules: boot manifest entry is not an object");
    }
    const row = value;
    const where = typeof row.id === "string" ? `"${row.id}"` : JSON.stringify(row);
    if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.rev !== "string") {
      throw new Error(`client-modules: boot manifest entry ${where} must carry string id/url/rev`);
    }
    if (seenEntryIds.has(row.id)) throw new Error(`client-modules: duplicate graph entry "${row.id}"`);
    seenEntryIds.add(row.id);
    const subject = `boot manifest entry ${where}`;
    const inject2 = optionalStringArray(subject, "inject", row.inject);
    const external = optionalStringArray(subject, "external", row.external);
    if (row.immediately !== void 0 && typeof row.immediately !== "boolean") {
      throw new Error(`client-modules: boot manifest entry ${where} immediately must be a boolean`);
    }
    moduleFields.push({
      id: row.id,
      url: row.url,
      rev: row.rev,
      inject: inject2 === void 0 ? [] : [...inject2],
      external: external === void 0 ? [] : [...external]
    });
    plugins2.push({
      id: row.id,
      inject: inject2 === void 0 ? [] : [...inject2],
      immediately: row.immediately === true
    });
  }
  const entryIds = new Set(moduleFields.map((row) => row.id));
  const initialUrls = /* @__PURE__ */ new Map();
  const batchUrls = /* @__PURE__ */ new Set();
  for (const value of graph.batches) {
    if (typeof value !== "object" || value === null) {
      throw new Error("client-modules: boot manifest batch is not an object");
    }
    const batch = value;
    const phase = batch.phase;
    if (phase !== "bootstrap" && phase !== "application") {
      throw new Error(`client-modules: boot manifest batch phase must be "bootstrap" or "application", received ${JSON.stringify(phase)}`);
    }
    if (typeof batch.url !== "string" || typeof batch.rev !== "string") {
      throw new Error(`client-modules: boot manifest ${phase} batch must carry string url/rev`);
    }
    if (batchUrls.has(batch.url)) {
      throw new Error(`client-modules: boot manifest carries duplicate batch URL ${JSON.stringify(batch.url)}`);
    }
    batchUrls.add(batch.url);
    const entries = optionalStringArray(`boot manifest ${phase} batch`, "entries", batch.entries);
    if (entries === void 0 || entries.length === 0) {
      throw new Error(`client-modules: boot manifest ${phase} batch entries must be a non-empty string array`);
    }
    for (const id of entries) {
      if (!entryIds.has(id)) {
        throw new Error(`client-modules: boot manifest ${phase} batch names unknown entry "${id}"`);
      }
      if (initialUrls.has(id)) {
        throw new Error(`client-modules: boot manifest entry "${id}" belongs to more than one batch`);
      }
      initialUrls.set(id, batch.url);
    }
  }
  const modules = moduleFields.map((row) => {
    const initialUrl = initialUrls.get(row.id);
    if (initialUrl === void 0) {
      throw new Error(`client-modules: boot manifest entry "${row.id}" belongs to no initial-load batch`);
    }
    return { ...row, initialUrl };
  });
  return { rev: graph.rev, ...release === void 0 ? {} : { release }, modules, plugins: plugins2 };
}
function decodeRelease(value) {
  if (value === void 0) return void 0;
  const release = typeof value === "object" && value !== null ? value : void 0;
  const commit = release?.commit;
  if (release === void 0 || typeof release.version !== "string" || commit !== void 0 && typeof commit !== "string") return null;
  return { version: release.version, ...commit === void 0 ? {} : { commit } };
}
function readRelease(wire) {
  if (typeof wire !== "object" || wire === null) return void 0;
  return decodeRelease(wire.release) ?? void 0;
}

// upstream/packages/client/modules/src/client/notify.ts.snapshot
function notifySubscribers2(listeners, label) {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error(`client-modules: ${label} subscriber failed`, error);
    }
  }
}

// upstream/packages/client/modules/src/client/release-change.ts.snapshot
function sameRelease(left, right) {
  return left?.version === right?.version && left?.commit === right?.commit;
}
function describeRelease(release) {
  return release === void 0 ? "none" : JSON.stringify(release);
}
var ReleaseChangeGate = class {
  /**
   * Start with the Host that served the boot graph.
   * @param page - boot graph's release identity.
   */
  constructor(page) {
    this.page = page;
    this.host = page;
  }
  /** Prompt-worthy release change; undefined while the Host serves the boot release or a dismissed one. */
  change = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
  };
  snapshot;
  listeners = /* @__PURE__ */ new Set();
  host;
  /** Host release the page last dismissed; a holder because an unpublished release is itself a value. */
  dismissed;
  /** Whether the connected Host serves the page's boot release; graphs and rebuilt frames apply only then. */
  get matches() {
    return sameRelease(this.host, this.page);
  }
  /**
   * Record the release of a received Host graph and update the announced change.
   * @param release - release identity of the received graph.
   * @returns true when the graph belongs to the page's boot release and may be applied.
   */
  observe(release) {
    const previous = this.host;
    this.host = release;
    const quiet = this.matches || this.dismissed !== void 0 && sameRelease(release, this.dismissed.release);
    if (quiet) {
      if (this.snapshot !== void 0) this.publish(void 0);
    } else if (this.snapshot === void 0 || !sameRelease(this.snapshot.host, release)) {
      console.warn(`client-modules: Host release changed from ${describeRelease(previous)} to ${describeRelease(release)}; plugin updates pause until this page reloads`);
      this.publish({ page: this.page, previous, host: release });
    }
    return this.matches;
  }
  /** Stop announcing the connected Host's release; the page keeps its boot release and still applies no other release. */
  dismiss() {
    if (this.snapshot === void 0) return;
    this.dismissed = { release: this.host };
    this.publish(void 0);
  }
  publish(snapshot) {
    this.snapshot = snapshot;
    notifySubscribers2(this.listeners, "release change");
  }
};

// upstream/packages/client/modules/src/client/entry-lifecycle.ts.snapshot
async function tearDownEntryFiber(entry) {
  const fiber = entry.fiber;
  if (fiber === void 0) return;
  const runtime = fiber.runtime;
  if (runtime !== null) entry.ctx.registry.delete(runtime.callback);
  while (fiber.inertia !== void 0) await fiber.inertia;
  delete entry.fiber;
}

// upstream/packages/client/modules/src/client/entries.ts.snapshot
var ACTIVE = 2;
var FAILED = 3;
function entryTargets(manifest) {
  return JSON.stringify(manifest.modules.map((row) => [row.id, row.rev, row.inject, row.external]));
}
var ClientEntries = class {
  /**
   * Construct the page controller before Cordis boot.
   * @param modules - Module arrival and materialization owner.
   * @param index - Private descriptor replacement and unused-module cleanup.
   */
  constructor(modules, index) {
    this.modules = modules;
    this.index = index;
    this.desired = modules.manifest;
    this.release = new ReleaseChangeGate(modules.manifest.release);
  }
  /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
  state = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
  };
  // The modules bootstrap factory cannot request platform libraries before the shell supplies its seed.
  snapshot = { syncing: false, failures: [] };
  listeners = /* @__PURE__ */ new Set();
  /** Admits only Host graphs of the page's boot release. */
  release;
  managed = /* @__PURE__ */ new Map();
  revisions = /* @__PURE__ */ new Map();
  loader;
  queue = Promise.resolve();
  desired;
  generation = 0;
  stopped = false;
  /** Host release change to announce; undefined while the Host serves the page's boot release or a dismissed one. */
  get releaseChange() {
    return this.release.change;
  }
  /** Stop announcing the connected Host's release; updates stay paused until the Host returns to the boot release or the page reloads. */
  dismissRelease() {
    this.release.dismiss();
  }
  /**
   * Create the initial roster and retain its entry identities for subsequent reconciliation.
   * As the Host Loader group does, a row whose creation rejects (for example a module that exports no
   * plugin) is logged and stays an inactive entry, so one row cannot abort startup before the boot audit.
   * @param loader - Page Loader, already configured with the module system.
   * @param manifest - Initial roster audited by the boot caller.
   * @returns after initial entries and their activation settle; boot owns its activation audit.
   */
  start(loader, manifest) {
    if (this.loader !== void 0) throw new Error("client-modules: entries already started");
    this.loader = loader;
    this.desired = manifest;
    loader.ctx.effect(() => () => {
      this.stopped = true;
      this.generation++;
      return this.queue;
    }, "client-modules: entry reconciliation");
    return this.enqueue(async () => {
      await Promise.all(this.desired.plugins.map(async ({ id }) => {
        await this.create(loader, id).catch((error) => {
          loader.ctx.logger.error(error);
        });
      }));
      await loader.await();
      for (const row of this.modules.manifest.modules) this.revisions.set(row.id, row.rev);
    });
  }
  /**
   * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
   * The release is compared before the rest of the graph is validated: a graph of another release, including one whose
   * format this page cannot read, is not applied and {@link releaseChange} announces it.
   * @param graph - JSON-decoded graph received from the Host.
   * @returns after the queued reconciliation, or at once for another release; per-package failures remain available in {@link state}.
   */
  sync(graph) {
    if (!this.release.observe(readRelease(graph))) return Promise.resolve();
    const manifest = parseBootManifest(graph);
    if (entryTargets(manifest) !== entryTargets(this.desired)) this.generation++;
    this.desired = manifest;
    const generation = this.generation;
    return this.enqueue(() => this.reconcile(generation));
  }
  /**
   * Retry failed entries against the latest graph, including an unchanged revision.
   * @returns after retry settlement, with remaining errors in {@link state}.
   */
  retry() {
    const generation = ++this.generation;
    return this.enqueue(() => this.reconcile(generation));
  }
  /**
   * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
   * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
   * Ignored while the connected Host serves another release than the page's boot release.
   * @param id - Package id from a rebuilt frame.
   * @param rev - Opaque revision selecting the rebuilt artifact.
   * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
   */
  reload(id, rev) {
    if (!this.release.matches) return Promise.resolve();
    this.desired = {
      ...this.desired,
      modules: this.desired.modules.map((row) => row.id === id ? { ...row, rev } : row)
    };
    return this.enqueue(async () => {
      const desired = this.desired.modules.find((row) => row.id === id);
      if (this.stopped || desired === void 0) return;
      const entry = this.managed.get(id);
      if (entry === void 0) {
        this.modules.invalidate(id, desired.rev);
        await this.reconcile(this.generation);
        return;
      }
      if (this.revisions.get(id) === rev) return;
      this.publish({ syncing: true, failures: this.snapshot.failures.filter((failure) => failure.id !== id) });
      await this.replace(entry, id, rev, this.generation);
      this.publish({ syncing: false, failures: this.snapshot.failures });
    }, id);
  }
  publish(snapshot) {
    this.snapshot = snapshot;
    notifySubscribers2(this.listeners, "synchronization");
  }
  enqueue(task, subject = "graph") {
    const run = this.queue.then(task);
    this.queue = run.then(() => void 0, (error) => {
      this.publish({ syncing: false, failures: [
        ...this.snapshot.failures.filter((failure) => failure.id !== subject),
        { id: subject, message: String(error) }
      ] });
    });
    return run;
  }
  current(generation) {
    return !this.stopped && generation === this.generation;
  }
  /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
  async create(loader, id) {
    const options = { name: id };
    const entryId = loader.ensureId(options);
    try {
      await loader.create(options);
    } finally {
      this.managed.set(id, loader.resolve(entryId));
    }
  }
  async replace(entry, id, rev, generation) {
    this.index.invalidateForReplacement(id, rev);
    await this.modules.prefetch(id);
    if (!this.current(generation)) return;
    await tearDownEntryFiber(entry);
    this.index.releaseReplaced(id);
    if (!this.current(generation)) return;
    await this.modules.import(id, "", {});
    if (!this.current(generation)) return;
    await entry.refresh();
    await entry.fiber?.await();
    if (entry.fiber === void 0) throw new Error(`client-modules: ${id} import failed (see console)`);
    this.revisions.set(id, rev);
  }
  async reconcile(generation) {
    if (!this.current(generation)) return;
    const loader = this.loader;
    if (loader === void 0) throw new Error("client-modules: entries have not started");
    const manifest = this.desired;
    this.publish({ syncing: true, failures: [] });
    const failures = [];
    this.index.update(manifest, this.managed.keys());
    const wanted = new Set(manifest.plugins.map((row) => row.id));
    for (const [id, entry] of this.managed) {
      if (wanted.has(id)) continue;
      const fiber = entry.fiber;
      loader.remove(entry.id);
      this.managed.delete(id);
      this.revisions.delete(id);
      while (fiber?.inertia !== void 0) await fiber.inertia;
    }
    for (const row of manifest.modules) {
      if (!this.current(generation)) break;
      try {
        const entry = this.managed.get(row.id);
        if (entry === void 0) {
          await this.modules.prefetch(row.id);
          if (!this.current(generation)) break;
          await this.modules.import(row.id, "", {});
          if (!this.current(generation)) break;
          await this.create(loader, row.id);
          this.revisions.set(row.id, row.rev);
        } else if (this.revisions.get(row.id) !== row.rev) {
          await this.replace(entry, row.id, row.rev, generation);
        } else if (entry.fiber === void 0) {
          await this.replace(entry, row.id, row.rev, generation);
        } else if (entry.fiber.state === FAILED) {
          await entry.fiber.update(entry.options.config, true);
        }
      } catch (error) {
        failures.push({ id: row.id, message: String(error) });
      }
    }
    await loader.await();
    for (const [id, entry] of this.managed) {
      if (failures.some((failure) => failure.id === id)) continue;
      if (entry.fiber?.state === ACTIVE) continue;
      try {
        if (entry.fiber === void 0) throw new Error(`client-modules: ${id} import failed (see console)`);
        await entry.fiber.await();
        failures.push({ id, message: `client-modules: ${id} is waiting for activation` });
      } catch (error) {
        failures.push({ id, message: String(error) });
      }
    }
    this.index.prune([...loader.entries()].map((entry) => entry.options.name));
    if (this.current(generation)) this.publish({ syncing: false, failures });
  }
};

// upstream/packages/client/modules/src/client/main-realm.ts.snapshot
var loadPageBundle = (url) => new Promise((resolve, reject) => {
  const el = document.createElement("script");
  el.async = true;
  el.src = url;
  el.addEventListener("load", () => {
    el.remove();
    resolve();
  }, { once: true });
  el.addEventListener("error", () => {
    el.remove();
    reject(new Error(`client-modules: bundle script ${url} failed to load`));
  }, { once: true });
  document.head.append(el);
});
var MainScriptRealm = class {
  /** @param loadBundle - Carrier execution hook; absent selects the existing page transport. */
  constructor(loadBundle = loadPageBundle) {
    this.loadBundle = loadBundle;
  }
  id = "main";
  pending = /* @__PURE__ */ new Set();
  closed = false;
  disposal;
  /** @param script - Script requested by Modules. @returns The carrier's execution completion. */
  execute(script) {
    if (this.closed) return Promise.reject(new Error("client-modules: Main Realm is disposed"));
    const task = this.loadBundle(script.url);
    this.pending.add(task);
    void task.then(() => {
      this.pending.delete(task);
    }, () => {
      this.pending.delete(task);
    });
    return task;
  }
  /** Stop accepting requests and await existing carrier operations without cancelling them. */
  dispose() {
    if (this.disposal !== void 0) return this.disposal;
    this.closed = true;
    this.disposal = Promise.allSettled([...this.pending]).then(() => {
    });
    return this.disposal;
  }
};

// upstream/packages/client/modules/src/client/system.ts.snapshot
function atRevision(url, rev) {
  if (!/[?&]rev=[^&#]*/.test(url)) {
    throw new Error(`client-modules: bundle URL ${url} has no revision`);
  }
  return url.replace(/([?&]rev=)[^&#]*/, `$1${encodeURIComponent(rev)}`);
}
var CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function chunkId(ownerId, fileName) {
  return `${ownerId}/${fileName}`;
}
function chunkUrl(row, fileName, rev) {
  const url = atRevision(row.url, rev);
  const marker = "/??";
  const resourceStart = url.indexOf(marker);
  const revisionStart = url.indexOf("&rev=", resourceStart + marker.length);
  const resource = resourceStart < 0 || revisionStart < 0 ? void 0 : url.slice(resourceStart + marker.length, revisionStart);
  if (resource !== `${row.id}/client.js`) {
    throw new Error(`client-modules: cannot resolve chunk ${JSON.stringify(fileName)} from bundle URL ${url}`);
  }
  return `${url.slice(0, resourceStart)}/${row.id}/${fileName}?${url.slice(revisionStart + 1)}`;
}
var ClientModuleSystem = class {
  version = "client";
  manifest;
  entries;
  loadCache = /* @__PURE__ */ new Map();
  mainRealm;
  /** Previous records of packages under replacement, by package id, until their old runtime is released. */
  replaced = /* @__PURE__ */ new Map();
  moduleListeners = /* @__PURE__ */ new Set();
  factories = /* @__PURE__ */ new Map();
  bootstrapIds = /* @__PURE__ */ new Set();
  staticIds = /* @__PURE__ */ new Set();
  /** In-flight script transport per URL. */
  pendingArrival = /* @__PURE__ */ new Map();
  /** Owner generation captured by in-flight chunk requests and advanced on invalidation. */
  generations = /* @__PURE__ */ new Map();
  /** Single-resource combo URL selected by HMR after invalidating one row. */
  reloadTargets = /* @__PURE__ */ new Map();
  /** Materialization re-entrancy guard: factory-form CJS cannot deliver partial exports, so a cycle is fatal. */
  materializing = /* @__PURE__ */ new Set();
  graphRows = /* @__PURE__ */ new Map();
  resolveAsset;
  /** Last import or prefetch failure per graph row, cleared by a later success or invalidation. */
  importErrors = /* @__PURE__ */ new Map();
  /** Batch URLs whose transport or execution already failed; rows still missing from them go straight to their one-resource URL. */
  failedBundleUrls = /* @__PURE__ */ new Set();
  /** Every URL whose script has executed once; a batch among them is never requested again. */
  executedBundleUrls = /* @__PURE__ */ new Set();
  /**
   * Build the module system over the parsed boot rows.
   * @param options - Parsed graph, delivered manifests, bootstrap module, registration facade, and transport.
   */
  constructor(options) {
    this.manifest = options.manifest;
    this.entries = new ClientEntries(this, {
      update: (manifest, managed) => {
        this.updateManifest(manifest, managed);
      },
      invalidateForReplacement: (id, rev) => {
        if (this.bootstrapIds.has(id)) throw new Error(`client-modules: replacing bootstrap module ${id} requires a page reload`);
        this.drop(id, rev, true);
      },
      releaseReplaced: (id) => {
        if (this.replaced.delete(this.resolveModuleId(id))) this.publishModules();
      },
      prune: (roots) => {
        this.prune(roots);
      }
    });
    this.mainRealm = new MainScriptRealm(options.loadBundle);
    this.resolveAsset = options.resolveAsset ?? ((reference) => reference);
    for (const row of options.manifest.modules) {
      this.graphRows.set(row.id, row);
    }
    const bootstrapId = stripClientSuffix(options.bootstrapModule.id);
    this.bootstrapIds.add(bootstrapId);
    this.loadCache.set(bootstrapId, {
      id: bootstrapId,
      ownerId: bootstrapId,
      exports: options.bootstrapModule.exports,
      edges: /* @__PURE__ */ new Set()
    });
    const target = options.registrationTarget;
    if (target.mode !== "queue") {
      throw new Error("client-modules: window.__ModuleLoader__.create called after module-system boot");
    }
    const pending = target.pendingQueue.splice(0);
    target.mode = "live";
    target.load = (registration) => {
      this.register(registration);
    };
    for (const registration of options.staticModules) {
      this.staticIds.add(registration.id);
      if (registration.id === bootstrapId && registration.chunk === void 0) continue;
      target.load(registration);
    }
    for (const registration of pending) target.load(registration);
  }
  subscribeModules(listener) {
    this.moduleListeners.add(listener);
    return () => {
      this.moduleListeners.delete(listener);
    };
  }
  *activeRecords() {
    for (const records of this.replaced.values()) yield* records;
    yield* this.loadCache.values();
  }
  publishModules() {
    notifySubscribers2(this.moduleListeners, "modules");
  }
  /** Stop accepting script execution and await the startup carrier's pending operations. */
  dispose() {
    return this.mainRealm.dispose();
  }
  resolveModuleId(specifier) {
    return this.staticIds.has(specifier) || this.factories.has(specifier) || this.loadCache.has(specifier) ? specifier : stripClientSuffix(specifier);
  }
  /** Register one bundle factory, rejecting a script that executes twice without invalidation. */
  register(registration) {
    const ownerId = registration.id;
    if (registration.chunk !== void 0 && !CLIENT_CHUNK.test(registration.chunk)) {
      throw new Error(`client-modules: invalid package-local chunk ${JSON.stringify(registration.chunk)}`);
    }
    const id = registration.chunk === void 0 ? ownerId : chunkId(ownerId, registration.chunk);
    if (this.loadCache.has(id) || this.factories.has(id)) {
      const registrationName = registration.chunk === void 0 ? registration.id : id;
      throw new Error(`client-modules: duplicate factory registration for "${registrationName}" (bundle executed twice without invalidate?)`);
    }
    this.factories.set(id, {
      manifest: registration,
      factory: registration.factory,
      rev: this.reloadTargets.get(ownerId)?.rev ?? this.graphRows.get(ownerId)?.rev
    });
  }
  /** Run one shared script transport per URL. */
  loadShared(url) {
    let transport = this.pendingArrival.get(url);
    if (transport === void 0) {
      transport = this.mainRealm.execute({ url }).then(() => {
        this.executedBundleUrls.add(url);
      }).finally(() => {
        this.pendingArrival.delete(url);
      });
      this.pendingArrival.set(url, transport);
    }
    return transport;
  }
  /**
   * Load one graph row so its factory is registered (idempotent per in-flight
   * arrival). A batch script is one classic script that registers every
   * package in sequence, and {@link register} rejects a second registration,
   * so the two failure kinds differ: a transport failure (`error` event, nothing
   * executed) is retried once on the same URL; a script that loaded without
   * registering this row (a parse error registered nothing, or a runtime throw
   * stopped it after registering others) is never re-executed, because a replay
   * would stop again at the first duplicate registration; that holds even when
   * the row that first imports from the batch is one it did register, because
   * every executed batch URL is remembered. Either way the row then falls back
   * to its own one-resource URL, which the Host serves for every package, so one
   * failed batch costs at most three requests per missing row and never fails
   * the rows that were registered.
   */
  async arrive(row) {
    const { id } = row;
    if (this.loadCache.has(id) || this.factories.has(id)) return;
    const reload = this.reloadTargets.get(id);
    const preferred = reload?.url ?? row.initialUrl;
    const fallback = reload === void 0 && row.url !== preferred ? row.url : void 0;
    const failures = [];
    const attempt = async (url) => {
      try {
        await this.loadShared(url);
      } catch (error) {
        failures.push(`${url}: ${describeError(error)}`);
        return "transport-failed";
      }
      if (this.factories.has(id)) return "registered";
      failures.push(`${url}: loaded without registering "${id}" via __ModuleLoader__.load`);
      return "not-registered";
    };
    let outcome = "transport-failed";
    if (this.failedBundleUrls.has(preferred)) {
      failures.push(`${preferred}: skipped after an earlier failure of this bundle`);
    } else if (fallback !== void 0 && this.executedBundleUrls.has(preferred)) {
      failures.push(`${preferred}: already executed without registering "${id}"`);
      outcome = "not-registered";
      this.failedBundleUrls.add(preferred);
    } else {
      outcome = await attempt(preferred);
      if (outcome === "transport-failed") outcome = await attempt(preferred);
      if (outcome !== "registered" && fallback !== void 0) this.failedBundleUrls.add(preferred);
    }
    if (outcome !== "registered" && fallback !== void 0) outcome = await attempt(fallback);
    if (outcome !== "registered") {
      throw new Error(`client-modules: could not load "${id}": ${failures.join("; ")}`);
    }
    if (reload !== void 0 && this.reloadTargets.get(id) === reload) {
      this.reloadTargets.delete(id);
    }
  }
  /** Register each injected package and unresolved dynamic request before its consumer. */
  async arriveGraphRow(row, open = [], visited = /* @__PURE__ */ new Set()) {
    const cycleStart = open.indexOf(row.id);
    if (cycleStart !== -1) {
      throw new Error(
        `client-modules: module arrival cycle ${[...open.slice(cycleStart), row.id].join(" -> ")} (the host must reject this graph before serving it)`
      );
    }
    if (visited.has(row.id)) return;
    visited.add(row.id);
    const next = [...open, row.id];
    for (const request of row.external) {
      const id = this.resolveModuleId(request);
      if (this.loadCache.has(id) || this.factories.has(id) && !this.graphRows.has(id)) continue;
      const dependency = this.graphRows.get(id);
      if (dependency !== void 0) await this.arriveDependency(row.id, dependency, next, visited);
    }
    for (const packageName of row.inject) {
      const dependency = this.graphRows.get(packageName);
      if (dependency !== void 0) await this.arriveDependency(row.id, dependency, [], visited);
    }
    await this.arrive(row);
  }
  /** Arrive one dependency, naming the consumer it failed for so a cascade reads as a chain, not as 44 unrelated failures. */
  async arriveDependency(consumerId, dependency, open, visited) {
    try {
      await this.arriveGraphRow(dependency, open, visited);
    } catch (error) {
      throw new Error(
        `client-modules: "${consumerId}" not loaded because dependency "${dependency.id}" failed: ${describeError(error)}`,
        { cause: error }
      );
    }
  }
  /** Materialize a registered factory (synchronous; memoized in loadCache). */
  materialize(id) {
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing;
    const registered = this.factories.get(id);
    if (registered === void 0) throw new Error(`client-modules: no registered factory for "${id}"`);
    if (this.materializing.has(id)) {
      throw new Error(`client-modules: require cycle through "${id}" (factory-form CJS cannot deliver partial exports)`);
    }
    this.materializing.add(id);
    let record2;
    try {
      const edges = /* @__PURE__ */ new Set();
      const exports = registered.factory(this.makeRequire(registered.manifest.id, edges, () => {
        if (this.loadCache.get(id)?.edges === edges) this.publishModules();
      }));
      record2 = {
        id,
        ownerId: registered.manifest.id,
        exports,
        edges,
        ...registered.manifest.meta === void 0 ? {} : { meta: registered.manifest.meta }
      };
      this.loadCache.set(id, record2);
    } finally {
      this.materializing.delete(id);
    }
    this.publishModules();
    return record2;
  }
  /** Build the synchronous module-table require, its asynchronous chunk operation, and its asset resolver. */
  makeRequire(ownerId, edges, onEdgesChanged) {
    const resolve = (spec) => {
      const id = this.resolveModuleId(spec);
      const record2 = this.loadCache.get(id);
      if (record2 !== void 0) return record2.exports;
      if (this.factories.has(id)) return this.materialize(id).exports;
      throw new Error(
        `client-modules: require("${spec}") missed the module table \u2014 not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`
      );
    };
    const recordEdge = (spec) => {
      if (edges.has(spec)) return;
      edges.add(spec);
      if (!spec.startsWith("./")) onEdgesChanged();
    };
    const require2 = (spec) => {
      const exports = resolve(spec);
      recordEdge(spec);
      return exports;
    };
    require2.asset = (reference) => this.resolveAsset(reference);
    require2.async = async (spec) => {
      if (!spec.startsWith("./")) {
        const exports2 = await this.import(spec);
        recordEdge(spec);
        return exports2;
      }
      const fileName = spec.slice(2);
      if (!CLIENT_CHUNK.test(fileName)) {
        throw new Error(`client-modules: invalid relative chunk request ${JSON.stringify(spec)}`);
      }
      const exports = await this.importChunk(ownerId, fileName);
      recordEdge(spec);
      return exports;
    };
    return require2;
  }
  /** Load, register, and materialize one package-local dynamic chunk. */
  async importChunk(ownerId, fileName) {
    const id = chunkId(ownerId, fileName);
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing.exports;
    if (!this.factories.has(id)) {
      const generation = this.generations.get(ownerId) ?? 0;
      const row = this.graphRows.get(ownerId);
      if (row === void 0) throw new Error(`client-modules: chunk owner "${ownerId}" is not a boot graph entry`);
      const revision = this.factories.get(ownerId)?.rev ?? this.reloadTargets.get(ownerId)?.rev ?? row.rev;
      const url = chunkUrl(row, fileName, revision);
      await this.loadShared(url);
      if ((this.generations.get(ownerId) ?? 0) !== generation) {
        this.factories.delete(id);
        if (this.loadCache.delete(id)) this.publishModules();
        return await this.importChunk(ownerId, fileName);
      }
      if (!this.factories.has(id)) {
        throw new Error(`client-modules: bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load`);
      }
    }
    return this.materialize(id).exports;
  }
  async import(specifier) {
    const id = this.resolveModuleId(specifier);
    const existing = this.loadCache.get(id);
    if (existing !== void 0) return existing.exports;
    const row = this.graphRows.get(id);
    if (row === void 0) {
      if (this.factories.has(id)) return this.materialize(id).exports;
      throw new Error(
        `client-modules: cannot resolve "${specifier}" \u2014 not a materialized module, and not a row in the boot graph (the runtime mirror of the bundle purity gate)`
      );
    }
    return this.recordingImportError(id, async () => {
      await this.arriveGraphRow(row);
      return this.materialize(id).exports;
    });
  }
  async prefetch(id) {
    const normalized = this.resolveModuleId(id);
    if (this.loadCache.has(normalized)) return;
    const row = this.graphRows.get(normalized);
    if (row === void 0 && this.factories.has(normalized)) return;
    if (row === void 0) throw new Error(`client-modules: prefetch("${id}") \u2014 not a graph entry`);
    await this.recordingImportError(normalized, () => this.arriveGraphRow(row));
  }
  importError(id) {
    return this.importErrors.get(stripClientSuffix(id));
  }
  /**
   * Run one graph-row operation, recording its failure for the boot audit and
   * clearing the record on success. Arrival and materialization both run in
   * here, so a factory that throws is recorded as well as a bundle that never
   * arrived; the Loader only sees a missing fiber either way.
   */
  async recordingImportError(id, operation) {
    try {
      const result = await operation();
      this.importErrors.delete(id);
      return result;
    } catch (error) {
      this.importErrors.set(id, error instanceof Error ? error : new Error(describeError(error)));
      throw error;
    }
  }
  /** Refresh descriptors and unowned factory revisions before any entry imports its dependencies. */
  updateManifest(manifest, managed) {
    for (const id of this.bootstrapIds) {
      if (this.manifest.modules.some((row) => row.id === id) && !manifest.modules.some((row) => row.id === id)) {
        throw new Error(`client-modules: removing bootstrap module ${id} requires a page reload`);
      }
    }
    const owned = new Set(managed);
    for (const row of manifest.modules) {
      this.graphRows.set(row.id, { ...row, initialUrl: row.url });
      const cachedRevision = this.factories.get(row.id)?.rev ?? this.reloadTargets.get(row.id)?.rev;
      if (!owned.has(row.id) && cachedRevision !== void 0 && cachedRevision !== row.rev) {
        this.invalidate(row.id, row.rev);
      }
    }
    this.manifest = manifest;
  }
  /** Retain live Loader modules and their transitive requests before evicting unreferenced graph records. */
  prune(roots) {
    const retained = new Set(this.bootstrapIds);
    const visit = (specifier) => {
      const id = this.resolveModuleId(specifier);
      if (retained.has(id)) return;
      retained.add(id);
      const row = this.graphRows.get(id);
      const observed = [this.loadCache.get(id), ...this.replaced.get(id) ?? []].flatMap((record2) => [...record2?.edges ?? []]);
      for (const request of [...row?.external ?? [], ...row?.inject ?? [], ...observed]) {
        visit(request);
      }
    };
    for (const id of this.staticIds) visit(id);
    for (const row of this.manifest.modules) visit(row.id);
    for (const id of roots) visit(id);
    for (const id of this.graphRows.keys()) {
      if (retained.has(id)) continue;
      this.graphRows.delete(id);
      this.invalidate(id);
    }
  }
  invalidate(id, rev) {
    this.drop(id, rev, false);
  }
  /**
   * Reset one package's code. With `retain`, its materialized records stay in {@link activeRecords}
   * until `releaseReplaced`, because the runtime created from them is still running.
   */
  drop(id, rev, retain) {
    const normalized = this.resolveModuleId(id);
    if (this.bootstrapIds.has(normalized)) throw new Error(`client-modules: replacing bootstrap module ${normalized} requires a page reload`);
    if (this.staticIds.has(normalized)) return;
    this.importErrors.delete(normalized);
    this.generations.set(normalized, (this.generations.get(normalized) ?? 0) + 1);
    const row = this.graphRows.get(normalized);
    if (row !== void 0) {
      const revision = rev ?? row.rev;
      this.reloadTargets.set(normalized, { url: atRevision(row.url, revision), rev: revision });
    } else this.reloadTargets.delete(normalized);
    for (const key of this.factories.keys()) {
      if (key === normalized || key.startsWith(`${normalized}/client.`)) this.factories.delete(key);
    }
    const removed = [];
    for (const [key, record2] of this.loadCache) {
      if (key === normalized || key.startsWith(`${normalized}/client.`)) {
        this.loadCache.delete(key);
        removed.push(record2);
      }
    }
    if (retain) {
      if (removed.length > 0) this.replaced.set(normalized, [...this.replaced.get(normalized) ?? [], ...removed]);
      return;
    }
    if (this.replaced.delete(normalized) || removed.length > 0) this.publishModules();
  }
};

// upstream/packages/client/modules/src/client/index.ts.snapshot
function createClientModuleSystem(target, bootstrapModule, options) {
  return new ClientModuleSystem({
    manifest: parseBootManifest(options.boot),
    staticModules: options.staticModules,
    registrationTarget: target,
    bootstrapModule,
    ...options.loadBundle === void 0 ? {} : { loadBundle: options.loadBundle },
    ...options.resolveAsset === void 0 ? {} : { resolveAsset: options.resolveAsset }
  });
}

// upstream/packages/client/locale/src/locale-settings.ts.snapshot
import z2 from "@deepseek-ai/schemastery";
var LOCALE_PREFERENCE_FIELD = "preference";
var LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
var LOCALE_IDS = ["zh", "en"];
var LocaleSettingsFields = {
  [LOCALE_PREFERENCE_FIELD]: z2.string().pattern(LOCALE_ID_PATTERN).required(false)
};
var LocaleSettingsSchema = z2.object(LocaleSettingsFields);

// upstream/packages/client/locale/src/client/LanguageRow.tsx.snapshot
import { useState as useState5 } from "react";
import { jsx as jsx12, jsxs as jsxs9 } from "react/jsx-runtime";

// upstream/packages/client/locale/src/client/index.ts.snapshot
var FALLBACK_LOCALE = "en";
var COMMON_NS = "common";
var BUILT_IN_LOCALE_METADATA = {
  zh: { label: "\u4E2D\u6587", fallback: "en" },
  en: { label: "English" }
};
var BUILT_IN_LOCALES = Object.freeze(
  LOCALE_IDS.map((id) => Object.freeze({ id, ...BUILT_IN_LOCALE_METADATA[id] }))
);
function localeKey(value) {
  return value.toLowerCase();
}
function normalizeLanguage(input) {
  if (!LOCALE_ID_PATTERN.test(input.id)) {
    throw new Error(`locale id "${input.id}" is not a BCP 47-style tag`);
  }
  if (input.label.trim() === "") throw new Error("locale label must not be empty");
  if (!LOCALE_ID_PATTERN.test(input.fallback)) {
    throw new Error(`locale fallback "${input.fallback}" is not a BCP 47-style tag`);
  }
  return Object.freeze({ id: input.id, label: input.label, fallback: input.fallback });
}
var LocaleRuntime = class {
  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions (standalone dictionary registries) stay process-local.
   * @param bootstrap - native initialization; absent in ordinary browsers.
   */
  constructor(ctx, host, bootstrap) {
    this.bootstrap = bootstrap;
    this.ctx = ctx;
    this.host = host;
    for (const locale of BUILT_IN_LOCALES) this.catalog.set(localeKey(locale.id), locale);
    const locales = this.localeList();
    this.provisional = resolveInitialLocale(locales, bootstrap?.languages);
    this.preference = bootstrap?.preference ?? void 0;
    this.snapshot = Object.freeze({ active: this.resolveActive(), locales, revision: 0 });
    if (host !== void 0) {
      ctx.effect(() => host.subscribe(() => {
        this.adopt(host);
      }), "locale: settings scope adoption");
      this.adopt(host);
    }
  }
  dicts = /* @__PURE__ */ new Map();
  bound = /* @__PURE__ */ new Map();
  catalog = /* @__PURE__ */ new Map();
  fallbackChains = /* @__PURE__ */ new Map();
  snapshot;
  listeners = /* @__PURE__ */ new Set();
  ctx;
  host;
  /** Browser-derived locale standing wherever no explicit Host selection does. */
  provisional;
  /** Last explicit selection, including one awaiting an external registration. */
  preference;
  /**
   * Read the current immutable locale snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getLocale() {
    return this.snapshot;
  }
  /**
   * Resolve package text through the active language's declared fallback chain.
   * Plain strings stay verbatim; maps do not consult registered dictionaries.
   * @param text - package text whose locale keys are lowercase and include English.
   * @returns the first available translation, including an empty string.
   */
  resolveText(text) {
    if (typeof text === "string") return text;
    return this.fallbackChain(this.snapshot.active).reduceRight(
      (resolved, locale) => text[localeKey(locale)] ?? resolved,
      text.en
    );
  }
  /**
   * LocaleFace getSnapshot: the current snapshot (carries `revision`; stable
   * reference between changes, uSES-safe).
   * @returns the current snapshot.
   */
  getSnapshot() {
    return this.snapshot;
  }
  /**
   * LocaleFace subscribe: notified on every snapshot change (locale switch
   * or dictionary registration — registrations bump the revision so already
   * rendered outlets pick up late-arriving dictionaries and locale definitions).
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /**
   * Switch the active locale — the only user preference write entry.
   *
   * The durable write happens even when the id already matches the active
   * locale, because the active value may be a provisional browser-derived or
   * fallback resolution that nothing has stored yet. Picking the language
   * already on screen is still an explicit choice, and it must survive a
   * different browser sharing the same DSH home. Only the render notification
   * is conditional: republishing an unchanged locale would churn every
   * subscriber for nothing.
   * @param id - a registered locale id; unknown ids throw.
   */
  setLocale(id) {
    const match = this.catalog.get(localeKey(id));
    if (match === void 0) throw new Error(`locale "${id}" is not registered`);
    this.preference = match.id;
    if (this.snapshot.active !== match.id) this.publish(match.id, true);
    void this.host?.set(LOCALE_PREFERENCE_FIELD, match.id);
  }
  /**
   * Add one selectable language to the shared catalog. Its fallback must
   * already be registered, and following fallback definitions must terminate
   * at English. Dictionaries may register before or after this definition.
   * Registration rechecks an unresolved Host preference and the browser's
   * ordered language list. The caller owns the returned disposer; removing an
   * active language falls back without clearing the stored id.
   * @param input - stable id, self-described label, and fallback language id.
   * @returns idempotent disposer removing this exact definition.
   * @throws when fields are malformed, the id is occupied, or the fallback
   * target is unknown or creates a cycle.
   */
  addLanguage(input) {
    const candidate = normalizeLanguage(input);
    const key = localeKey(candidate.id);
    if (this.catalog.has(key)) throw new Error(`locale "${candidate.id}" is already registered`);
    const fallback = this.catalog.get(localeKey(candidate.fallback));
    if (fallback === void 0) {
      throw new Error(`locale fallback "${candidate.fallback}" is not registered`);
    }
    const language = Object.freeze({ ...candidate, fallback: fallback.id });
    this.catalog.set(key, language);
    try {
      this.assertFallbackChain(language.id);
    } catch (error) {
      this.catalog.delete(key);
      throw error;
    }
    this.publishCatalog();
    return () => {
      if (this.catalog.get(key) !== language) return;
      this.catalog.delete(key);
      this.publishCatalog();
    };
  }
  /**
   * Adopt the scope's accepted durable selection without writing it back; an
   * absent selection returns to the browser-derived locale.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  adopt(host) {
    const section = host.getSnapshot().value;
    if (section === void 0) return;
    this.preference = section.preference;
    const target = this.resolveActive();
    if (this.snapshot.active === target) return;
    this.publish(target, true);
  }
  /** Recompute browser fallback and publish the current catalog. */
  publishCatalog() {
    this.fallbackChains.clear();
    const locales = this.localeList();
    this.provisional = resolveInitialLocale(locales, this.bootstrap?.languages);
    const active = this.resolveActive();
    this.publish(active, active !== this.snapshot.active, locales);
  }
  /** Resolve an explicit preference only while its definition is available. */
  resolveActive() {
    if (this.preference === void 0) return this.provisional;
    return this.catalog.get(localeKey(this.preference))?.id ?? this.provisional;
  }
  /** Snapshot the catalog in registration order. */
  localeList() {
    return Object.freeze([...this.catalog.values()]);
  }
  /** Fail a new definition whose complete fallback path does not reach English. */
  assertFallbackChain(start) {
    const seen = /* @__PURE__ */ new Set();
    let current2 = this.catalog.get(localeKey(start));
    while (current2 !== void 0) {
      const key = localeKey(current2.id);
      if (seen.has(key)) throw new Error(`locale fallback cycle includes "${current2.id}"`);
      seen.add(key);
      if (key === localeKey(FALLBACK_LOCALE)) return;
      if (current2.fallback === void 0) {
        throw new Error(`locale "${current2.id}" fallback chain does not reach "${FALLBACK_LOCALE}"`);
      }
      const next = this.catalog.get(localeKey(current2.fallback));
      if (next === void 0) {
        throw new Error(`locale fallback "${current2.fallback}" is not registered`);
      }
      current2 = next;
    }
  }
  /** Resolve a lookup chain, falling directly to English across an unload gap. */
  fallbackChain(start) {
    const startKey = localeKey(start);
    const cached = this.fallbackChains.get(startKey);
    if (cached !== void 0) return cached;
    const chain = [];
    const seen = /* @__PURE__ */ new Set();
    let current2 = this.catalog.get(startKey);
    while (current2 !== void 0 && !seen.has(localeKey(current2.id))) {
      const key = localeKey(current2.id);
      seen.add(key);
      chain.push(current2.id);
      current2 = current2.fallback === void 0 ? void 0 : this.catalog.get(localeKey(current2.fallback));
    }
    if (!seen.has(localeKey(FALLBACK_LOCALE))) chain.push(FALLBACK_LOCALE);
    const resolved = Object.freeze(chain);
    this.fallbackChains.set(startKey, resolved);
    return resolved;
  }
  register(ns, localeOrDicts, dict) {
    const pairs = typeof localeOrDicts === "string" ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts);
    for (const [locale] of pairs) {
      if (!LOCALE_ID_PATTERN.test(locale)) {
        throw new Error(`locale id "${locale}" is not a BCP 47-style tag`);
      }
    }
    let locales = this.dicts.get(ns);
    if (!locales) {
      locales = /* @__PURE__ */ new Map();
      this.dicts.set(ns, locales);
    }
    for (const [locale] of pairs) {
      if (locales.has(localeKey(locale))) {
        throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
      }
    }
    for (const [locale, entries] of pairs) locales.set(localeKey(locale), entries);
    this.publish(this.snapshot.active, false);
    return () => {
      const owner = this.dicts.get(ns);
      if (!owner) return;
      let removed = false;
      for (const [locale, entries] of pairs) {
        const key = localeKey(locale);
        if (owner.get(key) === entries) {
          owner.delete(key);
          removed = true;
        }
      }
      if (removed) this.publish(this.snapshot.active, false);
    };
  }
  bind(ns) {
    let t = this.bound.get(ns);
    if (!t) {
      t = (key, params) => this.translate(ns, key, params);
      this.bound.set(ns, t);
      return t;
    }
    return t;
  }
  translate(ns, key, params) {
    const chain = this.fallbackChain(this.snapshot.active);
    const template = this.lookup(ns, key, chain) ?? (ns !== COMMON_NS ? this.lookup(COMMON_NS, key, chain) : void 0) ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
  }
  lookup(ns, key, chain) {
    const locales = this.dicts.get(ns);
    for (const locale of chain) {
      const value = locales?.get(localeKey(locale))?.[key];
      if (value !== void 0) return value;
    }
    return void 0;
  }
  /**
   * Advance the snapshot revision and notify LocaleFace subscribers (render
   * refresh). Only an active-locale switch additionally emits
   * `locale/change` — dictionary registrations stay off the event so
   * registration-heavy boot cannot storm event listeners (which may
   * re-register slots in response).
   */
  publish(active, localeChanged, locales = this.snapshot.locales) {
    this.snapshot = Object.freeze({
      active,
      locales,
      revision: this.snapshot.revision + 1
    });
    if (localeChanged) this.ctx.emit("locale/change", this.snapshot);
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (error) {
        console.error("locale subscriber crashed:", error);
      }
    }
  }
};
function resolveInitialLocale(locales, languages) {
  return detectBrowserLocale(locales, languages) ?? FALLBACK_LOCALE;
}
function detectBrowserLocale(locales, languages) {
  if (languages === void 0) {
    if (typeof window === "undefined") return void 0;
    const browserLanguages = navigator.languages;
    languages = [...browserLanguages ?? [], navigator.language];
  }
  for (const tag of languages) {
    const requested = localeKey(tag);
    const exact = locales.find((locale) => localeKey(locale.id) === requested);
    if (exact !== void 0) return exact.id;
    const primary = requested.split("-")[0];
    const match = locales.find((locale) => localeKey(locale.id).split("-")[0] === primary);
    if (match !== void 0) return match.id;
  }
  return void 0;
}

// upstream/packages/client/shortcuts/src/client/index.ts.snapshot
import { Service } from "@deepseek-ai/cordis";

// upstream/packages/client/shortcuts/src/binding.ts.snapshot
var keyNames = {
  Slash: "/",
  Comma: ",",
  Period: ".",
  Backslash: "\\",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Enter: "Enter",
  Escape: "Esc",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192"
};
var modifierOrder = ["control", "alt", "shift", "meta"];
function normalizeBinding(binding, platform) {
  const codes = [binding.code, ...binding.secondCode === void 0 ? [] : [binding.secondCode]];
  codes.sort();
  for (const code of codes) {
    if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u.test(code) && !Object.hasOwn(keyNames, code)) throw new Error(`Unsupported shortcut code: ${code}`);
  }
  if (codes.length === 2 && codes[0] === codes[1]) throw new Error("Shortcut keys must be distinct");
  const modifiers = new Set(binding.modifiers.map((value) => value === "primary" ? platform === "macos" ? "meta" : "control" : value));
  return {
    code: codes[0],
    ...codes[1] === void 0 ? {} : { secondCode: codes[1] },
    modifiers: modifierOrder.filter((value) => modifiers.has(value))
  };
}
function bindingKey(binding) {
  const codes = binding.secondCode === void 0 ? [binding.code] : [binding.code, binding.secondCode].sort();
  return [...binding.modifiers, ...codes].join("+");
}
function presentBinding(binding, platform) {
  if (binding === null) return { keys: [], aria: void 0 };
  const key = keyNames[binding.code] ?? binding.code.replace(/^(Key|Digit)/u, "");
  const symbols = platform === "macos" ? { control: "\u2303", alt: "\u2325", shift: "\u21E7", meta: "\u2318" } : { control: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
  const ariaNames = { control: "Control", alt: "Alt", shift: "Shift", meta: "Meta" };
  const ariaKey = binding.code === "Space" ? "Space" : binding.code === "Escape" ? "Escape" : binding.code.startsWith("Arrow") ? binding.code : key;
  const second = binding.secondCode === void 0 ? [] : [keyNames[binding.secondCode] ?? binding.secondCode.replace(/^(Key|Digit)/u, "")];
  const keys = [...binding.modifiers.map((value) => symbols[value]), key];
  return {
    keys: [...platform === "windows" ? keys.flatMap((label, index) => index === 0 ? [label] : ["+", label]) : keys, ...second],
    aria: binding.secondCode === void 0 ? [...binding.modifiers.map((value) => ariaNames[value]), ariaKey].join("+") : void 0
  };
}
function isWebBindingAllowed(binding, platform) {
  if (binding.secondCode !== void 0) return false;
  if (platform === "windows" || platform === "macos") {
    if (binding.modifiers.length >= 3) return true;
    const primary = platform === "macos" ? "meta" : "control";
    if (binding.modifiers.length === 1 && (["Comma", "Backslash"].includes(binding.code) && binding.modifiers[0] === primary || binding.code === "Backquote" && binding.modifiers[0] === "control")) return true;
    if (binding.modifiers.length === 2 && binding.modifiers.includes(primary) && (binding.modifiers.includes("alt") || binding.modifiers.includes("shift"))) return true;
  }
  return [
    { code: "Slash", modifiers: ["primary"] },
    { code: "Comma", modifiers: ["primary", "shift"] },
    { code: "Period", modifiers: ["primary", "shift"] }
  ].some((candidate) => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)));
}

// upstream/packages/util/values/src/partial-json.ts.snapshot
var SIMPLE_ESCAPES = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "	"
};
var CONTENT_ESCAPE = /[\\\u0000-\u001f]/u;
function isWhitespace(c) {
  return c === " " || c === "\n" || c === "\r" || c === "	";
}
function isHex(c) {
  return c >= "0" && c <= "9" || c >= "a" && c <= "f" || c >= "A" && c <= "F";
}
var PartialArguments = class _PartialArguments {
  /** The view of a call with no arguments available. */
  static EMPTY = _PartialArguments.fromObject({});
  /**
   * View finished argument text without scanning it until a reader asks.
   * @param text - the complete argument JSON text.
   * @returns a sealed view.
   */
  static fromText(text) {
    const view = new _PartialArguments();
    view.append(text);
    view.sealed = true;
    return view;
  }
  /**
   * View an already parsed argument payload, such as a PTC dispatch object.
   * @param value - the parsed argument value.
   * @returns a sealed view; a non-object payload has no fields.
   */
  static fromObject(value) {
    const view = new _PartialArguments();
    view.object = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    view.sealed = true;
    return view;
  }
  /**
   * The source: text so far or a parsed object, plus whether it can still grow.
   * These are the only enumerable fields, so two views over the same source
   * compare equal structurally however far each has been read.
   */
  chunks = [];
  object;
  sealed = false;
  // Scan progress, located fields, and remembered reads are caches over the source.
  #ends = [];
  #size = 0;
  #consumed = 0;
  #mode = "root";
  #escape = false;
  #keyStart = 0;
  #keyEscaped = false;
  #key = "";
  #current = null;
  #nestedEnds = [];
  #nestedInString = false;
  #invalidAt;
  #invalidValue = false;
  #entries = /* @__PURE__ */ new Map();
  #order = [];
  #reads = /* @__PURE__ */ new Map();
  /** Whether this view rejects further appends; does not scan text or register reads. */
  get isSealed() {
    return this.sealed;
  }
  /** Whether indexing or a content read found invalid JSON; unread value contents are not validated. */
  get invalid() {
    this.scan();
    return this.#mode === "invalid" || this.#invalidValue;
  }
  /**
   * Retain streamed argument text without scanning or comparing observed answers.
   * @param fragment - the text following every fragment appended before.
   */
  append(fragment) {
    if (this.sealed) throw new Error("PartialArguments: cannot append to a sealed view");
    if (fragment.length === 0) return;
    this.chunks.push(fragment);
    this.#size += fragment.length;
    this.#ends.push(this.#size);
  }
  /**
   * Reconcile a streamed prefix with authoritative complete text without joining the fragments.
   * @param text - the final argument text, which replaces missing or conflicting deltas.
   * @returns this view sealed with its caches retained when every character matches; otherwise a new sealed view.
   */
  settle(text) {
    if (this.object !== void 0 || text.length !== this.#size) return _PartialArguments.fromText(text);
    let offset = 0;
    for (const chunk of this.chunks) {
      if (!text.startsWith(chunk, offset)) return _PartialArguments.fromText(text);
      offset += chunk.length;
    }
    this.chunks = text.length === 0 ? [] : [text];
    this.#ends = text.length === 0 ? [] : [text.length];
    this.sealed = true;
    return this;
  }
  /**
   * Compare observed answers and advance their publication baseline. Unread views remain unscanned.
   * @returns whether any observed answer changed since its first read or the preceding refresh.
   */
  refresh() {
    if (this.#reads.size === 0) return false;
    this.scan();
    let changed = false;
    let completions = false;
    for (const read of this.#reads.values()) {
      if (read.completion) {
        completions = true;
        continue;
      }
      changed = this.refreshRead(read) || changed;
    }
    if (completions) {
      for (const read of this.#reads.values()) if (read.completion) changed = this.refreshRead(read) || changed;
    }
    if (this.sealed) this.#reads.clear();
    return changed;
  }
  refreshRead(read) {
    const now = read.answer();
    if (Object.is(now, read.last)) return false;
    read.last = now;
    return true;
  }
  /**
   * Check whether no further fields can arrive.
   * @returns whether the outer object closed, indexing failed, or the view is sealed; unread values are not validated.
   */
  closed() {
    return this.remember("closed", "", () => this.closedNow());
  }
  /**
   * List discovered fields in first-appearance order.
   * @returns top-level keys seen so far, in first-appearance order.
   */
  keys() {
    return this.remember("keys", "", () => this.keysNow(), (keys) => keys.length);
  }
  /**
   * Check whether a top-level field has appeared.
   * @param key - argument name.
   * @returns whether the field has appeared (a string opened or another value began).
   */
  has(key) {
    return this.remember("has", key, () => this.hasNow(key));
  }
  /**
   * Check whether a field's closing delimiter has arrived, without validating its contents.
   * @param key - argument name.
   * @returns whether its delimiter arrived and no content reader has reported an error for this value.
   */
  complete(key) {
    return this.remember("complete", key, () => this.completeNow(key));
  }
  /**
   * Read string length without materializing its text.
   * @param key - argument name.
   * @param options - change granularity for a streaming string.
   * @returns decoded UTF-16 length of the string field so far; undefined when absent or not a string.
   */
  stringLength(key, options) {
    const step = Math.max(1, Math.floor(options?.step ?? 1));
    const offset = options?.offset ?? 0;
    return this.remember(
      `length:${step}:${offset}`,
      key,
      () => this.lengthNow(key),
      (length) => length === void 0 ? void 0 : Math.ceil((length + offset) / step)
    );
  }
  /**
   * Check a string against a decoded UTF-16 length limit without materializing it.
   * @param key - argument name.
   * @param maxLength - decoded UTF-16 limit, floored to at least zero.
   * @returns whether the string is longer than the limit; false when absent or not a string.
   */
  stringExceeds(key, maxLength) {
    const limit = Math.max(0, Math.floor(maxLength));
    return this.remember(
      `exceeds:${limit}`,
      key,
      () => (this.lengthNow(key, limit + 1) ?? 0) > limit
    );
  }
  /**
   * Read a decoded string, including a streaming prefix.
   * @param key - argument name.
   * @returns the string field's decoded text so far; undefined when absent or not a string.
   */
  text(key) {
    return this.remember("text", key, () => this.textNow(key));
  }
  /**
   * Read at most the first decoded UTF-16 units of a string.
   * @param key - argument name.
   * @param maxLength - maximum decoded UTF-16 length, floored to at least one.
   * @returns the bounded string prefix; undefined when absent or not a string.
   */
  textPrefix(key, maxLength) {
    const limit = Math.max(1, Math.floor(maxLength));
    return this.remember(
      `prefix:${limit}`,
      key,
      () => this.textPrefixNow(key, limit)
    );
  }
  /**
   * Read a completed non-string argument.
   * @param key - argument name.
   * @returns the parsed non-string value once it closed; undefined while open, absent, or a string.
   */
  value(key) {
    return this.remember("value", key, () => this.valueNow(key));
  }
  /** Answer a question and, on a streaming view, remember it for change detection. */
  remember(kind, key, read, comparison) {
    this.scan();
    const result = read();
    if (!this.sealed) {
      const id = `${kind}/${key}`;
      if (!this.#reads.has(id)) {
        this.#reads.set(id, {
          completion: kind === "complete",
          answer: comparison === void 0 ? read : () => comparison(read()),
          last: comparison === void 0 ? result : comparison(result)
        });
      }
    }
    return result;
  }
  closedNow() {
    return this.sealed || this.#mode === "closed" || this.#mode === "invalid";
  }
  keysNow() {
    return this.object === void 0 ? this.#order : Object.keys(this.object);
  }
  hasNow(key) {
    return this.object === void 0 ? this.#entries.has(key) : Object.hasOwn(this.object, key);
  }
  completeNow(key) {
    if (this.object !== void 0) return Object.hasOwn(this.object, key);
    const entry = this.#entries.get(key);
    return entry !== void 0 && entry.end >= 0 && (entry.kind === "string" ? entry.invalidAt === void 0 : !entry.invalid);
  }
  lengthNow(key, limit = Number.POSITIVE_INFINITY) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.length : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text !== void 0 && entry.text.at === entry.end) return entry.text.length;
    const read = entry.length ??= { at: entry.start, length: 0, text: "" };
    this.readString(entry, read, limit, false);
    return read.length;
  }
  textNow(key) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    if (entry.text === void 0 && entry.end >= 0 && entry.needsDecoding && entry.invalidAt === void 0) {
      let text;
      try {
        text = JSON.parse(`"${this.slice(entry.start, entry.end)}"`);
      } catch (_error) {
      }
      if (text !== void 0) entry.text = { at: entry.end, length: text.length, text };
    }
    const read = entry.text ??= { at: entry.start, length: 0, text: "" };
    this.readString(entry, read, Number.POSITIVE_INFINITY, true);
    return read.text;
  }
  textPrefixNow(key, maxLength) {
    if (this.object !== void 0) {
      const field = Object.hasOwn(this.object, key) ? this.object[key] : void 0;
      return typeof field === "string" ? field.slice(0, maxLength) : void 0;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "string") return void 0;
    const prefixes = entry.prefixes ??= /* @__PURE__ */ new Map();
    let read = prefixes.get(maxLength);
    if (read === void 0) {
      read = { at: entry.start, length: 0, text: "" };
      prefixes.set(maxLength, read);
    }
    this.readString(entry, read, maxLength, true);
    return read.text;
  }
  valueNow(key) {
    if (this.object !== void 0) {
      if (!Object.hasOwn(this.object, key)) return void 0;
      const field = this.object[key];
      return typeof field === "string" ? void 0 : field;
    }
    const entry = this.#entries.get(key);
    if (entry?.kind !== "value" || entry.end < 0 || entry.invalid) return void 0;
    if (entry.parsed === void 0) {
      try {
        entry.parsed = JSON.parse(this.slice(entry.start, entry.end));
      } catch (_error) {
        entry.invalid = true;
        this.#invalidValue = true;
      }
    }
    return entry.parsed;
  }
  chunkAt(at) {
    let low = 0;
    let high = this.#ends.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (this.#ends[mid] <= at) low = mid + 1;
      else high = mid;
    }
    return low;
  }
  /** Materialize only a requested range, never the cumulative source. */
  slice(start, end) {
    if (start >= end) return "";
    const first = this.chunkAt(start);
    const last = this.chunkAt(end - 1);
    const base = first === 0 ? 0 : this.#ends[first - 1];
    if (first === last) return this.chunks[first].slice(start - base, end - base);
    const parts = [this.chunks[first].slice(start - base)];
    for (let i = first + 1; i < last; i++) parts.push(this.chunks[i]);
    parts.push(this.chunks[last].slice(0, end - this.#ends[last - 1]));
    return parts.join("");
  }
  readString(entry, read, limit, materialize) {
    const end = Math.min(
      entry.end < 0 ? this.#consumed : entry.end,
      entry.invalidAt ?? Number.POSITIVE_INFINITY,
      this.#invalidAt ?? Number.POSITIVE_INFINITY
    );
    if (!entry.needsDecoding) {
      const length = Math.min(end - read.at, limit - read.length);
      if (length <= 0) return;
      if (materialize) read.text += this.slice(read.at, read.at + length);
      read.at += length;
      read.length += length;
      return;
    }
    let chunkIndex = this.chunkAt(read.at);
    while (read.at < end && read.length < limit) {
      const base = chunkIndex === 0 ? 0 : this.#ends[chunkIndex - 1];
      const chunk = this.chunks[chunkIndex];
      const remaining = chunk.slice(read.at - base, Math.min(chunk.length, end - base));
      const boundary = remaining.search(CONTENT_ESCAPE);
      const length = Math.min(boundary < 0 ? remaining.length : boundary, limit - read.length);
      if (length > 0) {
        if (materialize) read.text += remaining.slice(0, length);
        read.at += length;
        read.length += length;
        if (read.at === base + chunk.length) chunkIndex++;
        continue;
      }
      const type = remaining.length > 1 ? remaining[1] : read.at + 1 < end ? this.chunks[chunkIndex + 1][0] : void 0;
      let decoded;
      let width = 2;
      if (remaining[0] === "\\" && type === void 0 && entry.end < 0) return;
      if (remaining[0] === "\\" && type === "u") {
        const hex = this.slice(read.at + 2, Math.min(end, read.at + 6));
        let valid = true;
        for (let i = 0; i < hex.length; i++) if (!isHex(hex[i])) valid = false;
        if (valid) {
          if (hex.length < 4 && entry.end < 0) return;
          if (hex.length === 4) decoded = String.fromCharCode(Number.parseInt(hex, 16));
        }
        width = 6;
      } else if (remaining[0] === "\\" && type !== void 0) {
        decoded = SIMPLE_ESCAPES[type];
      }
      if (decoded === void 0) {
        entry.invalidAt = read.at;
        this.#invalidValue = true;
        return;
      }
      if (materialize) read.text += decoded;
      read.length++;
      read.at += width;
      while (chunkIndex < this.chunks.length && read.at >= this.#ends[chunkIndex]) chunkIndex++;
    }
  }
  /** Locate new field ranges without decoding or parsing their contents. */
  scan() {
    if (this.object !== void 0 || this.#consumed === this.#size) return;
    for (let i = this.chunkAt(this.#consumed); i < this.chunks.length && this.#invalidAt === void 0; i++) {
      const pending = this.chunks[i];
      const base = i === 0 ? 0 : this.#ends[i - 1];
      for (let index = this.#consumed - base; index < pending.length && this.#mode !== "invalid"; index++) {
        if (this.#mode === "string" || this.#mode === "nested" && this.#nestedInString) {
          const end = this.stringBoundary(pending, index);
          this.#consumed += end - index;
          index = end;
          if (index === pending.length) break;
        }
        this.step(pending[index], this.#consumed);
        this.#consumed++;
      }
    }
  }
  /** Only raw quotes and their preceding backslash runs can terminate a string. */
  stringBoundary(fragment, start) {
    let at = start;
    while (true) {
      const quote = fragment.indexOf('"', at);
      const end = quote < 0 ? fragment.length : quote;
      if (this.#mode === "string") {
        const entry = this.#current;
        if (!entry.needsDecoding && CONTENT_ESCAPE.test(fragment.slice(at, end))) entry.needsDecoding = true;
      }
      let slashStart = end;
      while (slashStart > at && fragment[slashStart - 1] === "\\") slashStart--;
      const escaped = (end - slashStart) % 2 === 1 !== (slashStart === at && this.#escape);
      this.#escape = quote < 0 && escaped;
      if (quote < 0 || !escaped) return end;
      at = quote + 1;
    }
  }
  step(c, at) {
    switch (this.#mode) {
      case "root":
        if (isWhitespace(c)) return;
        if (c === "{") {
          this.#mode = "key-or-end";
          return;
        }
        this.fail();
        return;
      case "key-or-end":
        if (isWhitespace(c)) return;
        if (c === "}") {
          this.#mode = "closed";
          return;
        }
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key-only":
        if (isWhitespace(c)) return;
        if (c === '"') {
          this.beginKey(at);
          return;
        }
        this.fail();
        return;
      case "key":
        this.stepKey(c, at);
        return;
      case "colon":
        if (isWhitespace(c)) return;
        if (c === ":") {
          this.#mode = "value";
          return;
        }
        this.fail();
        return;
      case "value":
        this.beginValue(c, at);
        return;
      case "string": {
        const entry = this.#current;
        entry.end = at;
        this.#current = null;
        this.#mode = "comma-or-end";
        return;
      }
      case "scalar":
        this.stepScalar(c, at);
        return;
      case "nested":
        this.stepNested(c, at);
        return;
      case "comma-or-end":
        if (isWhitespace(c)) return;
        if (c === ",") {
          this.#mode = "key-only";
          return;
        }
        if (c === "}") {
          this.#mode = "closed";
          return;
        }
        this.fail();
        return;
      case "closed":
        if (isWhitespace(c)) return;
        this.fail();
        return;
      /* v8 ignore next 2 -- scan() stops stepping once the view is invalid. */
      case "invalid":
        return;
      /* v8 ignore next 2 -- Every scanner mode has a handler above. */
      default:
        assertNever(this.#mode);
    }
  }
  fail() {
    this.#invalidAt = this.#consumed;
    this.#mode = "invalid";
    this.#current = null;
  }
  beginKey(at) {
    this.#mode = "key";
    this.#keyStart = at + 1;
    this.#keyEscaped = false;
    this.#escape = false;
  }
  stepKey(c, at) {
    if (c < " ") {
      this.fail();
      return;
    }
    if (this.#escape) {
      this.#escape = false;
      return;
    }
    if (c === "\\") {
      this.#escape = true;
      this.#keyEscaped = true;
      return;
    }
    if (c !== '"') return;
    const raw = this.slice(this.#keyStart, at);
    if (this.#keyEscaped) {
      try {
        this.#key = JSON.parse(`"${raw}"`);
      } catch (_error) {
        this.fail();
        return;
      }
    } else {
      this.#key = raw;
    }
    this.#mode = "colon";
  }
  open(entry) {
    if (!this.#entries.has(this.#key)) this.#order.push(this.#key);
    this.#entries.set(this.#key, entry);
    this.#current = entry;
  }
  beginValue(c, at) {
    if (isWhitespace(c)) return;
    if (c === '"') {
      this.open({
        kind: "string",
        start: at + 1,
        end: -1,
        needsDecoding: false,
        invalidAt: void 0,
        length: void 0,
        text: void 0,
        prefixes: void 0
      });
      this.#escape = false;
      this.#mode = "string";
      return;
    }
    if (c === "}" || c === "," || c === ":" || c === "]") {
      this.fail();
      return;
    }
    this.open({ kind: "value", start: at, end: -1, parsed: void 0, invalid: false });
    if (c === "{" || c === "[") {
      this.#mode = "nested";
      this.#nestedEnds = [c === "{" ? "}" : "]"];
      this.#nestedInString = false;
      this.#escape = false;
      return;
    }
    this.#mode = "scalar";
  }
  stepScalar(c, at) {
    if (c !== "," && c !== "}" && !isWhitespace(c)) return;
    this.closeValue(at);
    this.#mode = c === "," ? "key-only" : c === "}" ? "closed" : "comma-or-end";
  }
  stepNested(c, at) {
    if (this.#nestedInString) {
      this.#nestedInString = false;
      return;
    }
    if (c === '"') {
      this.#nestedInString = true;
      return;
    }
    if (c === "{" || c === "[") {
      this.#nestedEnds.push(c === "{" ? "}" : "]");
      return;
    }
    if (c === "}" || c === "]") {
      if (this.#nestedEnds.pop() !== c) {
        this.fail();
        return;
      }
      if (this.#nestedEnds.length === 0) {
        this.closeValue(at + 1);
        this.#mode = "comma-or-end";
      }
    }
  }
  closeValue(end) {
    const entry = this.#current;
    entry.end = end;
    this.#current = null;
  }
};

// upstream/packages/util/values/src/index.ts.snapshot
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}

// upstream/packages/client/shortcuts/src/configuration.ts.snapshot
var record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var commandPattern = /^[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/u;
function parseBinding(value) {
  if (value === null) return null;
  if (!record(value) || Object.keys(value).some((key) => key !== "code" && key !== "secondCode" && key !== "modifiers") || typeof value.code !== "string" || !Array.isArray(value.modifiers) || Object.hasOwn(value, "secondCode") && typeof value.secondCode !== "string" || !value.modifiers.every((modifier) => typeof modifier === "string" && ["primary", "control", "alt", "shift", "meta"].includes(modifier))) {
    throw new Error("Invalid shortcut binding");
  }
  const binding = {
    code: value.code,
    modifiers: value.modifiers,
    ...typeof value.secondCode === "string" ? { secondCode: value.secondCode } : {}
  };
  normalizeBinding(binding, "windows");
  return binding;
}
function parseShortcutDocument(raw) {
  if (raw === null) return { schemaVersion: 1, profiles: {} };
  try {
    const value = JSON.parse(raw);
    if (!record(value)) return "invalid";
    if (typeof value.schemaVersion === "number" && value.schemaVersion > 2) return "future";
    if (value.schemaVersion !== 1 && value.schemaVersion !== 2 || !record(value.profiles) || Object.keys(value).some((key) => key !== "schemaVersion" && key !== "profiles")) return "invalid";
    const profiles = {};
    for (const [profile, overrides] of Object.entries(value.profiles)) {
      if (!/^(desktop|web):(macos|windows|linux)$/u.test(profile) || !record(overrides)) return "invalid";
      const bindings = {};
      for (const [id, binding] of Object.entries(overrides)) {
        if (!commandPattern.test(id)) return "invalid";
        const parsed = parseBinding(binding);
        if (value.schemaVersion === 1 && parsed?.secondCode !== void 0) return "invalid";
        bindings[id] = parsed;
      }
      profiles[profile] = bindings;
    }
    return { schemaVersion: value.schemaVersion, profiles };
  } catch (_error) {
    return "invalid";
  }
}
function bindingIssue(binding, runtime, platform) {
  const { code, modifiers } = binding;
  if (runtime === "desktop" && (platform === "windows" || platform === "macos")) return null;
  if (binding.secondCode !== void 0) return "unsupported-key";
  if (modifiers.length === 0 || modifiers.every((modifier) => modifier === "shift")) return "modifier-required";
  if ((platform === "windows" || platform === "macos") && modifiers.length >= 3) return null;
  if (runtime === "web" && (platform === "windows" || platform === "macos") && isWebBindingAllowed(binding, platform)) return null;
  const primary = modifiers.includes(platform === "macos" ? "meta" : "control");
  if (["Escape", "Tab", "Space", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code) || code === "Enter" && !modifiers.includes("alt") || primary && ["KeyC", "KeyV", "KeyX", "KeyZ", "KeyY", "KeyQ", "KeyH"].includes(code) || primary && code === "KeyA" && !modifiers.includes("shift") || platform !== "macos" && (modifiers.includes("meta") || modifiers.includes("alt") && ["F4", "F2"].includes(code)) || platform === "macos" && modifiers.includes("control") && modifiers.includes("meta") || platform === "macos" && modifiers.includes("alt") && !primary) return "reserved";
  if (runtime === "web" && !isWebBindingAllowed(binding, platform)) return "unsupported-browser";
  return null;
}
function resolveShortcutDefault(definition, runtime, platform) {
  return definition.defaults[`${runtime}:${platform}`];
}
function effectiveShortcuts(definitions, document2, runtime, platform) {
  const overrides = document2.profiles[`${runtime}:${platform}`] ?? {};
  const fixed = definitions.flatMap((row) => row.fixed?.map((binding) => ({ id: row.id, binding: normalizeBinding(binding, platform) })) ?? []);
  const rows = definitions.filter((row) => row.fixed === void 0).map(({ id, defaults }) => {
    const modified = Object.hasOwn(overrides, id);
    const candidate = modified ? overrides[id] : resolveShortcutDefault({ id, defaults }, runtime, platform);
    const binding = candidate == null ? null : normalizeBinding(candidate, platform);
    return { id, binding, modified, issue: binding === null ? null : bindingIssue(binding, runtime, platform) };
  });
  return rows.map((row) => {
    const binding = row.binding;
    return { ...row, conflicts: binding === null ? [] : [.../* @__PURE__ */ new Set([
      ...rows.filter((other) => other.id !== row.id && other.binding !== null && other.issue === null && overlappingBindings(other.binding, binding) && (!row.modified || other.modified)).map((other) => other.id),
      ...fixed.filter((other) => overlappingBindings(other.binding, binding)).map((other) => other.id)
    ])] };
  });
}
function overlappingBindings(left, right) {
  if (left.modifiers.join("+") !== right.modifiers.join("+")) return false;
  if (left.secondCode !== void 0 && right.secondCode !== void 0) return bindingKey(left) === bindingKey(right);
  return [left.code, left.secondCode].some((code) => code !== void 0 && (code === right.code || code === right.secondCode));
}
function editShortcutDocument(document2, edit, runtime, platform) {
  const schemaVersion = runtime === "desktop" && (platform === "macos" || platform === "windows") ? 2 : document2.schemaVersion;
  const profile = `${runtime}:${platform}`;
  let overrides = { ...document2.profiles[profile] };
  switch (edit.type) {
    case "set":
      overrides[edit.id] = edit.binding;
      break;
    case "reset": {
      const { [edit.id]: _removed, ...remaining } = overrides;
      overrides = remaining;
      break;
    }
    case "reset-all":
      overrides = {};
      break;
    /* v8 ignore next -- parseShortcutEdit validates this closed union before persistence. */
    default:
      return assertNever(edit, "shortcut edit");
  }
  return { schemaVersion, profiles: { ...document2.profiles, [profile]: overrides } };
}

// upstream/packages/util/crypto/src/index.ts.snapshot
function randomUUID() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    const pinned = index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte;
    return pinned.toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// upstream/packages/client/shortcuts/src/persistence.ts.snapshot
function initialShortcutConfig() {
  return {
    revision: randomUUID(),
    sequence: 0,
    document: { schemaVersion: 1, profiles: {} },
    status: "loading",
    error: null,
    usingDefaults: true
  };
}
var ShortcutPersistence = class {
  constructor(storage, runtime, platform, rereadBeforeWrite, publish2) {
    this.storage = storage;
    this.runtime = runtime;
    this.platform = platform;
    this.rereadBeforeWrite = rereadBeforeWrite;
    this.publish = publish2;
  }
  snapshot = initialShortcutConfig();
  raw;
  queue = Promise.resolve();
  definitions = null;
  active = true;
  /**
   * Install or revoke a product catalog and invalidate drafts from its previous lifetime.
   * @param definitions - current trusted definitions, or null while the product is not ready.
   */
  setDefinitions(definitions) {
    this.definitions = definitions;
    this.accept({ ...this.snapshot });
  }
  /** Stop accepting edits or publishing late completions. */
  dispose() {
    this.active = false;
  }
  /**
   * Read the current file; failures retain the last accepted document and disable ordinary writes.
   * @returns the accepted snapshot or diagnostic snapshot.
   */
  readCurrent() {
    return this.serialize(() => this.read());
  }
  /**
   * Compare the draft revision, validate the complete candidate, then persist before publishing.
   * @param edit - constrained preference operation.
   * @param revision - state against which the user reviewed the edit.
   * @returns a classified outcome and the currently accepted snapshot.
   */
  edit(edit, revision) {
    return this.serialize(async () => {
      if (this.rereadBeforeWrite) await this.read();
      const result = (status) => ({ status, snapshot: this.snapshot });
      if (!this.active || this.definitions === null || this.snapshot.status === "loading") return result("not-ready");
      if (revision !== this.snapshot.revision) return result("stale");
      if (this.snapshot.status === "unreadable") return result("unreadable");
      if ((edit.type === "set" || edit.type === "reset") && !this.definitions.some((row) => row.id === edit.id && row.fixed === void 0)) return result("not-ready");
      const document2 = editShortcutDocument(this.snapshot.document, edit, this.runtime, this.platform);
      const rows = effectiveShortcuts(this.definitions, document2, this.runtime, this.platform);
      const invalid = rows.find((row) => (edit.type === "reset-all" || row.id === edit.id) && (row.issue !== null || row.conflicts.length > 0));
      const displaced = edit.type === "set" ? rows.find((row) => row.conflicts.includes(edit.id)) : void 0;
      if (invalid !== void 0 || displaced !== void 0) return {
        ...result("conflict"),
        ...invalid?.issue ? { issue: invalid.issue } : {},
        conflicts: invalid?.conflicts.length ? invalid.conflicts : displaced === void 0 ? [] : [displaced.id]
      };
      try {
        const raw = `${JSON.stringify(document2, null, 2)}
`;
        await this.storage.write(raw);
        this.raw = raw;
        this.accept({ ...this.snapshot, document: document2, status: "ready", error: null, usingDefaults: false });
        return result("saved");
      } catch (_error) {
        return result("write-failed");
      }
    });
  }
  serialize(operation) {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => void 0);
    return next;
  }
  accept(snapshot) {
    this.snapshot = { ...snapshot, sequence: this.snapshot.sequence + 1, revision: randomUUID() };
    if (!this.active) return;
    try {
      this.publish(this.snapshot);
    } catch (error) {
      console.error("Shortcut configuration subscriber failed:", error);
    }
  }
  async read() {
    let raw;
    try {
      raw = await this.storage.read();
    } catch (_error) {
      if (this.snapshot.error !== "read") this.accept({ ...this.snapshot, status: "unreadable", error: "read" });
      return this.snapshot;
    }
    if (raw === this.raw && this.snapshot.error !== "read") return this.snapshot;
    this.raw = raw;
    const document2 = parseShortcutDocument(raw);
    if (typeof document2 === "string") this.accept({ ...this.snapshot, status: "unreadable", error: document2 });
    else this.accept({ ...this.snapshot, document: document2, status: "ready", error: null, usingDefaults: raw === null });
    return this.snapshot;
  }
};

// upstream/packages/client/shortcuts/src/client/registry.ts.snapshot
var ShortcutRegistry = class {
  constructor(runtime, platform, config = { ...initialShortcutConfig(), status: "ready" }) {
    this.runtime = runtime;
    this.platform = platform;
    this.state = createSnapshotStore({ catalog: [], config });
    this.catalog = {
      getSnapshot: () => this.state.getSnapshot().catalog,
      subscribe: (listener) => this.state.subscribe(listener)
    };
    this.config = {
      getSnapshot: () => this.state.getSnapshot().config,
      subscribe: (listener) => this.state.subscribe(listener)
    };
  }
  commands = /* @__PURE__ */ new Map();
  fixedCommands = /* @__PURE__ */ new Map();
  conflicts = /* @__PURE__ */ new Map();
  bindings = /* @__PURE__ */ new Map();
  state;
  /** Effective localized rows derived from the accepted configuration. */
  catalog;
  /** Accepted preferences and visible read diagnostics. */
  config;
  /** Fixed local operations whose owning plugins are mounted. */
  fixedCatalog = createSnapshotStore([]);
  /**
   * Return the serializable active catalog for storage validation.
   * @returns definitions without callbacks or localized labels.
   */
  definitions() {
    return [
      ...[...this.commands.values()].map(({ id, defaults }) => ({ id, defaults })),
      ...[...this.fixedCommands.values()].map(({ id, bindings }) => ({ id, defaults: {}, fixed: bindings }))
    ];
  }
  /**
   * Register a read-only input action whose keys cannot be assigned to editable commands.
   * @param command - owner-localized action and readable sequence.
   * @returns idempotent disposer removing its reference row.
   */
  registerFixed(command) {
    if (this.fixedCommands.has(command.id) || this.commands.has(command.id)) throw new Error(`Duplicate shortcut command: ${command.id}`);
    for (const binding of command.bindings) normalizeBinding(binding, this.platform);
    this.fixedCommands.set(command.id, command);
    this.refreshLabels();
    return () => {
      if (this.fixedCommands.get(command.id) !== command) return;
      this.fixedCommands.delete(command.id);
      this.refreshLabels();
    };
  }
  refreshFixedLabels() {
    this.fixedCatalog.set([...this.fixedCommands.values()].map((command) => ({
      id: command.id,
      label: command.label(),
      keys: command.keys,
      group: command.group,
      bindings: command.bindings.map((binding) => normalizeBinding(binding, this.platform))
    })));
  }
  /**
   * Publish accepted preferences and all derived labels atomically.
   * @param config - storage owner's latest accepted snapshot.
   */
  configure(config) {
    const current2 = this.config.getSnapshot();
    if (config.revision === current2.revision && config.status === current2.status && config.error === current2.error) return;
    this.refreshLabels(config);
  }
  /**
   * Register atomically after checking defaults for all supported platforms and shells.
   * @param command - feature-owned command definition.
   * @returns idempotent disposer removing both matching and catalog entries.
   */
  register(command) {
    if (this.commands.has(command.id) || this.fixedCommands.has(command.id)) throw new Error(`Duplicate shortcut command: ${command.id}`);
    for (const runtime of ["desktop", "web"]) {
      for (const platform of ["macos", "windows", "linux"]) {
        const candidate = resolveShortcutDefault(command, runtime, platform);
        if (candidate === void 0) continue;
        const binding = normalizeBinding(candidate, platform);
        if (runtime === "web" && !isWebBindingAllowed(binding, platform)) {
          throw new Error(`Unsupported Web shortcut: ${command.id}`);
        }
        if (bindingIssue(binding, runtime, platform) !== null) throw new Error(`Reserved shortcut default: ${command.id}`);
        for (const existing of this.commands.values()) {
          const other = resolveShortcutDefault(existing, runtime, platform);
          if (other !== void 0 && overlappingBindings(binding, normalizeBinding(other, platform))) {
            throw new Error(`Conflicting shortcut defaults: ${command.id} and ${existing.id} (${runtime}:${platform})`);
          }
        }
      }
    }
    this.commands.set(command.id, command);
    this.refreshLabels();
    return () => {
      if (this.commands.get(command.id) !== command) return;
      this.commands.delete(command.id);
      this.refreshLabels();
    };
  }
  /**
   * Recompute effective bindings when preferences, commands, or locale change.
   * @param config - accepted configuration, defaulting to the current snapshot.
   */
  refreshLabels(config = this.config.getSnapshot()) {
    this.bindings.clear();
    this.conflicts.clear();
    const rows = effectiveShortcuts(this.definitions(), config.document, this.runtime, this.platform);
    const catalog = rows.map((row) => {
      const command = this.commands.get(row.id);
      const enabled = config.status !== "loading" && row.issue === null && row.conflicts.length === 0;
      if (enabled && row.binding !== null) this.bindings.set(bindingKey(row.binding), command);
      if (config.status !== "loading" && row.issue === null && row.conflicts.length > 0 && row.binding !== null) {
        this.conflicts.set(bindingKey(row.binding), command);
      }
      return {
        ...row,
        label: command.label(),
        aliases: command.aliases,
        ...presentBinding(row.binding, this.platform),
        aria: enabled ? presentBinding(row.binding, this.platform).aria : void 0
      };
    });
    this.state.set({ config, catalog });
    this.refreshFixedLabels();
  }
  /**
   * Invoke a native menu selection independently of its optional key binding.
   * @param id - registered product command.
   * @param context - live input owner and modal state.
   */
  invoke(id, context) {
    const command = this.commands.get(id);
    if (command === void 0 || context.modal !== null && !command.modals.includes(context.modal)) return;
    const result = command.resolve({ ...context, source: "menu" });
    if (result.status === "handled") result.run();
  }
  /**
   * Windows/macOS Desktop bindings override local regions and modal controls independently of their configuration source.
   * @param gesture - normalized DOM/native input facts.
   * @param context - synchronous input and modal owner.
   * @param consume - adapter's preventDefault, called before business execution.
   * @returns handled, blocked with a reason, or pass for local/system input.
   */
  dispatch(gesture, context, consume) {
    if (gesture.defaultPrevented || gesture.composing) return { status: "pass" };
    const modifiers = ["control", "alt", "shift", "meta"].filter((value) => gesture[value]);
    const pairKey = bindingKey({
      code: gesture.code,
      modifiers,
      ...gesture.secondCode === void 0 ? {} : { secondCode: gesture.secondCode }
    });
    const key = this.bindings.has(pairKey) || this.conflicts.has(pairKey) ? pairKey : bindingKey({ code: gesture.code, modifiers });
    const command = this.bindings.get(key) ?? this.conflicts.get(key);
    const priority = this.runtime === "desktop" && (this.platform === "windows" || this.platform === "macos");
    if (command === void 0 || !priority && !command.regions.includes(context.region)) return { status: "pass" };
    if (!priority && context.region === "terminal" && gesture.control && !gesture.meta && !gesture.alt && !gesture.shift && (gesture.code === "KeyW" || gesture.code === "KeyR")) return { status: "pass" };
    if (!this.bindings.has(key)) {
      consume();
      return { status: "blocked", commandId: command.id, reason: "conflict" };
    }
    if (!priority && context.modal !== null && !command.modals.includes(context.modal)) {
      consume();
      return { status: "blocked", commandId: command.id, reason: "modal" };
    }
    const resolution = command.resolve(context);
    if (resolution.status === "pass") return resolution;
    consume();
    if (resolution.status === "blocked") return { ...resolution, commandId: command.id };
    if (!gesture.repeat) resolution.run();
    return { status: "handled", commandId: command.id };
  }
};

// upstream/packages/client/shortcuts/src/client/dom.ts.snapshot
function detectEnvironment(document2, navigator2) {
  const desktop = document2.documentElement.dataset.platform;
  const device = desktop ?? navigator2.platform;
  return {
    runtime: desktop === void 0 ? "web" : "desktop",
    platform: /darwin|mac|iphone|ipad/iu.test(device) ? "macos" : /win/iu.test(device) ? "windows" : "linux"
  };
}
function installKeyboard(window2, shortcuts, fixed, native = false) {
  const document2 = window2.document;
  const composition = observeComposition(document2);
  let pending = false;
  let pendingTimer;
  const reset = () => {
    fixed?.({ type: "reset" });
  };
  let deadKey = false;
  let dialogs;
  const blur = () => {
    deadKey = false;
    reset();
  };
  const containsModal = (node) => node instanceof Element && (node.matches(modalSelector) || node.querySelector(modalSelector) !== null);
  const changedModals = (records) => {
    if (records.length > 0) dialogs = void 0;
    if (records.some((record2) => record2.type === "attributes" ? record2.oldValue === "dialog" || record2.oldValue === "true" || containsModal(record2.target) : [...record2.addedNodes, ...record2.removedNodes].some(containsModal))) reset();
  };
  const observer = new MutationObserver(changedModals);
  observer.observe(document2.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-modal"],
    attributeOldValue: true
  });
  const capture = () => {
    if (pending) reset();
    window2.clearTimeout(pendingTimer);
    changedModals(observer.takeRecords());
    pending = true;
    pendingTimer = window2.setTimeout(() => {
      pending = false;
      pendingTimer = void 0;
      reset();
    }, 0);
  };
  const keydown = (event) => {
    window2.clearTimeout(pendingTimer);
    pendingTimer = void 0;
    pending = false;
    const target = event.composedPath().find((value) => value instanceof Element);
    const element = target instanceof Element ? target : document2.activeElement;
    const region = element?.closest(".xterm") ? "terminal" : element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ? "editable" : "page";
    changedModals(observer.takeRecords());
    dialogs ??= document2.querySelectorAll(modalSelector);
    const top = dialogs[dialogs.length - 1];
    const context = { region, modal: top === void 0 ? null : top.dataset.shortcutModal ?? "other", target: element };
    const guarded = composition.guards(event) || deadKey || event.getModifierState("AltGraph");
    const isDead = event.key === "Dead";
    const commandDeadKey = isDead && shortcuts.runtime === "web" && shortcuts.platform === "macos" && event.code === "KeyN" && event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey;
    deadKey = isDead;
    const gesture = {
      code: event.code,
      control: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      repeat: event.repeat,
      composing: guarded || isDead,
      defaultPrevented: event.defaultPrevented
    };
    const consume = () => {
      event.preventDefault();
      if (commandDeadKey) deadKey = false;
    };
    fixed?.({ type: "keydown", gesture, context, consume });
    if (native) return;
    shortcuts.dispatch({
      ...gesture,
      composing: guarded || isDead && !commandDeadKey,
      defaultPrevented: event.defaultPrevented
    }, context, consume);
  };
  document2.addEventListener("compositionstart", reset, true);
  document2.addEventListener("compositionend", reset, true);
  document2.addEventListener("focusin", reset, true);
  document2.addEventListener("pointerdown", reset, true);
  window2.addEventListener("keydown", capture, true);
  window2.addEventListener("keydown", keydown);
  window2.addEventListener("blur", blur);
  return () => {
    pending = false;
    window2.clearTimeout(pendingTimer);
    observer.disconnect();
    dialogs = void 0;
    composition.dispose();
    document2.removeEventListener("compositionstart", reset, true);
    document2.removeEventListener("compositionend", reset, true);
    document2.removeEventListener("focusin", reset, true);
    document2.removeEventListener("pointerdown", reset, true);
    window2.removeEventListener("keydown", capture, true);
    window2.removeEventListener("keydown", keydown);
    window2.removeEventListener("blur", blur);
  };
}

// upstream/packages/client/shortcuts/src/client/storage.ts.snapshot
var SHORTCUT_STORAGE_KEY = "dsh.keybindings.v1";
function webShortcutStorage(window2, platform, publish2) {
  const persistence = new ShortcutPersistence({
    read: () => window2.localStorage.getItem(SHORTCUT_STORAGE_KEY),
    write: (raw) => {
      window2.localStorage.setItem(SHORTCUT_STORAGE_KEY, raw);
    }
  }, "web", platform, true, publish2);
  const changed = (event) => {
    if (event.key === null || event.key === SHORTCUT_STORAGE_KEY) void persistence.readCurrent();
  };
  window2.addEventListener("storage", changed);
  return {
    get: (definitions) => {
      persistence.setDefinitions(definitions);
      return persistence.readCurrent();
    },
    edit: (edit, revision) => persistence.edit(edit, revision),
    subscribe: () => () => {
    },
    recording: async () => {
    },
    dispose: () => {
      window2.removeEventListener("storage", changed);
      persistence.dispose();
    }
  };
}
function desktopShortcutStorage(window2) {
  return window2.dshDesktop?.shortcuts;
}

// upstream/packages/client/shortcuts/src/client/native.ts.snapshot
function installNativeKeyboard(window2, keyboard, registry, snapshot, reset) {
  return keyboard.subscribe((input) => {
    if (input.revision !== snapshot().revision) return;
    reset?.();
    let target = window2.document.activeElement;
    while (target?.shadowRoot?.activeElement != null && !target.matches("webview[data-sidebar-browser-frame]")) {
      target = target.shadowRoot.activeElement;
    }
    const top = [...window2.document.querySelectorAll(modalSelector)].at(-1);
    const region = target?.closest(".xterm") ? "terminal" : target?.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ? "editable" : "page";
    const context = { target, region, modal: top?.dataset.shortcutModal ?? (top === void 0 ? null : "other") };
    if (input.kind === "menu") {
      registry.invoke(input.commandId, context);
      return;
    }
    if (input.kind === "keyboard") {
      registry.dispatch({ ...input, composing: false, defaultPrevented: false }, context, () => {
      });
      return;
    }
    if (input.kind === "webview") {
      if (target?.matches("webview[data-sidebar-browser-frame]") !== true || !target.isConnected || input.frameName === "" || target.getAttribute("name") !== input.frameName) return;
      registry.dispatch({ ...input, composing: false, defaultPrevented: false }, { ...context, source: "webview" }, () => {
      });
      return;
    }
    if (!(target instanceof HTMLIFrameElement) || !target.isConnected || !target.matches("iframe[data-sidebar-browser-frame], iframe[data-html-preview]") || input.frameName === "" || target.name !== input.frameName) return;
    registry.dispatch({ ...input, composing: false, defaultPrevented: false }, { ...context, source: "iframe" }, () => {
    });
  });
}

// upstream/packages/client/shortcuts/src/config.ts.snapshot
import z3 from "@deepseek-ai/schemastery";
var Config2 = z3.object({
  stopSequenceMs: z3.natural().min(1).max(2147483646).default(500)
});

// upstream/packages/client/shortcuts/src/client/index.ts.snapshot
var ShortcutsService = class extends Service {
  static inject = ["locale"];
  runtime;
  platform;
  catalog;
  config;
  fixedCatalog;
  stopSequenceMs;
  fixedListeners = /* @__PURE__ */ new Set();
  adapter;
  keyboard;
  active = true;
  connected = false;
  registry;
  constructor(ctx) {
    const environment = detectEnvironment(document, navigator);
    const keyboard = environment.runtime === "desktop" ? window.dshDesktop?.keyboard : void 0;
    if (environment.runtime === "desktop" && keyboard === void 0) throw new Error("Desktop keyboard bridge unavailable");
    super(ctx, "shortcuts");
    this.keyboard = keyboard;
    this.runtime = environment.runtime;
    this.platform = environment.platform;
    const config = Config2(globalThis.__DSH_SHORTCUTS_CONFIG__ ?? {});
    this.stopSequenceMs = config.stopSequenceMs;
    this.registry = new ShortcutRegistry(this.runtime, this.platform, initialShortcutConfig());
    this.catalog = this.registry.catalog;
    this.config = this.registry.config;
    this.fixedCatalog = this.registry.fixedCatalog;
    const publish2 = (snapshot) => {
      if (this.active && this.connected && snapshot.sequence >= this.config.getSnapshot().sequence) this.registry.configure(snapshot);
    };
    const web = this.runtime === "web" ? webShortcutStorage(window, this.platform, publish2) : void 0;
    this.adapter = web ?? desktopShortcutStorage(window);
    if (keyboard !== void 0) ctx.effect(() => installNativeKeyboard(
      window,
      keyboard,
      this.registry,
      () => this.config.getSnapshot(),
      () => {
        this.fixedInput({ type: "reset" });
      }
    ), "shortcuts: native keyboard");
    ctx.effect(() => {
      const off = this.adapter?.subscribe(publish2);
      return () => {
        this.active = false;
        off?.();
        web?.dispose();
      };
    }, "shortcuts: preferences");
    this.syncDefinitions();
    ctx.effect(() => {
      const off = installKeyboard(
        window,
        this.registry,
        (input) => {
          this.fixedInput(input);
        },
        keyboard !== void 0 && (this.platform === "macos" || this.platform === "windows")
      );
      return () => {
        off();
        this.fixedListeners.clear();
      };
    }, "shortcuts: keyboard");
    ctx.effect(() => ctx.locale.subscribe(() => {
      this.registry.refreshLabels();
    }), "shortcuts: locale");
  }
  register(command) {
    const off = this.registry.register(command);
    this.syncDefinitions();
    return () => {
      off();
      this.syncDefinitions();
    };
  }
  registerFixed(command) {
    const off = this.registry.registerFixed(command);
    this.syncDefinitions();
    return () => {
      off();
      this.syncDefinitions();
    };
  }
  observeFixedInput(listener) {
    this.fixedListeners.add(listener);
    return () => {
      this.fixedListeners.delete(listener);
    };
  }
  fixedInput(input) {
    let consumed = false;
    for (const listener of [...this.fixedListeners]) {
      if (!this.fixedListeners.has(listener)) continue;
      try {
        listener(input.type === "reset" ? input : {
          ...input,
          gesture: { ...input.gesture, defaultPrevented: input.gesture.defaultPrevented || consumed },
          consume: () => {
            consumed = true;
            input.consume();
          }
        });
      } catch (error) {
        console.error("Fixed shortcut handler failed", error);
      }
    }
  }
  describeBinding(binding) {
    const normalized = binding === null ? null : normalizeBinding(binding, this.platform);
    return {
      binding: normalized,
      keys: presentBinding(normalized, this.platform).keys,
      issue: normalized === null ? null : bindingIssue(normalized, this.runtime, this.platform),
      conflicts: normalized === null ? [] : [
        ...this.catalog.getSnapshot().filter((row) => row.binding !== null && overlappingBindings(row.binding, normalized)).map((row) => row.id),
        ...this.fixedCatalog.getSnapshot().filter((row) => row.bindings.some((binding2) => overlappingBindings(binding2, normalized))).map((row) => row.id)
      ]
    };
  }
  syncDefinitions() {
    if (!this.active) return;
    if (this.adapter === void 0) {
      this.failRead();
      return;
    }
    void this.adapter.get(this.registry.definitions()).then((snapshot) => {
      this.connected = true;
      if (this.active && snapshot.sequence >= this.config.getSnapshot().sequence) this.registry.configure(snapshot);
    }, () => {
      this.failRead();
    });
  }
  failRead() {
    if (this.active) this.registry.configure({ ...this.config.getSnapshot(), status: "unreadable", error: "read" });
  }
  /**
   * Persist one reviewed operation while retaining accepted bindings on failure.
   * @param args - edit and expected revision supplied by the editor.
   * @returns classified save outcome and accepted snapshot.
   */
  async edit(...args) {
    if (this.adapter === void 0) return { status: "unreadable", snapshot: this.config.getSnapshot() };
    let result;
    try {
      result = await this.adapter.edit(...args);
    } catch (error) {
      if (this.active) console.error("Shortcut preference save failed", error);
      return { status: "write-failed", snapshot: this.config.getSnapshot() };
    }
    if (this.active && result.snapshot.sequence >= this.config.getSnapshot().sequence) this.registry.configure(result.snapshot);
    return result;
  }
  async recording(active) {
    if (this.adapter === void 0) throw new Error("Desktop shortcuts bridge unavailable");
    await this.adapter.recording(active);
  }
  async closeWindow() {
    if (this.keyboard === void 0) throw new Error("Desktop keyboard bridge unavailable");
    await this.keyboard.closeWindow(this.config.getSnapshot().revision);
  }
};
export {
  LocaleRuntime,
  ShortcutsService,
  index_ts_exports as contextMenu,
  createClientModuleSystem
};
