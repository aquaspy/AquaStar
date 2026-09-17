exports.dialogMessages = {
    helpMessage: 'Example Companion — demo de plugin do AquaStar',
    helpDetailExtra: function (k) {
        function expand(keyb) {
            if (Array.isArray(keyb)) return keyb.join(', ');
            return keyb || '';
        }
        return 'Example Companion\n' +
            expand(k.newStage) + ' - Nova janela BoxMover.swf (setas movem o quadrado)\n' +
            expand(k.openDashboard) + ' - Painel de exemplo (store / IPC / fetch)\n' +
            expand(k.openInjectDemo) + ' - Página local de demo de injeção\n' +
            expand(k.openGithub) + ' / ' + expand(k.openReleases) + ' / ' +
            expand(k.openPluginsDocs) + ' - GitHub / docs no navegador do sistema\n' +
            '(O Electron 11 não renderiza o github.com moderno dentro do app.)';
    }
};

exports.dashboardMessages = {
    title: 'Painel do Example Companion',
    blurb: 'Demonstra persistent-store, IPC namespaced e net-fetch (API do GitHub).',
    labelVisits: 'Visitas',
    labelLast: 'Última abertura',
    labelNote: 'Nota (aquastar.example-companion.demo.json)',
    saveNote: 'Salvar nota',
    refresh: 'Atualizar',
    fetchRepo: 'Buscar aquaspy/AquaStar via net.fetchText',
    saved: 'Nota salva.',
    fetchOk: 'Busca ok.',
    fetching: 'Buscando…',
    fetchFail: 'Falha na busca'
};

exports.settingsMessages = {
    optionLabels: {
        demoPlayerName: 'Nome de exibição (demo)',
        demoShowTips: 'Ativar injeção na página local de demo'
    },
    optionHints: {
        demoPlayerName: 'Salvo em plugins[example-companion] no aquastar.json (settings híbrido).',
        demoShowTips: 'Quando ligado, a página local de injeção (Alt+I) recebe o hook de navegação. Páginas do GitHub nunca são injetadas (quebram CSS/JS deles).'
    },
    settingsSections: {
        demo: 'Opções do plugin de exemplo'
    }
};

exports.menuMessages = {
    exampleGithub: 'AquaStar no GitHub',
    exampleReleases: 'Releases no GitHub',
    examplePluginsDocs: 'Guia de plugins'
};
