const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'web-dist');

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, source), destination);
}

function buildToolPage(source, destination, bridge) {
  let html = fs.readFileSync(path.join(root, source), 'utf8');
  const bridgeTag = `<script src="../../bridges/common.js"></script><script src="../../bridges/${bridge}.js"></script>`;
  html = html.replace(/<script>\s*\(function \(\)/, `${bridgeTag}<script>\n(function ()`);
  if (!html.includes(bridgeTag)) throw new Error(`Could not inject web bridge into ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

copy('web/landing.html', path.join(output, 'index.html'));
copy('web/assets/landing.css', path.join(output, 'assets/landing.css'));
copy('web/assets/landing.js', path.join(output, 'assets/landing.js'));
copy('Icon/Icon.png', path.join(output, 'assets/aquastar-icon.png'));

copy('res/core/list-state.js', path.join(output, 'core/list-state.js'));
copy('res/core/reset-time.js', path.join(output, 'core/reset-time.js'));
copy('res/ui/workspace/modals.js', path.join(output, 'ui/workspace/modals.js'));
copy('res/ui/workspace/character-tabs.js', path.join(output, 'ui/workspace/character-tabs.js'));
copy('res/features/common/list_window_common.js', path.join(output, 'tools/common/list_window_common.js'));

buildToolPage('res/features/reminders/reminders.html', path.join(output, 'tools/reminders/index.html'), 'reminders');
buildToolPage('res/features/todo/todo.html', path.join(output, 'tools/todo/index.html'), 'todo');
buildToolPage('res/features/strategy/strategy.html', path.join(output, 'tools/strategy/index.html'), 'strategy');

['common.js', 'reminders.js', 'todo.js', 'strategy.js'].forEach((file) =>
  copy(`web/bridges/${file}`, path.join(output, 'bridges', file))
);
copy('res/features/reminders/reminders_default.json', path.join(output, 'defaults/reminders.json'));
copy('res/features/strategy/strategy_default.json', path.join(output, 'defaults/strategy.json'));

['pt-BR', 'en-US'].forEach((code) => {
  const locale = require(path.join(root, 'res/po', `${code}.js`));
  fs.mkdirSync(path.join(output, 'locale'), { recursive: true });
  fs.writeFileSync(
    path.join(output, 'locale', `${code}.json`),
    JSON.stringify({
      remindersMessages: locale.remindersMessages,
      todoMessages: locale.todoMessages,
      strategyMessages: locale.strategyMessages
    })
  );
});

console.log('Built GitHub Pages artifact: web-dist');
