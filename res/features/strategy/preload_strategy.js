const { contextBridge, ipcRenderer } = require('electron');
const strategyApi = {
  get: () => ipcRenderer.invoke('getStrategy'),
  messages: () => ipcRenderer.invoke('getStrategyMessages'),
  save: (data) => ipcRenderer.invoke('saveStrategy', data),
  getInventoryCounts: (names) => ipcRenderer.invoke('getInventoryItemCounts', names),
  setTimerShortcut: (key) => ipcRenderer.invoke('setStrategyTimerShortcut', key),
  clearTimerShortcut: () => ipcRenderer.send('clearStrategyTimerShortcut'),
  onTimerToggle: (callback) => ipcRenderer.on('strategyTimerToggle', callback)
};
contextBridge.exposeInMainWorld('aquastarStrategy', strategyApi);

// The Strategy page lists the curated consumables alongside boss cards. Keep this in the
// preload so it can call the inventory IPC directly without broadening the renderer bridge.
window.addEventListener('DOMContentLoaded', () => {
  const timerStyle = document.createElement('style');
  timerStyle.textContent = '#timerRolesPanel{border-color:#315b83;background:linear-gradient(135deg,#18283b,#191919)}#timerRolesPanel .role-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0}#timerRolesPanel .role-filter>span{color:#9cc9ff;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.role-filter-actions,.role-filter-options{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.role-filter-actions button{padding:5px 8px}.role-filter-chip{padding:5px 10px;border-radius:14px;background:#111c27;border-color:#345875;color:#9fb5c8}.role-filter-chip.active{color:#fff;background:#276fb8;border-color:#5ba4ed}.timer-role-row{display:grid;grid-template-columns:minmax(100px,1fr) 86px 86px minmax(110px,1fr) 90px minmax(110px,1fr) auto;gap:8px;align-items:end;padding:10px;margin-bottom:8px;background:#111b26;border:1px solid #284867;border-radius:6px}.timer-role-row label{display:block;color:#9fb0c0;font-size:11px}.timer-role-row input,.timer-role-row select{display:block;width:100%;margin-top:4px;padding:7px;background:#0d131a;border:1px solid #36526c;border-radius:4px;color:#e6f2ff}.timer-role-live{padding:12px;border:1px solid #315b83;border-radius:7px;background:#0c1722}.timer-role-live-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px}.timer-role-live-head strong{font-size:16px;color:#e1f0ff}.timer-role-next{color:#9cc9ff}.timer-role-track{height:30px;position:relative;overflow:hidden;border:1px solid #3d668c;border-radius:5px;background:#081019}.timer-role-fill{height:100%;width:0;background:linear-gradient(90deg,#236dbd,#70bdff);transition:width .08s linear}.timer-role-fire{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;color:#fff;background:repeating-linear-gradient(45deg,#c97718,#c97718 10px,#efad42 10px,#efad42 20px);opacity:0;transition:opacity .08s linear}.boss-general-info{margin-top:8px;padding:9px;border-left:3px solid #4f88bc;border-radius:3px;background:#152230;color:#cbdbea;white-space:pre-wrap;font-size:12px;line-height:1.45}@media(max-width:760px){.timer-role-row{grid-template-columns:repeat(2,minmax(0,1fr))}.timer-role-row button{grid-column:2;justify-self:end}}';
  document.head.appendChild(timerStyle);
  const bossInfoField = document.createElement('div');
  bossInfoField.className = 'field full';
  bossInfoField.innerHTML = '<label>General boss information</label><textarea id="bossGeneralInfo" placeholder="Shown read-only in this boss strategies"></textarea>';
  const bossModalGrid = document.querySelector('#bossModal .grid');
  if (bossModalGrid) bossModalGrid.insertBefore(bossInfoField, bossModalGrid.children[2]);
  function syncBossGeneralInfo() {
    const name = document.getElementById('bossName').value;
    strategyApi.get().then((result) => {
      const current = (result.data.bosses || []).find((boss) => boss.name === name);
      document.getElementById('bossGeneralInfo').value = current ? current.generalInfo || '' : '';
    });
  }
  new MutationObserver(() => {
    if (document.getElementById('bossModal').classList.contains('open')) syncBossGeneralInfo();
  }).observe(document.getElementById('bossModal'), { attributes: true, attributeFilter: ['class'] });
  document.getElementById('saveBoss').addEventListener('click', () => {
    setTimeout(() => {
      const name = document.getElementById('bossName').value.trim();
      const generalInfo = document.getElementById('bossGeneralInfo').value;
      if (!name) return;
      strategyApi.get().then((result) => {
        const boss = (result.data.bosses || []).find((item) => item.name === name);
        if (!boss) return;
        boss.generalInfo = generalInfo;
        return strategyApi.save(result.data);
      });
    }, 0);
  });
  // Timer roles replace only the old shared Intro/Loop timeline. The rest of the Strategy
  // renderer remains untouched. This panel is installed when its editor becomes visible.
  let roleState = null;
  let runnerTimer = null;
  let runnerStartedAt = 0;
  let activeKey = null;
  const roleFilter = new Set();
  let filterStrategyId = null;
  const firedCycles = Object.create(null);
  const targetLabel = (target) => ({ main: 'Boss', left: 'Left', right: 'Right' }[target] || target);
  function locateStrategy(data) {
    const info = document.getElementById('strategyInfo');
    if (!info) return null;
    const bossName = (info.querySelector('h2') || {}).textContent || '';
    const strategyName = (info.querySelector('p') || {}).textContent || '';
    const boss = (data.bosses || []).find((item) => item.name === bossName);
    return boss && (boss.strategies || []).find((item) => item.name === strategyName);
  }
  function installTimerRoles() {
    const editor = document.getElementById('editorView');
    const oldIntro = document.getElementById('introTimers');
    const oldLoop = document.getElementById('loopTimers');
    if (!editor || editor.classList.contains('hidden') || !oldIntro) return;
    const oldSection = oldIntro.closest('.section');
    if (!oldSection) return;
    oldSection.style.display = 'none';
    let panel = document.getElementById('timerRolesPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'timerRolesPanel';
      panel.className = 'section';
      panel.innerHTML = '<h3>Timer Roles</h3><p style="margin:0 0 10px;color:#a8b4c0">Each role has its own first-action offset and repeat interval. The action happens when its bar reaches the end.</p><div data-editor></div><button class="primary" data-add>Add role</button><div class="role-filter"><span>Show roles</span><div class="role-filter-actions"><button type="button" data-role-filter-all>All</button><button type="button" data-role-filter-clear>None</button></div><div class="role-filter-options" data-role-filter-options></div></div><div class="timer-actions" style="margin-top:10px"><button class="primary" data-role-toggle>Start timer</button></div><div data-live style="display:grid;gap:10px;margin-top:16px"></div>';
      oldSection.parentNode.insertBefore(panel, oldSection);
      panel.querySelector('[data-role-toggle]').onclick = () => runnerStartedAt ? stopRoleRunner() : startRoleRunner();
      panel.querySelector('[data-role-filter-all]').onclick = () => { const strategy = currentRoleStrategy(); if (!strategy) return; strategy.timerRoles.forEach((role) => roleFilter.add(role.id)); renderRoleFilter(panel, strategy); applyRoleFilter(panel); };
      panel.querySelector('[data-role-filter-clear]').onclick = () => { const strategy = currentRoleStrategy(); if (!strategy) return; roleFilter.clear(); renderRoleFilter(panel, strategy); applyRoleFilter(panel); };
      const oldRunner = document.querySelector('.run-panel');
      const shortcutField = oldRunner && oldRunner.querySelector('.field');
      const shortcutHint = oldRunner && oldRunner.querySelector('#shortcutHint');
      if (shortcutField) panel.appendChild(shortcutField);
      if (shortcutHint) panel.querySelector('.timer-actions').appendChild(shortcutHint);
      if (oldRunner) oldRunner.style.display = 'none';
    }
    strategyApi.get().then((result) => {
      roleState = result.data;
      const current = locateStrategy(roleState);
      if (!current) return;
      if (activeKey && activeKey !== current.id) stopRoleRunner();
      activeKey = current.id;
      current.timerRoles = current.timerRoles || [];
      const info = document.getElementById('strategyInfo');
      const titleBlock = info && info.querySelector('div');
      const previousInfo = titleBlock && titleBlock.querySelector('.boss-general-info');
      if (previousInfo) previousInfo.remove();
      const boss = (roleState.bosses || []).find((item) => item.name === (info.querySelector('h2') || {}).textContent);
      if (boss && boss.generalInfo) { const generalInfo = document.createElement('div'); generalInfo.className = 'boss-general-info'; generalInfo.textContent = boss.generalInfo; titleBlock.appendChild(generalInfo); }
      renderRoles(panel, current);
    });
  }
  function renderRoles(panel, current) {
    const edit = panel.querySelector('[data-editor]');
    const live = panel.querySelector('[data-live]');
    edit.innerHTML = ''; live.innerHTML = '';
    if (filterStrategyId !== current.id) {
      roleFilter.clear();
      current.timerRoles.forEach((role) => roleFilter.add(role.id));
      filterStrategyId = current.id;
    }
    Array.from(roleFilter).forEach((id) => { if (!current.timerRoles.some((role) => role.id === id)) roleFilter.delete(id); });
    current.timerRoles.forEach((role) => {
      const row = document.createElement('div');
      row.className = 'timer-role-row';
      row.innerHTML = '<label>Role<input></label><label>Offset s<input type="number" min="0"></label><label>Every s<input type="number" min="1"></label><label>Effect<select></select></label><label>Target<select><option value="main">Boss</option><option value="left">Left</option><option value="right">Right</option></select></label><label>Note<input></label><button class="danger">×</button>';
      const [name, offset, interval, type, target, note] = row.querySelectorAll('input,select');
      name.value = role.name; offset.value = role.offset; interval.value = role.interval; target.value = role.target; note.value = role.note;
      roleState.timerTypes.forEach((timerType) => { const option = document.createElement('option'); option.value = timerType.id; option.textContent = timerType.name; option.selected = option.value === role.typeId; type.appendChild(option); });
      const changed = () => { role.name = name.value || 'Role'; role.offset = Math.max(0, Number(offset.value) || 0); role.interval = Math.max(1, Number(interval.value) || 1); role.typeId = type.value; role.target = target.value; role.note = note.value; refreshRoleBar(panel, role); };
      name.oninput = changed; offset.oninput = changed; interval.oninput = changed; type.onchange = changed; target.onchange = changed; note.oninput = changed;
      row.querySelector('button').onclick = () => { current.timerRoles = current.timerRoles.filter((item) => item.id !== role.id); renderRoles(panel, current); };
      edit.appendChild(row);
      const bar = document.createElement('div');
      bar.dataset.role = role.id;
      bar.className = 'timer-role-live';
      bar.innerHTML = '<div class="timer-role-live-head"><strong></strong><span data-next class="timer-role-next"></span></div><div class="timer-role-track"><div data-fill class="timer-role-fill"></div><div data-fire class="timer-role-fire"></div></div>';
      live.appendChild(bar);
      refreshRoleBar(panel, role);
    });
    panel.querySelector('[data-add]').onclick = () => { const role = { id: 'timerRole_' + Date.now().toString(36), name: 'T' + (current.timerRoles.length + 1), offset: 0, interval: 20, typeId: 'taunt', target: 'main', note: '' }; current.timerRoles.push(role); roleFilter.add(role.id); renderRoles(panel, current); };
    panel.querySelector('[data-role-toggle]').textContent = runnerStartedAt ? 'Stop timer' : 'Start timer';
    renderRoleFilter(panel, current);
    applyRoleFilter(panel);
  }
  function refreshRoleBar(panel, role) {
    const bar = panel.querySelector('[data-role="' + role.id + '"]');
    if (!bar) return;
    bar.querySelector('strong').textContent = role.name + ': ' + ((roleState.timerTypes.find((item) => item.id === role.typeId) || {}).name || role.typeId) + ' - ' + targetLabel(role.target);
    const option = panel.querySelector('[data-role-filter-options] [data-role-option="' + role.id + '"]');
    if (option) option.textContent = role.name;
  }
  function renderRoleFilter(panel, current) {
    const options = panel.querySelector('[data-role-filter-options]');
    options.innerHTML = '';
    if (!current.timerRoles.length) options.innerHTML = '<span style="color:#8e9cab">No roles added yet.</span>';
    current.timerRoles.forEach((role) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'role-filter-chip' + (roleFilter.has(role.id) ? ' active' : '');
      chip.dataset.roleOption = role.id;
      chip.textContent = role.name;
      chip.onclick = () => { if (roleFilter.has(role.id)) roleFilter.delete(role.id); else roleFilter.add(role.id); chip.classList.toggle('active', roleFilter.has(role.id)); applyRoleFilter(panel); };
      options.appendChild(chip);
    });
  }
  function applyRoleFilter(panel) {
    panel.querySelectorAll('[data-live] [data-role]').forEach((bar) => { bar.style.display = roleFilter.has(bar.dataset.role) ? '' : 'none'; });
  }
  function currentRoleStrategy() {
    return roleState && (roleState.bosses || []).flatMap((boss) => boss.strategies || []).find((item) => item.id === activeKey);
  }
  function updateRoleToggle() {
    const button = document.querySelector('#timerRolesPanel [data-role-toggle]');
    if (button) button.textContent = runnerStartedAt ? 'Stop timer' : 'Start timer';
  }
  function startRoleRunner() {
    const current = currentRoleStrategy();
    if (!current || !current.timerRoles.length) return;
    runnerStartedAt = Date.now();
    Object.keys(firedCycles).forEach((key) => delete firedCycles[key]);
    clearInterval(runnerTimer);
    runnerTimer = setInterval(updateRoleBars, 80);
    updateRoleToggle();
    updateRoleBars();
  }
  function stopRoleRunner() {
    clearInterval(runnerTimer);
    runnerTimer = null;
    runnerStartedAt = 0;
    updateRoleToggle();
  }
  function updateRoleBars() {
    if (!roleState || !runnerStartedAt) return;
    const current = currentRoleStrategy();
    if (!current) return;
    const elapsed = (Date.now() - runnerStartedAt) / 1000;
    current.timerRoles.forEach((role) => {
      const bar = document.querySelector('[data-role="' + role.id + '"]'); if (!bar) return;
      const sinceFirst = elapsed - role.offset;
      const until = sinceFirst < 0 ? -sinceFirst : role.interval - (sinceFirst % role.interval);
      const duration = sinceFirst < 0 ? role.offset : role.interval;
      bar.querySelector('[data-fill]').style.width = (duration ? Math.min(100, (1 - until / duration) * 100) : 100) + '%';
      bar.querySelector('[data-next]').textContent = 'Action in ' + until.toFixed(1) + 's';
      const cycle = sinceFirst < 0 ? -1 : Math.floor(sinceFirst / role.interval);
      if (sinceFirst >= 0 && firedCycles[role.id] !== cycle && until > role.interval - 0.10) {
        firedCycles[role.id] = cycle;
        const fire = bar.querySelector('[data-fire]');
        fire.textContent = 'Função: ' + role.name + ' — ' + (roleState.timerTypes.find((item) => item.id === role.typeId) || {}).name + ' - ' + targetLabel(role.target);
        fire.style.opacity = '1'; setTimeout(() => { fire.style.opacity = '0'; }, 1000);
      }
    });
  }
  new MutationObserver(() => {
    if (document.getElementById('editorView').classList.contains('hidden')) stopRoleRunner();
    else installTimerRoles();
  }).observe(document.getElementById('editorView'), { attributes: true, attributeFilter: ['class'] });
  document.getElementById('timerToggle').addEventListener('click', () => runnerStartedAt ? stopRoleRunner() : startRoleRunner());
  strategyApi.onTimerToggle(() => runnerStartedAt ? stopRoleRunner() : startRoleRunner());
  document.getElementById('saveStrategy').addEventListener('click', () => {
    setTimeout(() => {
      if (!roleState) return;
      strategyApi.get().then((result) => {
        const fresh = result.data;
        const savedRoleStrategy = (roleState.bosses || []).flatMap((boss) => boss.strategies || []).find((item) => item.id === activeKey);
        const target = locateStrategy(fresh);
        if (savedRoleStrategy && target) target.timerRoles = savedRoleStrategy.timerRoles;
        return strategyApi.save(fresh);
      });
    }, 0);
  });
  const host = document.getElementById('bossView');
  if (!host) return;
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:18px';
  const title = document.createElement('h2');
  title.textContent = 'Consumables';
  title.style.cssText = 'font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:.06em';
  const list = document.createElement('div');
  list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:7px';
  section.appendChild(title);
  section.appendChild(list);
  host.appendChild(section);

  ipcRenderer.invoke('getStrategy').then((result) => {
    const potions = result.data.potions || [];
    return ipcRenderer.invoke('getInventoryItemCounts', potions.map((potion) => potion.name))
      .then((counts) => ({ potions: potions, counts: counts }));
  }).then(({ potions, counts }) => {
    potions.forEach((potion) => {
      const count = counts[potion.name] || { characters: [] };
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;background:#181818;border:1px solid #2d2d2d;border-radius:4px;padding:8px';
      const name = document.createElement('strong');
      name.textContent = potion.name;
      name.style.cssText = 'flex:1;font-size:12px';
      const amount = document.createElement('span');
      amount.style.cssText = 'color:#9cc9ff;font-family:Consolas,monospace;font-size:11px;text-align:right;white-space:pre-line';
      amount.textContent = count.characters.map((character) => {
        return character.name + ': I ' + character.inventory + ' · B ' + character.bank;
      }).join('\n') || 'No synced characters';
      row.appendChild(name);
      row.appendChild(amount);
      list.appendChild(row);
    });
  }).catch(() => {});
});
