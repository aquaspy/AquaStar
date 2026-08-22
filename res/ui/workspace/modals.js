(function (root) {
  const workspace = root.AquaStarWorkspace = root.AquaStarWorkspace || {};
  workspace.showPromptModal = function (messages, labelText, defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('promptOverlay');
      const label = document.getElementById('promptLabel');
      const input = document.getElementById('promptInput');
      const ok = document.getElementById('promptOkBtn');
      const cancel = document.getElementById('promptCancelBtn');
      label.textContent = labelText; input.value = defaultValue || '';
      ok.textContent = messages.promptOkButton; cancel.textContent = messages.promptCancelButton;
      function done(value) {
        overlay.classList.remove('open'); ok.onclick = null; cancel.onclick = null;
        input.onkeydown = null; overlay.onclick = null; resolve(value);
      }
      ok.onclick = () => done(input.value);
      cancel.onclick = () => done(null);
      input.onkeydown = (event) => { if (event.key === 'Enter') done(input.value); if (event.key === 'Escape') done(null); };
      overlay.onclick = (event) => { if (event.target === overlay) done(null); };
      overlay.classList.add('open'); input.focus(); input.select();
    });
  };
  workspace.showChoiceModal = function (messages, labelText, options) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('baseCharOverlay');
      const label = document.getElementById('baseCharLabel');
      const select = document.getElementById('baseCharSelect');
      const ok = document.getElementById('baseCharOkBtn');
      const cancel = document.getElementById('baseCharCancelBtn');
      label.textContent = labelText; select.innerHTML = '';
      options.forEach((option) => { const el = document.createElement('option'); el.value = option.id; el.textContent = option.label; select.appendChild(el); });
      ok.textContent = messages.promptOkButton; cancel.textContent = messages.promptCancelButton;
      function done(value) { overlay.classList.remove('open'); ok.onclick = null; cancel.onclick = null; overlay.onclick = null; resolve(value); }
      ok.onclick = () => done(select.value); cancel.onclick = () => done(null);
      overlay.onclick = (event) => { if (event.target === overlay) done(null); };
      overlay.classList.add('open'); select.focus();
    });
  };
})(window);
