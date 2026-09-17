// AQW plugin locale catalog (en-US).
// Feature / game-specific strings; platform chrome stays in res/po.

function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.charPageStudioMessages = {
    locale: "en-US",
    title: "AquaStar — Char Page Studio",
    heading: "Char Page Studio",
    description: "Customize a Char Page with the native Flash Player.",
    sceneModeLabel: "Scene mode",
    charPageMode: "Char Page Studio",
    emptySceneMode: "Empty scene",
    emptySceneHint: "Empty scene uses the new AQW compositor: without the Char Page interface, border, or background.",
    characterLabel: "AQW character",
    loadCharacterButton: "Load from Char Page",
    characterHint: "Uses the character configured in Settings by default, but does not download anything until this button is used.",
    colorsLabel: "Colors",
    backgroundIndexLabel: "Background (bgindex)",
    emptySceneSettingsLabel: "Solid background and FPS (empty scene)",
    solidBackgroundLabel: "Solid background",
    nativeFps: "24 FPS (AQW)",
    loadSceneButton: "Load scene",
    savePngButton: "Save PNG screenshot",
    saveGifButton: "Generate GIF (8 s)",
    gifFpsLabel: "GIF FPS",
    gifColorsLabel: "GIF colors"
};

exports.dialogMessages = {
    // Appended under platform helpDetail (see res/locale.js).
    helpDetailExtra: function (k) {return 'Adventure Quest Worlds\n' +
        expand(k.wiki)      + ' - AQW Wiki\n' +
        expand(k.design)    + ' - AQW Design Notes\n' +
        expand(k.account)   + ' - AQW account page\n' +
        expand(k.charpage)  + " - Opens the configured player character's Char Page\n" +
        expand(k.cpSshot)   + ' - (Char Pages only) saves the open Char Page\n' +
        expand(k.newAqw)    + ' - Opens a new AQW instance\n' +
        expand(k.newTest)   + ' - Opens a Testing AQW instance\n' +
        expand(k.dragon)    + ' - Opens DragonFable\n' +
        expand(k.reminders) + ' - Quest reminders per character\n' +
        expand(k.todo)      + ' - To-Do List\n' +
        expand(k.inventory) + ' - Inventory/BuyBack\n' +
        expand(k.strategy)  + ' - Strategy tools\n\n' +
        'Game menu bar can be disabled in Settings. Char Page Studio is under the Game menu.';
    }
};

exports.menuMessages = {
    menuOtherPages: "Usefull Pages",
    menuOtherPages2: "Other usefull Pages",
    menuSocialMedia: "Social Media",
    menuWiki: "AQW Wiki",
    menuDesign: "Design Notes",
    menuBalancePatchNotes: "Balance/Class Patch Notes",
    menuAccount: "AQW Account",
    menuPortal: "Portal Battleon",
    menuHeromart: "Heromart",
    menuDailyGifts: "Daily Drops",
    menuCalendar: "Calendar of Events",
    menuCharpage: "Charpages",
    menuForge: "Forge Enchants",
    menuReddit: "AQW Subreddit",
    menuTwitter: "Alina's Twitter",
    menuTakeShot: "Take a SShot of CP (CP ONLY!)",
    menuCharPageStudio: "Char Page Studio",
    menuGame: "Game",
    menuFeatures: "Features",
    menuReminders: "Reminders",
    menuTodo: "To-Do List",
    menuInventory: "Inventory",
    menuStrategy: "Strategy",
    menuNewAqw: "New AQW Instance",
    menuNewTest: "AQW Testing Instance",
    menuDragon: "DragonFable",
    menuTools: "Tools",
};

exports.settingsMessages = {
    labels: {
        wiki: "Open AQW Wiki",
        account: "Open Account Page",
        design: "Open Design Notes",
        charpage: "Character Lookup",
        newAqw: "Open New AQW Instance",
        newTest: "Open Testing AQW Instance",
        dragon: "Open DragonFable",
        reminders: "Open Reminders",
        todo: "Open To-Do List",
        inventory: "Open Inventory",
        strategy: "Open Strategy",
        cpSshot: "Screenshot Char Page",
    },
    optionLabels: {
        playerCharacter: "Player Character",
        featurePlayerName: "Show Player Character in Window Title",
        autoSync: "Auto Sync Inventory",
    },
    optionHints: {
        playerCharacter: "Letters and numbers only. Used by the Char Page shortcut (Alt+P) to open straight to this character.",
        featurePlayerName: "When on, replaces \"AquaStar\" in the main window title with your Player Character above.",
        autoSync: "Periodically syncs your Inventory/BuyBack data from account.aq.com in the background (about every 2 hours) once you've logged in there at least once via Alt+A. When off, sync only happens when you use a Sync Now button (in the Inventory window or on account.aq.com/Home).",
    },
    settingsSections: {
        account: "Account & Inventory"
    }
};

