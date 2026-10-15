// Ruffle desktop (native) render mode. The game window shows a small status page while the
// official Ruffle desktop binary plays the SWF in its own process. Native Ruffle renders
// with wgpu (Vulkan/DX12/Metal) instead of WebGL inside Chromium 87, and opens TCP sockets
// itself, so no WebSocket relay is needed.
//
// Packaged builds ship a pinned Ruffle desktop in <app>/RuffleNative (see
// res/ruffleNativeBundle.json and scripts/fetch-ruffle-native.js), so it works offline from
// the first launch. With Ruffle auto-update on, newer official releases are downloaded to
// userData/ruffle-native/<tag>/ and the newest of bundled vs downloaded is used from the next
// launch. Targets without a bundled build (e.g. Linux armv7l) still download on first use.
// The bundled copy lives in the app folder and is never touched by pruning.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const updater = require('./ruffleUpdate.js');
const ruffleGraphics = require('./ruffleGraphics.js');

const LATEST_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest';

// Release asset suffix and executable path inside the archive, per platform.
function platformTarget(platform, arch) {
    platform = platform || process.platform;
    arch = arch || process.arch;
    if (platform === 'linux' && arch === 'x64') return { asset: '-linux-x86_64.tar.gz', exe: 'ruffle' };
    if (platform === 'linux' && arch === 'ia32') return { asset: '-linux-i686.tar.gz', exe: 'ruffle' };
    if (platform === 'linux' && arch === 'arm64') return { asset: '-linux-aarch64.tar.gz', exe: 'ruffle' };
    if (platform === 'win32' && arch === 'x64') return { asset: '-windows-x86_64.zip', exe: 'ruffle.exe' };
    if (platform === 'win32' && arch === 'ia32') return { asset: '-windows-x86_32.zip', exe: 'ruffle.exe' };
    if (platform === 'darwin') return { asset: '-macos-universal.tar.gz', exe: path.join('Ruffle.app', 'Contents', 'MacOS', 'ruffle') };
    return null;
}

const BUNDLE = require('./ruffleNativeBundle.json');
const DEFAULT_APP_ROOT = path.join(__dirname, '..');

// Executable of the bundled copy for a target, relative to the app root.
function bundledExePath(appRoot, platform, arch) {
    const target = platformTarget(platform, arch);
    return target ? path.join(appRoot || DEFAULT_APP_ROOT, BUNDLE.dir, target.exe) : null;
}

function isExecutable(file) {
    try { fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); return true; }
    catch (e) { return false; }
}

// The copy shipped inside the package, or null (dev checkout, unsupported target).
function readBundled(appRoot, platform, arch) {
    const exe = bundledExePath(appRoot, platform, arch);
    if (!exe || !isExecutable(exe)) return null;
    let tag = BUNDLE.tag;
    try { tag = JSON.parse(fs.readFileSync(path.join(appRoot || DEFAULT_APP_ROOT, BUNDLE.dir, 'ruffle-native-version.json'), 'utf8')).tag || tag; }
    catch (e) { /* the pinned manifest tag is enough */ }
    return { tag: tag, exe: exe, bundled: true };
}

