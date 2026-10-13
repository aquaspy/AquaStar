(function (root) {
  const b = root.AquaStarWebBridge;
  let toggle = null;
  root.aquastarStrategy = {
    messages: () => b.messages('strategyMessages'),
    get: async () => {
      let data = b.read('strategy');
      if (!data) {
        data = await b.defaults('strategy');
        await b.save('strategy', data);
      }
      return { data };
    },
    save: (data) => b.save('strategy', data),
    getInventoryCounts: async () => ({}),
    setTimerShortcut: async () => ({ ok: true }),
    clearTimerShortcut: () => {},
    onTimerToggle: (callback) => {
      toggle = callback;
    }
  };
  root.addEventListener('keydown', (event) => {
    if (toggle && event.altKey && event.shiftKey && event.key.toLowerCase() === 'u') {
      event.preventDefault();
      toggle();
    }
  });
})(window);
