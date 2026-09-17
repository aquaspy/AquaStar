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
    exampleGithub: 'AquaStar on GitHub',
    exampleReleases: 'GitHub Releases',
    examplePluginsDocs: 'Plugin authoring guide'
};
