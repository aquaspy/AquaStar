function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage: "Not valid Char Page window!",
    loadingCharpage: "Loading Char Page...",
    buildingCharpage: "Building scenario. Please wait some seconds...",
    cpDone: "DONE! Saved CP in Screenshot folder",
    doneSavedAs: "Done! Saved as ",
    recording: "RECORDING",
    alreadyRecording: "You are already recording another window!"
}

exports.dialogMessages = {
    helpTitle   :"Help:",
    helpMessage :"AquaStar shortcuts and features.",
    helpDetail(k) {return expand(k.help) + ' - Show this help.\n' +
        expand(k.settings)  + ' - Opens Settings.\n' +
        expand(k.about)     + ' - About AquaStar.\n' +
        expand(k.fullscreen)+ ' - Toggles fullscreen.\n' +
        expand(k.sshot)     + ' - Saves a screenshot of the game window.\n' +
        expand(k.record)    + ' - Record the Game Screen. Use it again to stop.\n' +
        expand(k.reload)    + ' - Reloads the current page.\n' +
        expand(k.reloadCache)+' - Clears game cache and data, then reloads the page.\n\n' +
        'Note: ' + expand(k.help) + ' shows this message.';
    },
    helpScreenshot     : "Screenshot folder: ",
    helpAqliteOld      : "App folder for aqlite_old and aquastar.json (can change if user move the application): ",
    helpCustomKeyPath  : "",

    aboutTitle     : "About AquaStar Version: ",
    aboutMessage   : "Aquastar would not be possible without the help of:",
    aboutDetail    :
        "133spider (github) for creating AQLite itself\naquaspy (github)\nbiglavis (github) For developing the extension WikiView\nArtix Entertainment (artix.com)\nElectronJs (electronjs.org)\nAdobe Flash Player (adobe.com)\nYOU! (Yes, You! Thanks for supporting us!)\n\nNote: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\nYou can give your opinion, contribute and follow the project here: ",
    aboutDebug     : "Debug Info",

    aboutGithubPrompt : "AquaStar Releases page",
    aboutClosePrompt  : "Close this Popup"
}

exports.menuMessages = {
    menuBackward: "Backward",
    menuFoward: "Foward",
    menuCopyURL: "Copy this page's URL",
    menuReloadPage: "Reload this page",
    menuSettings: "Settings",
    menuTakeGameShot: "Save Game Screenshot",
    menuRecord: "Record Game Screen",
    menuReloadCache: "Reload and Clear Cache",
    menuFullscreen: "Fullscreen",
    menuHelp: "Help",
    menuAbout: "About AquaStar"
}

