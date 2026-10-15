// Native desktop-player capture. Flash and in-page playback stay on capturePage.
// One slot per companion window. Callers never see a pid or a cached source id.
const { execFile } = require('child_process');

const REASONS = ['starting', 'closed', 'macos-denied', 'wayland', 'ambiguous', 'no-window', 'empty-frame'];
const ATTEMPTS = 5;
const PROBE_TIMEOUT_MS = 1000;
const FRAME_TIMEOUT_MS = 4000;

function messageKey(reason) {
    const parts = String(reason).split('-');
    let body = '';
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        body += part.charAt(0).toUpperCase() + part.slice(1);
    }
    return 'nativeCapture' + body;
}

function ruffleFileName(swfUrl) {
    if (typeof swfUrl !== 'string' || swfUrl === '') return '';
    const cut = swfUrl.split(/[?#]/)[0];
    const parts = cut.split(/[/\\]/);
    const segment = parts[parts.length - 1];
    if (!segment) return '';
    try {
        return decodeURIComponent(segment);
    } catch (_err) {
        return segment;
    }
}

function parseListed(sources) {
    const listed = [];
    if (!Array.isArray(sources)) return listed;
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        if (!source || typeof source.id !== 'string') continue;
        const matched = /^window:(\d+)/.exec(source.id);
        if (!matched) continue;
        listed.push({
            sourceId: source.id,
            title: typeof source.name === 'string' ? source.name : '',
            nativeId: matched[1]
        });
    }
    return listed;
}

function unique(window) {
    return { kind: 'unique', window: window };
}

function matchPlayer(listed, osList, player) {
    const fileName = player.fileName || '';
    const named = function (title) {
        return fileName !== '' && String(title).indexOf(fileName) !== -1;
    };
    const exact = function (title) {
        return title === 'Ruffle - ' + fileName;
    };

    if (!osList || osList.ok !== true) {
        const titleHits = listed.filter(function (item) { return named(item.title); });
        if (titleHits.length === 1) return unique(titleHits[0]);
        if (titleHits.length > 1) return { kind: 'ambiguous' };
        return { kind: 'none' };
    }

    const owned = (osList.windows || []).filter(function (item) {
        return item && item.pid === player.pid;
    });
    const withIds = owned.filter(function (item) {
        return typeof item.nativeId === 'string' && item.nativeId !== '';
    });

    if (withIds.length > 0) {
        const ownedIds = new Set(withIds.map(function (item) { return item.nativeId; }));
        const pidHits = listed.filter(function (item) {
            return item.nativeId != null && ownedIds.has(item.nativeId);
        });
        const namedHits = pidHits.filter(function (item) { return named(item.title); });
        if (namedHits.length === 1) return unique(namedHits[0]);
        if (namedHits.length > 1) {
            const exactHits = namedHits.filter(function (item) { return exact(item.title); });
            if (exactHits.length === 1) return unique(exactHits[0]);
            return { kind: 'ambiguous' };
        }
        if (pidHits.length === 1) return unique(pidHits[0]);
        if (pidHits.length > 1) {
            const narrowed = pidHits.filter(function (item) {
                return item.title === 'Ruffle' || named(item.title);
            });
            if (narrowed.length === 1) return unique(narrowed[0]);
            return { kind: 'ambiguous' };
        }
        if (owned.length > 0) return { kind: 'unlisted' };
        return { kind: 'none' };
    }

    const ownedTitles = owned.map(function (item) { return item.title; }).filter(function (title) {
        return typeof title === 'string' && title !== '';
    });
    if (ownedTitles.length > 0) {
        const titleSet = new Set(ownedTitles);
        const titleHits = listed.filter(function (item) { return titleSet.has(item.title); });
        if (titleHits.length === 1) return unique(titleHits[0]);
        if (titleHits.length > 1) {
            const exactHits = titleHits.filter(function (item) { return exact(item.title); });
            if (exactHits.length === 1) return unique(exactHits[0]);
            return { kind: 'ambiguous' };
        }
        if (owned.length > 0) return { kind: 'unlisted' };
    }

    if (owned.length > 0) return { kind: 'unlisted' };
    return { kind: 'none' };
}

function createCapture(deps) {
    const rows = new Map();
    const sleep = typeof deps.sleep === 'function'
        ? deps.sleep
        : function () { return new Promise(function (resolve) { setTimeout(resolve, 200); }); };

    function blocked(reason) {
        const key = messageKey(reason);
        const messages = deps.messages || {};
        const message = messages[key];
        if (typeof message !== 'string') throw new Error('missing capture message: ' + key);
        return { route: 'blocked', reason: reason, message: message };
    }

    function open(win) {
        if (!win || win.id == null) {
            return {
                starting: function () {},
                spawned: function () {}
            };
        }
        const existing = rows.get(win.id);
        if (existing) return existing.session;
        const id = win.id;
        const session = {
            starting: function () {
                const row = rows.get(id);
                if (!row) return;
                const slot = row.slot;
                if (slot.phase === 'playing' && slot.child && slot.child.exitCode === null) return;
                row.slot = { gen: slot.gen, phase: 'starting' };
            },
            spawned: function (child, swfUrl) {
                const row = rows.get(id);
                if (!row) return;
                if (!child || typeof child.once !== 'function' ||
                    !Number.isInteger(child.pid) || child.pid <= 0 ||
                    typeof swfUrl !== 'string') {
                    return;
                }
                const slot = row.slot;
                if (slot.phase === 'playing' && slot.child === child) return;
                const gen = slot.gen + 1;
                row.slot = { gen: gen, phase: 'playing', child: child, swfUrl: swfUrl };
                const retire = function () {
                    const current = rows.get(id);
                    if (!current) return;
                    const now = current.slot;
                    if (now.phase === 'playing' && now.gen === gen && now.child === child) {
                        current.slot = { gen: gen, phase: 'closed' };
                    }
                };
                child.once('exit', retire);
                child.once('error', retire);
            }
        };
        rows.set(id, {
            slot: { gen: 1, phase: 'starting' },
            win: win,
            session: session
        });
        if (typeof win.once === 'function') {
            win.once('closed', function () {
                const row = rows.get(id);
                if (row && row.session === session) rows.delete(id);
            });
        }
        return session;
    }

    function windowGone(win) {
        return !win || (typeof win.isDestroyed === 'function' && win.isDestroyed());
    }

    async function resolve(win, genReentry) {
        if (!genReentry) genReentry = 0;
        if (windowGone(win)) return { route: 'page' };
        const row = rows.get(win.id);
        if (!row) return { route: 'page' };
        if (row.slot.phase === 'starting') return blocked('starting');
        if (row.slot.phase === 'closed') return blocked('closed');
        if (row.slot.phase !== 'playing' || !row.slot.child) return blocked('no-window');

        let access = 'unknown';
        try { access = deps.screenAccess(); } catch (_err) { access = 'unknown'; }
        if (access === 'denied' || access === 'restricted') return blocked('macos-denied');

        const gen = row.slot.gen;
        const player = {
            pid: row.slot.child.pid,
            fileName: ruffleFileName(row.slot.swfUrl)
        };

        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            let osList;
            try {
                osList = await deps.listWindows(player.pid);
            } catch (_err) {
                osList = { ok: false };
            }
            if (!osList || (osList.ok !== true && osList.ok !== false)) osList = { ok: false };

            let sources = [];
            try {
                // Width and height 0 skip Chromium's preview bitmap. They are not "full size".
                sources = await deps.getSources({
                    types: ['window'],
                    thumbnailSize: { width: 0, height: 0 }
                });
            } catch (_err) {
                sources = [];
            }

            if (windowGone(win)) return { route: 'page' };
            const again = rows.get(win.id);
            if (!again || again.slot.gen !== gen || again.slot.phase !== 'playing') {
                if (again && again.slot.gen !== gen) {
                    if (genReentry > 0) return blocked('no-window');
                    return resolve(win, genReentry + 1);
                }
                return resolve(win, genReentry);
            }

            const match = matchPlayer(parseListed(sources), osList, player);
            if (match.kind === 'unique') {
                return {
                    route: 'source',
                    sourceId: match.window.sourceId,
                    title: match.window.title
                };
            }
            if (match.kind === 'ambiguous') return blocked('ambiguous');
            if (attempt < ATTEMPTS - 1) await sleep();
        }

        let accessAgain = 'unknown';
        try { accessAgain = deps.screenAccess(); } catch (_err) { accessAgain = 'unknown'; }
        if (accessAgain === 'denied' || accessAgain === 'restricted' || accessAgain === 'not-determined') {
            return blocked('macos-denied');
        }
        let session = 'other';
        try { session = deps.session(); } catch (_err) { session = 'other'; }
        // A unique window already returned above. Wayland only explains a miss.
        if (session === 'wayland') return blocked('wayland');
        return blocked('no-window');
    }

    async function captureStill(win) {
        const found = await resolve(win);
        if (found.route !== 'source') return found;
        let png = null;
        try {
            png = await deps.grabFrame(win, found.sourceId);
        } catch (_err) {
            png = null;
        }
        if (Buffer.isBuffer(png) && png.length > 0) return { route: 'png', png: png };
        return blocked('empty-frame');
    }

    function recordingSource(win) {
        return resolve(win);
    }

    async function retarget(focusedWin) {
        let pid = null;
        try {
            if (typeof deps.foregroundPid !== 'function') return null;
            pid = await deps.foregroundPid();
        } catch (_err) {
            return null;
        }
        if (!Number.isInteger(pid) || pid <= 0) return null;
        let found = null;
        const iterator = rows.values();
        let step = iterator.next();
        while (!step.done) {
            const row = step.value;
            const slot = row.slot;
            const live = slot.phase === 'playing' && slot.child &&
                slot.child.pid === pid && slot.child.exitCode === null &&
                !(typeof row.win.isDestroyed === 'function' && row.win.isDestroyed());
            if (live) {
                if (focusedWin && row.win === focusedWin) return row.win;
                if (!found) found = row.win;
            }
            step = iterator.next();
        }
        return found;
    }

    return {
        open: open,
        captureStill: captureStill,
        recordingSource: recordingSource,
        retarget: retarget
    };
}

