// Node-only web build contribution for the AQW plugin (no Electron).
// Consumed by scripts/build-web.js via contributeWebBuild().

const FEATURES = 'plugins/adventure-quest-worlds/features';

function contributeWebBuild() {
  return {
    landing: {
      landingHtml: 'web/landing.html',
      landingJs: 'web/assets/landing.js',
      landingCss: 'web/assets/landing.css',
      iconFrom: 'Icon/Icon.png'
    },
    tools: [
      {
        id: 'reminders',
        sourceHtml: FEATURES + '/reminders/reminders.html',
        bridge: 'web/bridges/reminders.js',
        outToolsPath: 'tools/reminders/index.html',
        defaultsJson: FEATURES + '/reminders/reminders_default.json',
        localeKeys: ['remindersMessages']
      },
      {
        id: 'todo',
        sourceHtml: FEATURES + '/todo/todo.html',
        bridge: 'web/bridges/todo.js',
        outToolsPath: 'tools/todo/index.html',
        localeKeys: ['todoMessages']
      },
      {
        id: 'strategy',
        sourceHtml: FEATURES + '/strategy/strategy.html',
        bridge: 'web/bridges/strategy.js',
        outToolsPath: 'tools/strategy/index.html',
        defaultsJson: FEATURES + '/strategy/strategy_default.json',
        localeKeys: ['strategyMessages']
      }
    ],
    sharedKits: [
      'res/core/list-state.js',
      'res/core/reset-time.js',
      'res/ui/workspace/modals.js',
      'res/ui/workspace/character-tabs.js',
      'res/features/common/list_window_common.js'
    ],
    bridges: {
      commonBridge: 'web/bridges/common.js'
    },
    localeModules: {
      'en-US': 'plugins/adventure-quest-worlds/locales/en-US.js',
      'pt-BR': 'plugins/adventure-quest-worlds/locales/pt-BR.js'
    }
  };
}

module.exports = contributeWebBuild;
module.exports.contributeWebBuild = contributeWebBuild;
