/** Test package registering its own settings page into `settings.section`. */
window.__ModuleLoader__.load({
  id: '@fixture/settings-section',
  factory(require) {
    const Vue = require('vue')
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'fixture-settings-section', label: 'Fixture settings',
        }, () => Vue.h('section', { 'data-fixture-settings-section': '', 'aria-label': 'Fixture settings' },
          Vue.h('p', null, 'Settings content from the fixture'))))
      },
    }
  },
})