// Compare release tags such as "v0.7.1". Returns >0 when a is newer. Unparseable tags
// (e.g. nightlies) count as newer than a stable bundle only when they differ from it.
function compareTags(a, b) {
    const parse = (t) => { const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(t || ''); return m ? m.slice(1).map(Number) : null; };
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return a === b ? 0 : (pa ? -1 : 1);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

// The .app that contains the executable. indexOf('.app') hits an outer AquaStar.app first
// and leaves the nested Ruffle.app quarantined.
function containingApp(exe) {
    let dir = path.dirname(String(exe || ''));
    while (dir && dir !== path.dirname(dir)) {
        if (path.extname(dir) === '.app') return dir;
        dir = path.dirname(dir);
    }
    return null;
}

function clearMacQuarantine(exe) {
    if (process.platform !== 'darwin') return true;
    const app = containingApp(exe);
    if (!app) return true;
    try {
        execFileSync('xattr', ['-dr', 'com.apple.quarantine', app], { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

// A translocated copy is read-only, so xattr cannot clear it. Copy that .app somewhere
// writable and clear the flag there. Called for the bundled copy and for downloads.
function copyUnquarantined(exe, dataDirectory) {
    const app = containingApp(exe);
    if (!app) return exe;
    const dest = path.join(dataDirectory, 'ruffle-native', 'unquarantined', path.basename(app));
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(app, dest, { recursive: true });
    try { execFileSync('xattr', ['-dr', 'com.apple.quarantine', dest], { stdio: 'ignore' }); }
    catch (e) { /* the copy is outside the translocation mount */ }
    const copied = path.join(dest, path.relative(app, exe));
    if (process.platform !== 'win32') {
        try { fs.chmodSync(copied, 0o755); } catch (e) { /* launch reports a missing bit */ }
    }
    return copied;
}

function preparePlayer(exe, dataDirectory) {
    if (clearMacQuarantine(exe)) return exe;
    try { return copyUnquarantined(exe, dataDirectory); }
    catch (e) {
        console.log('[AquaStar] Could not copy ' + exe + ' out of quarantine: ' + e.message);
        return exe;
    }
}

function rootDir(dataDirectory) { return path.join(dataDirectory, 'ruffle-native'); }
function markerPath(dataDirectory) { return path.join(rootDir(dataDirectory), 'current.json'); }

function readInstalled(dataDirectory) {
    try {
        const marker = JSON.parse(fs.readFileSync(markerPath(dataDirectory), 'utf8'));
        if (marker && marker.exe && fs.existsSync(marker.exe)) return marker;
    } catch (e) { /* not installed yet */ }
    return null;
}

async function latestRelease(target) {
    const res = await updater._request(LATEST_URL, 0);
    let body = '';
    for await (const chunk of res) body += chunk;
    const release = JSON.parse(body);
    const asset = (release.assets || []).find((a) => (a.name || '').endsWith(target.asset));
    if (!asset) throw new Error('Ruffle ' + release.tag_name + ' has no ' + target.asset + ' build');
    return { tag: release.tag_name, url: asset.browser_download_url };
}

async function install(dataDirectory, release, target) {
    const root = rootDir(dataDirectory);
    fs.mkdirSync(root, { recursive: true });
    const archive = path.join(root, 'download' + (target.asset.endsWith('.zip') ? '.zip' : '.tar.gz'));
    const staging = path.join(root, release.tag + '.partial');
    const finalDir = path.join(root, release.tag);
    updater._removeIfPresent(staging);
    fs.mkdirSync(staging, { recursive: true });
    try {
        await updater._download(release.url, archive);
        if (archive.endsWith('.zip')) await updater._extractArchive(archive, staging);
        else execFileSync('tar', ['-xzf', archive, '-C', staging]);
        const exe = path.join(staging, target.exe);
        if (!fs.existsSync(exe)) throw new Error('Downloaded archive has no ' + target.exe);
        if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
        updater._removeIfPresent(finalDir);
        fs.renameSync(staging, finalDir);
        const marker = { tag: release.tag, exe: path.join(finalDir, target.exe) };
        fs.writeFileSync(markerPath(dataDirectory), JSON.stringify(marker, null, 2));
        return marker;
    } finally {
        if (fs.existsSync(archive)) fs.unlinkSync(archive);
        updater._removeIfPresent(staging);
    }
}

// Delete every downloaded version except `keepTag` and any whose binary a running player
// still uses. Each removal is best-effort: a folder that cannot be deleted now (for example
// a locked .exe on Windows) is simply retried on the next launch, so this is idempotent.
function pruneOldVersions(dataDirectory, keepTag, inUseExes) {
    const root = rootDir(dataDirectory);
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch (e) { return []; }
    const busyDirs = (inUseExes || []).map((exe) => path.relative(root, exe).split(path.sep)[0]);
    const removed = [];
    entries.forEach((entry) => {
        if (!entry.isDirectory() || entry.name === keepTag || busyDirs.indexOf(entry.name) !== -1) return;
        try {
            updater._removeIfPresent(path.join(root, entry.name));
            removed.push(entry.name);
        } catch (e) {
            console.log('[AquaStar] Old Ruffle desktop ' + entry.name + ' not removed yet: ' + e.message);
        }
    });
    return removed;
}

function runningExes() {
    const exes = [];
    running.forEach((child) => { if (child.aquaStarExe) exes.push(child.aquaStarExe); });
    return exes;
}

// Returns the binary to use: the newest of the bundled copy and a downloaded one. Without
// either, the latest release is downloaded. With autoUpdate, a release newer than what is
// used now is fetched in the background for the next launch.
exports.ensureInstalled = async function (dataDirectory, autoUpdate, appRoot) {
    const target = platformTarget();
    if (!target) throw new Error('Ruffle desktop is not available for ' + process.platform + '/' + process.arch);
    const bundled = readBundled(appRoot);
    const downloaded = readInstalled(dataDirectory);
    let current = downloaded;
    if (bundled && (!downloaded || compareTags(downloaded.tag, bundled.tag) <= 0)) current = bundled;
    // Leftovers from earlier updates (only under userData; the bundled copy is never pruned).
    if (downloaded) pruneOldVersions(dataDirectory, current === downloaded ? downloaded.tag : null, runningExes());
    if (current) {
        current = { tag: current.tag, exe: preparePlayer(current.exe, dataDirectory), bundled: current.bundled };
        if (autoUpdate) {
            latestRelease(target)
                .then((release) => compareTags(release.tag, current.tag) <= 0 ? null : install(dataDirectory, release, target)
                    // The version that is running now stays until the next launch prunes it.
                    .then(() => pruneOldVersions(dataDirectory, release.tag, runningExes())))
                .catch((e) => console.log('[AquaStar] Ruffle desktop update check failed: ' + e.message));
        }
        return current;
    }
    const installed = await install(dataDirectory, await latestRelease(target), target);
    return { tag: installed.tag, exe: preparePlayer(installed.exe, dataDirectory) };
};

// Command-line arguments for one game. Kept pure so it can be unit-tested.
exports.buildArgs = function (swfUrl, opts) {
    opts = opts || {};
    const args = ['--tcp-connections', 'allow', '--storage', 'disk', '--letterbox', 'on'];
    if (opts.width && opts.height) args.push('--width', String(opts.width), '--height', String(opts.height));
    if (/^(low|medium|high)$/.test(opts.quality || '')) args.push('--quality', opts.quality);
    const platform = opts.platform || process.platform;
    args.push('--graphics', ruffleGraphics.normalize(opts.graphics, platform));
    if (opts.saveDirectory) args.push('--save-directory', opts.saveDirectory);
    // AquaStar's own window and menus stay the control surface; hide Ruffle's menu bar.
    args.push('--no-gui');
    args.push(swfUrl);
    return args;
};

const running = new Set();

// A backend other than the platform default that dies right after launch, or with a
// Rust panic (e.g. wgpu "Out of Memory" on Vulkan with Intel Mesa, ruffle-rs/ruffle#24920),
// is retried with that default (OpenGL, or Metal on macOS). A clean exit never triggers it.
const EARLY_EXIT_MS = 15000;
exports.EARLY_EXIT_MS = EARLY_EXIT_MS;
exports.shouldFallbackToGl = function (info, platform) {
    platform = platform || (info && info.platform) || process.platform;
    if (!info || info.graphics === ruffleGraphics.safeId(platform)) return false;
    const abnormal = (info.code !== 0 && info.code !== null && info.code !== undefined) || !!info.signal;
    if (!abnormal || info.killedByUs) return false;
    return !!info.panicked || (info.elapsedMs >= 0 && info.elapsedMs < EARLY_EXIT_MS);
};
exports.looksLikePanic = function (text) {
    return /panicked at|Out of Memory|wgpu error|Validation Error/i.test(text || '');
};

exports.launch = function (exe, swfUrl, opts) {
    const child = spawn(exe, exports.buildArgs(swfUrl, opts), { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false });
    child.aquaStarExe = exe;
    child.aquaStarStartedAt = Date.now();
    child.aquaStarPanicked = false;
    // Keep only the tail of stderr: enough to spot a panic without growing unbounded.
    let tail = '';
    if (child.stderr) {
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            tail = (tail + chunk).slice(-8192);
            if (exports.looksLikePanic(tail)) child.aquaStarPanicked = true;
        });
    }
    child.aquaStarStderrTail = () => tail;
    running.add(child);
    child.on('exit', () => running.delete(child));
    child.on('error', (e) => { running.delete(child); console.log('[AquaStar] Ruffle desktop failed: ' + e.message); });
    return child;
};

// Native players are children of AquaStar: close them with it.
exports.killAll = function () {
    running.forEach((child) => { try { child.aquaStarKilledByUs = true; child.kill(); } catch (e) { /* already gone */ } });
    running.clear();
};

exports.platformTarget = platformTarget;
exports.pruneOldVersions = pruneOldVersions;
exports.readInstalled = readInstalled;
exports.readBundled = readBundled;
exports.bundledExePath = bundledExePath;
exports.compareTags = compareTags;
exports.containingApp = containingApp;
