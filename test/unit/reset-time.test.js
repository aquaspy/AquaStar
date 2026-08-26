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
