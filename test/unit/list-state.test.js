const assert = require('assert');
const state = require('../../res/core/list-state.js');

test('list state keeps shared and per-character hidden state isolated', () => {
  const item = { hiddenBy: {} };
  state.setItemHidden(item, true, false, 'char-a');
  assert.strictEqual(state.isItemHidden(item, false, 'char-b'), true);
  assert.strictEqual(state.isItemHidden(item, true, 'char-a'), false);
  state.setItemHidden(item, true, true, 'char-a');
  assert.strictEqual(state.isItemHidden(item, true, 'char-a'), true);
  assert.strictEqual(state.isItemHidden(item, true, 'char-b'), false);
});

test('list state reorders only inside the requested section', () => {
  const items = [
    { id: 'a', section: 'main' },
    { id: 'b', section: 'seasonal' },
    { id: 'c', section: 'main' },
    { id: 'd', section: 'seasonal' }
  ];
  const reordered = state.reorderInSection(items, 'c', 'a', (item) => item.section);
  assert.deepStrictEqual(
    reordered.map((item) => item.id),
    ['c', 'b', 'a', 'd']
  );
  assert.strictEqual(
    state.reorderInSection(items, 'c', 'b', (item) => item.section),
    items
  );
});

test('list state removes a character from shared item maps', () => {
  const characters = [{ id: 'a' }, { id: 'b' }];
  const items = [{ hiddenBy: { a: true, b: true }, done: { a: 1, b: 2 } }];
  const remaining = state.removeCharacter(characters, items, 'a', (item, id) => delete item.done[id]);
  assert.deepStrictEqual(remaining, [{ id: 'b' }]);
  assert.deepStrictEqual(items[0].hiddenBy, { b: true });
  assert.deepStrictEqual(items[0].done, { b: 2 });
});
