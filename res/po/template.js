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
    menuBalancePatchNotes: "",
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
    menuReminders    : "",
    menuTodo         : ""
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
        todo:        "",
        record:      ""
    },
    optionsHeading: "",
    optionLabels: {
        playerCharacter:   "",
        featurePlayerName: "",
        customUrl:         "",
        recordingFormat:   "",
        renderMode:        "",
        enableDevTools:    ""
    },
    optionHints: {
        playerCharacter:   "",
        featurePlayerName: "",
        customUrl:         "",
        recordingFormat:   "",
        renderMode:        "",
        enableDevTools:    ""
    },
    customSwfHeading      : "",
    customSwfLabel        : "",
    customSwfHint         : "",
    customSwfActiveLabel  : "",
    customSwfInactiveLabel: "",
    customSwfChooseButton : "",
    customSwfRemoveButton : "",
    customSwfRemoveConfirm: "",
    customSwfChosenMessage: "",
    customSwfRemovedMessage: "",
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
    showMemberDailiesLabel: "",
    individualHiddenLabel: "",
    serverTimeLabel    : "",
    categoryClassLabel : "",
    categoryUltraLabel : "",
    categoryOtherLabel : "",
    memberToggleLabel  : "",
    memberBadgeShort   : "",
    memberBadgeTitle   : "",
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
        mayThe4th:       { label: "", short: "" },
        starFestival:    { label: "", short: "" },
        kalaSeason:      { label: "", short: "" },
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
    baseCharacterPrompt: "",
    confirmDeleteCharacter: "",
    confirmDeleteQuest : "",
    noCharactersHint   : "",
    questNamePlaceholder: "",
    questJoinPlaceholder: "",
    filterNamePlaceholder: "",
    filterAllLabel     : "",
    dailyLabel         : "",
    weeklyLabel        : "",
    monthlyLabel       : "",
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

exports.todoMessages = {
    title              : "",
    heading            : "",
    description        : "",
    serverTimeLabel    : "",
    individualHiddenLabel: "",
    categoryDropLabel  : "",
    categoryDailyDropLabel: "",
    categoryShopMergeLabel: "",
    categoryQuestRewardLabel: "",
    categoryHardFarmLabel: "",
    categoryReputationFarmLabel: "",
    priorityToggleLabel: "",
    priorityToggleTitle: "",
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
        mayThe4th:       { label: "", short: "" },
        starFestival:    { label: "", short: "" },
        kalaSeason:      { label: "", short: "" },
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
    baseCharacterPrompt: "",
    confirmDeleteCharacter: "",
    confirmDeleteTask  : "",
    noCharactersHint   : "",
    taskNamePlaceholder: "",
    wikiLinkPlaceholder: "",
    joinCommandPlaceholder: "",
    copyButton         : "",
    copiedLabel        : "",
    filterNamePlaceholder: "",
    filterAllLabel     : "",
    addTaskButton      : "",
    wikiLinkButtonTitle: "",
    completeButton     : "",
    reopenButton       : "",
    deleteButton       : "",
    completedToggleLabel: "",
    dragHandleTitle    : "",
    renameTabTitle     : "",
    removeTabTitle     : "",
    savingLabel        : "",
    savedLabel         : ""
}
