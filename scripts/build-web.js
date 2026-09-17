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
  // Desktop HTML lives under plugins/.../features and reaches kits via ../../../../res/*.
  // web-dist keeps the flatter tools/{feature} layout, so rewrite those hrefs/srcs.
  html = html
    .replace(/(?:\.\.\/)+res\/core\//g, '../../core/')
    .replace(/(?:\.\.\/)+res\/ui\//g, '../../ui/')
    .replace(/(?:\.\.\/)+res\/features\/common\//g, '../common/');
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

const aqwFeatures = 'plugins/adventure-quest-worlds/features';
buildToolPage(`${aqwFeatures}/reminders/reminders.html`, path.join(output, 'tools/reminders/index.html'), 'reminders');
buildToolPage(`${aqwFeatures}/todo/todo.html`, path.join(output, 'tools/todo/index.html'), 'todo');
buildToolPage(`${aqwFeatures}/strategy/strategy.html`, path.join(output, 'tools/strategy/index.html'), 'strategy');

['common.js', 'reminders.js', 'todo.js', 'strategy.js'].forEach((file) =>
  copy(`web/bridges/${file}`, path.join(output, 'bridges', file))
);
copy(`${aqwFeatures}/reminders/reminders_default.json`, path.join(output, 'defaults/reminders.json'));
copy(`${aqwFeatures}/strategy/strategy_default.json`, path.join(output, 'defaults/strategy.json'));

['pt-BR', 'en-US'].forEach((code) => {
  // Feature catalogs live in the AQW plugin locale tree (platform chrome stays in res/po).
  const locale = require(path.join(root, 'plugins/adventure-quest-worlds/locales', `${code}.js`));
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
