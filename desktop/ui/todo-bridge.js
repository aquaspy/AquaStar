const { invoke } = window.__TAURI__.core;
window.aquastarTodo = {
  getTodo: () => invoke('get_todo'),
  getMessages: () => invoke('get_todo_messages'),
  saveTodo: (state) => invoke('save_todo', { state }),
  copyText: (text) => navigator.clipboard.writeText(typeof text === 'string' ? text : ''),
  openLink: (url) => invoke('open_todo_link', { url })
};
