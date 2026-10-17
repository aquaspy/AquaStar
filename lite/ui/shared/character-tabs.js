(function (root) {
  const workspace = root.AquaStarWorkspace = root.AquaStarWorkspace || {};
  workspace.createCharacterTabs = function (options) {
    const tabs = options.tabsElement;
    function changed() { options.onChanged(); render(); }
    async function add() {
      const name = await options.prompt(options.messages.promptCharacterName, '');
      if (name === null || !name.trim()) return;
      const character = { id: options.genId('c'), name: name.trim() };
      options.characters().push(character); options.setActiveId(character.id); changed();
    }
    async function rename(character) {
      const name = await options.prompt(options.messages.promptCharacterName, character.name);
      if (name === null || !name.trim()) return;
      character.name = name.trim(); changed();
    }
    function remove(character) {
      if (!window.confirm(options.messages.confirmDeleteCharacter)) return;
      options.beforeRemove(character);
      const characters = options.characters();
      const index = characters.indexOf(character);
      if (index !== -1) characters.splice(index, 1);
      if (options.activeId() === character.id) options.setActiveId(characters.length ? characters[0].id : null);
      changed();
    }
    function render() {
      tabs.innerHTML = '';
      options.characters().forEach((character) => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (character.id === options.activeId() ? ' active' : '');
        tab.onclick = () => { options.setActiveId(character.id); options.onActiveChanged(); render(); };
        const name = document.createElement('span'); name.textContent = character.name;
        const renameBtn = document.createElement('span'); renameBtn.className = 'tabBtn'; renameBtn.title = options.messages.renameTabTitle; renameBtn.textContent = '✎';
        renameBtn.onclick = (event) => { event.stopPropagation(); rename(character); };
        const removeBtn = document.createElement('span'); removeBtn.className = 'tabBtn'; removeBtn.title = options.messages.removeTabTitle; removeBtn.textContent = '✕';
        removeBtn.onclick = (event) => { event.stopPropagation(); remove(character); };
        tab.append(name, renameBtn, removeBtn); tabs.appendChild(tab);
      });
      const addBtn = document.createElement('div'); addBtn.className = 'tab tabAddBtn'; addBtn.textContent = options.messages.addCharacterTab; addBtn.onclick = add;
      tabs.appendChild(addBtn);
    }
    return { render: render };
  };
})(window);
