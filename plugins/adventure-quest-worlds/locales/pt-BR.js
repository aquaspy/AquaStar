// AQW plugin locale catalog (pt-BR).
// Feature / game-specific strings; platform chrome stays in res/po.

function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.charPageStudioMessages = {
    locale: "pt-BR",
    title: "AquaStar — Char Page Studio",
    heading: "Char Page Studio",
    description: "Personalize uma Char Page com o Flash Player nativo.",
    sceneModeLabel: "Modo de cena",
    charPageMode: "Char Page Studio",
    emptySceneMode: "Cenário vazio",
    emptySceneHint: "Cenário vazio usa o novo compositor AQW: sem interface, moldura ou fundo da Char Page.",
    characterLabel: "Personagem AQW",
    loadCharacterButton: "Carregar da Char Page",
    characterHint: "Usa por padrão o Personagem configurado nas Configurações, mas não baixa nada até este botão ser usado.",
    colorsLabel: "Cores",
    backgroundIndexLabel: "Fundo (bgindex)",
    emptySceneSettingsLabel: "Fundo sólido e FPS (cenário vazio)",
    solidBackgroundLabel: "Fundo sólido",
    nativeFps: "24 FPS (AQW)",
    loadSceneButton: "Carregar cenário",
    savePngButton: "Salvar print PNG",
    saveGifButton: "Gerar GIF (8 s)",
    gifFpsLabel: "FPS do GIF",
    gifColorsLabel: "Cores do GIF"
};

exports.dialogMessages = {
    helpDetail: function (k) {return expand(k.wiki) + ' - AQW Wiki\n' +
        expand(k.design)    + ' - AQW Design Notes\n' +
        expand(k.account)   + ' - Página da conta AQW\n' +
        expand(k.charpage)  + ' - Consulta a Char Page do personagem configurado nas Configurações\n' +
        expand(k.cpSshot)   + ' - (Somente Char Pages) salva uma imagem da Char Page aberta\n' +
        expand(k.newAqw)    + ' - Abre uma nova instância do AQW.\n' +
        expand(k.newTest)   + ' - Abre uma instância de testes do AQW.\n' +
        expand(k.dragon)    + ' - Abre o DragonFable.\n' +
        expand(k.about)     + ' - Sobre AquaStar.\n' +
        expand(k.fullscreen)+ ' - Ativa/desativa tela cheia.\n' +
        expand(k.sshot)     + ' - Salva um print da janela do jogo.\n' +
        expand(k.record)    + ' - Grava a tela do jogo. Use de novo para parar.\n' +
        expand(k.reload)    + " - Recarrega a página atual.\n" +
        expand(k.reloadCache)+' - Limpa o cache e dados do jogo, então recarrega a página.\n' +
        expand(k.settings)  + ' - Abre a tela de Configurações, para customizar as keybindings.\n' +
        expand(k.reminders) + ' - Abre Lembretes de quests por personagem.\n' +
        expand(k.todo)      + ' - Abre a Lista de Tarefas.\n' +
        expand(k.inventory) + ' - Abre Inventário/BuyBack.\n' +
        expand(k.strategy)  + ' - Abre as ferramentas de Estratégia.\n\n' +
        'A barra de menu acima do jogo oferece estes mesmos comandos e pode ser desligada nas Configurações.\n' +
        'Use Char Page Studio pelo menu AquaStar para criar imagens e GIFs.\n\n' +
        'Nota: ' + expand(k.help) + ' mostra esta mensagem.';
    }
};

exports.menuMessages = {
    menuOtherPages: "Páginas úteis",
    menuOtherPages2: "Outras páginas úteis",
    menuSocialMedia: "Redes sociais",
    menuWiki: "AQW Wiki",
    menuDesign: "Design Notes",
    menuBalancePatchNotes: "Balance/Class Patch Notes",
    menuAccount: "AQW Account",
    menuPortal: "Portal Battleon",
    menuHeromart: "Heromart",
    menuDailyGifts: "Drops Diários",
    menuCalendar: "Calendário de Eventos",
    menuCharpage: "Charpages",
    menuForge: "Encantamentos de Forja",
    menuReddit: "AQW Subreddit",
    menuTwitter: "Twitter da Alina",
    menuTakeShot: "Printa a Charpage (somente CP!)",
    menuCharPageStudio: "Char Page Studio",
    menuReminders: "Lembretes",
    menuTodo: "Lista de Tarefas",
    menuInventory: "Inventário",
    menuStrategy: "Estratégia",
    menuNewAqw: "Nova Instância AQW",
    menuNewTest: "Instância de Testes AQW",
    menuDragon: "DragonFable",
    menuTools: "Ferramentas",
    menuFeatures: "Recursos",
};

