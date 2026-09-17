const path = require('path');
const url = require('url');

const menus = require('./menus.js');
const keybinds = require('./keybinds.js');
const session = require('./session.js');
const navigation = require('./injections/navigation.js');
const dashboardIpc = require('./features/dashboard/dashboard.js');

function toFileUrl(filePath) {
    return url.pathToFileURL(filePath).href;
}

function activate(host) {
    const boxmoverSwf = toFileUrl(path.join(__dirname, 'assets', 'boxmover.swf'));
    const rectangleSwf = toFileUrl(path.join(__dirname, 'assets', 'rectangle.swf'));

    host.setPrimaryGame({
        id: 'example-boxmover',
        getUrl: function () { return boxmoverSwf; },
        title: function () { return 'AquaStar - Example Companion'; },
        isGameUrl: function (candidate) {
            return typeof candidate === 'string' &&
                /\.swf(\?|#|$)/i.test(candidate) &&
                (candidate.indexOf('boxmover.swf') !== -1 ||
                    candidate.indexOf('rectangle.swf') !== -1);
        },
        wrap: { preferDirectWmode: true, ruffleEligible: true },
        flashTrust: true
    });

    host.registerLaunches([
        {
            id: 'example-static-rect',
            getUrl: function () { return rectangleSwf; },
            title: function () { return 'AquaStar - Static rectangle.swf'; },
            wrap: { preferDirectWmode: true, ruffleEligible: true },
            flashTrust: true
        }
    ]);

    host.trustFlashUrls([boxmoverSwf, rectangleSwf]);
    host.registerSessionRules(session.createSessionRules());
    host.registerNavigationHooks(navigation.createNavigationHooks(host));

    menus.register(host);
    keybinds.register(host);

    host.registerLocales({
        'en-US': require('./locales/en-US.js'),
        'pt-BR': require('./locales/pt-BR.js')
    });

    host.registerOptionDefaults({
        demoPlayerName: 'Example Player',
        demoShowTips: true
    });

    host.registerSettingsSection({
        id: 'example-demo',
        titleKey: 'demo',
        title: 'Example plugin options',
        order: 10,
        fields: [
            { key: 'demoPlayerName', type: 'text' },
            { key: 'demoShowTips', type: 'boolean' }
        ]
    });

    const dashboardHtml = toFileUrl(path.join(__dirname, 'features', 'dashboard', 'dashboard.html'));
    const dashboardPreload = path.join(__dirname, 'features', 'dashboard', 'preload_dashboard.js');
    host.registerFeatureWindows([{
        id: 'example-dashboard',
        title: 'Example Dashboard',
        url: dashboardHtml,
        config: {
            width: 520,
            height: 560,
            useContentSize: true,
            webPreferences: {
                nodeIntegration: false,
                sandbox: true,
                contextIsolation: true,
                plugins: false,
                preload: dashboardPreload
            }
        }
    }]);

    dashboardIpc.attach(host);

    host.log('Example Companion plugin activated (primary=boxmover.swf)');
}

module.exports = {
    activate: activate
};
