/** A published-protocol consumer of composer activities and bundle activation guidance. */
window.__ModuleLoader__.load({
  id: "@fixture/input-extension",
  factory(require) {
    const Vue = require("vue");
    const {
      Button,
      Modal,
      IconApiOutlineRegular,
    } = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = Vue.h;
    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        const labels = {
          start: "Input activity",
          cancel: "Cancel activity",
          insert: "Insert result",
          stale: "Draft changed",
          setup: "Input plugin setup",
          details: "Open setup",
          later: "Later",
          config: "Input plugin configuration",
        };
        ctx.effect(() => ctx.locale.register("fixtureInput", { en: labels, zh: labels }));
        ctx.slots.inject("conversation.input.activity", () =>
          ctx.slots.register(
            {
              name: "conversation.input.activity",
              locale: "fixtureInput",
            },
            Vue.defineComponent(
              (props) => {
                const span = Vue.shallowRef(null);
                const stale = Vue.shallowRef(false);
                Vue.onBeforeUnmount(() => props.onActiveChange(false));
                const close = () => {
                  span.value = null;
                  stale.value = false;
                  props.onActiveChange(false);
                };
                return () =>
                  span.value === null
                    ? h(
                        Button,
                        {
                          disabled: props.locked,
                          "aria-label": props.t("start"),
                          style: { width: "32px", height: "32px", padding: 0 },
                          onClick: () => {
                            span.value = props.inputActions.captureInsertion();
                            props.onActiveChange(true);
                          },
                        },
                        { default: () => h(IconApiOutlineRegular, { size: 16 }) },
                      )
                    : h("div", null, [
                        h(Button, { onClick: close }, { default: () => props.t("cancel") }),
                        h(
                          Button,
                          {
                            onClick: () => {
                              if (props.inputActions.insertText(" from plugin", span.value))
                                close();
                              else stale.value = true;
                            },
                          },
                          { default: () => props.t("insert") },
                        ),
                        stale.value ? h("span", { role: "status" }, props.t("stale")) : null,
                      ]);
              },
              { props: ["inputActions", "onActiveChange", "locked", "t"] },
            ),
          ),
        );
        ctx.slots.inject("plugins.bundle.config", () =>
          ctx.slots.register(
            {
              name: "plugins.bundle.config",
              key: "@fixture/input-extension",
              locale: "fixtureInput",
            },
            ({ t }) => h("p", null, t("config")),
          ),
        );
        ctx.slots.inject("plugins.bundle.activation", () =>
          ctx.slots.register(
            {
              name: "plugins.bundle.activation",
              key: "@fixture/input-extension",
              locale: "fixtureInput",
            },
            ({ onDismiss, onOpenDetails, t }) =>
              h(
                Modal,
                {
                  open: true,
                  title: t("setup"),
                  closeLabel: t("later"),
                  onClose: onDismiss,
                },
                {
                  default: () => [
                    h(Button, { onClick: onDismiss }, { default: () => t("later") }),
                    h(Button, { onClick: onOpenDetails }, { default: () => t("details") }),
                  ],
                },
              ),
          ),
        );
      },
    };
  },
});
