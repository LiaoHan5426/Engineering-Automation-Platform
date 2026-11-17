/** Test package using the published registration protocol, locale and slots. */
window.__ModuleLoader__.load({
  id: "@fixture/live-client",
  meta() {
    return {
      stylesheets: {
        "style.css": {
          text: () =>
            "[data-live-client] { color: rgb(12, 34, 56); position: absolute; bottom: 20px; right: 20px; }",
        },
      },
    };
  },
  factory(require) {
    const Vue = require("vue");
    const {
      IconFolderCloseRegular,
      IconNewChatOutlineRegular,
      MenuItemButton,
    } = require("@deepseek-ai/dsh-client-ui-primitives");
    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        const counters = document.documentElement.dataset;
        counters.liveMounts = String(Number(counters.liveMounts ?? 0) + 1);
        ctx.effect(() =>
          ctx.locale.register("fixtureLive", {
            zh: {
              active: "动态插件已启用",
              configSummary: "示例配置项",
              configForm: "动态插件配置",
              configField: "问候语",
              configSave: "保存",
              action: "夹具操作",
              badge: "夹具标签",
              section: "夹具区块",
              sectionBody: "来自夹具的区块内容",
              exportSession: "导出会话",
              copySessionId: "复制会话 ID",
            },
            en: {
              active: "Live plugin enabled",
              configSummary: "An example setting",
              configForm: "Live plugin configuration",
              configField: "Greeting",
              configSave: "Save",
              action: "Fixture action",
              badge: "Fixture badge",
              section: "Fixture section",
              sectionBody: "Section content from the fixture",
              exportSession: "Export session",
              copySessionId: "Copy session ID",
            },
          }),
        );
        // Detail contributions for this bundle's own page and its row's page: an
        // action at the head, a badge beside the title, and a section below.
        // The subject says what the open page is about; another bundle's page
        // gets nothing from these entries.
        const mine = (subject) =>
          (subject.kind === "bundle" || subject.kind === "row") &&
          subject.pkg.name === "@fixture/live-client";
        ctx.slots.inject("plugins.detail.actions", () =>
          ctx.slots.register(
            {
              name: "plugins.detail.actions",
              id: "fixture-live-client",
              locale: "fixtureLive",
            },
            ({ t, subject }) =>
              mine(subject)
                ? Vue.h("button", { type: "button", "data-live-action": subject.kind }, t("action"))
                : null,
          ),
        );
        ctx.slots.inject("plugins.detail.badge", () =>
          ctx.slots.register(
            {
              name: "plugins.detail.badge",
              id: "fixture-live-client",
              locale: "fixtureLive",
            },
            ({ t, subject }) =>
              mine(subject) ? Vue.h("span", { "data-live-badge": subject.kind }, t("badge")) : null,
          ),
        );
        ctx.slots.inject("plugins.detail.section", () =>
          ctx.slots.register(
            {
              name: "plugins.detail.section",
              id: "fixture-live-client",
              locale: "fixtureLive",
            },
            ({ t, subject }) =>
              mine(subject)
                ? Vue.h(
                    "section",
                    { "data-live-section": subject.kind, "aria-label": t("section") },
                    [Vue.h("h4", null, t("section")), Vue.h("p", null, t("sectionBody"))],
                  )
                : null,
          ),
        );
        ctx.slots.inject("shell.overlay", () =>
          ctx.slots.register(
            {
              name: "shell.overlay",
              id: "fixture-live-client",
              locale: "fixtureLive",
            },
            ({ t }) => Vue.h("div", { "data-live-client": "" }, t("active")),
          ),
        );
        // The configuration of this bundle's one row, as the Plugins page renders it on the row's own page.
        ctx.slots.inject("plugins.row.config", () =>
          ctx.slots.register(
            {
              name: "plugins.row.config",
              key: "@fixture/live-client#fixture-live-client",
              locale: "fixtureLive",
            },
            ({ t, view }) =>
              view === "summary"
                ? t("configSummary")
                : Vue.h(
                    "form",
                    {
                      "data-live-config": "",
                      "aria-label": t("configForm"),
                      onSubmit: (event) => {
                        event.preventDefault();
                        counters.liveSaves = String(Number(counters.liveSaves ?? 0) + 1);
                      },
                    },
                    [
                      Vue.h("label", null, [
                        t("configField"),
                        Vue.h("input", { name: "greeting", value: "hello" }),
                      ]),
                      Vue.h("button", { type: "submit" }, t("configSave")),
                    ],
                  ),
          ),
        );
        const actionInjected = () => ({
          selectAction(action, sessionId, displayTitle) {
            counters.sessionAction = action;
            counters.sessionActionId = sessionId;
            counters.sessionActionTitle = displayTitle;
          },
        });
        const registerSessionAction = (id, order, label, separatorBefore) =>
          ctx.slots.register(
            {
              name: "sidebar.workspaces.session.menu.item",
              id,
              order,
              locale: "fixtureLive",
              inject: actionInjected,
            },
            Vue.defineComponent(
              (props) => {
                const menu = props.useMenuOpenState();
                return () =>
                  Vue.h(
                    MenuItemButton,
                    {
                      separatorBefore,
                      onSelect: () => {
                        menu.value[1](false);
                        props.selectAction(id, props.sessionId, props.displayTitle);
                      },
                    },
                    { default: () => props.t(label) },
                  );
              },
              { props: ["sessionId", "displayTitle", "useMenuOpenState", "selectAction", "t"] },
            ),
          );
        ctx.slots.inject("sidebar.session.row.trailing", function* () {
          for (const [id, order, Icon, label] of [
            ["fixture.trailing-new-chat", 200, IconNewChatOutlineRegular, "section"],
            ["fixture.trailing-folder", 100, IconFolderCloseRegular, "badge"],
          ]) {
            yield ctx.slots.register(
              {
                name: "sidebar.session.row.trailing",
                id,
                order,
                locale: "fixtureLive",
              },
              ({ sessionId, t }) =>
                Vue.h(
                  "span",
                  {
                    role: "img",
                    "aria-label": t(label),
                    "data-session-trailing": sessionId,
                  },
                  Vue.h(Icon),
                ),
            );
          }
        });
        ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () {
          // Legacy rows form their own ordered group before the built-in Archive action.
          yield registerSessionAction("fixture.export-session", 500, "exportSession", true);
          yield registerSessionAction("fixture.copy-session-id", 600, "copySessionId", false);
        });
        ctx.effect(() => {
          const ping = () => {
            counters.liveHits = String(Number(counters.liveHits ?? 0) + 1);
          };
          window.addEventListener("dsh-fixture-ping", ping);
          return async () => {
            window.removeEventListener("dsh-fixture-ping", ping);
            await Promise.resolve();
            counters.liveDisposals = String(Number(counters.liveDisposals ?? 0) + 1);
          };
        });
      },
    };
  },
});
