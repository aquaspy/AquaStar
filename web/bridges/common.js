(function (root) {
  const source = new URL('../', document.currentScript.src);
  const supported = { pt: 'pt-BR', en: 'en-US' };
  function language() {
    const selected = localStorage.getItem('aquastar-language');
    if (selected === 'pt' || selected === 'en') return supported[selected];
    const candidates = root.navigator.languages || [root.navigator.language || 'en-US'];
    return candidates.some((value) => /^pt(?:-|$)/i.test(value)) ? 'pt-BR' : 'en-US';
  }
  async function messages(name) {
    const data = await fetch(new URL('locale/' + language() + '.json', source)).then((r) => r.json());
    return data[name];
  }
  function copy(text) {
    return navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.resolve();
  }
  function read(key) {
    try {
      const value = localStorage.getItem('aquastar-tools.' + key);
      return value ? JSON.parse(value) : null;
    } catch (_) {
      return null;
    }
  }
  function save(key, value) {
    localStorage.setItem('aquastar-tools.' + key, JSON.stringify(value));
    return Promise.resolve({ data: value });
  }
  function defaults(name) {
    return fetch(new URL('defaults/' + name + '.json', source)).then((r) => {
      if (!r.ok) throw new Error('Defaults indisponíveis.');
      return r.json();
    });
  }
  root.AquaStarWebBridge = { messages, copy, read, save, defaults, language };
})(window);
