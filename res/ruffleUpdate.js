// Downloads Ruffle's *web self-hosted* nightly. AquaStar embeds Ruffle in an
// Electron page, so the desktop executable releases are deliberately not used.
const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');

const RELEASES_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases?per_page=30';
const LATEST_URL = 'https://api.github.com/repos/ruffle-rs/ruffle/releases/latest';

function request(url, redirectCount) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'AquaStar Ruffle Updater', 'Accept': 'application/vnd.github+json' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
                res.resume();
                return resolve(request(res.headers.location, redirectCount + 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('GitHub returned HTTP ' + res.statusCode));
            }
            resolve(res);
        }).on('error', reject);
    });
}

async function getRelease(channel) {
    const res = await request(channel === 'nightly' ? RELEASES_URL : LATEST_URL, 0);
    let body = '';
    for await (const chunk of res) body += chunk;
    const response = JSON.parse(body);
    const release = channel === 'nightly'
        ? response.find((item) => item.prerelease && /^nightly-/.test(item.tag_name || ''))
        : response;
    if (!release) throw new Error(channel === 'nightly' ? 'No Ruffle nightly release was found' : 'No stable Ruffle release was found');
    const asset = (release.assets || []).find((item) => /-web-selfhosted\.zip$/i.test(item.name || ''));
    if (!asset) throw new Error('The Ruffle nightly has no web self-hosted archive');
    return { tag: release.tag_name, url: asset.browser_download_url };
}

async function download(url, destination) {
    const res = await request(url, 0);
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(destination);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
        res.on('error', reject);
    });
}

function findPlayer(directory) {
    const direct = path.join(directory, 'ruffle.js');
    if (fs.existsSync(direct)) return directory;
    const children = fs.readdirSync(directory, { withFileTypes: true }).filter((item) => item.isDirectory());
    for (const child of children) {
        const nested = path.join(directory, child.name);
        if (fs.existsSync(path.join(nested, 'ruffle.js'))) return nested;
    }
    return null;
}

function removeIfPresent(target) {
    if (fs.existsSync(target)) fs.rmdirSync(target, { recursive: true });
}

function bundledVersion(playerPath) {
    try {
        const source = fs.readFileSync(playerPath, 'utf8');
        const match = source.match(/versionNumber:"([^"]+)"[^}]*buildDate:"([^"]+)"/);
        return match ? match[1] + ' (' + match[2].slice(0, 10) + ')' : 'Bundled version';
    } catch (e) { return 'Bundled version'; }
}

exports.getStatus = function (dataDirectory, bundledPlayerPath) {
    const currentDirectory = path.join(dataDirectory, 'ruffle-current');
    const currentPlayerPath = path.join(currentDirectory, 'ruffle.js');
    let downloadedTag = null;
    let downloadedChannel = null;
    try {
        const installed = JSON.parse(fs.readFileSync(path.join(currentDirectory, 'ruffle-version.json'), 'utf8'));
        downloadedTag = installed.tag || null;
        downloadedChannel = installed.channel === 'nightly' ? 'nightly' : (installed.channel === 'latest' ? 'latest' : null);
    }
    catch (e) { /* A pre-marker downloaded bundle is still usable. */ }
    return {
        loaded: fs.existsSync(currentPlayerPath)
            ? { source: 'downloaded', version: downloadedTag || 'Downloaded version', channel: downloadedChannel }
            : { source: 'bundled', version: bundledVersion(bundledPlayerPath) },
        fallback: { source: 'bundled', version: bundledVersion(bundledPlayerPath) }
    };
};

exports.restoreBundled = function (dataDirectory) {
    // Do this at the next launch: the active browser can still lazily load JS/WASM
    // chunks from its current Ruffle directory.
    fs.writeFileSync(path.join(dataDirectory, 'restore-bundled-ruffle'), 'restore on next launch');
    return { restartRequired: true };
};

exports.downloadLatest = async function (dataDirectory, channel, bundledPlayerPath) {
    channel = channel === 'nightly' ? 'nightly' : 'latest';
    const release = await getRelease(channel);
    if (channel === 'latest' && ('v' + bundledVersion(bundledPlayerPath).split(' ')[0]) === release.tag) {
        return { tag: release.tag, bundledAlreadyCurrent: true, restartRequired: false };
    }
    const installedVersionPath = path.join(dataDirectory, 'ruffle-current', 'ruffle-version.json');
    if (fs.existsSync(installedVersionPath)) {
        try {
            const installed = JSON.parse(fs.readFileSync(installedVersionPath, 'utf8'));
            if (installed.tag === release.tag) return { tag: release.tag, upToDate: true, restartRequired: false };
        } catch (e) { /* A malformed marker is harmless: download a fresh copy. */ }
    }
    const zipPath = path.join(dataDirectory, 'ruffle-download.zip');
    const extractDirectory = path.join(dataDirectory, 'ruffle-extract');
    const stagedDirectory = path.join(dataDirectory, 'ruffle-next');
    removeIfPresent(extractDirectory);
    removeIfPresent(stagedDirectory);
    try {
        await download(release.url, zipPath);
        await new Promise((resolve, reject) => extract(zipPath, { dir: extractDirectory }, (err) => err ? reject(err) : resolve()));
        const playerDirectory = findPlayer(extractDirectory);
        if (!playerDirectory) throw new Error('Downloaded archive does not contain ruffle.js');
        // A sibling .wasm is essential. This rejects desktop/extension packages even
        // if their archive layout changes to include a similarly named JS file.
        if (!fs.readdirSync(playerDirectory).some((name) => /\.wasm$/i.test(name))) {
            throw new Error('Downloaded archive is not a self-hosted WebAssembly build');
        }
        if (playerDirectory === extractDirectory) fs.renameSync(extractDirectory, stagedDirectory);
        else fs.renameSync(playerDirectory, stagedDirectory);
        fs.writeFileSync(path.join(stagedDirectory, 'ruffle-version.json'), JSON.stringify({ tag: release.tag, channel: channel }, null, 2));
        return { tag: release.tag, restartRequired: true };
    } finally {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        removeIfPresent(extractDirectory);
    }
};