function run(command, args, input) {
    return new Promise(function (resolve) {
        let child;
        try {
            child = execFile(command, args, {
                timeout: PROBE_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 1024 * 1024
            }, function (error, stdout, stderr) {
                resolve({
                    error: error || null,
                    stdout: stdout == null ? '' : String(stdout),
                    stderr: stderr == null ? '' : String(stderr)
                });
            });
        } catch (error) {
            resolve({ error: error, stdout: '', stderr: '' });
            return;
        }
        if (input != null && child && child.stdin) {
            child.stdin.on('error', function () {});
            try {
                child.stdin.write(input);
                child.stdin.end();
            } catch (_err) {
                child.stdin.destroy();
            }
        }
    });
}

function stripBom(text) {
    const value = String(text || '');
    if (value.charCodeAt(0) === 0xfeff) return value.slice(1);
    return value;
}

function parseTabLines(stdout, pid) {
    const windows = [];
    const lines = stripBom(stdout).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const tab = line.indexOf('\t');
        if (tab < 1) return null;
        const nativeId = line.slice(0, tab).trim();
        if (!/^\d+$/.test(nativeId)) return null;
        windows.push({
            pid: pid,
            nativeId: nativeId,
            title: line.slice(tab + 1).replace(/\r$/, '')
        });
    }
    return windows;
}

