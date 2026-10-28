const {app, session, Menu, BrowserWindow, dialog}  = require('electron')

// Helper processes (host.windows.spawnHelperProcess): a plugin script that needs its own
// Electron process. The platform runs it instead of the normal app and knows nothing else.
const helper = require('./res/platform/helper-process.js').resolveHelperScript(process.argv, __dirname);
if (helper.requested) {
    if (!helper.script) {
        console.error('[AquaStar] ' + helper.error);
        app.exit(1);
        return;
    }
    require(helper.script);
    return;
}

// I am honestly surprised we forgot this line.
if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

const path     = require('path')
const fs       = require('fs');

const keyb          = require('./res/keybindings.js');
// Platform IPC (always registered from main — never by plugins).
const ipcRecording  = require('./res/ipc/recording.js');
const inst          = require('./res/instances.js');
const windowsMenu   = require('./res/windows/menu.js');
const socketProxy   = require('./res/socketProxy.js');
const ruffleUpdate  = require('./res/ruffleUpdate.js');
const constant = require('./res/const.js');
const locale  = require('./res/locale.js');
const platform = require('./res/platform');

const bootPluginDisk = platform.readPluginFlagsFromDisk(
    constant.appDataDirectory,
    process.env
);
const bootFlags = bootPluginDisk.flags;

let activePluginRuntime = null;

// pluginSystem:false / AQUASTAR_DISABLE_PLUGINS=1 is the emergency "safe mode": only the
// bundled default plugin (the one whose manifest says bundledDefault) is activated, with no
// local plugins and no plugin selector, so a broken local plugin or a bad activePluginId can
// never keep the app from starting.

function activatePlugins() {
    platform.pluginRuntime.setDependencies({
        instances: inst,
        constant: constant,
        BrowserWindow: BrowserWindow
    });

    const safeMode = !bootFlags.pluginSystem;
    if (safeMode) {
        console.log('[AquaStar:plugins] pluginSystem disabled — safe mode: bundled default plugin only');
    }

    return platform.activateSelected({
        bundledDir: path.join(__dirname, 'plugins'),
        localDir: path.join(constant.appDataDirectory, 'plugins'),
        enableLocalPlugins: safeMode ? false : bootFlags.enableLocalPlugins,
        allowLocalPluginOverride: safeMode ? false : bootFlags.allowLocalPluginOverride,
        appVersion: constant.appVersion || app.getVersion(),
        appRootPath: constant.appRootPath,
        appDataDirectory: constant.appDataDirectory,
        // Saved settings first so plugins can read their own options at activate();
        // boot flags then win for the platform keys.
        safeMode: safeMode,
        platformSettings: Object.assign({}, bootPluginDisk.settings, bootFlags, {
            activePluginId: safeMode ? '' : bootFlags.activePluginId,
            trustedLocalPlugins: (bootPluginDisk.settings &&
                bootPluginDisk.settings.trustedLocalPlugins) || {}
        }),
        legacyIpc: true,
        deps: platform.pluginRuntime.createHostWindowDeps()
    }).then(function (runtime) {
        activePluginRuntime = runtime;
        if (runtime && runtime.host) {
            const state = runtime.host._getState();
            const hooks = state.navigationHooks;
            if (hooks) inst.setNavigationHooks(hooks);

            const pluginInfo = runtime.plugin && runtime.plugin.manifest
                ? {
                    id: runtime.plugin.manifest.id,
                    name: runtime.plugin.manifest.name || runtime.plugin.manifest.id
                }
                : null;
            platform.pluginRuntime.adopt(runtime.host, pluginInfo);
            // Older local SWF file names this plugin used to read (manifest customSwfAliases).
            constant.setCustomSwfAliases(runtime.plugin.manifest.customSwfAliases);

            platform.menuRegistry.adoptHostState(state, state.menuProviders || null);
            platform.settingsRegistry.adoptHostState(state, pluginInfo);
            if (state.locales) {
                locale.mergePluginLocales(state.locales);
            }
            const reserved = Object.keys(platform.PLATFORM_RESERVED_KEYBIND_IDS);
            const pluginBindIds = Object.keys(state.keybindDefaults || {});
            (state.keybinds || []).forEach(function (binding) {
                if (binding && binding.id && pluginBindIds.indexOf(binding.id) === -1) {
                    pluginBindIds.push(binding.id);
                }
            });
            keyb.setVisibleKeybindIds(reserved.concat(pluginBindIds));
        }
        return runtime;
    }).catch(function (err) {
        console.log('[AquaStar:plugins] Activation failed: ' + (err && err.message ? err.message : err));
        platform.menuRegistry.clear();
        platform.settingsRegistry.clear();
        platform.pluginRuntime.clear();
        return null;
    });
}

