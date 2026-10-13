exports.dialogMessages = {
    helpMessage: 'Example Companion — AquaStar plugin demo',
    helpDetailExtra: function (k) {
        function expand(keyb) {
            if (Array.isArray(keyb)) return keyb.join(', ');
            return keyb || '';
        }
        return 'Example Companion\n' +
            expand(k.newStage) + ' - New BoxMover.swf window (arrow keys move the square)\n' +
            expand(k.openDashboard) + ' - Example dashboard (store / IPC / fetch)\n' +
            expand(k.openInjectDemo) + ' - Local injection demo page\n' +
            expand(k.openGithub) + ' / ' + expand(k.openReleases) + ' / ' +
            expand(k.openPluginsDocs) + ' - GitHub / docs in the system browser\n' +
            '(Electron 11 cannot render modern github.com in-app.)';
    }
};

exports.dashboardMessages = {
    title: 'Example Companion dashboard',
    blurb: 'Demonstrates persistent-store, namespaced IPC, and net-fetch (GitHub API).',
    labelVisits: 'Visits',
    labelLast: 'Last opened',
    labelNote: 'Sticky note (aquastar.example-companion.demo.json)',
    saveNote: 'Save note',
    refresh: 'Refresh',
    fetchRepo: 'Fetch aquaspy/AquaStar via net.fetchText',
    saved: 'Note saved.',
    fetchOk: 'Fetch ok.',
    fetching: 'Fetching…',
    fetchFail: 'Fetch failed'
};

exports.injectDemoMessages = {
    title: 'Injection demo page',
    heading: 'Injection demo page',
    body: 'This local page is the safe target for registerNavigationHooks. GitHub itself is not injected — rewriting UA/DOM on github.com breaks their CSS/JS.',
    waiting: 'Waiting for navigation hook…',
    ok: 'Injection OK — navigation hook ran from example-companion'
};

exports.settingsMessages = {
    optionLabels: {
        demoPlayerName: 'Demo display name',
        demoShowTips: 'Enable injection on the local demo page'
    },
    optionHints: {
        demoPlayerName: 'Stored under plugins[example-companion] in aquastar.json (hybrid settings).',
        demoShowTips: 'When on, Alt+I local inject-demo page receives a navigation-hook update. GitHub pages are never injected (breaks their CSS/JS).'
    },
    settingsSections: {
        demo: 'Example plugin options'
    }
};

exports.menuMessages = {
    exampleMenu: 'Example',
    exampleNewBoxMover: 'New BoxMover window',
    exampleStaticRect: 'Open static rectangle.swf',
    exampleDashboard: 'Demo dashboard',
    exampleInjectDemo: 'Injection demo page',
    exampleGithub: 'AquaStar on GitHub (system browser)',
    exampleReleases: 'GitHub Releases (system browser)',
    examplePluginsDocs: 'Plugin authoring guide (system browser)',
    exampleDesignDocs: 'Plugin architecture design (system browser)'
};

exports.windowTitles = {
    primary: 'AquaStar - Example Companion',
    staticRect: 'AquaStar - Static rectangle.swf',
    dashboard: 'Example Dashboard'
};