function parsePid(stdout) {
    const lines = String(stdout || '').split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (!/^\d+$/.test(trimmed)) continue;
        const pid = Number(trimmed);
        return pid > 0 ? pid : null;
    }
    return null;
}

function windowsListScript(pid) {
    return (
        "$ProgressPreference = 'SilentlyContinue'\n" +
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" +
        "Add-Type -TypeDefinition @'\n" +
        'using System;\n' +
        'using System.Text;\n' +
        'using System.Runtime.InteropServices;\n' +
        'public class AquaStarWinList {\n' +
        '  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);\n' +
        '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);\n' +
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);\n' +
        '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);\n' +
        '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);\n' +
        '  public static string Collect(uint want) {\n' +
        '    StringBuilder rows = new StringBuilder();\n' +
        '    EnumProc proc = (h, l) => {\n' +
        '      if (!IsWindowVisible(h)) return true;\n' +
        '      uint wpid;\n' +
        '      GetWindowThreadProcessId(h, out wpid);\n' +
        '      if (wpid != want) return true;\n' +
        '      StringBuilder sb = new StringBuilder(1024);\n' +
        '      GetWindowTextW(h, sb, sb.Capacity);\n' +
        '      ulong id = IntPtr.Size == 8 ? unchecked((ulong)h.ToInt64()) : (uint)h.ToInt32();\n' +
        '      string title = sb.ToString().Replace("\\r", " ").Replace("\\n", " ");\n' +
        '      rows.Append(id.ToString()).Append("\\t").Append(title).Append("\\n");\n' +
        '      return true;\n' +
        '    };\n' +
        '    EnumWindows(proc, IntPtr.Zero);\n' +
        '    return rows.ToString();\n' +
        '  }\n' +
        '}\n' +
        "'@\n" +
        '[AquaStarWinList]::Collect(' + pid + ')\n'
    );
}

