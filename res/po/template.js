function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage  : "",
    loadingCharpage  : "",
    buildingCharpage : "",
    cpDone           : "",
    doneSavedAs      : "",
    recording        : "", // Please, dont use '!'s
    alreadyRecording : ""
}

exports.dialogMessages = {
    helpTitle   :'Help:',
    helpMessage : "",
    helpDetail(k) {return expand(k.wiki) + ' - \n' +
        expand(k.design)    + ' - \n' +
        expand(k.account)   + ' - \n' +
        expand(k.charpage)  + ' - \n' +
        expand(k.cpSshot)   + ' - \n' +
        expand(k.newAqw)    + ' - \n' +
        expand(k.newTest)   + ' - \n' +
        expand(k.about)     + ' - \n' +
        expand(k.fullscreen)+ ' - \n' +
        expand(k.sshot)     + ' - \n' +
        expand(k.record)    + ' - \n' +
        expand(k.reload)    + " - \n" +
        expand(k.reloadCache)+' - \n' +
        expand(k.settings)  + ' - .\n' +
        expand(k.reminders) + ' - .\n\n' +
        '\n\n' +
        ':' + expand(k.help) + ' .';
    },
    helpScreenshot     : ": ",
    helpAqliteOld      : ": ",
    helpCustomKeyPath  : ": ",
    
    aboutTitle     : "",
    aboutMessage   : "",
    aboutDetail    : "",
    aboutDebug     : "",
    
    aboutGithubPrompt : "",
    aboutClosePrompt  : ""
}

exports.menuMessages = {
    menuBackward     : "",
    menuFoward       : "",
    menuOtherPages   : "",
    menuOtherPages2  : "",
    menuSocialMedia  : "",
    menuWiki         : "",
    menuDesign       : "",
    menuAccount      : "",
    menuPortal       : "",
    menuHeromart     : "",
    menuDailyGifts   : "",
    menuCalendar     : "",
    menuCharpage     : "",
    menuForge        : "",
    menuReddit       : "",
    menuTwitter      : "",
    menuTakeShot     : "",
    menuCopyURL      : "",
    menuReloadPage   : "",
    menuSettings     : "",
    menuReminders    : ""
}

exports.settingsMessages = {
    title            : "",
    heading          : "",
    description      : "",
    saveLocationLabel: "",
    saveButton       : "",
    resetAllButton   : "",
    restartButton    : "",
    closeButton      : "",
    recordButton     : "",
    recordingLabel   : "",
    resetButton      : "",
    savedMessage     : "",
    macOnlyLabel     : "",
    charpageOnly     : "",
    labels: {
        wiki:        "",
        account:     "",
        design:      "",
        charpage:    "",
        newAqw:      "",
        newTest:     "",
        about:       "",
        fullscreen:  "",
        sshot:       "",
        cpSshot:     "",
        reload:      "",
        reloadCache: "",
        dragon:      "",
        forward:     "",
        backward:    "",
        help:        "",
        settings:    "",
        reminders:   "",
        record:      ""
    },
    optionsHeading: "",
    optionLabels: {
        playerCharacter:   "",
        featurePlayerName: "",
        recordingFormat:   "",
        renderMode:        "",
        enableDevTools:    ""
    },
    optionHints: {
        playerCharacter:   "",
        featurePlayerName: "",
        recordingFormat:   "",
        renderMode:        "",
        enableDevTools:    ""
    },
    optionWarnings: {
        renderMode:     "",
        enableDevTools: ""
    }
}

exports.remindersMessages = {
    title              : "",
    heading            : "",
    description        : "",
    showCompletedLabel : "",
    serverTimeLabel    : "",
    categoryClassLabel : "",
    categoryUltraLabel : "",
    categoryOtherLabel : "",
    seasonalToggleLabel: "",
    seasonalSectionLabel: "",
    nextFriday13Label  : "",
    thisMonthLabel     : "",
    monthNames: ["", "", "", "", "", "", "", "", "", "", "", ""],
    seasonalEvents: {
        nulgathBirthday: { label: "", short: "" },
        carnival:        { label: "", short: "" },
        dageBirthday:    { label: "", short: "" },
        aprilFools:      { label: "", short: "" },
        starFestival:    { label: "", short: "" },
        friday13:        { label: "", short: "" },
        pirateDay:       { label: "", short: "" },
        anniversary:     { label: "", short: "" },
        blackFriday:     { label: "", short: "" },
        frostval:        { label: "", short: "" }
    },
    addCharacterTab    : "",
    promptCharacterName: "",
    promptOkButton     : "",
    promptCancelButton : "",
    confirmDeleteCharacter: "",
    confirmDeleteQuest : "",
    noCharactersHint   : "",
    questNamePlaceholder: "",
    questJoinPlaceholder: "",
    dailyLabel         : "",
    weeklyLabel        : "",
    addQuestButton     : "",
    copyButton         : "",
    copiedLabel        : "",
    deleteButton       : "",
    hideButton         : "",
    unhideButton       : "",
    archiveToggleLabel : "",
    dragHandleTitle    : "",
    renameTabTitle     : "",
    removeTabTitle     : "",
    savingLabel        : "",
    savedLabel         : ""
}
