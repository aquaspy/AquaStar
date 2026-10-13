const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'web-dist');

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, source), destination);
}

// Desktop pages sit at plugins/<id>/features/<tool>/ and web-dist keeps a flatter
// tools/<tool>/ layout, so a contribution lists the rewrites its pages need
// ({ match: <regex source>, replace }).
function buildToolPage(source, destination, bridgeId, pathRewrites) {
  let html = fs.readFileSync(path.join(root, source), 'utf8');
  (pathRewrites || []).forEach(function (rule) {
    html = html.replace(new RegExp(rule.match, 'g'), rule.replace);
  });
  const bridgeTag = `<script src="../../bridges/common.js"></script><script src="../../bridges/${bridgeId}.js"></script>`;
  html = html.replace(/<script>\s*\(function \(\)/, `${bridgeTag}<script>\n(function ()`);
  if (!html.includes(bridgeTag)) throw new Error(`Could not inject web bridge into ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
}

// The tools site is built from what a bundled plugin declares in its manifest
// ("web": { "contribute": "<relative path>" }): this script names no plugin. When several
// declare one, the plugin marked bundledDefault is the site's subject.
function findContributor() {
  const pluginsDir = path.join(root, 'plugins');
  const candidates = [];
  fs.readdirSync(pluginsDir).sort().forEach(function (dir) {
    const manifestPath = path.join(pluginsDir, dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { return; }
    if (manifest.web && manifest.web.contribute && manifest.id !== '_template') {
      candidates.push({ dir: dir, manifest: manifest });
    }
  });
  const chosen = candidates.filter(function (c) { return c.manifest.bundledDefault === true; })[0] || candidates[0];
  if (!chosen) throw new Error('No bundled plugin declares web.contribute in its manifest');
  return chosen;
}

function loadContribution() {
  const chosen = findContributor();
  const contributePath = path.join(root, 'plugins', chosen.dir, chosen.manifest.web.contribute);
  if (!fs.existsSync(contributePath)) {
    throw new Error('Missing web contribution: ' + contributePath);
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

const contribution = loadContribution();

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const landing = contribution.landing;
copy(landing.landingHtml, path.join(output, 'index.html'));
copy(landing.landingCss, path.join(output, 'assets/landing.css'));
copy(landing.landingJs, path.join(output, 'assets/landing.js'));
copy(landing.iconFrom || 'Icon/Icon.png', path.join(output, 'assets/aquastar-icon.png'));

(contribution.sharedKits || []).forEach(function (kit) {
  if (!kit || typeof kit.from !== 'string' || typeof kit.to !== 'string') {
    throw new Error('sharedKits entries must be { from, to }');
  }
  if (path.isAbsolute(kit.to) || kit.to.split(/[\\/]/).indexOf('..') !== -1) {
    throw new Error('sharedKits "to" must stay inside web-dist: ' + kit.to);
  }
  copy(kit.from, path.join(output, kit.to));
});

if (contribution.bridges && contribution.bridges.commonBridge) {
  copy(contribution.bridges.commonBridge, path.join(output, 'bridges/common.js'));
}

const localeKeys = {};
contribution.tools.forEach(function (tool) {
  const bridgeId = tool.id;
  if (!tool.bridge) throw new Error('Tool "' + bridgeId + '" must declare its bridge');
  copy(tool.bridge, path.join(output, 'bridges', bridgeId + '.js'));
  buildToolPage(tool.sourceHtml, path.join(output, tool.outToolsPath), bridgeId, contribution.pathRewrites);
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