exports.settingsMessages = {
    labels: {
        wiki: "Abrir a Wiki do AQW",
        account: "Abrir a Página da Conta",
        design: "Abrir as Design Notes",
        charpage: "Consultar Char Page",
        newAqw: "Abrir Nova Instância do AQW",
        newTest: "Abrir Instância de Testes do AQW",
        dragon: "Abrir o DragonFable",
        reminders: "Abrir Lembretes",
        todo: "Abrir Lista de Tarefas",
        inventory: "Abrir Inventário",
        strategy: "Abrir Estratégia",
        cpSshot: "Printar a Char Page",
    },
    optionLabels: {
        playerCharacter: "Personagem",
        featurePlayerName: "Mostrar Personagem no Título da Janela",
        autoSync: "Auto Sincronizar Inventário",
    },
    optionHints: {
        playerCharacter: "Apenas letras e números. Usado pelo atalho da Char Page (Alt+P) para abrir direto neste personagem.",
        featurePlayerName: "Quando ativado, substitui \"AquaStar\" no título da janela principal pelo Personagem acima.",
        autoSync: "Sincroniza periodicamente seus dados de Inventário/BuyBack do account.aq.com em segundo plano (a cada ~2 horas), depois de você logar lá pelo menos uma vez via Alt+A. Quando desligado, a sincronização só acontece quando você usa um botão Sincronizar Agora (na janela de Inventário ou no account.aq.com/Home).",
    },
    settingsSections: {
        account: "Conta e Inventário"
    }
};

exports.remindersMessages = {
    title: "AquaStar - Lembretes",
    heading: "Lembretes",
    description: "Acompanhe tarefas diárias e semanais do jogo por personagem. Os resets seguem o horário do servidor da AE (America/New_York) - diário à meia-noite, semanal na virada de quinta para sexta.",
    showCompletedLabel: "Mostrar concluídas",
    showMemberDailiesLabel: "Mostrar lembretes member",
    individualHiddenLabel: "Lista de ocultas individual por personagem",
    serverTimeLabel: "Horário do Servidor",
    categoryClassLabel: "Classe",
    categoryUltraLabel: "Ultra Bosses",
    categoryOtherLabel: "Outros",
    memberToggleLabel: "Membro",
    memberBadgeShort: "★",
    memberBadgeTitle: "Conteúdo exclusivo para membros",
    seasonalToggleLabel: "Sazonal",
    seasonalSectionLabel: "Sazonais",
    nextFriday13Label: "Próxima sexta-feira 13: ",
    thisMonthLabel: "Este Mês",
    monthNames: [
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro"
    ],
    seasonalEvents: {
        nulgathBirthday: {
            label: "Aniversário do Nulgath (Jan)",
            short: "JAN"
        },
        carnival: {
            label: "Carnaval / Ano Novo Lunar (Fev)",
            short: "FEV"
        },
        dageBirthday: {
            label: "Aniversário do Dage / Dia da Sorte (Mar)",
            short: "MAR"
        },
        aprilFools: {
            label: "Dia da Mentira (Abr)",
            short: "ABR"
        },
        mayThe4th: {
            label: "Star Wars Day - 4 de Maio (Mai)",
            short: "MAI"
        },
        starFestival: {
            label: "Festival das Estrelas / Verão (Jul)",
            short: "JUL"
        },
        kalaSeason: {
            label: "Volta às Aulas / Dia da Indonésia (Ago)",
            short: "AGO"
        },
        friday13: {
            label: "Sexta-feira 13",
            short: "S13"
        },
        pirateDay: {
            label: "Dia de Falar Como Pirata / Independência (Set)",
            short: "SET"
        },
        anniversary: {
            label: "Mogloween / Aniversário do AQW (Out)",
            short: "OUT"
        },
        blackFriday: {
            label: "Black Friday (Nov)",
            short: "NOV"
        },
        frostval: {
            label: "Frostval / Ano Novo (Dez)",
            short: "DEZ"
        }
    },
    addCharacterTab: "+ Adicionar Personagem",
    promptCharacterName: "Nome do personagem:",
    promptOkButton: "OK",
    promptCancelButton: "Cancelar",
    baseCharacterPrompt: "A lista de ocultas de qual personagem deve virar a nova lista compartilhada?",
    confirmDeleteCharacter: "Remover este personagem e seu progresso em todas as quests? Isso não pode ser desfeito.",
    confirmDeleteQuest: "Excluir esta quest para todos os personagens? Isso não pode ser desfeito.",
    noCharactersHint: "Adicione uma aba de personagem acima para começar a acompanhar quests.",
    questNamePlaceholder: "Nome da quest",
    questJoinPlaceholder: "/join ...",
    filterNamePlaceholder: "Filtrar por nome...",
    filterAllLabel: "Todas",
    dailyLabel: "Diária",
    weeklyLabel: "Semanal",
    monthlyLabel: "Mensal",
    addQuestButton: "Adicionar Quest",
    copyButton: "Copiar",
    copiedLabel: "Copiado!",
    deleteButton: "Excluir",
    hideButton: "Ocultar",
    unhideButton: "Reexibir",
    archiveToggleLabel: "Ocultas",
    dragHandleTitle: "Arraste para reordenar",
    renameTabTitle: "Renomear",
    removeTabTitle: "Remover",
    savingLabel: "Salvando...",
    savedLabel: "Salvo"
};

