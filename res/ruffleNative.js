// Ruffle desktop (native) render mode. The game window shows a small status page while the
// official Ruffle desktop binary plays the SWF in its own process. Native Ruffle renders
// with wgpu (Vulkan/DX12/Metal) instead of WebGL inside Chromium 87, and opens TCP sockets
// itself, so no WebSocket relay is needed.
//
// The binary is not bundled: it is downloaded on first use from the official GitHub
// release, the same feed res/ruffleUpdate.js uses for the web build, and refreshed in the
// background when Ruffle auto-update is on. A new version is used from the next launch.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const updater = require('./ruffleUpdate.js');

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

// Returns the installed binary, downloading it when missing. With autoUpdate, an
// installed copy is used immediately and a newer release is fetched for next time.
exports.ensureInstalled = async function (dataDirectory, autoUpdate) {
    const target = platformTarget();
    if (!target) throw new Error('Ruffle desktop is not available for ' + process.platform + '/' + process.arch);
    const installed = readInstalled(dataDirectory);
    // Leftovers from earlier updates; the active version and running players are kept.
    if (installed) pruneOldVersions(dataDirectory, installed.tag, runningExes());
    if (installed) {
        if (autoUpdate) {
            latestRelease(target)
                .then((release) => release.tag === installed.tag ? null : install(dataDirectory, release, target)
                    // The version that is running now stays until the next launch prunes it.
                    .then(() => pruneOldVersions(dataDirectory, release.tag, runningExes())))
                .catch((e) => console.log('[AquaStar] Ruffle desktop update check failed: ' + e.message));
        }
        return installed;
    }
    return install(dataDirectory, await latestRelease(target), target);
};

// Command-line arguments for one game. Kept pure so it can be unit-tested.
exports.buildArgs = function (swfUrl, opts) {
    opts = opts || {};
    const args = ['--tcp-connections', 'allow', '--storage', 'disk', '--letterbox', 'on'];
    if (opts.width && opts.height) args.push('--width', String(opts.width), '--height', String(opts.height));
    if (/^(low|medium|high)$/.test(opts.quality || '')) args.push('--quality', opts.quality);
    if (opts.saveDirectory) args.push('--save-directory', opts.saveDirectory);
    // AquaStar's own window and menus stay the control surface; hide Ruffle's menu bar.
    args.push('--no-gui');
    args.push(swfUrl);
    return args;
};

const running = new Set();

exports.launch = function (exe, swfUrl, opts) {
    const child = spawn(exe, exports.buildArgs(swfUrl, opts), { stdio: 'ignore', windowsHide: false });
    child.aquaStarExe = exe;
    running.add(child);
    child.on('exit', () => running.delete(child));
    child.on('error', (e) => { running.delete(child); console.log('[AquaStar] Ruffle desktop failed: ' + e.message); });
    return child;
};

// Native players are children of AquaStar: close them with it.
exports.killAll = function () {
    running.forEach((child) => { try { child.kill(); } catch (e) { /* already gone */ } });
    running.clear();
};

exports.platformTarget = platformTarget;
exports.pruneOldVersions = pruneOldVersions;
exports.readInstalled = readInstalled;
