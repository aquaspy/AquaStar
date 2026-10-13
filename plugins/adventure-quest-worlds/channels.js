// Main-process IPC channels this plugin registers under their unprefixed (legacy) names
// (manifest "unprefixedIpc"). They must register exactly once. Channels that exist only in
// the Char Page Studio helper process are intentionally not listed: that process runs its
// own Electron main.

module.exports = {
    AQW_FEATURE_CHANNELS: [
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
    ]
};