exports.todoMessages = {
    title: "AquaStar - Lista de Tarefas",
    heading: "Lista de Tarefas",
    description: "Acompanhe drops, itens de loja e recompensas de quest para pegar, por personagem.",
    serverTimeLabel: "Horário do Servidor",
    individualHiddenLabel: "Lista de concluídas individual por personagem",
    categoryDropLabel: "Drop",
    categoryDailyDropLabel: "Drop Diário",
    categoryShopMergeLabel: "Loja/Fusão",
    categoryQuestRewardLabel: "Recompensa de Quest",
    categoryHardFarmLabel: "Farm Difícil",
    categoryReputationFarmLabel: "Farm de Reputação",
    priorityToggleLabel: "Prioridade",
    priorityToggleTitle: "Alternar prioridade - tarefas prioritárias ficam listadas primeiro",
    seasonalToggleLabel: "Sazonal",
    seasonalSectionLabel: "Sazonais",
    nextFriday13Label: "Próxima sexta-feira 13: ",
    thisMonthLabel: "Este Mês",
    monthNames: [
        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro"
    ],
    seasonalEvents: {
        nulgathBirthday: {
            label: "Aniversário do Nulgath (Jan)",
            short: "JAN"
        },
        carnival: {
            label: "Carnaval / Ano Novo Lunar (Fev)",
            short: "FEV"
        },
        dageBirthday: {
            label: "Aniversário do Dage / Dia da Sorte (Mar)",
            short: "MAR"
        },
        aprilFools: {
            label: "Dia da Mentira (Abr)",
            short: "ABR"
        },
        mayThe4th: {
            label: "Star Wars Day - 4 de Maio (Mai)",
            short: "MAI"
        },
        starFestival: {
            label: "Festival das Estrelas / Verão (Jul)",
            short: "JUL"
        },
        kalaSeason: {
            label: "Volta às Aulas / Dia da Indonésia (Ago)",
            short: "AGO"
        },
        friday13: {
            label: "Sexta-feira 13",
            short: "S13"
        },
        pirateDay: {
            label: "Dia de Falar Como Pirata / Independência (Set)",
            short: "SET"
        },
        anniversary: {
            label: "Mogloween / Aniversário do AQW (Out)",
            short: "OUT"
        },
        blackFriday: {
            label: "Black Friday (Nov)",
            short: "NOV"
        },
        frostval: {
            label: "Frostval / Ano Novo (Dez)",
            short: "DEZ"
        }
    },
    addCharacterTab: "+ Adicionar Personagem",
    promptCharacterName: "Nome do personagem:",
    promptOkButton: "OK",
    promptCancelButton: "Cancelar",
    baseCharacterPrompt: "A lista de concluídas de qual personagem deve virar a nova lista compartilhada?",
    confirmDeleteCharacter: "Remover este personagem e seu progresso em todas as tarefas? Isso não pode ser desfeito.",
    confirmDeleteTask: "Excluir esta tarefa para todos os personagens? Isso não pode ser desfeito.",
    noCharactersHint: "Adicione uma aba de personagem acima para começar a acompanhar tarefas.",
    taskNamePlaceholder: "Nome da tarefa",
    wikiLinkPlaceholder: "Link da wiki (opcional)",
    joinCommandPlaceholder: "/join ... (opcional)",
    copyButton: "Copiar",
    copiedLabel: "Copiado!",
    filterNamePlaceholder: "Filtrar por nome...",
    filterAllLabel: "Todas",
    addTaskButton: "Adicionar Tarefa",
    wikiLinkButtonTitle: "Abrir link da wiki",
    completeButton: "Concluir",
    reopenButton: "Reabrir",
    deleteButton: "Excluir",
    completedToggleLabel: "Concluídas",
    dragHandleTitle: "Arraste para reordenar",
    renameTabTitle: "Renomear",
    removeTabTitle: "Remover",
    savingLabel: "Salvando...",
    savedLabel: "Salvo"
};

