(function (root) {
  const source = new URL('../', document.currentScript.src);
  async function messages(name) {
    const data = await fetch(new URL('locale/pt-BR.json', source)).then((r) => r.json());
    return data[name];
  }
  function copy(text) { return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.resolve(); }
  function read(key) { try { const value = localStorage.getItem('aquastar-tools.' + key); return value ? JSON.parse(value) : null; } catch (_) { return null; } }
  function save(key, value) { localStorage.setItem('aquastar-tools.' + key, JSON.stringify(value)); return Promise.resolve({ data: value }); }
  function defaults(name) { return fetch(new URL('defaults/' + name + '.json', source)).then((r) => { if (!r.ok) throw new Error('Defaults indisponíveis.'); return r.json(); }); }
  root.AquaStarWebBridge = { messages, copy, read, save, defaults };
})(window);
