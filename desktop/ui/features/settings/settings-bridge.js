const { invoke } = window.__TAURI__.core;
const platform = /Mac/i.test(navigator.userAgent) ? 'darwin' : 'linux';
window.aquastarSettings = {
  platform,
  getKeybindings: () => invoke('get_keybindings'),
  getMessages: () => invoke('get_settings_messages'),
  saveKeybindings: (binds) => invoke('save_keybindings', { binds }),
  updateRuffle: (channel) => invoke('update_ruffle', { channel }),
  getRuffleStatus: () => invoke('get_ruffle_status'),
  restoreBundledRuffle: () => invoke('restore_bundled_ruffle'),
  restartApp: () => invoke('restart_app'),
  getCustomSwfStatus: () => invoke('get_custom_swf_status'),
  chooseCustomSwf: () => invoke('choose_custom_swf'),
  removeCustomSwf: () => invoke('remove_custom_swf'),
  getPluginList: (opts) => invoke('get_plugin_list', { opts: opts || {} }),
  getPluginSettings: () => invoke('get_plugin_settings'),
  getSettingsLayout: () => invoke('get_settings_layout')
};
