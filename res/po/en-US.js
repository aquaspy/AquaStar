function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage  : "Not valid Char Page window!",
    loadingCharpage  : "Loading Char Page...",
    buildingCharpage : "Building scenario. Please wait some seconds...",
    cpDone           : "DONE! Saved CP in Screenshot folder",
    doneSavedAs      : "Done! Saved as ",
    recording        : "RECORDING",
    alreadyRecording : "You are already recording another window!"
}

exports.dialogMessages = {
    helpTitle   :'Help:',
    helpMessage :"These are the keybindings added to the game.",
    helpDetail(k) {return expand(k.wiki) + ' - AQW Wiki\n' +
        expand(k.design)    + ' - AQW Design notes\n' +
        expand(k.account)   + ' - Account page\n' +
        expand(k.charpage)  + ' - Character (Player) lookup. You can also just use the in-game lookup.\n' +
        expand(k.cpSshot)   + ' - (Char pages only!) Take a screenshot of the current char page.\n' +
        expand(k.newAqw)    + ' - Opens a new instance.\n' +
        expand(k.newTest)   + ' - Opens a Testing AQW instance.\n' +
        expand(k.about)     + ' - About AquaStar.\n' +
        expand(k.fullscreen)+ ' - Toggles Fullscreen\n' +
        expand(k.sshot)     + ' - Screenshot the game window (AQW and AQLITE only). They are saved in another folder as detailed below.\n' +
        expand(k.record)    + ' - Record the Game Screen. Use it again to stop.\n' +
        expand(k.reload)    + " - Reload the pages, like in a browser\n" +
        expand(k.reloadCache)+' - Clears all game cache, some cookies and refresh the window (can fix some bugs in game)\n' +
        expand(k.settings)  + ' - Opens the Settings screen, to customize keybindings.\n' +
        expand(k.reminders) + ' - Opens the Reminders screen, to track daily/weekly quests per character.\n\n' +
        'For an older/custom aqlite file, please name it "aqlite_old.swf" and put it in the same folder as the executable, as said below!\n\n' +
        'Note:' + expand(k.help) + ' Shows this message.';
    },
    helpScreenshot     : "Screenshot folder: ",
    helpAqliteOld      : "App folder for aqlite_old and aquastar.json (can change if user move the application): ",
    helpCustomKeyPath  : "Another Location for aquastar.json with custom keybindings. Check Readme.md for help: ",
    
    aboutTitle     : "About AquaStar Version: ",
    aboutMessage   : "Aquastar would not be possible without the help of:",
    aboutDetail    : 
        '133spider (github) for creating AQLite itself\n' +
        'aquaspy (github)\n' +
        'biglavis (github) For developing the extension WikiView\n' +
        'Artix Entertainment (artix.com)\n' +
        'ElectronJs (electronjs.org)\n' +
        'Adobe Flash Player (adobe.com)\n' +
        'YOU! (Yes, You! Thanks for supporting us!)\n\n' +
        'Note: This is NOT an official Artix product. Artix Entertainment does not recommends it by any means. You are at your own risk using it.\n\n' +
        'You can give your opinion, contribute and follow the project here: ',
    aboutDebug     : "Debug Info",
    
    aboutGithubPrompt : "AquaStar Releases page",
    aboutClosePrompt  : "Close this Popup"
}

exports.menuMessages = {
    menuBackward     : "Backward",
    menuFoward       : "Foward",
    menuOtherPages   : "Usefull Pages",
    menuOtherPages2  : "Other usefull Pages",
    menuSocialMedia  : "Social Media",
    menuWiki         : "AQW Wiki",
    menuDesign       : "Design Notes",
    menuAccount      : "AQW Account",
    menuPortal       : "Portal Battleon",
    menuHeromart     : "Heromart",
    menuDailyGifts   : "Daily Drops",
    menuCalendar     : "Calendar of Events",
    menuCharpage     : "Charpages",
    menuForge        : "Forge Enchants",
    menuReddit       : "AQW Subreddit",
    menuTwitter      : "Alina's Twitter",
    menuTakeShot     : "Take a SShot of CP (CP ONLY!)",
    menuCopyURL      : "Copy this page's URL",
    menuReloadPage   : "Reload this page",
    menuSettings     : "Settings",
    menuReminders    : "Reminders"
}

