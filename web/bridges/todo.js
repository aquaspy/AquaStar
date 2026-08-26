(function (root) {
  const b = root.AquaStarWebBridge;
  root.aquastarTodo = {
    getMessages: () => b.messages('todoMessages'),
    getTodo: async () => ({ data: b.read('todo') || { characters: [], tasks: [], individualHiddenMode: false } }),
    saveTodo: (data) => b.save('todo', data),
    copyText: b.copy,
    openLink: (url) => {
      if (/^https?:\/\//i.test(url)) root.open(url, '_blank', 'noopener');
    }
  };
})(window);
