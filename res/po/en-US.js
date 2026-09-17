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
    helpDetail(k) {return 'AquaStar (app)\n' +
        expand(k.help) + ' - Show this help.\n' +
        expand(k.settings)  + ' - Opens Settings (General / active plugin / Keybinds).\n' +
        expand(k.about)     + ' - About AquaStar.\n' +
        expand(k.fullscreen)+ ' - Toggles fullscreen.\n' +
        expand(k.sshot)     + ' - Saves a screenshot of the focused game window.\n' +
        expand(k.record)    + ' - Record the game screen. Use it again to stop.\n' +
        expand(k.reload)    + ' - Reloads the current page.\n' +
        expand(k.reloadCache)+' - Clears cache/data for the page, then reloads.\n' +
        expand(k.forward)   + ' / ' + expand(k.backward) + ' - Navigate history in browser windows.\n\n' +
        'Active-plugin shortcuts (if any) are listed below.';
    },
    helpScreenshot     : "Screenshot folder: ",
    helpAqliteOld      : "AppData folder for aquastar.json and optional local SWF override (can change if the user moves the app): ",
    helpCustomKeyPath  : "",

    aboutTitle     : "About AquaStar Version: ",
    aboutMessage   : "AquaStar is a Flash companion shell with game plugins.",
    aboutDetail    :
        "Thanks to everyone who made this possible:\n133spider (AQLite)\naquaspy\nbiglavis (WikiView)\nArtix Entertainment\nElectron\nAdobe Flash Player\nand you for supporting the project.\n\nAquaStar is not an official Artix product; use at your own risk.\n\nProject / releases: ",
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
    heading: "Settings",
    description: "Configure AquaStar and the active plugin. Changes are saved to the file shown below; some options need a restart to take effect.",
    descriptionGeneral: "Plugin selection, primary game override, recording, and runtime options.",
    descriptionPlugin: "Options provided by the active plugin.",
    descriptionKeybinds: "Click \"Record\" and press a new key combination to change a shortcut. Restart AquaStar to apply keybind changes.",
    saveLocationLabel: "Saving to: ",
    saveButton: "Save Changes",
    resetAllButton: "Reset All to Default",
    restartButton: "Restart AquaStar Now",
    closeButton: "Close",
    recordButton: "Record",
    recordingLabel: "Press keys... (Esc to cancel)",
    resetButton: "Reset",
    savedMessage: "Saved! Restart AquaStar if a change requires it.",
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
    tabGeneral: "General",
    tabKeybinds: "Keybinds",
    tabPluginFallback: "Active plugin",
    pluginSettingsEmpty: "This plugin has no extra settings.",
    keybindsAppHeading: "App",
    keybindsGameHeading: "Game",
    optionsHeading: "General options",
    optionLabels: {
        appLanguage: "Language",
        customUrl: "Custom game URL",
        recordingFormat: "Recording Format",
        renderMode: "Flash Renderer",
        ruffleUpdateChannel: "Ruffle Update Channel",
        ruffleAutoUpdate: "Automatically download updates",
        showGameMenu: "Show menu above game windows",
        enableDevTools: "Enable DevTools"
    },
    optionHints: {
        appLanguage: "UI language for AquaStar and the active plugin. Restart required after changing.",
        customUrl: "Loads a different SWF URL instead of the active plugin's primary game. Leave empty for the plugin default. Ignored if a local SWF file (below) is active.",
        recordingFormat: "File format used when recording the game screen (Ctrl+J). MP4 isn't available on this Electron version.",
        renderMode: "Which Flash runtime loads game windows from the active plugin. Takes effect after restart when switching to Ruffle.",
        ruffleUpdateChannel: "Latest uses Ruffle's most recent stable release. Nightly includes newer experimental changes. To apply a channel change, fully close AquaStar and open it again; do not use only the Restart button.",
        ruffleAutoUpdate: "Checks the selected channel in the background every time AquaStar opens. A download is applied after restart.",
        showGameMenu: "Shows a menu bar above game windows with the same commands as the shortcuts. Turn it off for keyboard-only controls.",
        enableDevTools: "Opens the DevTools console automatically on startup."
    },
    languageChoiceLabels: {
        system: "System default",
        "en-US": "English",
        "pt-BR": "Português (Brasil)"
    },
    customSwfHeading: "Primary game override",
    customSwfLabel: "Local SWF file",
    customSwfHint: "Overrides the active plugin's primary game with a local .swf file — takes priority over the Custom game URL above. Takes effect after restarting AquaStar.",
    customSwfActiveLabel: "Active: ",
    customSwfInactiveLabel: "Not set — using the active plugin's primary game.",
    customSwfChooseButton: "Choose File...",
    customSwfRemoveButton: "Remove",
    customSwfRemoveConfirm: "Remove the custom SWF file? AquaStar will go back to the active plugin's primary game after a restart.",
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
