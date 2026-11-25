# Design: DSH layout slot mounts

**Date:** 2026-11-25
**Status:** Draft, pending review
**Slice:** Frontend shell layout only
**Catalog:** `frontend/packages/plugin-runtime/src/client/layoutSlots.ts` (126 keys, owned by the shell)

## Context

py-backend and the Vue shell are the production path. `dsh-personal` is the reference for Cordis client slots. Plugins keep calling `ctx.slots.inject` / `ctx.slots.register` with the catalog key. The shell declares every seat those calls need, and renders it in a stable outlet.

This slice does not change Host remotes, agent execution, or install sources (npx, git, local path). It does not add an EAP Cordis profile. It does not edit `dsh-personal`.

Related decision: [py-backend L2 plugin host](../../decisions/py-backend-plugin-host-l2.md).

## Name rewrite

One facade wraps `SlotRegistry` before the renderer and plugin `./client` load. Callers still pass catalog keys. The registry stores layout names only. `ui-sidebar-right` is not loaded.

| Catalog key | Layout name |
|---|---|
| `settings.section` | `dsh-layout-settings.section` |
| `rightbar` | `dsh-layout-rightbar` |
| `main.conversation` | `dsh-layout-main.conversation` |

Rules:

- Layout name is the prefix `dsh-layout-` plus the catalog key. Dots stay. Stripping the prefix restores the catalog key. Replacing dots with hyphens is rejected because keys such as `conversation.chat.assistant-actions` would collide.
- `root` stays the registry name `root`. The shell renders that literal from `renderSlot`, so its DOM `data-slot` stays `root`. A plugin `inject` / `register` of `root` throws, and the message names `shell.overlay`.
- Rewrite slot names only: `inject` key, `register` `name`, `renderSlot` key, and every key in a `children` map.
- The shell registry writes `data-slot` from the stored name, so the DOM value is the layout name.

`data-slot` on the shell is only the layout name. Plugin bundles that query a literal catalog attribute, such as `[data-slot="main.conversation"]`, are outside this slice. The shell measurement target is the conversation outlet, not a second fake node.

## Catalog

`layoutSlots.ts` is the shell's copy of the seat list. Frontend code does not import or generate it from `dsh-personal`. A test fails when the declarer rules below break.

`declaredBy` has three forms in the current catalog:

| Form | Count | Parent |
|---|---|---|
| `the runtime itself (built in; always present)` | 1 (`root`) | none |
| `an entry in '<slot>' (<package>)` | 110 | that catalog slot |
| `factory '<name>' (<package>)` | 15 | that factory name, which is not a catalog key |

The 15 factory-owned keys use 7 factory names: `conversation.approval.card`, `conversation.chat.user.content`, `conversation.content`, `conversation.user.text`, `settings.section.view`, `sidebar.panel.icon`, `workspace.picker`.

If a future `declaredBy` has no quoted parent and is not the `root` sentence, generation fails. If an `an entry in` parent is not a catalog key, generation fails. If a factory’s child keys resolve to more than one outlet, generation fails.

## One declarer

The shell declares every catalog key. `ui-sidebar-right` was loaded only while testing a DSH plugin. That load is not a confirmed seat owner, and boot does not apply it.

The shell declares all 126 keys:

- `root` is the frame the shell renders once.
- Each remaining key appears in exactly one `children` map, on the shell registration of its parent slot or on the shell `registerFactory` of its factory.
- Parent `root` has these children: `main`, `rightbar`, `shell.bottom`, `shell.leading`, `shell.overlay`, `sidebar`.

The shell registers one occupant per parent with cell key `eap-layout` and `children` set to that parent's catalog keys. That cell is not a tab type. The occupant renders each child with `display: contents`. `sidebar.right.pane.tab` is keyed, and the shell renders only the `eap-layout` cell.

Factory names stay as catalog text. At boot the shell calls `slots.registerFactory` for each of the 7 factories, with `children` listing the shell-declared catalog keys that name that factory. The factory component renders those children.

