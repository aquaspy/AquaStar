// Browser-only persistence for AquaStar Tools.  The UMD wrapper deliberately
// also supports Node so the schema and backup behavior can be regression-tested
// without a browser or Electron.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AquaStarWebStorage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STORAGE_KEY = 'aquastar-tools.web-state';
  const SCHEMA_VERSION = 1;
  const COLLECTIONS = ['reminders', 'todo', 'strategy'];

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      reminders: null,
      todo: null,
      strategy: null
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalise(raw) {
    const state = defaultState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
    if (raw.version !== SCHEMA_VERSION) return state;
    COLLECTIONS.forEach(function (name) {
      if (raw[name] !== undefined) state[name] = clone(raw[name]);
    });
    return state;
  }

  function create(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('Armazenamento local indisponível.');
    }

    function read() {
      const value = storage.getItem(STORAGE_KEY);
      if (!value) return defaultState();
      try {
        return normalise(JSON.parse(value));
      } catch (_) {
        return defaultState();
      }
    }

    function write(state) {
      const clean = normalise(state);
      storage.setItem(STORAGE_KEY, JSON.stringify(clean));
      return clean;
    }

    return {
      read: read,
      get: function (collection) {
        if (COLLECTIONS.indexOf(collection) === -1) throw new Error('Coleção desconhecida.');
        return clone(read()[collection]);
      },
      set: function (collection, value) {
        if (COLLECTIONS.indexOf(collection) === -1) throw new Error('Coleção desconhecida.');
        const state = read();
        state[collection] = clone(value);
        write(state);
        return clone(state[collection]);
      },
      exportBackup: function () {
        return JSON.stringify(read(), null, 2);
      },
      importBackup: function (text) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          throw new Error('O arquivo não contém um JSON válido.');
        }
        if (!parsed || parsed.version !== SCHEMA_VERSION) {
          throw new Error('O backup não é compatível com esta versão do AquaStar Tools.');
        }
        return write(parsed);
      },
      clear: function () {
        storage.removeItem(STORAGE_KEY);
      }
    };
  }

  return { STORAGE_KEY: STORAGE_KEY, SCHEMA_VERSION: SCHEMA_VERSION, COLLECTIONS: COLLECTIONS, defaultState: defaultState, normalise: normalise, create: create };
});
