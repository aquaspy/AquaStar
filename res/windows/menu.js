// App / game / context menus. Platform chrome is minimal; the active plugin
// supplies Useful Pages, Game/Features entries via menuRegistry.
const { BrowserWindow } = require('electron');
const constant     = require('../const.js');
const windowConfig = require('./config.js');
const locale       = require('../locale.js');
const menuRegistry = require('../platform/menu-registry.js');

function runAction(action, focusedWin) {
    require('../keybindings.js').runGameMenuAction(action, focusedWin);
}

function command(label, action, accelerator) {
    return {
        label: label,
        accelerator: accelerator,
        registerAccelerator: false,
        click(_item, focusedWin) {
            runAction(action, focusedWin);
        }
    };
}

function generateLink(label, link, keybind) {
    return {
        label: label,
        accelerator: keybind,
        registerAccelerator: false,
        openMode: 'in-place',
        click(menuItem, focusedWin) {
            if (focusedWin && focusedWin.webContents) focusedWin.webContents.loadURL(link);
        }
    };
}

function usefulPagesFromDescriptor(items) {
    return (items || []).map(function (item) {
        if (!item) return null;
        if (item.type === 'separator') return { type: 'separator' };
        if (item.submenu) {
            return {
                label: item.label,
                submenu: usefulPagesFromDescriptor(item.submenu)
            };
        }
        if (!item.url) return null;
        return generateLink(item.label, item.url, item.accelerator || null);
    }).filter(Boolean);
}

function gamePagesFromDescriptor(items, keybinds) {
    return (items || []).map(function (item) {
        if (!item) return null;
        if (item.type === 'separator') return { type: 'separator' };
        if (item.submenu) {
            return {
                label: item.label,
                submenu: gamePagesFromDescriptor(item.submenu, keybinds)
            };
        }
        const action = item.action || item.keybindId || item.id;
        if (action && !item.url) {
            return command(item.label, action, item.accelerator || keybinds[item.keybindId]);
        }
        if (item.url) {
            const openMode = item.openMode || 'new-window';
            return {
                label: item.label,
                accelerator: item.accelerator,
                registerAccelerator: false,
                openMode: openMode,
                click(_menuItem, focusedWin) {
                    if (openMode === 'in-place' && focusedWin && focusedWin.webContents) {
                        focusedWin.webContents.loadURL(item.url);
                        return;
                    }
                    require('../instances.js').newBrowserWindow(item.url);
                }
            };
        }
        return null;
    }).filter(Boolean);
}

function pluginContributorMenus(keybinds) {
    const menuMessages = (locale.strings && locale.strings.menuMessages) || {};
    return menuRegistry.buildMenuItems({
        keybinds: keybinds,
        labels: menuMessages,
        actions: {
            // Lazy: resolve through dispatcher when clicked
        },
        openLink: function (url, mode, focusedWin) {
            if (mode === 'in-place' && focusedWin && focusedWin.webContents) {
                focusedWin.webContents.loadURL(url);
                return;
            }
            require('../instances.js').newBrowserWindow(url);
        }
    });
}

function platformAquaStarMenu(menuMessages, keybinds) {
    return {
        label: 'AquaStar',
        submenu: [
            command(menuMessages.menuSettings || 'Settings', 'settings', keybinds.settings),
            { type: 'separator' },
            command(menuMessages.menuHelp || 'Help', 'help', keybinds.help),
            command(menuMessages.menuAbout || 'About', 'about', keybinds.about)
        ]
    };
}

function platformToolsMenu(menuMessages, keybinds) {
    return {
        label: menuMessages.menuTools || 'Tools',
        submenu: [
            command(menuMessages.menuTakeGameShot || 'Screenshot', 'sshot', keybinds.sshot),
            command(menuMessages.menuRecord || 'Record', 'record', keybinds.record),
            { type: 'separator' },
            command(menuMessages.menuReloadPage || 'Reload', 'reload', keybinds.reload),
            command(menuMessages.menuReloadCache || 'Reload + clear cache', 'reloadCache', keybinds.reloadCache),
            command(menuMessages.menuFullscreen || 'Fullscreen', 'fullscreen', keybinds.fullscreen)
        ]
    };
}

