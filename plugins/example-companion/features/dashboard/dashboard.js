// Side-effect IPC for the example dashboard feature window.
const { ipcMain } = require('electron');

let hostRef = null;

function attach(host) {
    hostRef = host;
    // Namespaced automatically for non-AQW plugins: plugin:example-companion:…
    host.ipc.handle('getDashboardState', function () {
        const store = host.getStore('demo');
        return store.readOrCreate(function () {
            return { visits: 0, lastOpenedAt: null, note: '' };
        });
    });
    host.ipc.handle('bumpDashboardVisit', function () {
        const store = host.getStore('demo');
        const state = store.readOrCreate(function () {
            return { visits: 0, lastOpenedAt: null, note: '' };
        });
        state.visits = (state.visits || 0) + 1;
        state.lastOpenedAt = new Date().toISOString();
        store.write(state);
        return state;
    });
    host.ipc.handle('saveDashboardNote', function (_event, note) {
        const store = host.getStore('demo');
        const state = store.readOrCreate(function () {
            return { visits: 0, lastOpenedAt: null, note: '' };
        });
        state.note = String(note == null ? '' : note).slice(0, 500);
        store.write(state);
        return state;
    });
    host.ipc.handle('fetchGithubRepoMeta', async function () {
        try {
            const result = await host.net.fetchText(
                'https://api.github.com/repos/aquaspy/AquaStar',
                {
                    headers: {
                        'User-Agent': 'AquaStar-ExampleCompanion',
                        'Accept': 'application/vnd.github+json'
                    }
                }
            );
            if (!result || !result.ok) {
                return {
                    ok: false,
                    error: (result && result.error) || 'fetch failed'
                };
            }
            const json = JSON.parse(result.html || result.text || '{}');
            return {
                ok: true,
                fullName: json.full_name,
                stars: json.stargazers_count,
                description: json.description
            };
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    });

    host.ipc.handle('getDashboardMessages', function () {
        return host.getLocaleStrings('dashboardMessages') || {};
    });
}

module.exports = {
    attach: attach,
    _hostForTests: function () { return hostRef; }
};

// Silence unused ipcMain lint in environments that scan requires
void ipcMain;