exports.remindersMessages = {
    title: "AquaStar - Reminders",
    heading: "Reminders",
    description: "Track daily and weekly in-game tasks per character. Resets follow the AE server clock (America/New_York) - daily at midnight, weekly at the Thursday-to-Friday midnight.",
    showCompletedLabel: "Show completed",
    showMemberDailiesLabel: "Show member reminders",
    individualHiddenLabel: "Individual hidden list per character",
    serverTimeLabel: "Server Time",
    categoryClassLabel: "Class",
    categoryUltraLabel: "Ultra Bosses",
    categoryOtherLabel: "Other",
    memberToggleLabel: "Member",
    memberBadgeShort: "★",
    memberBadgeTitle: "Member-only content",
    seasonalToggleLabel: "Seasonal",
    seasonalSectionLabel: "Seasonal",
    nextFriday13Label: "Next Friday the 13th: ",
    thisMonthLabel: "This Month",
    monthNames: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ],
    seasonalEvents: {
        nulgathBirthday: {
            label: "Nulgath's Birthday (Jan)",
            short: "JAN"
        },
        carnival: {
            label: "Carnival / Lunar New Year (Feb)",
            short: "FEB"
        },
        dageBirthday: {
            label: "Dage's Birthday / Good Luck Day (Mar)",
            short: "MAR"
        },
        aprilFools: {
            label: "April Fools (Apr)",
            short: "APR"
        },
        mayThe4th: {
            label: "May the 4th (May)",
            short: "MAY"
        },
        starFestival: {
            label: "Star Festival / Summer (Jul)",
            short: "JUL"
        },
        kalaSeason: {
            label: "Back to School / Indonesian Day (Aug)",
            short: "AUG"
        },
        friday13: {
            label: "Friday the 13th",
            short: "F13"
        },
        pirateDay: {
            label: "Talk Like a Pirate Day / Independence (Sep)",
            short: "SEP"
        },
        anniversary: {
            label: "Mogloween / AQW Anniversary (Oct)",
            short: "OCT"
        },
        blackFriday: {
            label: "Black Friday (Nov)",
            short: "NOV"
        },
        frostval: {
            label: "Frostval / New Year (Dec)",
            short: "DEC"
        }
    },
    addCharacterTab: "+ Add Character",
    promptCharacterName: "Character name:",
    promptOkButton: "OK",
    promptCancelButton: "Cancel",
    baseCharacterPrompt: "Which character's hidden list should become the new shared one?",
    confirmDeleteCharacter: "Remove this character and its progress on every quest? This cannot be undone.",
    confirmDeleteQuest: "Delete this quest for every character? This cannot be undone.",
    noCharactersHint: "Add a character tab above to start tracking quests.",
    questNamePlaceholder: "Quest name",
    questJoinPlaceholder: "/join ...",
    filterNamePlaceholder: "Filter by name...",
    filterAllLabel: "All",
    dailyLabel: "Daily",
    weeklyLabel: "Weekly",
    monthlyLabel: "Monthly",
    addQuestButton: "Add Quest",
    copyButton: "Copy",
    copiedLabel: "Copied!",
    deleteButton: "Delete",
    hideButton: "Hide",
    unhideButton: "Unhide",
    archiveToggleLabel: "Hidden",
    dragHandleTitle: "Drag to reorder",
    renameTabTitle: "Rename",
    removeTabTitle: "Remove",
    savingLabel: "Saving...",
    savedLabel: "Saved"
};

