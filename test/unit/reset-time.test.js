const assert = require('assert');
const time = require('../../res/core/reset-time.js');

test('daily reset remains midnight in New York across daylight saving time', () => {
  const beforeDst = new Date('2026-03-08T16:00:00.000Z');
  const next = time.getNextDailyReset(beforeDst);
  assert.deepStrictEqual(time.getPartsInTZ(next, 'America/New_York'), {
    year: 2026,
    month: 3,
    day: 9,
    hour: 0,
    minute: 0,
    second: 0,
    weekday: 'Mon'
  });
});

test('weekly reset resolves to the following Friday midnight', () => {
  const now = new Date('2026-08-20T18:00:00.000Z');
  const next = time.getNextWeeklyReset(now);
  const parts = time.getPartsInTZ(next, 'America/New_York');
  assert.strictEqual(parts.weekday, 'Fri');
  assert.strictEqual(parts.hour, 0);
  assert.strictEqual(parts.minute, 0);
});

test('time formatting preserves the established compact labels', () => {
  assert.strictEqual(time.formatTimeRemaining(0), '0m');
  assert.strictEqual(time.formatTimeRemaining(61 * 60000), '1h 1m');
  assert.strictEqual(time.formatTimeRemaining(25 * 60 * 60000), '1d 1h');
});

test('createResetTime can anchor weekly resets on a different weekday', () => {
  const mondayResets = time.createResetTime({ weeklyResetWeekday: 'Mon' });
  const now = new Date('2026-08-20T18:00:00.000Z'); // Thursday afternoon ET
  const next = mondayResets.getNextWeeklyReset(now);
  const parts = mondayResets.getPartsInTZ(next, 'America/New_York');
  assert.strictEqual(parts.weekday, 'Mon');
  assert.strictEqual(parts.hour, 0);
  assert.strictEqual(parts.minute, 0);
  assert.strictEqual(parts.day, 24);
  // Default export remains Friday-anchored.
  const defaultNext = time.getNextWeeklyReset(now);
  assert.strictEqual(time.getPartsInTZ(defaultNext, 'America/New_York').weekday, 'Fri');
});

test('createResetTime uses the configured time zone for daily midnight', () => {
  const la = time.createResetTime({ timeZone: 'America/Los_Angeles' });
  const beforeMidnightPt = new Date('2026-03-10T06:30:00.000Z'); // 11:30pm PDT previous calendar day
  const next = la.getNextDailyReset(beforeMidnightPt);
  assert.deepStrictEqual(la.getPartsInTZ(next, 'America/Los_Angeles'), {
    year: 2026,
    month: 3,
    day: 10,
    hour: 0,
    minute: 0,
    second: 0,
    weekday: 'Tue'
  });
});
