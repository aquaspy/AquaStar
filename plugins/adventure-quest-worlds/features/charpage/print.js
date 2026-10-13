// Char Page screenshot (Alt+K). Opens the focused Char Page in a hidden window, waits for the
// Flash to render, crops the original 715x455 area and saves a screenshot. The user is kept
// informed through the focused window's title. The title flash helpers, the JS runner and the
// screenshot writer are generic platform services handed in by the caller.

// Original Char Page Flash proportion.
const ORIGINAL_WIDTH = 715;
const ORIGINAL_HEIGHT = 455;
// There is no event for "Flash finished loading", so give the assets time to arrive.
const RENDER_DELAY_MS = 5000;

/**
 * Rectangle of the Flash movie inside a window of the given size, preserving the original
 * proportion (letterboxed, centered horizontally when the window is wider).
 */
function movieRect(windowSize) {
    const width = windowSize[0];
    const height = windowSize[1];
    if ((width / height) > (ORIGINAL_WIDTH / ORIGINAL_HEIGHT)) {
        // Window is wider than the original: scale by height, center horizontally.
        const scaledWidth = ORIGINAL_WIDTH * (height / ORIGINAL_HEIGHT);
        return {
            x: Math.round((width - scaledWidth) / 2),
            y: 0,
            width: Math.round(scaledWidth),
            height: height
        };
    }
    return {
        x: 0,
        y: 0,
        width: width,
        height: Math.round(ORIGINAL_HEIGHT * (width / ORIGINAL_WIDTH))
    };
}

/**
 * @param {object} deps
 * @param {Function} deps.BrowserWindow Electron BrowserWindow class
 * @param {object} deps.windowConfig BrowserWindow options of the hidden print window
 * @param {(url: string) => string} deps.classify navigation classifier ('charpage' for a Char Page)
 * @param {(webContents: object, source: string, label: string) => Promise<any>} deps.executeJavaScript
 * @param {(win: object, text: string, resetAfter?: boolean) => void} deps.notify title flash
 * @param {(win: object, rect: object, destroyWindow: boolean) => any} deps.takeScreenshot
 * @param {() => object} deps.getMessages { invalid, loading, building, done }
 */
function createCharPagePrint(deps) {
    // Closing the focused window early must stop the "Building…" / "Done" updates.
    let printWindowOpen = false;

    return function charPagePrint() {
        const focusedWindow = deps.BrowserWindow.getFocusedWindow();
        if (focusedWindow == null) return;
        const url = focusedWindow.webContents.getURL();
        if (deps.classify(url) !== 'charpage') return;

        const messages = deps.getMessages() || {};
        const code = '(document.getElementsByTagName("object")[0] == undefined)? false : true;';
        deps.executeJavaScript(focusedWindow.webContents, code, 'Char page check').then(function (flashExists) {
            if (!flashExists) {
                deps.notify(focusedWindow, messages.invalid);
                return;
            }
            const printWindow = new deps.BrowserWindow(deps.windowConfig);
            printWindow.setMenuBarVisibility(false);
            deps.notify(focusedWindow, messages.loading, false);
            printWindow.loadURL(url);

            printWindowOpen = true;
            focusedWindow.on('closed', function () { printWindowOpen = false; });

            printWindow.webContents.on('did-finish-load', function () {
                if (printWindowOpen) deps.notify(focusedWindow, messages.building, false);

                setTimeout(function () {
                    deps.takeScreenshot(printWindow, movieRect(printWindow.getSize()), true);
                    if (printWindowOpen) deps.notify(focusedWindow, messages.done);
                }, RENDER_DELAY_MS);
            });
        });
    };
}

module.exports = {
    createCharPagePrint: createCharPagePrint,
    movieRect: movieRect,
    ORIGINAL_WIDTH: ORIGINAL_WIDTH,
    ORIGINAL_HEIGHT: ORIGINAL_HEIGHT
};