exports.getMenu = (keybinds, funcTakeSS, isContext) => {
    if (isContext == false && process.platform == 'darwin') return null;

    const menuMessages = locale.strings.menuMessages || {};
    const template = [];

    if (isContext) {
        template.push(
            {
                label: menuMessages.menuCopyURL || 'Copy URL',
                click(menuItem, focusedWin) {
                    require('electron').clipboard.writeText(
                        focusedWin.webContents.getURL(), 'clipboard');
                }
            },
            {
                label: menuMessages.menuReloadPage || 'Reload',
                click(menuItem, focusedWin) { focusedWin.reload(); }
            },
            { type: 'separator' }
        );
    }

    template.push(
        {
            label: '<<< ' + (menuMessages.menuBackward || 'Back'),
            accelerator: keybinds.backward,
            click(menuItem, focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoBack()) br.goBack();
            }
        },
        {
            label: '>>> ' + (menuMessages.menuFoward || 'Forward'),
            accelerator: keybinds.forward,
            click(menuItem, focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoForward()) br.goForward();
            }
        }
    );

    // Plugin Useful Pages only — never fall back to the AQW catalog.
    if (menuRegistry.hasAppUsefulPages()) {
        const described = menuRegistry.getAppUsefulPages({
            labels: menuMessages,
            keybinds: keybinds
        });
        const pages = usefulPagesFromDescriptor(described);
        if (pages.length) {
            template.push({
                label: menuMessages.menuOtherPages || 'Pages',
                submenu: pages
            });
        }
    }

    template.push({
        label: menuMessages.menuTools || 'Tools',
        submenu: [
            {
                label: menuMessages.menuTakeShot || 'Screenshot',
                accelerator: keybinds.sshot,
                click: function () {
                    if (typeof funcTakeSS === 'function') funcTakeSS();
                    else runAction('sshot');
                }
            },
            command(menuMessages.menuSettings || 'Settings', 'settings', keybinds.settings)
        ]
    });

    // Plugin-registered top-level menus (Game / Features / Example / …)
    pluginContributorMenus(keybinds).forEach(function (item) {
        template.push(item);
    });

    template.push(platformAquaStarMenu(menuMessages, keybinds));

    return template;
};

exports.getGameMenu = (keybinds) => {
    const menuMessages = locale.strings.menuMessages || {};
    const template = [
        platformAquaStarMenu(menuMessages, keybinds),
        platformToolsMenu(menuMessages, keybinds)
    ];

    if (menuRegistry.hasGameMenuPages && menuRegistry.hasGameMenuPages()) {
        const pages = gamePagesFromDescriptor(
            menuRegistry.getGameMenuPages({
                labels: menuMessages,
                keybinds: keybinds
            }),
            keybinds
        );
        if (pages.length) {
            template.push({
                label: menuMessages.menuOtherPages || 'Pages',
                submenu: pages
            });
        }
    }

    pluginContributorMenus(keybinds).forEach(function (item) {
        template.push(item);
    });

    return template;
};

function showHelpMessage(win){
    const dialogMessages = locale.strings.dialogMessages;
    const dialog_options = {
        buttons: ['Ok'],
        title:   dialogMessages.helpTitle,
        message: dialogMessages.helpMessage,
        detail:  dialogMessages.helpDetail + "\n\n" +
            dialogMessages.helpScreenshot + constant.sshotPath
    };
    require('electron').dialog.showMessageBox(win,dialog_options);
}
function showAboutMessage(win) {
    const dialogMessages = locale.strings.dialogMessages;
    const dialog_options = {
        buttons: [dialogMessages.aboutGithubPrompt, dialogMessages.aboutClosePrompt],
        title:   dialogMessages.aboutTitle + constant.appVersion,
        message: dialogMessages.aboutMessage,
        detail:  dialogMessages.aboutDetail + constant.githubPage +'\n\n\n' +
        dialogMessages.aboutDebug + ":\n" +
        "OS   - " + process.platform + "\n" +
        "ARCH - " + process.arch     + "\n"
    };

    require('electron').dialog.showMessageBox(win, dialog_options, (response) => {
        if (response != 0) return;
        const newWin = new BrowserWindow(windowConfig.winConfig);
        newWin.setMenuBarVisibility(true);
        newWin.loadURL(constant.githubPage);
    });
}

exports.showHelpMessage = showHelpMessage;
exports.showAboutMessage = showAboutMessage;
