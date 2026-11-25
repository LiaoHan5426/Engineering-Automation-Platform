/**
 * EAP-owned Cordis seat catalog.
 * Plugins still call these keys. The shell stores dsh-layout-* names.
 * This file is the authority. Frontend code does not read dsh-personal to refresh it.
 */
export const LAYOUT_PREFIX = 'dsh-layout-'
export const LAYOUT_SLOTS = [
  {
    "key": "contextMenu.content",
    "kind": "keyed",
    "scope": "root",
    "parent": "shell.overlay",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "contextMenu.icon",
    "kind": "keyed",
    "scope": "root",
    "parent": "shell.overlay",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.approval.detail",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.approval.card",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.aside",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.view",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.assistant-actions",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.commandview",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.flow",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.view",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.markdown.fence",
    "kind": "hoc",
    "scope": "session",
    "parent": "conversation.view",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.message.images",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.node",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.chat.flow",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.reasoning.body",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.text-interaction",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.view",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.turnTail",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.user.before",
    "kind": "chain",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.chat.user.images",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.chat.user.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.composer",
    "kind": "chain",
    "scope": "session",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.composer.bar",
    "kind": "single",
    "scope": "session-maybe",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.composer.dock",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.header",
    "kind": "single",
    "scope": "session-maybe",
    "parent": "main.conversation",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.header.leading",
    "kind": "single",
    "scope": "root",
    "parent": "conversation.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.agentPreset",
    "kind": "single",
    "scope": "session-maybe",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.brand.mark",
    "kind": "single",
    "scope": "root",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.frame",
    "kind": "hoc",
    "scope": "root",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.options",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.workspace",
    "kind": "single",
    "scope": "root",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.hero.workspace.directoryFlow",
    "kind": "single",
    "scope": "root",
    "parent": "conversation.hero.workspace",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.activity",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.attachments",
    "kind": "single",
    "scope": "session-maybe",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.dock",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.left",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.model",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.model.label",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.input.model",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.model.options",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.input.model",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.model.pane",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.input.model",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.overlay",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.permission",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.plan",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.input.right",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.composer.bar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.plan-review.actions",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.composer",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.content",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header.actions",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header.corner",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.session.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header.lineage",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.session.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header.utilities",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.header.views.actions",
    "kind": "list",
    "scope": "root",
    "parent": "conversation.session.header",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.panel.environment.row",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session.panel.section",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.panel.indicator",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session.header.utilities",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.panel.section",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.chat.aside",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.session.panel.section.actions",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.chat.aside",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.trajectory.images",
    "kind": "single",
    "scope": "session",
    "parent": "conversation.view",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "conversation.user.text.node",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.user.text",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "conversation.view",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "deliverables.file.actions",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.chat.turnTail",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "deliverables.review.file.actions",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "forge.change-request.card.actions",
    "kind": "list",
    "scope": "session",
    "parent": "conversation.session.panel.section",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "forge.changes.file.menu",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "forge.changes.toolbar",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "forge.diff.comment.actions",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "forge.diff.line.annotation",
    "kind": "keyed",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "main",
    "kind": "keyed",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "main.conversation",
    "kind": "single",
    "scope": "session-maybe",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.add.actions",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.bundle.activation",
    "kind": "keyed",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.bundle.config",
    "kind": "keyed",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.detail.actions",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.detail.badge",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.detail.section",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.item",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.row.config",
    "kind": "keyed",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "plugins.tab",
    "kind": "list",
    "scope": "root",
    "parent": "main",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "rightbar",
    "kind": "single",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "rightbar.session",
    "kind": "single",
    "scope": "session",
    "parent": "rightbar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "root",
    "kind": "single",
    "scope": "root",
    "parent": null,
    "parentKind": "runtime",
    "declarer": "shell"
  },
  {
    "key": "settings.action",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.close",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.general.item",
    "kind": "list",
    "scope": "root",
    "parent": "settings.section",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.header",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.launcher",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.launcher.notifications",
    "kind": "single",
    "scope": "root",
    "parent": "settings.notice",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.models.footer",
    "kind": "list",
    "scope": "root",
    "parent": "settings.section",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.models.provider-card",
    "kind": "keyed",
    "scope": "root",
    "parent": "settings.section",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.models.sign-in",
    "kind": "single",
    "scope": "root",
    "parent": "settings.onboarding",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.notice",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.onboarding",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.section",
    "kind": "list",
    "scope": "root",
    "parent": "settings.section.view",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "settings.section.icon",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "settings.trigger",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.settings",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "shell.bottom",
    "kind": "single",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "shell.leading",
    "kind": "single",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "shell.overlay",
    "kind": "list",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "shell.quota-notice",
    "kind": "chain",
    "scope": "root",
    "parent": "shell.overlay",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar",
    "kind": "single",
    "scope": "root",
    "parent": "root",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.brand.mark",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.brand.name",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.chat.conversation",
    "kind": "single",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.footer.action",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.panellist",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.panel.icon",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "sidebar.panellist.actions",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.pane.tab",
    "kind": "keyed",
    "scope": "session",
    "parent": "rightbar.session",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.pane.tab.title",
    "kind": "keyed",
    "scope": "session",
    "parent": "rightbar.session",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.document",
    "kind": "keyed",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.document.action",
    "kind": "keyed",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.document.actions",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.document.office.pdf",
    "kind": "keyed",
    "scope": "session",
    "parent": "sidebar.right.tab.document",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.document.unpreviewable",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.files.actions",
    "kind": "list",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.guide",
    "kind": "chain",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.guide.actions",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.guide.entry",
    "kind": "keyed",
    "scope": "session",
    "parent": "sidebar.right.pane.tab",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.right.tab.menu.item",
    "kind": "list",
    "scope": "session",
    "parent": "contextMenu.content",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.session.action",
    "kind": "hoc",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.session.row.hover",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.workspaces",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.session.row.leading",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.workspaces",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.session.row.trailing",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.workspaces",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.settings",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.toggle.badge",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.workspaces",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.workspaces.directoryFlow",
    "kind": "single",
    "scope": "root",
    "parent": "sidebar.workspaces",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.workspaces.session.menu.item",
    "kind": "list",
    "scope": "root",
    "parent": "contextMenu.content",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "sidebar.workspaces.session.row.action",
    "kind": "list",
    "scope": "root",
    "parent": "sidebar.workspaces",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "tool.call.images",
    "kind": "single",
    "scope": "session",
    "parent": "tool.call.toolview",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "tool.call.toolview",
    "kind": "keyed",
    "scope": "session",
    "parent": "conversation.chat.node",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "tool.view.cordis",
    "kind": "keyed",
    "scope": "session",
    "parent": "tool.call.toolview",
    "parentKind": "slot",
    "declarer": "shell"
  },
  {
    "key": "workspace.picker.directoryFlow",
    "kind": "single",
    "scope": "root",
    "parent": "workspace.picker",
    "parentKind": "factory",
    "declarer": "shell"
  },
  {
    "key": "workspace.toast",
    "kind": "keyed",
    "scope": "root",
    "parent": "shell.overlay",
    "parentKind": "slot",
    "declarer": "shell"
  }
] as const
export const ROOT_OUTLETS = {
  "main": "conversation",
  "rightbar": "sidebar-right",
  "sidebar": "sidebar-leading",
  "shell.bottom": "shell",
  "shell.leading": "shell",
  "shell.overlay": "shell"
} as const
export const LAYOUT_FACTORIES = [
  {
    "name": "conversation.approval.card",
    "scope": "session-maybe",
    "outlet": "conversation",
    "children": [
      "conversation.approval.detail"
    ]
  },
  {
    "name": "conversation.chat.user.content",
    "scope": "session-maybe",
    "outlet": "conversation",
    "children": [
      "conversation.chat.user.images"
    ]
  },
  {
    "name": "conversation.content",
    "scope": "session-maybe",
    "outlet": "conversation",
    "children": [
      "conversation.composer",
      "conversation.composer.bar",
      "conversation.hero.agentPreset",
      "conversation.hero.brand.mark",
      "conversation.hero.frame",
      "conversation.hero.options",
      "conversation.hero.workspace",
      "conversation.input.dock",
      "conversation.session"
    ]
  },
  {
    "name": "conversation.user.text",
    "scope": "session-maybe",
    "outlet": "conversation",
    "children": [
      "conversation.user.text.node"
    ]
  },
  {
    "name": "settings.section.view",
    "scope": "root",
    "outlet": "settings",
    "children": [
      "settings.section"
    ]
  },
  {
    "name": "sidebar.panel.icon",
    "scope": "root",
    "outlet": "sidebar-leading",
    "children": [
      "sidebar.panellist"
    ]
  },
  {
    "name": "workspace.picker",
    "scope": "root",
    "outlet": "shell",
    "children": [
      "workspace.picker.directoryFlow"
    ]
  }
] as const
export const LAYOUT_OCCUPANTS = [
  {
    "parent": "contextMenu.content",
    "children": [
      "sidebar.right.tab.menu.item",
      "sidebar.workspaces.session.menu.item"
    ]
  },
  {
    "parent": "conversation.chat.aside",
    "children": [
      "conversation.session.panel.section",
      "conversation.session.panel.section.actions"
    ]
  },
  {
    "parent": "conversation.chat.flow",
    "children": [
      "conversation.chat.node"
    ]
  },
  {
    "parent": "conversation.chat.node",
    "children": [
      "conversation.chat.assistant-actions",
      "conversation.chat.commandview",
      "conversation.chat.message.images",
      "conversation.chat.reasoning.body",
      "conversation.chat.turnTail",
      "conversation.chat.user.before",
      "tool.call.toolview"
    ]
  },
  {
    "parent": "conversation.chat.turnTail",
    "children": [
      "deliverables.file.actions"
    ]
  },
  {
    "parent": "conversation.composer",
    "children": [
      "conversation.plan-review.actions"
    ]
  },
  {
    "parent": "conversation.composer.bar",
    "children": [
      "conversation.composer.dock",
      "conversation.input.activity",
      "conversation.input.attachments",
      "conversation.input.left",
      "conversation.input.model",
      "conversation.input.overlay",
      "conversation.input.permission",
      "conversation.input.plan",
      "conversation.input.right"
    ]
  },
  {
    "parent": "conversation.header",
    "children": [
      "conversation.header.leading",
      "conversation.session.header"
    ]
  },
  {
    "parent": "conversation.hero.workspace",
    "children": [
      "conversation.hero.workspace.directoryFlow"
    ]
  },
  {
    "parent": "conversation.input.model",
    "children": [
      "conversation.input.model.label",
      "conversation.input.model.options",
      "conversation.input.model.pane"
    ]
  },
  {
    "parent": "conversation.session",
    "children": [
      "conversation.view"
    ]
  },
  {
    "parent": "conversation.session.header",
    "children": [
      "conversation.session.header.actions",
      "conversation.session.header.corner",
      "conversation.session.header.lineage",
      "conversation.session.header.utilities",
      "conversation.session.header.views.actions"
    ]
  },
  {
    "parent": "conversation.session.header.utilities",
    "children": [
      "conversation.session.panel.indicator"
    ]
  },
  {
    "parent": "conversation.session.panel.section",
    "children": [
      "conversation.session.panel.environment.row",
      "forge.change-request.card.actions"
    ]
  },
  {
    "parent": "conversation.view",
    "children": [
      "conversation.chat.aside",
      "conversation.chat.flow",
      "conversation.chat.markdown.fence",
      "conversation.chat.text-interaction",
      "conversation.trajectory.images"
    ]
  },
  {
    "parent": "main",
    "children": [
      "main.conversation",
      "plugins.add.actions",
      "plugins.bundle.activation",
      "plugins.bundle.config",
      "plugins.detail.actions",
      "plugins.detail.badge",
      "plugins.detail.section",
      "plugins.item",
      "plugins.row.config",
      "plugins.tab"
    ]
  },
  {
    "parent": "main.conversation",
    "children": [
      "conversation.header"
    ]
  },
  {
    "parent": "root",
    "children": [
      "main",
      "rightbar",
      "shell.bottom",
      "shell.leading",
      "shell.overlay",
      "sidebar"
    ]
  },
  {
    "parent": "settings.notice",
    "children": [
      "settings.launcher.notifications"
    ]
  },
  {
    "parent": "settings.onboarding",
    "children": [
      "settings.models.sign-in"
    ]
  },
  {
    "parent": "settings.section",
    "children": [
      "settings.general.item",
      "settings.models.footer",
      "settings.models.provider-card"
    ]
  },
  {
    "parent": "shell.overlay",
    "children": [
      "contextMenu.content",
      "contextMenu.icon",
      "shell.quota-notice",
      "workspace.toast"
    ]
  },
  {
    "parent": "sidebar",
    "children": [
      "sidebar.brand.mark",
      "sidebar.brand.name",
      "sidebar.footer.action",
      "sidebar.panellist.actions",
      "sidebar.session.action",
      "sidebar.settings",
      "sidebar.toggle.badge",
      "sidebar.workspaces"
    ]
  },
  {
    "parent": "rightbar",
    "children": [
      "rightbar.session"
    ]
  },
  {
    "parent": "rightbar.session",
    "children": [
      "sidebar.right.pane.tab",
      "sidebar.right.pane.tab.title"
    ]
  },
  {
    "parent": "sidebar.right.pane.tab",
    "children": [
      "deliverables.review.file.actions",
      "sidebar.right.tab.guide",
      "sidebar.right.tab.guide.actions",
      "sidebar.right.tab.guide.entry",
      "forge.changes.file.menu",
      "forge.changes.toolbar",
      "forge.diff.comment.actions",
      "forge.diff.line.annotation",
      "sidebar.chat.conversation",
      "sidebar.right.tab.document",
      "sidebar.right.tab.document.action",
      "sidebar.right.tab.document.actions",
      "sidebar.right.tab.document.unpreviewable",
      "sidebar.right.tab.files.actions"
    ]
  },
  {
    "parent": "sidebar.right.tab.document",
    "children": [
      "sidebar.right.tab.document.office.pdf"
    ]
  },
  {
    "parent": "sidebar.settings",
    "children": [
      "settings.action",
      "settings.close",
      "settings.header",
      "settings.launcher",
      "settings.notice",
      "settings.onboarding",
      "settings.section.icon",
      "settings.trigger"
    ]
  },
  {
    "parent": "sidebar.workspaces",
    "children": [
      "sidebar.session.row.hover",
      "sidebar.session.row.leading",
      "sidebar.session.row.trailing",
      "sidebar.workspaces.directoryFlow",
      "sidebar.workspaces.session.row.action"
    ]
  },
  {
    "parent": "tool.call.toolview",
    "children": [
      "tool.call.images",
      "tool.view.cordis"
    ]
  }
] as const
