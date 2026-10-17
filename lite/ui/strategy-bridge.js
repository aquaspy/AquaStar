const { invoke } = window.__TAURI__.core;
const timerToggles = [];
window.__aquastarTimerToggle = () => {
  timerToggles.forEach((callback) => callback());
};
window.aquastarStrategy = {
  get: () => invoke('get_strategy'),
  messages: () => invoke('get_strategy_messages'),
  save: (data) => invoke('save_strategy', { data }),
  getInventoryCounts: (names) => invoke('get_inventory_item_counts', { names }),
  setTimerShortcut: (key) => invoke('set_strategy_timer_shortcut', { key }),
  clearTimerShortcut: () => invoke('clear_strategy_timer_shortcut'),
  onTimerToggle: (callback) => { timerToggles.push(callback); }
};
