// Download the pinned Ruffle desktop build for one target into <appDir>/RuffleNative so it
// ships inside the package (like FlashPlayer/). Versions, URLs and SHA-256 hashes are pinned
// in res/ruffleNativeBundle.json; a hash mismatch fails the build.
//
// Usage: node scripts/fetch-ruffle-native.js <linux|win32|darwin> <x64|ia32|armv7l|arm64> [appDir]
// Targets without an official Ruffle desktop build are skipped (exit 0) with a notice; the
// app then keeps downloading on demand where possible.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'res', 'ruffleNativeBundle.json'), 'utf8'));
const CACHE = process.env.RUFFLE_NATIVE_CACHE || path.join(ROOT, '.ruffle-native-cache');

function get(url, redirects) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'AquaStar-build' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          resolve(get(res.headers.location, redirects + 1));
        } else if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        } else resolve(res);
      })
      .on('error', reject);
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function fetchArchive(target) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, path.basename(new URL(target.url).pathname));
  if (fs.existsSync(file) && sha256(file) === target.sha256) return file;
  const tmp = file + '.part';
  const res = await get(target.url, 0);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.on('error', reject);
  });
  const actual = sha256(tmp);
  if (actual !== target.sha256) {
    fs.unlinkSync(tmp);
    throw new Error('SHA-256 mismatch for ' + target.url + ': expected ' + target.sha256 + ', got ' + actual);
  }
  fs.renameSync(tmp, file);
  return file;
}

function extractZip(zipFile, dest) {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      zip.readEntry();
      zip.on('entry', (entry) => {
        const out = path.join(dest, entry.fileName);
        if (!path.resolve(out).startsWith(path.resolve(dest) + path.sep))
          return reject(new Error('Unsafe path in zip'));
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(out, { recursive: true });
          return zip.readEntry();
        }
        fs.mkdirSync(path.dirname(out), { recursive: true });
        zip.openReadStream(entry, (e, stream) => {
          if (e) return reject(e);
          const w = fs.createWriteStream(out);
          stream.pipe(w);
          w.on('finish', () => zip.readEntry());
          w.on('error', reject);
        });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
    });
  });
}

async function main() {
  const platform = process.argv[2];
  const arch = process.argv[3];
  const appDir = path.resolve(process.argv[4] || ROOT);
  if (!platform || !arch) {
    console.error('Usage: node scripts/fetch-ruffle-native.js <platform> <arch> [appDir]');
    process.exit(1);
  }
  const key = platform + '-' + arch;
  const dest = path.join(appDir, manifest.dir);
  fs.rmSync(dest, { recursive: true, force: true });
  const target = manifest.targets[key];
  if (!target) {
    console.log('--> No bundled Ruffle desktop for ' + key + ': ' + (manifest.unsupported[key] || 'no official build'));
    return;
  }
  const archive = await fetchArchive(target);
  fs.mkdirSync(dest, { recursive: true });
  if (archive.endsWith('.zip')) await extractZip(archive, dest);
  // tar keeps the executable bit and, on macOS, the app bundle's signature layout.
  else execFileSync('tar', ['-xzf', archive, '-C', dest]);
  const exe = require(path.join(ROOT, 'res', 'ruffleNative.js')).bundledExePath(appDir, platform, arch);
  if (!exe || !fs.existsSync(exe)) throw new Error('Bundled Ruffle executable missing after extraction: ' + exe);
  if (platform !== 'win32') fs.chmodSync(exe, 0o755);
  // The Windows zip also carries an MSI installer the app never uses.
  fs.rmSync(path.join(dest, 'setup.msi'), { force: true });
  fs.writeFileSync(
    path.join(dest, 'ruffle-native-version.json'),
    JSON.stringify({ tag: manifest.tag, target: key }, null, 2) + '\n'
  );
  console.log('--> Bundled Ruffle desktop ' + manifest.tag + ' (' + key + ') at ' + dest);
}

main().catch((e) => {
  console.error('[fetch-ruffle-native] ' + e.message);
  process.exit(1);
});
