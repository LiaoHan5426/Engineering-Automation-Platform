---
description: "Browser UI renderer: Vue bindings for ordinary Slots and reusable Component Factories, ctx.uiRenderer, and the assembled dsh web application root."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-renderer

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-renderer` mounts the assembled dsh web client GUI: after the complete client plugin roster settles, the boot kernel calls `ctx.uiRenderer.mount(container)`, which hydrates the framework-free boot page and switches to the full Vue application before the next paint. Business plugins stay plain Vue components that receive session and workspace data through typed props and never wire subscriptions themselves — the renderer binds the runtime's bare observable sources into selector hooks at the slot outlets. The web shell and the boot kernel are its only direct consumers, so a composition needs it exactly when it wants a Vue-rendered GUI.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

This package is infrastructure: the web shell and the boot kernel are its only direct consumers. A composition needs it whenever it wants a Vue-rendered GUI — `dsh-client-web` loads the roster, waits for it to settle and for the boot audit to accept it, then calls `ctx.uiRenderer.mount(container)`.

### What mounting does

`mount(container)` synchronously installs styles for already materialized modules, hydrates existing boot DOM when present, and renders the application. Its disposer unmounts Vue before releasing styles. One renderer instance owns one active mount; a second simultaneous mount rejects, while an old disposer cannot remove a later mount. Plugin disposal also releases the active mount. The renderer performs the sole context-level `renderSlot('root')` call; the root occupant owns product layout.

### For business plugins

A business plugin registers an ordinary Slot entry or a reusable Component Factory; the renderer binds the runtime's session and workspace observable sources into selector hooks at the render position. The plugin receives standard scope props through its derived Component props and does not manage registry subscriptions or Vue internals. Every renderer-created Component can render a Factory occurrence, and a Factory can expose caller-selected local Components without sharing implementation values between packages.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package realizes one boundary: the object layer (runtime, framework-independent) owns business state; this renderer is the only place ctx-to-Vue integration happens — slot renderer, `SessionProvider`, and framework selector-hook binding.

### Activation and mount

The plugin injects `modules`, installs the Slot renderer, and publishes an instance of [`UiRenderer`](src/client/renderer.ts). Its [`DocumentStyles`](src/client/styles/document-styles.ts) constructor only retains dependencies; explicit `mount()` subscribes to module-record changes and installs CSS before Vue mounts. Later materialization, dependency changes, and invalidation update the installed resources synchronously. Metadata and per-file text caches belong to this renderer and are keyed by module records, so replacement records do not reuse old text.

For modules with `meta`, stylesheets are collected from its optional `stylesheets` record, keyed by each stylesheet's path within the owning package, with descriptors that expose `text(context)`. Each installed style element carries `data-plugin` with the owning package and `data-path` with that path. Loaded dependency resources precede consumers; within one package, identical paths share one style node. Component mount/unmount does not register styles. A failure affects only its own stylesheet: when a module's `meta()` or a descriptor's `text()` throws, or a path already carries different CSS from another module of the same package, the renderer leaves that stylesheet out, reports it once through `console.error`, and installs every other stylesheet. A path conflict keeps the text already installed. A failed producer runs again only for a replacement module record. During live replacement, the previous styles stay installed until the replaced plugin has been torn down.

### Slot bindings

`createVueSlotRenderer` connects the existing slot registry to native Vue outlets and Factory occurrences. Components bind renderer-provided selector hooks once during setup and read readonly shallow refs through `.value` during render. Source replacement releases the old subscription before binding the new source; queued callbacks from disposed bindings cannot publish. Equality retains selected snapshot identity, and reactive selector inputs are tracked even when an external publication first enters a conditional branch. Factory Stores stay lazy and retain one exclusive handle per occurrence; persistence is rejected for those handles. Factory failures report through ordinary supervision without abdicating the shared definition: definitions and fallback local Components report against the definition, caller-selected local Components against the caller registration.

The client entry continues to re-export `useObservableSelector` from static [ui-primitives](../ui-primitives/README.md#observable-selectors). Business plugins import the static library directly rather than requesting renderer implementation through `dsh.client.external`.

Contextual hooks retain their child scope while the factory, hook context, and individual framework inputs retain their identities. Fresh options or input wrappers do not restart effects or replace writable DOM targets. Changing a factory, context, framework key, or framework value releases the previous scope before rebinding; a failed replacement also releases its partial scope and clears the forwarded DOM target. Reads inside the factory or hook do not become binding dependencies.

Withdrawal immediately revokes an entry or Factory owner. Until Vue commits its outlet removal, the resident occurrence stops resolving Stores and injection faces; retained rendering authorizations continue to reject stale calls.

A blank optional Session scope adopts its first session without remounting; a later context generation change or loss creates a fresh incarnation. SessionProvider and HOC components accept native default slots. Each mounted app owns a unique Vue ID prefix, and stale mount disposers cannot remove a replacement. Teardown failures propagate to the mount owner while module styles are still released.

Framework fields enter object and class components only through their declared runtime props or emits, including inherited mixins and `extends`. Caller inputs remain unchanged, including native attributes, listeners, VNode keys and refs, and override matching framework fields. Functional components receive the complete input. Factory-selected and fallback local components follow the same rule. Lazy components expose their framework inputs through an explicit prop-declaring outer component, while their asynchronous implementation stays deferred.

### Identity

Vue, Cordis, ui-slots, and ui-primitives retain one browser identity through the web shell's static module table; this package arrives as a dynamic client bundle.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the surrounding machinery and the composition model.

- [ui-slots](../ui-slots/README.md) — the slot registry pure core this renderer binds to Vue.
- [web](../web/README.md) — the shell that loads the roster and calls `mount`.
- [ui-session](../ui-session/README.md) — the adapter that supplies the standard Session sources and hooks this renderer binds.
- [Web client architecture](../../../docs/subsystems/web-client.md) — the loading chain, object layer, and layering red lines.
- [Slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) — the definitive composition model.
- [Component Factories](../../../.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.md) — reusable definitions, local Component selection, and occurrence lifetimes.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side render assembly that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the application frame appears and how far per-region readiness goes; they are current package constraints.

- **The first application frame waits for the whole client roster** — the boot kernel hands over the mount point only after the loader roster settles and the boot audit accepts it; per-region readiness remains deferred.
- **Only the main document is supported** — there is no Document Scope or Shadow DOM placement, and styles are retained at module rather than component granularity.
- **Slot rendering has no Suspense integration or per-entry lazy loading** — the complete plugin roster settles before the renderer mounts the root.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
