// Shared logic for AquaStar's per-character list windows (Reminders, To-Do...): AE server
// time / reset-date math (DST-aware, America/New_York), the seasonal-event tag system, the
// per-character "hidden" map (shared vs individual toggle), drag-reorder-within-a-section,
// and the two hand-rolled modals every one of these windows needs (window.prompt() isn't
// implemented under Electron - see the note below). Loaded as a plain <script> tag (no
// bundler/module system in this app), so it hangs everything off window.ListWindowCommon.
//
// Any page using the modal helpers must include the same #promptOverlay/#baseCharOverlay
// markup as reminders.html - the ids are hardcoded here rather than passed in, since this
// library is scoped to these list windows specifically, not meant as a fully generic modal kit.
(function () {
  'use strict';

  function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // --- Reset-time math (America/New_York, DST-aware). No external libraries -
  // Intl.DateTimeFormat already handles EST/EDT transitions given the IANA name. ---

  function _getPartsInTZ(date, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'short'
    });
    const raw = {};
    fmt.formatToParts(date).forEach((p) => { if (p.type !== 'literal') raw[p.type] = p.value; });
    let hour = parseInt(raw.hour, 10);
    if (hour === 24) hour = 0; // Chromium/ICU quirk: hour12:false can render midnight as "24"
    return {
      year: parseInt(raw.year, 10), month: parseInt(raw.month, 10), day: parseInt(raw.day, 10),
      hour: hour, minute: parseInt(raw.minute, 10), second: parseInt(raw.second, 10),
      weekday: raw.weekday // "Mon".."Sun"
    };
  }

  function _etOffsetMinutes(date) {
    const utc = _getPartsInTZ(date, 'UTC');
    const et  = _getPartsInTZ(date, 'America/New_York');
    const utcAsEpoch = Date.UTC(utc.year, utc.month - 1, utc.day, utc.hour, utc.minute, utc.second);
    const etAsEpoch  = Date.UTC(et.year,  et.month  - 1, et.day,  et.hour,  et.minute,  et.second);
    return (etAsEpoch - utcAsEpoch) / 60000; // -300 EST / -240 EDT
  }

  // Precise UTC epoch-ms of "America/New_York Y-M-D 00:00:00". US DST transitions always
  // land at 2am local, never at midnight, so every calendar day has exactly one well-defined
  // local-midnight instant - sampling the offset at the naive UTC-interpreted guess is safe.
  function _etMidnightUtcMs(year, month, day) {
    const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
    const offsetMin = _etOffsetMinutes(new Date(guess));
    return guess - offsetMin * 60000;
  }

  function _addCalendarDays(year, month, day, delta) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function getPreviousDailyReset(now) {
    const p = _getPartsInTZ(now, 'America/New_York');
    return new Date(_etMidnightUtcMs(p.year, p.month, p.day));
  }

  function getNextDailyReset(now) {
    const prev = getPreviousDailyReset(now);
    const p = _getPartsInTZ(prev, 'America/New_York');
    const nextCal = _addCalendarDays(p.year, p.month, p.day, 1);
    return new Date(_etMidnightUtcMs(nextCal.year, nextCal.month, nextCal.day));
  }

  // Weekly reset = the Thursday -> Friday midnight transition, America/New_York local time.
  function getPreviousWeeklyReset(now) {
    let resetDate = getPreviousDailyReset(now);
    let p = _getPartsInTZ(resetDate, 'America/New_York');
    while (p.weekday !== 'Fri') {
      const prevCal = _addCalendarDays(p.year, p.month, p.day, -1);
      resetDate = new Date(_etMidnightUtcMs(prevCal.year, prevCal.month, prevCal.day));
      p = _getPartsInTZ(resetDate, 'America/New_York');
    }
    return resetDate;
  }

  function getNextWeeklyReset(now) {
    let resetDate = getNextDailyReset(now);
    let p = _getPartsInTZ(resetDate, 'America/New_York');
    while (p.weekday !== 'Fri') {
      const nextCal = _addCalendarDays(p.year, p.month, p.day, 1);
      resetDate = new Date(_etMidnightUtcMs(nextCal.year, nextCal.month, nextCal.day));
      p = _getPartsInTZ(resetDate, 'America/New_York');
    }
    return resetDate;
  }

  // Monthly reset = ET midnight on the 1st of the calendar month, America/New_York local time.
  function getPreviousMonthlyReset(now) {
    const p = _getPartsInTZ(now, 'America/New_York');
    return new Date(_etMidnightUtcMs(p.year, p.month, 1));
  }

  function getNextMonthlyReset(now) {
    const p = _getPartsInTZ(now, 'America/New_York');
    const nextMonth = p.month === 12 ? 1 : p.month + 1;
    const nextYear = p.month === 12 ? p.year + 1 : p.year;
    return new Date(_etMidnightUtcMs(nextYear, nextMonth, 1));
  }

  const _serverTimeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  function formatServerTimeText(now) {
    return _serverTimeFmt.format(now);
  }

  function formatTimeRemaining(msRemaining) {
    if (msRemaining <= 0) return '0m';
    const totalMinutes = Math.ceil(msRemaining / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  }

  // "Next Friday the 13th" shown near Server Time - deliberately does NOT check whether
  // the 13th has already passed this month, per design: if the current calendar month
  // contains a Friday the 13th at all, it counts as "This Month".
  function getNextFriday13Text(now, messages) {
    const p = _getPartsInTZ(now, 'America/New_York');
    for (let i = 0; i < 24; i++) {
      const y = p.year + Math.floor((p.month - 1 + i) / 12);
      const m = ((p.month - 1 + i) % 12) + 1;
      const weekday = _getPartsInTZ(new Date(_etMidnightUtcMs(y, m, 13)), 'America/New_York').weekday;
      if (weekday === 'Fri') {
        return i === 0 ? messages.thisMonthLabel : messages.monthNames[m - 1];
      }
    }
    return '';
  }

  // Seasonal is a separate, orthogonal tag from whatever category system a page uses - an
  // item can be both (e.g. a seasonal ultra boss) or seasonal on its own. Shared verbatim
  // across every list window so seasonal event keys/labels never drift between them.
  const SEASONAL_EVENT_KEYS = [
    'nulgathBirthday', 'carnival', 'dageBirthday', 'aprilFools', 'mayThe4th', 'starFestival',
    'kalaSeason', 'friday13', 'pirateDay', 'anniversary', 'blackFriday', 'frostval'
  ];
  function isSeasonal(item) {
    return !!item.seasonal && SEASONAL_EVENT_KEYS.indexOf(item.seasonalEvent) !== -1;
  }

  // --- Per-character "hidden" map ---
  // Same shape everywhere it's used: a map keyed by character id, plus a SHARED_HIDDEN_KEY
  // entry for the shared (non-individual) mode. Callers decide what "hidden" means for their
  // own item (Reminders: archived; To-Do: completed) - this only manages the map itself.
  const SHARED_HIDDEN_KEY = '__shared__';
  function isItemHidden(item, individualMode, activeCharId) {
    if (!item.hiddenBy) return false;
    const key = individualMode ? activeCharId : SHARED_HIDDEN_KEY;
    return !!item.hiddenBy[key];
  }
  function setItemHidden(item, value, individualMode, activeCharId) {
    if (!item.hiddenBy) item.hiddenBy = {};
    const key = individualMode ? activeCharId : SHARED_HIDDEN_KEY;
    if (value) item.hiddenBy[key] = true;
    else delete item.hiddenBy[key];
  }

  // Reorders within whichever section (as classified by sectionOfFn) the dragged item
  // belongs to - dragging across sections is a no-op since each renders as its own list.
  // Items outside that section keep their original relative position. Returns a new array;
  // does not mutate `items`.
  function reorderInSection(items, draggedId, targetId, sectionOfFn) {
    if (draggedId === targetId) return items;
    const draggedItem = items.find((it) => it.id === draggedId);
    const targetItem = items.find((it) => it.id === targetId);
    if (!draggedItem || !targetItem) return items;
    const section = sectionOfFn(draggedItem);
    if (sectionOfFn(targetItem) !== section) return items;

    const group = items.filter((it) => sectionOfFn(it) === section);
    const fromIdx = group.findIndex((it) => it.id === draggedId);
    const toIdx = group.findIndex((it) => it.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return items;
    const [moved] = group.splice(fromIdx, 1);
    group.splice(toIdx, 0, moved);

    let cursor = 0;
    return items.map((it) => (sectionOfFn(it) === section ? group[cursor++] : it));
  }

  // --- Modals ---
  // Electron doesn't implement window.prompt() - it resolves to null instantly with no
  // dialog shown (window.alert/confirm map to native dialogs and DO work; prompt doesn't
  // have a native equivalent and Electron never shimmed it). This hand-rolled modal
  // replaces every text-entry prompt in these windows. Requires the page to include the
  // #promptOverlay markup from reminders.html verbatim.
  function showPromptModal(messages, labelText, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('promptOverlay');
      const labelEl = document.getElementById('promptLabel');
      const inputEl = document.getElementById('promptInput');
      const okBtn = document.getElementById('promptOkBtn');
      const cancelBtn = document.getElementById('promptCancelBtn');

      labelEl.textContent = labelText;
      inputEl.value = defaultValue || '';
      okBtn.textContent = messages.promptOkButton;
      cancelBtn.textContent = messages.promptCancelButton;
      overlay.classList.add('open');
      inputEl.focus();
      inputEl.select();

      function cleanup(result) {
        overlay.classList.remove('open');
        inputEl.removeEventListener('keydown', onKeyDown);
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      }
      function onKeyDown(e) {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(inputEl.value); }
        else if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
      }
      inputEl.addEventListener('keydown', onKeyDown);
      okBtn.onclick = () => cleanup(inputEl.value);
      cancelBtn.onclick = () => cleanup(null);
    });
  }

  // Used when switching a list from individual back to shared mode - the user picks which
  // character's list becomes the new shared one. Requires the #baseCharOverlay markup.
  function showChoiceModal(messages, labelText, options) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('baseCharOverlay');
      const labelEl = document.getElementById('baseCharLabel');
      const selectEl = document.getElementById('baseCharSelect');
      const okBtn = document.getElementById('baseCharOkBtn');
      const cancelBtn = document.getElementById('baseCharCancelBtn');

      labelEl.textContent = labelText;
      selectEl.innerHTML = '';
      options.forEach((opt) => {
        const optEl = document.createElement('option');
        optEl.value = opt.id;
        optEl.textContent = opt.label;
        selectEl.appendChild(optEl);
      });
      okBtn.textContent = messages.promptOkButton;
      cancelBtn.textContent = messages.promptCancelButton;
      overlay.classList.add('open');

      function cleanup(result) {
        overlay.classList.remove('open');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      }
      okBtn.onclick = () => cleanup(selectEl.value);
      cancelBtn.onclick = () => cleanup(null);
    });
  }

  window.ListWindowCommon = {
    genId: genId,
    getPartsInTZ: _getPartsInTZ,
    etMidnightUtcMs: _etMidnightUtcMs,
    addCalendarDays: _addCalendarDays,
    getPreviousDailyReset: getPreviousDailyReset,
    getNextDailyReset: getNextDailyReset,
    getPreviousWeeklyReset: getPreviousWeeklyReset,
    getNextWeeklyReset: getNextWeeklyReset,
    getPreviousMonthlyReset: getPreviousMonthlyReset,
    getNextMonthlyReset: getNextMonthlyReset,
    formatServerTimeText: formatServerTimeText,
    formatTimeRemaining: formatTimeRemaining,
    getNextFriday13Text: getNextFriday13Text,
    SEASONAL_EVENT_KEYS: SEASONAL_EVENT_KEYS,
    isSeasonal: isSeasonal,
    SHARED_HIDDEN_KEY: SHARED_HIDDEN_KEY,
    isItemHidden: isItemHidden,
    setItemHidden: setItemHidden,
    reorderInSection: reorderInSection,
    showPromptModal: showPromptModal,
    showChoiceModal: showChoiceModal
  };
})();
