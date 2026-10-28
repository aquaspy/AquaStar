// Main-process IPC channels owned by the platform. They must register exactly once.
// A plugin lists its own unprefixed channels beside its code (see its channels.js).

const PLATFORM_CHANNELS = [
    'saveDialog',
    'saveRecording',
    'getKeybindings',
    'saveKeybindings',
    'prepareRecordingCapture',
    'recordingMimeCandidates',
    'chooseRecordingFormat',
    'recordingFileName',
    'getSettingsMessages',
    'updateRuffle',
    'getRuffleStatus',
    'restoreBundledRuffle',
    'restartApp',
    'getCustomSwfStatus',
    'chooseCustomSwf',
    'removeCustomSwf',
    'getPluginList',
    'getPluginSettings'
];

module.exports = {
    PLATFORM_CHANNELS: PLATFORM_CHANNELS,
    ALL_MAIN_PROCESS_CHANNELS: PLATFORM_CHANNELS.slice()
};