function windowsForegroundScript() {
    return (
        "$ProgressPreference = 'SilentlyContinue'\n" +
        "Add-Type -TypeDefinition @'\n" +
        'using System;\n' +
        'using System.Runtime.InteropServices;\n' +
        'public class AquaStarForeground {\n' +
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\n' +
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);\n' +
        '  public static uint Pid() {\n' +
        '    IntPtr h = GetForegroundWindow();\n' +
        '    if (h == IntPtr.Zero) return 0;\n' +
        '    uint pid;\n' +
        '    GetWindowThreadProcessId(h, out pid);\n' +
        '    return pid;\n' +
        '  }\n' +
        '}\n' +
        "'@\n" +
        '[AquaStarForeground]::Pid()\n'
    );
}

const SWIFT_LIST = [
    'import CoreGraphics',
    'import Foundation',
    'let want = Int32(WANTED_PID)',
    'guard let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {',
    '  fputs("unreadable\\n", stderr)',
    '  exit(1)',
    '}',
    'for row in info {',
    '  let owner = row[kCGWindowOwnerPID as String]',
    '  var pid = -1',
    '  if let n = owner as? Int { pid = n }',
    '  else if let n = owner as? Int32 { pid = Int(n) }',
    '  else if let n = owner as? NSNumber { pid = n.intValue }',
    '  if Int32(pid) != want { continue }',
    '  var number = 0',
    '  let rawNumber = row[kCGWindowNumber as String]',
    '  if let n = rawNumber as? Int { number = n }',
    '  else if let n = rawNumber as? NSNumber { number = n.intValue }',
    '  var name = ""',
    '  if let n = row[kCGWindowName as String] as? String { name = n }',
    '  let clean = name.replacingOccurrences(of: "\\n", with: " ").replacingOccurrences(of: "\\r", with: " ")',
    '  print("\\(number)\\t\\(clean)")',
    '}',
    ''
].join('\n');

function macWindowScript(pid) {
    return [
        'tell application "System Events"',
        'set proc to first process whose unix id is ' + pid,
        'if (count of windows of proc) is 0 then return ""',
        'set windowNames to name of every window of proc',
        "set AppleScript's text item delimiters to linefeed",
        'return windowNames as text',
        'end tell',
        ''
    ].join('\n');
}

function sessionKind() {
    if (process.platform !== 'linux') return 'other';
    if (process.env.XDG_SESSION_TYPE === 'wayland') return 'wayland';
    if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) return 'wayland';
    return 'x11';
}