exports.settingsMessages = {
    title: "AquaStar - Settings",
    heading: "Keybind Settings",
    description: "Click \"Record\" and press a new key combination to change a shortcut. Changes are saved to the file shown below and require restarting AquaStar to take effect.",
    saveLocationLabel: "Saving to: ",
    saveButton: "Save Changes",
    resetAllButton: "Reset All to Default",
    restartButton: "Restart AquaStar Now",
    closeButton: "Close",
    recordButton: "Record",
    recordingLabel: "Press keys... (Esc to cancel)",
    resetButton: "Reset",
    savedMessage: "Saved! Restart AquaStar to apply the new keybindings.",
    macOnlyLabel: " (macOS only)",
    charpageOnly: " (char page only)",
    labels: {
        about: "About AquaStar",
        fullscreen: "Toggle Fullscreen",
        sshot: "Screenshot Game Window",
        reload: "Reload Page",
        reloadCache: "Reload and Clear Cache",
        forward: "Go Forward",
        backward: "Go Backward",
        help: "Show Help",
        settings: "Open Settings (this screen)",
        record: "Record Game Screen"
    },
    optionsHeading: "Other Options",
    optionLabels: {
        recordingFormat: "Recording Format",
        renderMode: "Flash Renderer",
        ruffleUpdateChannel: "Ruffle Update Channel",
        ruffleAutoUpdate: "Automatically download updates",
        enableDevTools: "Enable DevTools"
    },
    optionHints: {
        recordingFormat: "File format used when recording the game screen (Ctrl+J). MP4 isn't available on this Electron version.",
        renderMode: "Which Flash runtime loads AQW (main, new instance, Testing) and DragonFable (Alt+1). The Char Page is unaffected (Artix already uses Ruffle there).",
        ruffleUpdateChannel: "Latest uses Ruffle's most recent stable release. Nightly includes newer experimental changes. To apply a channel change, fully close AquaStar and open it again; do not use only the Restart button.",
        ruffleAutoUpdate: "Checks the selected channel in the background every time AquaStar opens. A download is applied after restart.",
        enableDevTools: "Opens the DevTools console automatically on startup."
    },
    customSwfHeading: "Custom SWF File",
    customSwfLabel: "Local SWF File",
    customSwfHint: "Overrides the default AQW game entirely with a local .swf file - takes priority over the Custom Game URL option above. Takes effect after restarting AquaStar.",
    customSwfActiveLabel: "Active: ",
    customSwfInactiveLabel: "Not set - using the default AQW game.",
    customSwfChooseButton: "Choose File...",
    customSwfRemoveButton: "Remove",
    customSwfRemoveConfirm: "Remove the custom SWF file? AquaStar will go back to loading the default AQW game after a restart.",
    customSwfChosenMessage: "Custom SWF file set. Restart AquaStar to use it.",
    customSwfRemovedMessage: "Custom SWF file removed. Restart AquaStar to apply.",
    ruffleHeading: "Ruffle Updates",
    ruffleStatusLabel: "Ruffle selected at startup",
    ruffleLoadedLabel: "Selected at startup: ",
    ruffleConfiguredChannelLabel: "Configured update channel: ",
    ruffleLatestLabel: "Latest (Stable)",
    ruffleNightlyLabel: "Nightly (Experimental)",
    ruffleFallbackLabel: "Bundled fallback: ",
    ruffleInactiveLabel: "Ruffle is not active; Flash Player is selected.\n",
    ruffleDownloadedLabel: "Downloaded version",
    ruffleBundledLabel: "Bundled fallback",
    ruffleUpdateLabel: "Update Ruffle",
    ruffleUpdateHint: "Downloads the self-hosted web build for the selected channel from Ruffle's official GitHub release. Stable is recommended; Nightly is experimental. Restart to apply it.",
    ruffleUpdateButton: "Download Update",
    ruffleDownloadingMessage: "Downloading Ruffle update...",
    ruffleUpdatedMessage: "Ruffle update downloaded. Restart AquaStar to apply it.",
    ruffleAlreadyCurrentMessage: "Ruffle is already up to date.",
    ruffleBundledAlreadyCurrentMessage: "The bundled Ruffle is already the latest stable version.",
    ruffleUpdateFailedMessage: "Could not update Ruffle: ",
    ruffleRestoreLabel: "Restore bundled Ruffle",
    ruffleRestoreHint: "Removes downloaded Ruffle files at the next restart and uses the version packaged with AquaStar.",
    ruffleRestoreButton: "Restore Bundled Version",
    ruffleRestoreConfirm: "Restore the Ruffle version packaged with AquaStar? Downloaded Ruffle files will be removed after restart.",
    ruffleRestoreMessage: "Bundled Ruffle will be restored when AquaStar restarts.",
    optionWarnings: {
        renderMode: "Ruffle is an experimental, open-source Flash emulator. It may be slower, less stable, or behave differently than the real Flash Player, especially in crowded rooms. Switch anyway?",
        enableDevTools: "This option is for developers. Normal players usually don't need it. Enable anyway?"
    },
    pluginsHeading: "Plugins",
    pluginsActiveLabel: "Active plugin",
    pluginsActiveHint: "Only one plugin can be active. Changing it requires restarting AquaStar.",
    pluginsRestartHint: "Restart AquaStar to apply the active plugin change.",
    pluginsRestartPrompt: "Active plugin changed. Restart AquaStar now to apply it?",
    pluginsEmptyLabel: "No plugins discovered.",
    pluginsSourceBundled: "bundled",
    pluginsSourceLocal: "local",
    pluginsEnableLocalLabel: "Load local plugins from AppData",
    pluginsEnableLocalHint: "Looks for plugins under AppData/AquaStar/plugins. Local plugins run in-process with full app access after you trust them.",
    pluginsAllowOverrideLabel: "Allow local plugins to override bundled ids",
    pluginsAllowOverrideHint: "If a local plugin reuses a bundled id, prefer the local copy. Collision errors otherwise keep the bundled plugin.",
    pluginsTrustHeading: "Trust local plugins",
    pluginsTrustHint: "Unchecked local plugins will not activate. Trust grants all requested permissions for that plugin.",
    pluginsTrustLabel: "Trust",
    pluginsLocalDirLabel: "Local plugins folder: ",
    pluginsCollisionLabel: "Discovery notes:"
}
