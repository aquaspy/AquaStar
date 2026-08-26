const assert = require('assert');
const storageApi = require('../../web/shared/storage.js');

function memoryStorage() {
    const values = {};
    return {
        getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
        setItem: (key, value) => { values[key] = String(value); },
        removeItem: (key) => { delete values[key]; }
    };
}

test('web storage keeps independent versioned feature data and supports backups', () => {
    const store = storageApi.create(memoryStorage());
    assert.deepStrictEqual(store.read(), storageApi.defaultState());
    store.set('todo', { characters: [{ id: 'dstar' }], tasks: [] });
    assert.deepStrictEqual(store.get('todo'), { characters: [{ id: 'dstar' }], tasks: [] });
    const exported = store.exportBackup();
    const other = storageApi.create(memoryStorage());
    other.importBackup(exported);
    assert.deepStrictEqual(other.get('todo'), { characters: [{ id: 'dstar' }], tasks: [] });
    assert.throws(() => other.importBackup('{"version":999}'), /não é compatível/);
});
