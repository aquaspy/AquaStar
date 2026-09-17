exports.dialogMessages = {
    helpMessage: 'Example Companion — AquaStar plugin demo',
    helpDetail: function () {
        return 'Primary game: BoxMover.swf (arrow keys).\n' +
            'Alt+N new window · Alt+E dashboard · Alt+I injection demo.\n' +
            'GitHub links open in your system browser (Electron 11 cannot render modern github.com).';
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
