// User-Agent sent to Artix servers, matching what Artix Game Launcher 2.2.0 sends.
//
// The launcher's raw UA carries an "ArtixGameLauncher/x.y.z" token and its code runs
// `ua.replace(/Artix.*\s/, '')`. That greedy regex also eats the Chrome/ and Electron/
// tokens that follow, so the servers actually see:
//   Mozilla/5.0 (...) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36
// AquaStar's raw UA has no "Artix" token, so the same regex was a no-op and the
// servers saw "AquaStar/x Chrome/87 Electron/11.5.0".

function launcherUserAgent(rawUA) {
    return String(rawUA || '')
        .replace(/\s(?:Artix\S*|AquaStar|Chrome|Electron)\/\S+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

module.exports = { launcherUserAgent: launcherUserAgent };