exports.todoMessages = {
    title: "AquaStar - To-Do List",
    heading: "To-Do List",
    description: "Track drops, shop items, and quest rewards to grab, per character.",
    serverTimeLabel: "Server Time",
    individualHiddenLabel: "Individual completed list per character",
    categoryDropLabel: "Drop",
    categoryDailyDropLabel: "Daily Drop",
    categoryShopMergeLabel: "Shop/Merge",
    categoryQuestRewardLabel: "Quest Reward",
    categoryHardFarmLabel: "Hard Farm",
    categoryReputationFarmLabel: "Reputation Farm",
    priorityToggleLabel: "Priority",
    priorityToggleTitle: "Toggle priority - priority tasks are listed first",
    seasonalToggleLabel: "Seasonal",
    seasonalSectionLabel: "Seasonal",
    nextFriday13Label: "Next Friday the 13th: ",
    thisMonthLabel: "This Month",
    monthNames: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ],
    seasonalEvents: {
        nulgathBirthday: {
            label: "Nulgath's Birthday (Jan)",
            short: "JAN"
        },
        carnival: {
            label: "Carnival / Lunar New Year (Feb)",
            short: "FEB"
        },
        dageBirthday: {
            label: "Dage's Birthday / Good Luck Day (Mar)",
            short: "MAR"
        },
        aprilFools: {
            label: "April Fools (Apr)",
            short: "APR"
        },
        mayThe4th: {
            label: "May the 4th (May)",
            short: "MAY"
        },
        starFestival: {
            label: "Star Festival / Summer (Jul)",
            short: "JUL"
        },
        kalaSeason: {
            label: "Back to School / Indonesian Day (Aug)",
            short: "AUG"
        },
        friday13: {
            label: "Friday the 13th",
            short: "F13"
        },
        pirateDay: {
            label: "Talk Like a Pirate Day / Independence (Sep)",
            short: "SEP"
        },
        anniversary: {
            label: "Mogloween / AQW Anniversary (Oct)",
            short: "OCT"
        },
        blackFriday: {
            label: "Black Friday (Nov)",
            short: "NOV"
        },
        frostval: {
            label: "Frostval / New Year (Dec)",
            short: "DEC"
        }
    },
    addCharacterTab: "+ Add Character",
    promptCharacterName: "Character name:",
    promptOkButton: "OK",
    promptCancelButton: "Cancel",
    baseCharacterPrompt: "Which character's completed list should become the new shared one?",
    confirmDeleteCharacter: "Remove this character and its progress on every task? This cannot be undone.",
    confirmDeleteTask: "Delete this task for every character? This cannot be undone.",
    noCharactersHint: "Add a character tab above to start tracking tasks.",
    taskNamePlaceholder: "Task name",
    wikiLinkPlaceholder: "Wiki link (optional)",
    joinCommandPlaceholder: "/join ... (optional)",
    copyButton: "Copy",
    copiedLabel: "Copied!",
    filterNamePlaceholder: "Filter by name...",
    filterAllLabel: "All",
    addTaskButton: "Add Task",
    wikiLinkButtonTitle: "Open wiki link",
    completeButton: "Complete",
    reopenButton: "Reopen",
    deleteButton: "Delete",
    completedToggleLabel: "Completed",
    dragHandleTitle: "Drag to reorder",
    renameTabTitle: "Rename",
    removeTabTitle: "Remove",
    savingLabel: "Saving...",
    savedLabel: "Saved"
};

