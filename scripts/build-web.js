const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'web-dist');

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, source), destination);
}

function buildToolPage(source, destination, bridgeId) {
  let html = fs.readFileSync(path.join(root, source), 'utf8');
  // Desktop HTML lives under plugins/.../features and reaches kits via ../../../../res/*.
  // web-dist keeps the flatter tools/{feature} layout, so rewrite those hrefs/srcs.
  html = html
    .replace(/(?:\.\.\/)+res\/core\//g, '../../core/')
    .replace(/(?:\.\.\/)+res\/ui\//g, '../../ui/')
    .replace(/(?:\.\.\/)+res\/features\/common\//g, '../common/');
  const bridgeTag = `<script src="../../bridges/common.js"></script><script src="../../bridges/${bridgeId}.js"></script>`;
  html = html.replace(/<script>\s*\(function \(\)/, `${bridgeTag}<script>\n(function ()`);
  if (!html.includes(bridgeTag)) throw new Error(`Could not inject web bridge into ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
}

function loadContribution() {
  const contributePath = path.join(root, 'plugins', 'adventure-quest-worlds', 'web', 'contribute.js');
  if (!fs.existsSync(contributePath)) {
    throw new Error('Missing AQW web contribution: ' + contributePath);
  }
  const mod = require(contributePath);
  const contrib = typeof mod === 'function'
    ? mod()
    : (mod && typeof mod.contributeWebBuild === 'function' ? mod.contributeWebBuild() : mod);
  if (!contrib || !contrib.landing || !Array.isArray(contrib.tools)) {
    throw new Error('contributeWebBuild() must return landing + tools');
  }
  return contrib;
}

function sharedKitOutPath(source) {
  const normalized = source.replace(/\\/g, '/');
  if (normalized.indexOf('res/core/') === 0) {
    return normalized.slice('res/'.length);
  }
  if (normalized.indexOf('res/ui/') === 0) {
    return normalized.slice('res/'.length);
  }
  if (normalized.indexOf('res/features/common/') === 0) {
    return 'tools/common/' + path.basename(normalized);
  }
  throw new Error('Unsupported sharedKits path: ' + source);
}

const contribution = loadContribution();

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const landing = contribution.landing;
copy(landing.landingHtml, path.join(output, 'index.html'));
copy(landing.landingCss, path.join(output, 'assets/landing.css'));
copy(landing.landingJs, path.join(output, 'assets/landing.js'));
copy(landing.iconFrom || 'Icon/Icon.png', path.join(output, 'assets/aquastar-icon.png'));

(contribution.sharedKits || []).forEach(function (kitPath) {
  copy(kitPath, path.join(output, sharedKitOutPath(kitPath)));
});

if (contribution.bridges && contribution.bridges.commonBridge) {
  copy(contribution.bridges.commonBridge, path.join(output, 'bridges/common.js'));
}

const localeKeys = {};
contribution.tools.forEach(function (tool) {
  const bridgeId = tool.id;
  const bridgeSrc = tool.bridge || path.join('web', 'bridges', bridgeId + '.js');
  copy(bridgeSrc, path.join(output, 'bridges', bridgeId + '.js'));
  buildToolPage(tool.sourceHtml, path.join(output, tool.outToolsPath), bridgeId);
  if (tool.defaultsJson) {
    copy(tool.defaultsJson, path.join(output, 'defaults', tool.id + '.json'));
  }
  (tool.localeKeys || []).forEach(function (key) {
    localeKeys[key] = true;
  });
});

const localeModules = contribution.localeModules || {};
Object.keys(localeModules).forEach(function (code) {
  const locale = require(path.join(root, localeModules[code]));
  const payload = {};
  Object.keys(localeKeys).forEach(function (key) {
    payload[key] = locale[key];
  });
  fs.mkdirSync(path.join(output, 'locale'), { recursive: true });
  fs.writeFileSync(
    path.join(output, 'locale', code + '.json'),
    JSON.stringify(payload)
  );
});

console.log('Built GitHub Pages artifact: web-dist');
