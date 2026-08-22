// AQW reset calculations, kept DOM-free for deterministic tests around DST.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AquaStarResetTime = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function getPartsInTZ(date, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short'
    });
    const raw = {};
    fmt.formatToParts(date).forEach((part) => { raw[part.type] = part.value; });
    let hour = parseInt(raw.hour, 10);
    if (hour === 24) hour = 0;
    return {
      year: parseInt(raw.year, 10), month: parseInt(raw.month, 10), day: parseInt(raw.day, 10),
      hour: hour, minute: parseInt(raw.minute, 10), second: parseInt(raw.second, 10), weekday: raw.weekday
    };
  }

  function etOffsetMinutes(date) {
    const utc = getPartsInTZ(date, 'UTC');
    const et = getPartsInTZ(date, 'America/New_York');
    return (Date.UTC(et.year, et.month - 1, et.day, et.hour, et.minute, et.second) -
      Date.UTC(utc.year, utc.month - 1, utc.day, utc.hour, utc.minute, utc.second)) / 60000;
  }

  function etMidnightUtcMs(year, month, day) {
    const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
    return guess - etOffsetMinutes(new Date(guess)) * 60000;
  }

  function addCalendarDays(year, month, day, delta) {
    const date = new Date(Date.UTC(year, month - 1, day + delta));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function getPreviousDailyReset(now) {
    const p = getPartsInTZ(now, 'America/New_York');
    return new Date(etMidnightUtcMs(p.year, p.month, p.day));
  }
  function getNextDailyReset(now) {
    const p = getPartsInTZ(now, 'America/New_York');
    const next = addCalendarDays(p.year, p.month, p.day, 1);
    return new Date(etMidnightUtcMs(next.year, next.month, next.day));
  }
  function getPreviousWeeklyReset(now) {
    const p = getPartsInTZ(now, 'America/New_York');
    const daysSinceFriday = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) + 2) % 7;
    const prev = addCalendarDays(p.year, p.month, p.day, -daysSinceFriday);
    return new Date(etMidnightUtcMs(prev.year, prev.month, prev.day));
  }
  function getNextWeeklyReset(now) {
    const previous = getPreviousWeeklyReset(now);
    const p = getPartsInTZ(previous, 'America/New_York');
    const next = addCalendarDays(p.year, p.month, p.day, 7);
    return new Date(etMidnightUtcMs(next.year, next.month, next.day));
  }
  function getPreviousMonthlyReset(now) {
    const p = getPartsInTZ(now, 'America/New_York');
    return new Date(etMidnightUtcMs(p.year, p.month, 1));
  }
  function getNextMonthlyReset(now) {
    const p = getPartsInTZ(now, 'America/New_York');
    const month = p.month === 12 ? 1 : p.month + 1;
    const year = p.month === 12 ? p.year + 1 : p.year;
    return new Date(etMidnightUtcMs(year, month, 1));
  }
  const serverTimeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
  function formatServerTimeText(now) { return serverTimeFmt.format(now); }
  function formatTimeRemaining(milliseconds) {
    if (milliseconds <= 0) return '0m';
    const totalMinutes = Math.ceil(milliseconds / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return days + 'd ' + hours + 'h';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  }
  function getNextFriday13Text(now, messages) {
    const p = getPartsInTZ(now, 'America/New_York');
    for (let i = 0; i < 24; i++) {
      const year = p.year + Math.floor((p.month - 1 + i) / 12);
      const month = ((p.month - 1 + i) % 12) + 1;
      if (getPartsInTZ(new Date(etMidnightUtcMs(year, month, 13)), 'America/New_York').weekday === 'Fri') {
        return i === 0 ? messages.thisMonthLabel : messages.monthNames[month - 1];
      }
    }
    return '';
  }
  return {
    getPartsInTZ: getPartsInTZ, etMidnightUtcMs: etMidnightUtcMs, addCalendarDays: addCalendarDays,
    getPreviousDailyReset: getPreviousDailyReset, getNextDailyReset: getNextDailyReset,
    getPreviousWeeklyReset: getPreviousWeeklyReset, getNextWeeklyReset: getNextWeeklyReset,
    getPreviousMonthlyReset: getPreviousMonthlyReset, getNextMonthlyReset: getNextMonthlyReset,
    formatServerTimeText: formatServerTimeText, formatTimeRemaining: formatTimeRemaining,
    getNextFriday13Text: getNextFriday13Text
  };
});
