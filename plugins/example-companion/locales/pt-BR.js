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
