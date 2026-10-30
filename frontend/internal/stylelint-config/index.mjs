/** @type {import('stylelint').Config} */
const bemPattern = "^([a-z][a-z0-9]*)((--|__|-)[a-z0-9]+)*$";
/** Block must be `eap-<name>`; element `__`; modifier `--`. */
const eapBemPattern = "^eap(-[a-z0-9]+)+((--|__)[a-z0-9]+)*$";

export default {
  extends: ["stylelint-config-standard", "stylelint-config-recess-order"],
  overrides: [
    {
      files: ["**/*.vue"],
      customSyntax: "postcss-html",
    },
    {
      files: ["**/packages/ui/**/*.{css,vue}"],
      rules: {
        "selector-class-pattern": [
          eapBemPattern,
          {
            message: (selector) =>
              `Expected "${selector}" to follow eap BEM (eap-block, eap-block__elem, eap-block--mod)`,
          },
        ],
      },
    },
  ],
  rules: {
    // Allow BEM modifiers/elements (e.g. eap-button--primary, eap-panel__body, form-actions).
    "selector-class-pattern": [
      // Longer separators first: otherwise "--primary" is eaten as "-" + invalid "-primary".
      bemPattern,
      {
        message: (selector) => `Expected class selector "${selector}" to be kebab-case or BEM`,
      },
    ],
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "custom-variant", "source", "theme", "utility", "variant"],
      },
    ],
    // Keep real font family casing inside token stacks (Inter, Menlo, …).
    "value-keyword-case": [
      "lower",
      {
        ignoreProperties: ["/^--font(-|$)/", "/^--eap-font-family/", "font-family"],
      },
    ],
  },

  ignoreFiles: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
};