exports.strategyMessages = {
    title: "AquaStar - Estratégia",
    heading: "Estratégia",
    description: "Planeje composições, táticas e mecânicas cronometradas para Ultra e Challenge Bosses.",
    addBoss: "Adicionar Boss",
    manageClasses: "Classes",
    managePotions: "Potes",
    manageTimerTypes: "Tipos de Timer",
    saved: "Salvo",
    emptyBosses: "Nenhum boss cadastrado. Adicione um para começar.",
    emptyStrategies: "Nenhuma estratégia cadastrada.",
    ultra: "Ultra Boss",
    challenge: "Challenge Boss",
    weekly: "Semanal",
    daily: "Diária",
    players: "jogadores",
    zone: "Zona",
    noJoin: "Sem /join definido",
    main: "Boss",
    left: "Esquerda",
    right: "Direita",
    open: "Abrir",
    edit: "Editar",
    delete: "Excluir",
    deleteBossConfirm: "Excluir este boss e todas as estratégias dele?",
    deleteStrategyConfirm: "Excluir esta estratégia?",
    bosses: "Todos os Bosses",
    strategies: "Estratégias",
    addStrategy: "Adicionar Estratégia",
    editStrategy: "Editar Estratégia",
    team: "Composição do Time",
    bossNotes: "Detalhes do Boss",
    strategyNotes: "Detalhes da Estratégia",
    save: "Salvar",
    player: "Jogador",
    noClass: "Nenhuma classe selecionada",
    editBoss: "Editar Boss",
    name: "Nome",
    join: "Comando /join",
    reset: "Reset",
    kind: "Tipo de boss",
    role: "Função",
    cancel: "Cancelar",
    close: "Fechar",
    add: "Adicionar",
    timers: "Timers",
    intro: "Intro (executa uma vez)",
    loop: "Loop (repete)",
    addTimer: "Adicionar Timer",
    delay: "Intervalo (segundos)",
    timerType: "Efeito",
    target: "Alvo",
    assignment: "Função",
    timerLabel: "Nota",
    timerRunner: "Timer ao Vivo",
    startTimer: "Iniciar Timer",
    stopTimer: "Parar Timer",
    timerIdle: "Pronto — inicie o timer para executar a estratégia.",
    shortcut: "Atalho global de alternância (com esta estratégia aberta)",
    shortcutError: "Atalho indisponível",
    potionKind: "Categoria",
    tonic: "Tônico",
    elixir: "Elixir",
    potion: "Pote",
    timerRoles: "Funcões de Timer",
    timerRolesHelp: "Cada função tem seu próprio atraso inicial e intervalo de repetição. A ação acontece ao fim da barra.",
    addRole: "Adicionar função",
    showRoles: "Mostrar funções",
    all: "Todos",
    none: "Nenhum",
    bestTonic: "Melhor tônico",
    bestElixir: "Melhor elixir",
    noPreference: "Sem preferência",
    saveClass: "Salvar classe",
    generalBossInfo: "Informações gerais do boss",
    generalBossInfoHint: "Exibido somente para leitura nas estratégias deste boss",
    consumables: "Consumíveis",
    consumablesFor: "Consumíveis de",
    noFavoriteConsumables: "Nenhum tônico ou elixir favorito configurado para esta classe.",
    noConsumablesInInventory: "Nenhum consumível desta classe está no inventário sincronizado.",
    actionIn: "Ação em",
    functionLabel: "Função",
    roles: {
        support: "Suporte",
        dps: "DPS",
        tank: "Tank",
        dot: "Dano ao Longo do Tempo (DoT)"
    }
};

