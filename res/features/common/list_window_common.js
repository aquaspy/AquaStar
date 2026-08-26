// Compatibility facade for existing list-window renderers. Domain rules now
// live in res/core and DOM components in res/ui/workspace.
(function (root) {
  const state = root.AquaStarListState;
  const time = root.AquaStarResetTime;
  const workspace = root.AquaStarWorkspace;
  if (!state || !time || !workspace) throw new Error('AquaStar shared list dependencies were not loaded');
  root.ListWindowCommon = Object.assign({}, state, time, {
    showPromptModal: workspace.showPromptModal,
    showChoiceModal: workspace.showChoiceModal
  });
})(window);
