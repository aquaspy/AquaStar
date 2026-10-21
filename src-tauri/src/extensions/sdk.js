(() => {
  'use strict';
  const invoke = (method, args = {}) =>
    window.__TAURI_INTERNALS__.invoke('extension_invoke', { method, args });
  const api = Object.freeze({
    storage: Object.freeze({
      get: key => invoke('storage.get', { key }),
      set: (key, value) => invoke('storage.set', { key, value }),
      remove: key => invoke('storage.remove', { key })
    }),
    net: Object.freeze({ fetch: options => invoke('net.fetch', options) }),
    actions: Object.freeze({ run: actionId => invoke('actions.run', { actionId }) }),
    host: Object.freeze({ info: () => invoke('host.info') })
  });
  Object.defineProperty(window, 'aquastar', { value: api, writable: false, configurable: false });
})();
