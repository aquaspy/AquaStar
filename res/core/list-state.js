// Shared list-domain helpers.  This UMD module deliberately has no Electron or
// DOM dependency so both the main process and feature renderers can test it.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AquaStarListState = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SEASONAL_EVENT_KEYS = [
    'nulgathBirthday', 'carnival', 'dageBirthday', 'aprilFools', 'mayThe4th', 'starFestival',
    'kalaSeason', 'friday13', 'pirateDay', 'anniversary', 'blackFriday', 'frostval'
  ];
  const SHARED_HIDDEN_KEY = '__shared__';

  function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function isSeasonal(item) {
    return !!item && item.seasonal === true && SEASONAL_EVENT_KEYS.indexOf(item.seasonalEvent) !== -1;
  }

  function isItemHidden(item, individualMode, activeCharId) {
    if (!item || !item.hiddenBy || typeof item.hiddenBy !== 'object') return false;
    const key = individualMode ? activeCharId : SHARED_HIDDEN_KEY;
    return !!(key && item.hiddenBy[key]);
  }

  function setItemHidden(item, value, individualMode, activeCharId) {
    if (!item) return;
    if (!item.hiddenBy || typeof item.hiddenBy !== 'object') item.hiddenBy = {};
    const key = individualMode ? activeCharId : SHARED_HIDDEN_KEY;
    if (!key) return;
    if (value) item.hiddenBy[key] = true;
    else delete item.hiddenBy[key];
  }

  function reorderInSection(items, draggedId, targetId, sectionOfFn) {
    if (!Array.isArray(items) || draggedId === targetId) return items;
    const draggedItem = items.find((item) => item && item.id === draggedId);
    const targetItem = items.find((item) => item && item.id === targetId);
    if (!draggedItem || !targetItem) return items;
    const section = sectionOfFn(draggedItem);
    if (section !== sectionOfFn(targetItem)) return items;
    const group = items.filter((item) => sectionOfFn(item) === section);
    const fromIndex = group.findIndex((item) => item.id === draggedId);
    const targetIndex = group.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return items;
    const moved = group.splice(fromIndex, 1)[0];
    group.splice(targetIndex, 0, moved);
    let cursor = 0;
    return items.map((item) => sectionOfFn(item) === section ? group[cursor++] : item);
  }

  function removeCharacter(characters, items, characterId, cleanupItem) {
    const remaining = (Array.isArray(characters) ? characters : []).filter((character) => character.id !== characterId);
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item && item.hiddenBy) delete item.hiddenBy[characterId];
      if (cleanupItem) cleanupItem(item, characterId);
    });
    return remaining;
  }

  return {
    SEASONAL_EVENT_KEYS: SEASONAL_EVENT_KEYS,
    SHARED_HIDDEN_KEY: SHARED_HIDDEN_KEY,
    genId: genId,
    isSeasonal: isSeasonal,
    isItemHidden: isItemHidden,
    setItemHidden: setItemHidden,
    reorderInSection: reorderInSection,
    removeCharacter: removeCharacter
  };
});