exports.settingsMessages = {
    title            : "AquaStar - Settings",
    heading          : "Keybind Settings",
    description      : "Click \"Record\" and press a new key combination to change a shortcut. Changes are saved to the file shown below and require restarting AquaStar to take effect.",
    saveLocationLabel: "Saving to: ",
    saveButton       : "Save Changes",
    resetAllButton   : "Reset All to Default",
    restartButton    : "Restart AquaStar Now",
    closeButton      : "Close",
    recordButton     : "Record",
    recordingLabel   : "Press keys... (Esc to cancel)",
    resetButton      : "Reset",
    savedMessage     : "Saved! Restart AquaStar to apply the new keybindings.",
    macOnlyLabel     : " (macOS only)",
    charpageOnly     : " (char page only)",
    labels: {
        wiki:        "Open AQW Wiki",
        account:     "Open Account Page",
        design:      "Open Design Notes",
        charpage:    "Character Lookup",
        newAqw:      "Open New AQW Instance",
        newTest:     "Open Testing AQW Instance",
        about:       "About AquaStar",
        fullscreen:  "Toggle Fullscreen",
        sshot:       "Screenshot Game Window",
        cpSshot:     "Screenshot Char Page",
        reload:      "Reload Page",
        reloadCache: "Reload and Clear Cache",
        dragon:      "Open DragonFable",
        forward:     "Go Forward",
        backward:    "Go Backward",
        help:        "Show Help",
        settings:    "Open Settings (this screen)",
        reminders:   "Open Reminders",
        record:      "Record Game Screen"
    },
    optionsHeading: "Other Options",
    optionLabels: {
        playerCharacter:   "Player Character",
        featurePlayerName: "Show Player Character in Window Title",
        recordingFormat:   "Recording Format",
        renderMode:        "Flash Renderer",
        enableDevTools:    "Enable DevTools"
    },
    optionHints: {
        playerCharacter:   "Letters and numbers only. Used by the Char Page shortcut (Alt+P) to open straight to this character.",
        featurePlayerName: "When on, replaces \"AquaStar\" in the main window title with your Player Character above.",
        recordingFormat:   "File format used when recording the game screen (Ctrl+J). MP4 isn't available on this Electron version.",
        renderMode:        "Which Flash runtime loads AQW (main, new instance, Testing). DragonFable and the Char Page are unaffected.",
        enableDevTools:    "Opens the DevTools console automatically on startup."
    },
    optionWarnings: {
        renderMode:     "Ruffle is an experimental, open-source Flash emulator. It may be slower, less stable, or behave differently than the real Flash Player, especially in crowded rooms. Switch anyway?",
        enableDevTools: "This option is for developers. Normal players usually don't need it. Enable anyway?"
    }
}

exports.remindersMessages = {
    title              : "AquaStar - Reminders",
    heading            : "Reminders",
    description        : "Track daily and weekly in-game tasks per character. Resets follow the AE server clock (America/New_York) - daily at midnight, weekly at the Thursday-to-Friday midnight.",
    addCharacterTab    : "+ Add Character",
    promptCharacterName: "Character name:",
    promptOkButton     : "OK",
    promptCancelButton : "Cancel",
    confirmDeleteCharacter: "Remove this character and its progress on every quest? This cannot be undone.",
    confirmDeleteQuest : "Delete this quest for every character? This cannot be undone.",
    noCharactersHint   : "Add a character tab above to start tracking quests.",
    questNamePlaceholder: "Quest name",
    questJoinPlaceholder: "/join ...",
    dailyLabel         : "Daily",
    weeklyLabel        : "Weekly",
    addQuestButton     : "Add Quest",
    copyButton         : "Copy",
    copiedLabel        : "Copied!",
    deleteButton       : "Delete",
    renameTabTitle     : "Rename",
    removeTabTitle     : "Remove",
    savingLabel        : "Saving...",
    savedLabel         : "Saved"
}