exports.inventoryMessages = {
    title: "AquaStar - Inventário",
    heading: "Inventário",
    description: "Navegue pelos dados de Inventário e BuyBack sincronizados do account.aq.com, por personagem.",
    inventoryTabLabel: "Inventário",
    buyBackTabLabel: "Buy Back",
    syncButton: "Sincronizar Agora",
    syncingLabel: "Sincronizando...",
    syncedLabel: "Última sincronização: ",
    justNowLabel: "agora mesmo",
    neverSyncedLabel: "Nunca sincronizado",
    syncErrorUnauthenticated: "Não está logado. Abra a Página da Conta (Alt+A) e faça login, depois tente de novo.",
    syncErrorNetwork: "Não foi possível acessar account.aq.com. Verifique sua conexão e tente de novo.",
    filterNamePlaceholder: "Buscar itens...",
    filterTypeAll: "Todos os Tipos",
    filterAllLabel: "Todos",
    filterBankLabel: "Apenas no banco",
    filterInventoryOnlyLabel: "Apenas no inventário",
    filterMemberLabel: "Apenas member",
    filterNonMemberOnlyLabel: "Apenas não member",
    filterAcLabel: "Apenas AC",
    filterNonAcLabel: "Apenas não AC",
    emptyStateLabel: "Nenhum item encontrado. Tente sincronizar ou ajustar os filtros.",
    noCharactersLabel: "Nenhum personagem sincronizado ainda. Logue via Alt+A e depois Sincronize Agora.",
    columnName: "Nome",
    columnType: "Tipo",
    columnCount: "Quantidade",
    columnBank: "Banco",
    columnAdded: "Adicionado",
    columnCost: "Custo",
    columnRarity: "Raridade",
    columnInserted: "Vendido",
    bankBadge: "Banco",
    inventoryBadge: "Inventário",
    memberBadge: "Member",
    acBadge: "AC",
    normalBadge: "Normal",
    filterLabels: "Etiquetas",
    labelsSelected: "selecionadas",
    labelFilterClear: "Limpar",
    manageLabels: "Gerenciar Etiquetas",
    labelName: "Nome da etiqueta",
    addLabel: "Adicionar",
    saveLabel: "Salvar",
    assignLabels: "Atribuir Etiquetas",
    labelScopeCharacter: "Este personagem",
    labelScopeGlobal: "Todos os personagens",
    labelScopeCharacterHint: "Aplica apenas ao personagem ativo.",
    labelScopeGlobalHint: "Aplica ao mesmo item para todos os personagens.",
    assignLabelsHint: "O escopo é definido ao criar a etiqueta. Etiquetas de personagem são independentes; etiquetas globais sempre valem para todos.",
    delete: "Excluir",
    close: "Fechar",
    cancel: "Cancelar",
    itemCountLabel: "{shown} de {total} itens"
};

exports.wikiMessages = {
    mergeMaterialsTitle: "AquaStar: Materiais da loja",
    mergeDependencies: "Incluir dependências",
    mergeBuyback: "Dependências com Buy Back",
    mergeEmpty: "Nenhum material listado.",
    mergeReputationLabel: "Reputação necessária:",
    mergeSelectAll: "Marcar todos",
    mergeClearAll: "Desmarcar todos",
    mergeSelectItem: "Selecionar item"
};
