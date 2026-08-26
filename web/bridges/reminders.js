(function (root) {
  const b = root.AquaStarWebBridge;
  root.aquastarReminders = {
    getMessages: () => b.messages('remindersMessages'),
    getReminders: async () => {
      let data = b.read('reminders');
      if (!data) { const raw = await b.defaults('reminders'); data = { characters: [], quests: raw.quests.map((q, i) => Object.assign({}, q, { id: 'q_' + Date.now().toString(36) + '_' + i, done: {}, hiddenBy: {} })), showCompleted: true, showMemberDailies: true, individualHiddenMode: false }; await b.save('reminders', data); }
      return { data };
    },
    saveReminders: (data) => b.save('reminders', data), copyText: b.copy
  };
})(window);
