/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard', 'stylelint-config-recess-order'],
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'apply',
          'custom-variant',
          'source',
          'theme',
          'utility',
          'variant',
        ],
      },
    ],
  },
  ignoreFiles: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
}
