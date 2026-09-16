// Main-process legacy IPC channels that must register exactly once (PR 2).
// Studio helper-process channels are intentionally excluded.

const PLATFORM_CHANNELS = [
    'saveDialog',
    'saveRecording',
    'getDesktopCapturerSourceForWindow',
    'getKeybindings',
    'saveKeybindings',
    'getRecordingFormat',
    'getSettingsMessages',
    'updateRuffle',
    'getRuffleStatus',
    'restoreBundledRuffle',
    'restartApp',
    'getCustomSwfStatus',
    'chooseCustomSwf',
    'removeCustomSwf'
];

const AQW_FEATURE_CHANNELS = [
    'fetchWikiPage',
    'getReminders',
    'getRemindersMessages',
    'saveReminders',
    'remindersCopyText',
    'getTodo',
    'getTodoMessages',
    'saveTodo',
    'todoOpenLink',
    'todoCopyText',
    'getStrategy',
    'getStrategyMessages',
    'saveStrategy',
    'setStrategyTimerShortcut',
    'clearStrategyTimerShortcut',
    'getInventory',
    'saveInventoryLabels',
    'getInventoryMessages',
    'getWikiMessages',
    'syncInventoryNow',
    'setInventoryActiveChar',
    'matchWikiItem',
    'matchWikiItems',
    'getInventoryItemCounts',
    'openInventoryItemWiki',
    'charpage-studio-defaults',
    'charpage-studio-load-character',
    'charpage-studio-capture',
    'charpage-studio-runtime-status',
    'charpage-studio-open-devtools'
];

module.exports = {
    PLATFORM_CHANNELS: PLATFORM_CHANNELS,
    AQW_FEATURE_CHANNELS: AQW_FEATURE_CHANNELS,
    ALL_MAIN_PROCESS_CHANNELS: PLATFORM_CHANNELS.concat(AQW_FEATURE_CHANNELS)
};
