// App menu + the Help/About dialogs it opens. Split out of const.js so menu-building
// stays separate from app-wide constants and window-shape configs. Pulls menuMessages/
// dialogMessages fresh from locale.strings on every call instead of caching them in a
// module-scoped var (setLocale() re-populates locale.strings whenever the language or
// keybinds change, so reading it live here is simpler than keeping a second copy in sync).
const { BrowserWindow } = require('electron');
const constant     = require('../const.js');
const windowConfig = require('./config.js');
const locale       = require('../locale.js');

exports.getMenu = (keybinds, funcTakeSS, isContext = false) => {
    // needs to be like that as the function is located on instances...
    if (isContext == false && process.platform == 'darwin') return null;

    const menuMessages = locale.strings.menuMessages;

    function generateLink (label,link,keybind = null) {
        return {
            label: label,
            accelerator: keybind,
            // Show the shortcut hint only - don't actually bind it here. These keys
            // (wiki/design/account/charpage) already open a *new* window via
            // electron-localshortcut; letting the menu also register the accelerator
            // races that handler and can replace the current window's URL instead
            // (most visible once DevTools shifts window focus timing).
            registerAccelerator: false,
            click(menuItem,focusedWin) {
                focusedWin.webContents.loadURL(link);
            }
        }
    }
    var links =
    [
        {
            label: '<<< ' + menuMessages.menuBackward,
            accelerator: keybinds.backward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoBack()) br.goBack();
            }
        },
        {
            label: '>>> ' + menuMessages.menuFoward,
            accelerator: keybinds.forward,
            click(menuItem,focusedWin) {
                var br = focusedWin.webContents;
                if (br.canGoForward()) br.goForward();
            }
        }, // Sorry Mac, you cant have those next ones as its not worth it... There is still right click tho
        {
            label: menuMessages.menuOtherPages,
            submenu: [
                generateLink(menuMessages.menuWiki,constant.wikiReleases,keybinds.wiki),
                generateLink(menuMessages.menuDesign,constant.designNotes,keybinds.design),
                generateLink(menuMessages.menuAccount,constant.accountAq,keybinds.account),
                generateLink(menuMessages.menuCharpage,constant.charLookup,keybinds.charpage),
                // No keybind now...
                {type: 'separator'},
                {
                    label: menuMessages.menuOtherPages2,
                    submenu: [
                        generateLink(menuMessages.menuDailyGifts,constant.dailyGifts),
                        generateLink(menuMessages.menuCalendar,constant.calendar),
                        generateLink(menuMessages.menuForge,constant.forgeEnchants),
                        generateLink(menuMessages.menuHeromart,constant.heromart),
                        generateLink(menuMessages.menuPortal,constant.battleon)
                    ]
                },
                {
                    label: menuMessages.menuSocialMedia,
                    submenu: [
                        generateLink(menuMessages.menuTwitter,constant.twtAlina),
                        generateLink(menuMessages.menuReddit,constant.redditAqw)
                    ]
                }
            ]
        },
        {
            label: menuMessages.menuTakeShot,
            accelerator: keybinds.cpSshot,
            click() {
                funcTakeSS();
            }
        },
        {
            label: menuMessages.menuSettings,
            accelerator: keybinds.settings,
            click() {
                // Cant pull instances module at top level or else would be cyclical.
                require('../instances.js').openSettingsWindow();
            }
        },
        {
            label: menuMessages.menuReminders,
            accelerator: keybinds.reminders,
            click() {
                require('../instances.js').openRemindersWindow();
            }
        }
    ];
    if (isContext){
        var ret = [
            {
                label: menuMessages.menuCopyURL,
                click(menuItem,focusedWin) {
                    require('electron').clipboard.writeText(
                        focusedWin.webContents.getURL(),'clipboard');
                }
            },
            {
                label: menuMessages.menuReloadPage,
                click(menuItem,focusedWin) {
                    focusedWin.reload();
                }
            },
            { type: 'separator' }
        ];
        ret.reverse().forEach((e) => {links.splice(0, 0, e)}); // Insert at the beginning
    }
    return links;
}

function showHelpMessage(win){
    const dialogMessages = locale.strings.dialogMessages;
    const dialog_options = {
        buttons: ['Ok'],
        title:   dialogMessages.helpTitle,
        message: dialogMessages.helpMessage,
        detail:  dialogMessages.helpDetail + "\n" +
            dialogMessages.helpCustomKeyPath + constant.appdataJsonPath + "\n" +
            dialogMessages.helpScreenshot + constant.sshotPath + "\n" +
            dialogMessages.helpAqliteOld + constant.appDirectoryPath
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

    // I wish the worse for who created Promisses and async stuff with such poor way to deal with them.
    // Now i have to do ugly and messy code. Good job. ASSHOLE
    // and no, sync version isnt available on our version. Freaking flash....
    require('electron').dialog.showMessageBox(win,dialog_options, (response) => {
        if (response != 0) return;

        // Cant pull instances module or else would be cyclical.
        const newWin = new BrowserWindow(windowConfig.winConfig);
        newWin.setMenuBarVisibility(true);
        newWin.loadURL(constant.githubPage);
    });
}

exports.showHelpMessage  = showHelpMessage;
exports.showAboutMessage = showAboutMessage;