exports.strategyMessages = {
    title: "AquaStar - Strategy",
    heading: "Strategy",
    description: "Plan team compositions, tactics and timed mechanics for Ultra and Challenge bosses.",
    addBoss: "Add Boss",
    manageClasses: "Classes",
    managePotions: "Potions",
    manageTimerTypes: "Timer Types",
    saved: "Saved",
    emptyBosses: "No bosses yet. Add one to begin planning.",
    emptyStrategies: "No strategies yet.",
    ultra: "Ultra Boss",
    challenge: "Challenge Boss",
    weekly: "Weekly",
    daily: "Daily",
    players: "players",
    zone: "Zone",
    noJoin: "No /join set",
    main: "Boss",
    left: "Left",
    right: "Right",
    open: "Open",
    edit: "Edit",
    delete: "Delete",
    deleteBossConfirm: "Delete this boss and all of its strategies?",
    deleteStrategyConfirm: "Delete this strategy?",
    bosses: "All Bosses",
    strategies: "Strategies",
    addStrategy: "Add Strategy",
    editStrategy: "Edit Strategy",
    team: "Team Composition",
    bossNotes: "Boss Details",
    strategyNotes: "Strategy Details",
    save: "Save",
    player: "Player",
    noClass: "No class selected",
    editBoss: "Edit Boss",
    name: "Name",
    join: "/Join command",
    reset: "Reset",
    kind: "Boss type",
    role: "Role",
    cancel: "Cancel",
    close: "Close",
    add: "Add",
    timers: "Timers",
    intro: "Intro (runs once)",
    loop: "Loop (repeats)",
    addTimer: "Add Timer",
    delay: "Delay (seconds)",
    timerType: "Effect",
    target: "Target",
    assignment: "Assignment",
    timerLabel: "Note",
    timerRunner: "Live Timer",
    startTimer: "Start Timer",
    stopTimer: "Stop Timer",
    timerIdle: "Ready — start the timer to run this strategy.",
    shortcut: "Global toggle shortcut (while this strategy is open)",
    shortcutError: "Shortcut unavailable",
    potionKind: "Potion category",
    tonic: "Tonic",
    elixir: "Elixir",
    potion: "Potion",
    timerRoles: "Timer Roles",
    timerRolesHelp: "Each role has its own first-action offset and repeat interval. The action happens when its bar reaches the end.",
    addRole: "Add role",
    showRoles: "Show roles",
    all: "All",
    none: "None",
    bestTonic: "Best tonic",
    bestElixir: "Best elixir",
    noPreference: "No preference",
    saveClass: "Save class",
    generalBossInfo: "General boss information",
    generalBossInfoHint: "Shown read-only in this boss strategies",
    consumables: "Consumables",
    consumablesFor: "Consumables for",
    noFavoriteConsumables: "No favorite tonic or elixir configured for this class.",
    noConsumablesInInventory: "None of this class consumables are in the synced inventory.",
    actionIn: "Action in",
    functionLabel: "Function",
    roles: {
        support: "Support",
        dps: "DPS",
        tank: "Tank",
        dot: "Damage over Time (DoT)"
    }
};

exports.inventoryMessages = {
    title: "AquaStar - Inventory",
    heading: "Inventory",
    description: "Browse your synced account.aq.com Inventory and BuyBack data, per character.",
    inventoryTabLabel: "Inventory",
    buyBackTabLabel: "Buy Back",
    syncButton: "Sync Now",
    syncingLabel: "Syncing...",
    syncedLabel: "Last synced: ",
    justNowLabel: "just now",
    neverSyncedLabel: "Never synced",
    syncErrorUnauthenticated: "Not logged in. Open the Account Page (Alt+A) and log in, then try again.",
    syncErrorNetwork: "Could not reach account.aq.com. Check your connection and try again.",
    filterNamePlaceholder: "Search items...",
    filterTypeAll: "All Types",
    filterAllLabel: "All",
    filterBankLabel: "Bank only",
    filterInventoryOnlyLabel: "Inventory only",
    filterMemberLabel: "Member only",
    filterNonMemberOnlyLabel: "Non-member only",
    filterAcLabel: "AC only",
    filterNonAcLabel: "Non-AC only",
    emptyStateLabel: "No items found. Try syncing or adjusting filters.",
    noCharactersLabel: "No characters synced yet. Log in via Alt+A, then Sync Now.",
    columnName: "Name",
    columnType: "Type",
    columnCount: "Count",
    columnBank: "Bank",
    columnAdded: "Added",
    columnCost: "Cost",
    columnRarity: "Rarity",
    columnInserted: "Sold",
    bankBadge: "Bank",
    inventoryBadge: "Inventory",
    memberBadge: "Member",
    acBadge: "AC",
    normalBadge: "Normal",
    filterLabels: "Labels",
    labelsSelected: "selected",
    labelFilterClear: "Clear",
    manageLabels: "Manage Labels",
    labelName: "Label name",
    addLabel: "Add",
    saveLabel: "Save",
    assignLabels: "Assign Labels",
    labelScopeCharacter: "This character",
    labelScopeGlobal: "All characters",
    labelScopeCharacterHint: "Only applies to the active character.",
    labelScopeGlobalHint: "Applies to the same item for every character.",
    assignLabelsHint: "The label scope is defined when it is created. Character labels are independent for each character; global labels always apply to everyone.",
    delete: "Delete",
    close: "Close",
    cancel: "Cancel",
    itemCountLabel: "{shown} of {total} items"
};

exports.wikiMessages = {
    mergeMaterialsTitle: "AquaStar: Shop materials",
    mergeDependencies: "Include dependencies",
    mergeBuyback: "Dependencies with Buy Back",
    mergeEmpty: "No materials listed.",
    mergeReputationLabel: "Reputation required:",
    mergeSelectAll: "Select all",
    mergeClearAll: "Clear all",
    mergeSelectItem: "Select item"
};
