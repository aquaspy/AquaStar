const { invoke } = window.__TAURI__.core;
window.aquastarReminders = {
  getReminders: () => invoke('get_reminders'),
  getMessages: () => invoke('get_reminders_messages'),
  saveReminders: (state) => invoke('save_reminders', { state }),
  copyText: (text) => navigator.clipboard.writeText(typeof text === 'string' ? text : '')
};
