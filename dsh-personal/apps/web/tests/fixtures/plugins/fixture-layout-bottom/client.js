/** Root-scoped bottom content with occupant-owned height and local input state. */
window.__ModuleLoader__.load({
  id: "@fixture/layout-bottom",
  factory(require) {
    const Vue = require("vue");
    const { Button } = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = Vue.h;
    const Bottom = Vue.defineComponent(
      (props) => {
        const height = Vue.shallowRef(240);
        return () => {
          if (height.value === 0) return null;
          return h(
            "section",
            {
              "aria-label": props.t("title"),
              "data-bottom-fixture": "",
              style: { height: `${height.value}px`, boxSizing: "border-box", padding: "16px" },
            },
            [
              h("input", { "aria-label": props.t("input") }),
              h(
                Button,
                { onClick: () => (height.value = 360) },
                { default: () => props.t("grow") },
              ),
              h(
                Button,
                { onClick: () => (height.value = 0) },
                { default: () => props.t("collapse") },
              ),
            ],
          );
        };
      },
      { props: ["t"] },
    );
    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        const labels = {
          title: "Bottom content",
          input: "Bottom input",
          grow: "Grow bottom",
          collapse: "Collapse bottom",
        };
        ctx.effect(() => ctx.locale.register("fixtureBottom", { en: labels, zh: labels }));
        ctx.slots.injecprops.t("shell.bottom", () =>
          ctx.slots.register(
            {
              name: "shell.bottom",
              locale: "fixtureBottom",
            },
            Bottom,
          ),
        );
      },
    };
  },
});
