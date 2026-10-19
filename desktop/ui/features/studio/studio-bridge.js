const { invoke } = window.__TAURI__.core;
window.characterBLab = {
  getDefaults: () => invoke('studio_defaults'),
  getMessages: () => invoke('studio_messages'),
  loadCharacter: (name) => invoke('studio_load_character', { name }),
  render: (renderer, flashVars) => invoke('studio_render', { renderer, flashVars }),
  capture: (kind, renderer, flashVars, fps, colors) =>
    invoke('studio_capture', { kind, renderer, flashVars, fps, colors }),
  closePreview: () => invoke('studio_close_preview')
};
