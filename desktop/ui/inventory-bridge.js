const { invoke } = window.__TAURI__.core;
window.aquastarInventory = {
  getInventory: () => invoke('get_inventory'),
  saveLabels: (labels) => invoke('save_inventory_labels', { labels }),
  getMessages: () => invoke('get_inventory_messages'),
  syncNow: () => invoke('sync_inventory_now'),
  setActiveChar: (charId) => invoke('set_inventory_active_char', { char_id: charId }),
  openItemWiki: (itemName) => invoke('open_inventory_item_wiki', { item_name: itemName })
};
window.aquastarWiki = {
  fetchWikiPage: (url) => invoke('fetch_wiki_page', { url }),
  matchWikiItems: (titles) => invoke('match_wiki_items', { titles })
};