## Outlets

The Cordis root stays mounted for the life of the Vue app. Five outlets live in `App.vue` and use `v-show`. Hiding an outlet does not dispose the slot tree.

| Outlet | Anchor | What is placed here |
|---|---|---|
| `shell` | app root, overlay | `shell.leading`, `shell.bottom`, `shell.overlay` and their descendants; factory `workspace.picker` |
| `conversation` | chat column | `main` and its descendants (includes `main.conversation` and `plugins.*`); conversation factories |
| `settings` | non-modal settings dialog over the main column | factory `settings.section.view` |
| `sidebar-leading` | workspace left column, separate from the view-switcher nav | `sidebar` and its descendants; factory `sidebar.panel.icon` |
| `sidebar-right` | existing `#eap-cordis-sidebar-right` | `rightbar` and the seats the shell declares under it |

Each outlet element carries `data-dsh-region` with the outlet id. Implementers place hosts to match the figures in [Placement](#placement). A seat whose parent is another slot stays inside that parent’s box.

Child seats render inside the parent host. They are not moved to another outlet because their key prefix matches a different region. Consequences taken from the catalog:

- `plugins.*` is declared by an entry in `main`, so it renders in the conversation outlet, in the body group next to `main.conversation`.
- `settings.section` is declared by factory `settings.section.view`, so the section list renders in the settings outlet.
- Other `settings.*` keys are under `sidebar.settings`, so they render in `sidebar-leading`.
- `shell.leading` is the top-left chrome of the `shell` outlet. It is not the `sidebar-leading` column.

## Placement

The view-switcher nav and the workspace inspector are existing EAP chrome. They are not slot outlets. Empty hosts use `display: contents` and add no box until a plugin renders one.

`shell` stays visible on every view: `shell.leading` at the frame’s top-left, `shell.bottom` across the full width under the columns, `shell.overlay` as a click-through layer above the columns. `sidebar-leading` and `sidebar-right` stay visible on chat and on settings. `conversation` stays visible while the workspace under the settings dialog is chat. Opening settings does not hide that outlet. `settings` is visible only while a settings section is open. A hidden outlet stays mounted.

Chat view, left to right:

```text
+------------------------------------------------------------------+
| shell.leading          data-dsh-region="shell"                  |
+------+------------------+------------------------+---------------+
| EAP  | sidebar-leading  | conversation           | sidebar-right |
| view | data-dsh-region= | data-dsh-region=       | #eap-cordis-  |
| nav  | "sidebar-leading"| "conversation"         | sidebar-right |
|      |                  |                        |               |
| not  | sidebar          | header                 | rightbar      |
| an   | .panellist       |   conversation.header  | rightbar      |
| out- | .session.*       |   .session.header.*    |               |
| let  | .settings.*      | body                   |               |
|      |   settings.action|   main.conversation    |               |
|      |   settings.header|   plugins.*            | hidden host   |
|      |                  | dock                   | cell eap-     |
|      |                  |   conversation.        | layout        |
|      |                  |     composer.*         |               |
|      |                  |   conversation.input.* |               |
+------+------------------+------------------------+---------------+
| shell.bottom           data-dsh-region="shell"                  |
+------------------------------------------------------------------+
  shell.overlay floats above all columns, same shell outlet
```

Settings dialog. It is a modal over the shell, so opening it does not switch the view-switcher into a settings area and does not show a return-to-session control. The conversation outlet stays mounted and stays visible when the workspace underneath is chat. `sidebar.settings.*` stays in the left column, under the dialog. The dialog hosts the settings page and the section factory:

```text
+------------------------------------------------------------------+
| shell.leading                                                    |
+------+------------------+------------------------+---------------+
| EAP  | sidebar-leading  | settings               | sidebar-right |
| view | sidebar.settings | data-dsh-region=       | rightbar      |
| nav  | settings.action  | "settings"             | rightbar      |
|      | settings.header  |                        |               |
|      | settings.notice  | settings.section       |               |
|      |                  | (factory settings.     |               |
|      |                  |  section.view)         |               |
|      |                  |                        |               |
|      |                  | conversation outlet    |               |
|      |                  | stays mounted under    |               |
|      |                  | the dialog             |               |
+------+------------------+------------------------+---------------+
| shell.bottom                                                     |
+------------------------------------------------------------------+
```

Parent boxes for the seats that are easy to put on the wrong surface:

```text
root
├─ shell.leading / shell.bottom / shell.overlay     → outlet shell
├─ sidebar                                          → outlet sidebar-leading
│  └─ sidebar.settings
│     └─ settings.action, settings.header, …        → still sidebar-leading
├─ main                                             → outlet conversation
│  ├─ main.conversation
│  │  └─ conversation.header / session / composer…
│  └─ plugins.*                                     → conversation body
├─ rightbar                                         → outlet sidebar-right
│  └─ rightbar.session                              → shell
│     └─ sidebar.right.pane.tab (eap-layout cell)
└─ factory settings.section.view                    → outlet settings
   └─ settings.section
```

Inside an owner that has conversation children, render order is three groups:

1. Header: the child key is `conversation.header`, or starts with `conversation.header.` or `conversation.session.header`.
2. Dock: the child key is `conversation.composer`, or starts with `conversation.composer.` or `conversation.input.`.
3. Body: every other child.

Grouping only sorts children of that owner. It does not re-parent them. The EAP chat transcript and composer stay. Slot hosts use `display: contents`, so an empty seat adds no box. The plugin component supplies the visible box and hit target.

The conversation outlet is the measurement box currently created by `centerAnchor` (`#root` / `[data-slot="main.conversation"]`). That helper stops creating a second node. Its box tracks the chat column, and the slot host inside is `dsh-layout-main.conversation`.

## Runtime

1. Read the seat list from `layoutSlots.ts`.
2. Create the shell context and slot registry, and install the rewrite facade.
3. Shell registers `root` with the six root children, registers the 7 factories, and registers shell owners for every other shell-declared key.
4. Mount the five outlets and render `root` into the shell outlet. Root’s owner places `main`, `sidebar`, `rightbar`, and `shell.*` into the matching outlets.
5. Load plugin `./client`. Do not apply `ui-sidebar-right`.

`slots.inject` still waits until the declaring registration is mounted, then re-runs if that registration is replaced.

## Errors

- Unknown slot name: throw, include the original string.
- Plugin registration of `root`: throw, name `shell.overlay`.
- A catalog key missing from the shell `children` maps, or a second declarer for the same key: fail the test.

## Acceptance

- The shell catalog has 126 keys. Layout name and catalog key convert both ways.
- All 126 keys are shell-declared, with no package declarer.
- A probe `register` on `settings.section` renders inside `[data-dsh-region="settings"]` with `data-slot="dsh-layout-settings.section"`.
- A probe on `conversation.composer.bar` renders inside `[data-dsh-region="conversation"]`, in the dock group.
- A probe on `sidebar.panellist` renders inside `[data-dsh-region="sidebar-leading"]`.
- A probe on `settings.header` renders inside `[data-dsh-region="sidebar-leading"]`, not in the settings outlet.
- A probe on `plugins.tab` renders inside `[data-dsh-region="conversation"]`, not in the settings outlet.
- `rightbar` renders inside `#eap-cordis-sidebar-right` with `data-slot="dsh-layout-rightbar"`. Boot does not create `[data-sidebar-right-guide]`.
- Leaving and re-entering settings keeps the settings probe mounted.
- `inject('not.a.slot')` throws and the message contains `not.a.slot`.

## Out of scope

- Rewriting DSH remote methods onto py-backend.
- Classifying install sources (npx, git, local path) and any marketplace UI.
- Patching string selectors inside third-party plugin bundles.
- Loading dsh-personal client packages (`ui-sidebar-right`, `ui-chat`, `ui-settings`, `ui-layout`, …) as the seat owners. The shell owns every catalog key.