function screenAccess() {
    if (process.platform !== 'darwin') return 'skipped';
    try {
        const electron = require('electron');
        const status = electron.systemPreferences.getMediaAccessStatus('screen');
        return status || 'unknown';
    } catch (_err) {
        return 'unknown';
    }
}

async function listWindowsWindows(pid) {
    const result = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', windowsListScript(pid)
    ]);
    if (result.error) return { ok: false };
    const parsed = parseTabLines(result.stdout, pid);
    if (!parsed) return { ok: false };
    return { ok: true, windows: parsed };
}

async function listWindowsMac(pid) {
    const swift = await run('swift', ['-'], SWIFT_LIST.replace('WANTED_PID', String(pid)));
    if (!swift.error) {
        const parsed = parseTabLines(swift.stdout, pid);
        if (parsed) return { ok: true, windows: parsed };
    }
    const osa = await run('osascript', [], macWindowScript(pid));
    if (osa.error) return { ok: false };
    const windows = [];
    const lines = String(osa.stdout || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;
        windows.push({ pid: pid, nativeId: '', title: lines[i].replace(/\r$/, '') });
    }
    return { ok: true, windows: windows };
}

function parseWmctrl(stdout, pid) {
    const windows = [];
    const lines = String(stdout || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const matched = /^(\S+)\s+(\S+)\s+(\d+)\s+(\S+)(?:\s(.*))?$/.exec(line);
        if (!matched) return null;
        if (Number(matched[3]) !== pid) continue;
        if (!/^0x[0-9a-fA-F]+$/.test(matched[1])) return null;
        let nativeId;
        try {
            nativeId = BigInt(matched[1]).toString(10);
        } catch (_err) {
            return null;
        }
        windows.push({ pid: pid, nativeId: nativeId, title: matched[5] || '' });
    }
    return windows;
}

async function listWindowsXdotool(pid) {
    const search = await run('xdotool', ['search', '--pid', String(pid)]);
    if (search.error && search.error.code === 'ENOENT') return { ok: false };
    const ids = [];
    const lines = String(search.stdout || '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        if (!/^\d+$/.test(trimmed)) return { ok: false };
        ids.push(trimmed);
    }
    if (!ids.length) return { ok: true, windows: [] };
    const names = await run('xdotool', ['getwindowname'].concat(ids));
    const titles = names.error ? [] : String(names.stdout || '').split(/\r?\n/);
    const windows = [];
    for (let i = 0; i < ids.length; i++) {
        windows.push({
            pid: pid,
            nativeId: ids[i],
            title: titles[i] ? titles[i].replace(/\r$/, '') : ''
        });
    }
    return { ok: true, windows: windows };
}

async function listWindowsLinux(pid) {
    const wm = await run('wmctrl', ['-lp']);
    if (!wm.error) {
        const parsed = parseWmctrl(wm.stdout, pid);
        if (!parsed) return { ok: false };
        return { ok: true, windows: parsed };
    }
    if (wm.error.code !== 'ENOENT') return { ok: false };
    return listWindowsXdotool(pid);
}

async function listWindowsForPid(pid) {
    try {
        if (!Number.isInteger(pid) || pid <= 0) return { ok: false };
        if (process.platform === 'win32') return await listWindowsWindows(pid);
        if (process.platform === 'darwin') return await listWindowsMac(pid);
        if (process.platform === 'linux') return await listWindowsLinux(pid);
        return { ok: false };
    } catch (_err) {
        return { ok: false };
    }
}

async function foregroundWindows() {
    const result = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command', windowsForegroundScript()
    ]);
    if (result.error) return null;
    return parsePid(result.stdout);
}

async function foregroundMac() {
    const osa = await run('osascript', ['-e',
        'tell application "System Events" to unix id of first application process whose frontmost is true'
    ]);
    if (!osa.error) {
        const pid = parsePid(osa.stdout);
        if (pid) return pid;
    }
    const front = await run('lsappinfo', ['front']);
    if (front.error) return null;
    const asn = String(front.stdout || '').trim().split(/\s+/)[0];
    if (!asn) return null;
    const info = await run('lsappinfo', ['info', '-only', 'pid', asn]);
    if (info.error) return null;
    return parsePid(info.stdout);
}