function createWindow () {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        // Screen capture is needed only by AquaStar's own game windows.  Normal
        // browser windows load remote account/wiki pages and must not inherit it.
        const win = BrowserWindow.fromWebContents(webContents);
        const swfUrl = win && win.aquaStarSwfUrl;
        const isGameWindow = typeof swfUrl === 'string' && constant.isRuffleEligible(swfUrl);
        callback(isGameWindow && (permission === 'media' || permission === 'display-capture'));
    });

    // Keybindings now in keybindings.js
    const finalkeyb = keyb.addKeybinding();

    // Best-effort background check: it deliberately never delays startup.
    if (finalkeyb.ruffleAutoUpdate === true) {
        ruffleUpdate.downloadLatest(
            constant.appDataDirectory,
            finalkeyb.ruffleUpdateChannel,
            path.join(constant.appRootPath, 'res', 'ruffle', 'ruffle.js')
        ).then((result) => {
            if (result && result.restartRequired) {
                const { Notification } = require('electron');
                new Notification({ title: 'AquaStar', body: 'A new Ruffle version was downloaded. Restart AquaStar to apply it.' }).show();
            }
        }).catch((e) => console.log('[AquaStar] Ruffle auto-update failed: ' + e.message));
    }

    // Lang setup. Has to be after Ready event.
    // Prefer explicit Settings → appLanguage over OS locale when set.
    const langPref = finalkeyb.appLanguage;
    const localeId = (!langPref || langPref === 'system') ? app.getLocale() : langPref;
    constant.setLocale(localeId, finalkeyb);

    // Minimal global menu first (Windows). Full plugin menus are per-window via setMenu.
    // Setting ApplicationMenu *after* the first setMenu left the initial window on the
    // stub menu only — order matters.
    if (process.platform === 'darwin') {
        Menu.setApplicationMenu(windowsMenu.darwinApplicationMenu());
    } else {
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { label: 'AquaStar', submenu: [{ role: 'quit' }] }
        ]));
    }

    // Primary URL comes from the active plugin (platform custom SWF / customUrl still win).
    const bootGameUrl = platform.pluginRuntime.getPrimaryUrl();
    if (!bootGameUrl) {
        dialog.showErrorBox('AquaStar',
            'No game plugin could be loaded, so there is nothing to open.\n\n' +
            'Check the console output for "[AquaStar:plugins]" lines, or reinstall AquaStar.');
        app.quit();
        return;
    }

    // webRequest rules go in before the first window loads anything.
    applySessionRules();

    let win = inst.newBrowserWindow(bootGameUrl, true);
    // Re-apply after setApplicationMenu so the first window keeps plugin menu entries.
    inst.applyWindowMenu(win, bootGameUrl);

    const smokeShot = process.env.AQUASTAR_SMOKE_SHOT;
    if (smokeShot && win) {
        const waitMs = Number(process.env.AQUASTAR_SMOKE_WAIT_MS || 20000);
        win.webContents.once('did-finish-load', function () {
            setTimeout(function () {
                win.webContents.capturePage().then(function (image) {
                    fs.writeFileSync(smokeShot, image.toPNG());
                    const size = image.getSize();
                    console.log('[AquaStar] smoke shot ' + smokeShot + ' ' + size.width + 'x' + size.height);
                    app.exit(0);
                }).catch(function (error) {
                    console.error('[AquaStar] smoke shot failed: ' + (error && error.message ? error.message : error));
                    app.exit(1);
                });
            }, waitMs);
        });
    }

    win.once('ready-to-show', () => {win.show()});  //show launcher only when ready
    
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}

// Platform rules (ad blocking) and the active plugin's rules share one applicator: Electron
// keeps a single listener per webRequest event, so separate registrations would replace
// each other. The platform only supplies the browser's own UA; any UA policy is the plugin's.
function applySessionRules() {
    let swfLogStream = null;
    if (constant.isSwfLogEnabled) {
        var t = new Date();
        var logName = "SWF log " +
            t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate() + "_" +
            t.getHours() + "-" + t.getMinutes() + ".txt";
        inst.mkdir(constant.swflogPath);
        swfLogStream = fs.createWriteStream(
            path.join(constant.swflogPath, logName),
            { autoClose: true });
    }

    const pluginRules = activePluginRuntime && activePluginRuntime.host
        ? (activePluginRuntime.host._getState().sessionRules || [])
        : [];

    platform.applySessionRules(
        session.defaultSession,
        platform.createPlatformSessionRules().concat(pluginRules),
        {
            defaultUserAgent: session.defaultSession.getUserAgent(),
            settings: { swfLog: constant.isSwfLogEnabled },
            logLine: function (line) {
                if (swfLogStream) swfLogStream.write(line + '\n');
            }
        }
    );
}

app.on('second-instance', () => {
  // Someone tried to run a second AquaStar - focus the existing one instead.
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
})
// macOS can emit activate before ready (including during a backend restart).
// Share initialization so activate and ready cannot race plugin activation or create
// a window before Electron's session is available.
let initializationPromise = null;
function ensureMainWindow() {
  if (!initializationPromise) {
    initializationPromise = app.whenReady().then(() => {
      // No AquaStar window needs Chromium's spellchecker. Avoid downloading and
      // loading a Hunspell dictionary into the browser process on every launch.
      try { session.defaultSession.setSpellCheckerLanguages([]); }
      catch (e) { console.log('[AquaStar] Could not disable spellchecker: ' + e.message); }
      return activatePlugins();
    });
  }
  return initializationPromise.then(() => {
    // Recheck after initialization: repeated activate events may be waiting too.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
app.on('ready', ensureMainWindow);
app.on('will-quit', () => {
  keyb.unregisterGlobalShortcuts();
  // No-op if a Ruffle-mode window never started it.
  socketProxy.stop();
  if (activePluginRuntime && activePluginRuntime.module &&
      typeof activePluginRuntime.module.deactivate === 'function') {
    try { activePluginRuntime.module.deactivate(activePluginRuntime.host); }
    catch (e) { console.log('[AquaStar:plugins] deactivate error: ' + e.message); }
  }
})
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', ensureMainWindow);
