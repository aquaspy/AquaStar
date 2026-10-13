// Node-only web build contribution for the AQW plugin (no Electron).
// Consumed by scripts/build-web.js via contributeWebBuild(); all paths are relative to the
// repository root. The build script names no plugin: it finds this file through the
// manifest's "web.contribute".

const PLUGIN = 'plugins/adventure-quest-worlds';
const FEATURES = PLUGIN + '/features';
const WEB = PLUGIN + '/web';

function contributeWebBuild() {
  return {
    landing: {
      landingHtml: WEB + '/landing.html',
      landingJs: WEB + '/assets/landing.js',
      landingCss: WEB + '/assets/landing.css',
      iconFrom: 'Icon/Icon.png'
    },
    tools: [
      {
        id: 'reminders',
        sourceHtml: FEATURES + '/reminders/reminders.html',
        bridge: WEB + '/bridges/reminders.js',
        outToolsPath: 'tools/reminders/index.html',
        defaultsJson: FEATURES + '/reminders/reminders_default.json',
        localeKeys: ['remindersMessages']
      },
      {
        id: 'todo',
        sourceHtml: FEATURES + '/todo/todo.html',
        bridge: WEB + '/bridges/todo.js',
        outToolsPath: 'tools/todo/index.html',
        localeKeys: ['todoMessages']
      },
      {
        id: 'strategy',
        sourceHtml: FEATURES + '/strategy/strategy.html',
        bridge: WEB + '/bridges/strategy.js',
        outToolsPath: 'tools/strategy/index.html',
        defaultsJson: FEATURES + '/strategy/strategy_default.json',
        localeKeys: ['strategyMessages']
      }
    ],
    // Kits the web pages share with the desktop pages: copied to web-dist at `to`. The pages
    // reference them with the same relative paths on desktop and on the web, except the
    // platform's focus.css (see pathRewrites).
    sharedKits: [
      { from: PLUGIN + '/core/list-state.js', to: 'core/list-state.js' },
      { from: PLUGIN + '/core/reset-time.js', to: 'core/reset-time.js' },
      { from: PLUGIN + '/ui/workspace/modals.js', to: 'ui/workspace/modals.js' },
      { from: PLUGIN + '/ui/workspace/character-tabs.js', to: 'ui/workspace/character-tabs.js' },
      { from: FEATURES + '/common/list_window_common.js', to: 'tools/common/list_window_common.js' },
      { from: 'res/features/common/focus.css', to: 'tools/common/focus.css' }
    ],
    // The platform stylesheet lives outside the plugin on desktop; on the web it sits next to
    // the other shared tool files (regex source -> replacement).
    pathRewrites: [
      { match: '(?:\\.\\./)+res/features/common/focus\\.css', replace: '../common/focus.css' }
    ],
    bridges: {
      commonBridge: WEB + '/bridges/common.js'
    },
    localeModules: {
      'en-US': PLUGIN + '/locales/en-US.js',
      'pt-BR': PLUGIN + '/locales/pt-BR.js'
    }
  };
}

module.exports = contributeWebBuild;
module.exports.contributeWebBuild = contributeWebBuild;