async function foregroundLinux() {
    const active = await run('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
    if (active.error) return null;
    const id = /0x[0-9a-fA-F]+/.exec(active.stdout);
    if (!id) return null;
    const pidLine = await run('xprop', ['-id', id[0], '_NET_WM_PID']);
    if (pidLine.error) return null;
    const matched = /_NET_WM_PID\(CARDINAL\)\s*=\s*(\d+)/.exec(pidLine.stdout);
    if (!matched) return null;
    const pid = Number(matched[1]);
    return pid > 0 ? pid : null;
}

async function foregroundPid() {
    try {
        if (sessionKind() === 'wayland') return null;
        if (process.platform === 'win32') return await foregroundWindows();
        if (process.platform === 'darwin') return await foregroundMac();
        if (process.platform === 'linux') return await foregroundLinux();
        return null;
    } catch (_err) {
        return null;
    }
}

function normalizePng(png) {
    if (!png) return null;
    if (Buffer.isBuffer(png)) return png.length > 0 ? png : null;
    if (png instanceof Uint8Array) return png.length > 0 ? Buffer.from(png) : null;
    if (png.type === 'Buffer' && Array.isArray(png.data)) {
        return png.data.length > 0 ? Buffer.from(png.data) : null;
    }
    return null;
}

let frameToken = 0;

function grabFrame(electron, win, sourceId) {
    return new Promise(function (resolve) {
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()) || !win.webContents) {
            resolve(null);
            return;
        }
        const token = ++frameToken;
        let settled = false;
        function finish(png) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            electron.ipcMain.removeListener('capture-native-frame-result', onResult);
            if (typeof win.removeListener === 'function') win.removeListener('closed', onClosed);
            resolve(png);
        }
        function onResult(_event, payload) {
            if (!payload || payload.token !== token) return;
            finish(normalizePng(payload.png));
        }
        function onClosed() {
            finish(null);
        }
        const timer = setTimeout(function () { finish(null); }, FRAME_TIMEOUT_MS);
        electron.ipcMain.on('capture-native-frame-result', onResult);
        if (typeof win.on === 'function') win.on('closed', onClosed);
        try {
            win.webContents.send('capture-native-frame', { token: token, sourceId: sourceId });
        } catch (_err) {
            finish(null);
        }
    });
}

function liveMessages() {
    const view = {};
    REASONS.forEach(function (reason) {
        const key = messageKey(reason);
        Object.defineProperty(view, key, {
            enumerable: true,
            get: function () {
                const constant = require('./const.js');
                const catalog = constant.titleMessages || {};
                return catalog[key];
            }
        });
    });
    return view;
}

let singletonCapture = null;

function singleton() {
    if (singletonCapture) return singletonCapture;
    const electron = require('electron');
    singletonCapture = createCapture({
        listWindows: listWindowsForPid,
        getSources: function (opts) {
            const thumbnailSize = opts && opts.thumbnailSize ? opts.thumbnailSize : { width: 0, height: 0 };
            return electron.desktopCapturer.getSources({
                types: ['window'],
                thumbnailSize: thumbnailSize
            });
        },
        grabFrame: function (win, sourceId) {
            return grabFrame(electron, win, sourceId);
        },
        screenAccess: screenAccess,
        session: sessionKind,
        foregroundPid: foregroundPid,
        messages: liveMessages()
    });
    return singletonCapture;
}

exports.REASONS = REASONS;
exports.messageKey = messageKey;
exports.createCapture = createCapture;
exports.open = function (win) { return singleton().open(win); };
exports.captureStill = function (win) { return singleton().captureStill(win); };
exports.recordingSource = function (win) { return singleton().recordingSource(win); };
exports.retarget = function (win) { return singleton().retarget(win); };
