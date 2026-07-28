function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage  : "Janela de Char Page inválida",
    loadingCharpage  : "Carregando Char Page...",
    buildingCharpage : "Construindo cenário. Por favor aguarde uns segundos...",
    cpDone           : "PRONTO! Salvo a CP na pasta de Screenshots",
    doneSavedAs      : "Pronto! Salvo como ",
    recording        : "GRAVANDO",
    alreadyRecording : "Você já está gravando em alguma outra janela!"
}

exports.dialogMessages = {
    helpTitle   :'Ajuda:',
    helpMessage : "Estas são as keybindings adicionadas ao jogo.",
    helpDetail(k) {return expand(k.wiki) + ' - AQW Wiki\n' +
        expand(k.design)    + ' - AQW Design notes\n' +
        expand(k.account)   + ' - Account page\n' +
        expand(k.charpage)  + ' - Character (Player) lookup. Você também pode utilizar o interno do jogo.\n' +
        expand(k.cpSshot)   + ' - (Apenas char pages!) Printa a tela do char page atual.\n' +
        expand(k.newAqw)    + ' - Abre uma nova instância do AQW.\n' +
        expand(k.newTest)   + ' - Abre uma instância de testes do AQW.\n' +
        expand(k.about)     + ' - Sobre AquaStar.\n' +
        expand(k.fullscreen)+ ' - Ativa/Desativa Fullscreen\n' +
        expand(k.sshot)     + ' - Printa a tela do jogo (apenas AQW e AQLITE). Eles são salvos em uma pasta separada dita abaixo.\n' +
        expand(k.record)    + ' - Grava a tela do jogo. Use de novo para parar.\n' +
        expand(k.reload)    + " - Recarregam as páginas, como em um navegador\n" +
        expand(k.reloadCache)+' - Limpa todo o cachê do jogo, alguns cookies, e recarrega a página (pode consertar bugs dentro do jogo)\n' +
        expand(k.settings)  + ' - Abre a tela de Configurações, para customizar as keybindings.\n' +
        expand(k.reminders) + ' - Abre a tela de Lembretes, para acompanhar quests diárias/semanais por personagem.\n\n' +
        'Para um aqlite antigo/customizado, por favor nomeie ele para "aqlite_old.swf" e o coloque na mesma pasta da executável, dita abaixo!\n\n' +
        'Nota: ' + expand(k.help) + ' Mostra esta mensagem.';
    },
    helpScreenshot     : "Pasta dos prints: ",
    helpAqliteOld      : "Pasta do app para o aqlite_old/aquastar.json (Pode mudar se o usuário mover o aplicativo): ",
    helpCustomKeyPath  : "Outro local para o aquastar.json com keybinds customizadas. Veja o Readme.md para mais ajuda: ",
    
    aboutTitle     : "Sobre o AquaStar, versão: ",
    aboutMessage   : "Aquastar não seria possível sem a ajuda de:",
    aboutDetail    : 
        '133spider (github) por criar o AQLite em si\n' +
        'aquaspy (github)\n' +
        'biglavis (github) Por desenvolver a extensão WikiView\n' +
        'Artix Entertainment (artix.com)\n' +
        'ElectronJs (electronjs.org)\n' +
        'Adobe Flash Player (adobe.com)\n' +
        'VOCÊ! (Sim, Você! Obrigado por seu apoio!)\n\n' +
        'Nota: Este não é um produto oficial da Artix. Artix Entertainment não recomenda o uso por qualquer motivo. Você está usando por sua conta e risco.\n\n' +
        'Você pode dar suas opiniões, contribuir, e seguir o projeto em: ',

    aboutDebug     : "Informações para Debug",
    
    aboutGithubPrompt : "Releases do AquaStar",
    aboutClosePrompt  : "Fechar esse Popup" 
}

exports.menuMessages = {
    menuBackward     : "Voltar",
    menuFoward       : "Avançar",
    menuOtherPages   : "Páginas úteis",
    menuOtherPages2  : "Outras páginas úteis",
    menuSocialMedia  : "Redes sociais",
    menuWiki         : "AQW Wiki",
    menuDesign       : "Design Notes",
    menuAccount      : "AQW Account",
    menuPortal       : "Portal Battleon",
    menuHeromart     : "Heromart",
    menuDailyGifts   : "Drops Diários",
    menuCalendar     : "Calendário de Eventos",
    menuCharpage     : "Charpages",
    menuForge        : "Encantamentos de Forja",
    menuReddit       : "AQW Subreddit",
    menuTwitter      : "Twitter da Alina",
    menuTakeShot     : "Printa a Charpage (somente CP!)",
    menuCopyURL      : "Copiar o link da página",
    menuReloadPage   : "Recaregar a página",
    menuSettings     : "Configurações",
    menuReminders    : "Lembretes"
}

exports.settingsMessages = {
    title            : "AquaStar - Configurações",
    heading          : "Configurações de Keybindings",
    description      : "Clique em \"Gravar\" e pressione uma nova combinação de teclas para alterar um atalho. As mudanças são salvas no arquivo mostrado abaixo e exigem reiniciar o AquaStar para terem efeito.",
    saveLocationLabel: "Salvando em: ",
    saveButton       : "Salvar Alterações",
    resetAllButton   : "Restaurar Tudo ao Padrão",
    restartButton    : "Reiniciar o AquaStar Agora",
    closeButton      : "Fechar",
    recordButton     : "Gravar",
    recordingLabel   : "Pressione as teclas... (Esc para cancelar)",
    resetButton      : "Restaurar",
    savedMessage     : "Salvo! Reinicie o AquaStar para aplicar as novas keybindings.",
    macOnlyLabel     : " (somente macOS)",
    charpageOnly     : " (somente char pages)",
    labels: {
        wiki:        "Abrir a Wiki do AQW",
        account:     "Abrir a Página da Conta",
        design:      "Abrir as Design Notes",
        charpage:    "Consultar Char Page",
        newAqw:      "Abrir Nova Instância do AQW",
        newTest:     "Abrir Instância de Testes do AQW",
        about:       "Sobre o AquaStar",
        fullscreen:  "Ativar/Desativar Fullscreen",
        sshot:       "Printar a Janela do Jogo",
        cpSshot:     "Printar a Char Page",
        reload:      "Recarregar a Página",
        reloadCache: "Recarregar e Limpar o Cachê",
        dragon:      "Abrir o DragonFable",
        forward:     "Avançar",
        backward:    "Voltar",
        help:        "Mostrar a Ajuda",
        settings:    "Abrir Configurações (esta tela)",
        reminders:   "Abrir Lembretes",
        record:      "Gravar a Tela do Jogo"
    },
    optionsHeading: "Outras Opções",
    optionLabels: {
        playerCharacter:   "Personagem",
        featurePlayerName: "Mostrar Personagem no Título da Janela",
        recordingFormat:   "Formato de Gravação",
        renderMode:        "Renderizador de Flash",
        enableDevTools:    "Ativar DevTools"
    },
    optionHints: {
        playerCharacter:   "Apenas letras e números. Usado pelo atalho da Char Page (Alt+P) para abrir direto neste personagem.",
        featurePlayerName: "Quando ativado, substitui \"AquaStar\" no título da janela principal pelo Personagem acima.",
        recordingFormat:   "Formato do arquivo ao gravar a tela do jogo (Ctrl+J). MP4 não está disponível nesta versão do Electron.",
        renderMode:        "Qual runtime Flash carrega o AQW (principal, nova instância, Testing). DragonFable e a Char Page não são afetados.",
        enableDevTools:    "Abre o console de DevTools automaticamente ao iniciar."
    },
    optionWarnings: {
        renderMode:     "Ruffle é um emulador de Flash experimental e de código aberto. Pode ser mais lento, menos estável, ou se comportar diferente do Flash Player real, principalmente em salas cheias. Trocar mesmo assim?",
        enableDevTools: "Esta opção é para desenvolvedores. Players normalmente não precisam dela. Ativar mesmo assim?"
    }
}

exports.remindersMessages = {
    title              : "AquaStar - Lembretes",
    heading            : "Lembretes",
    description        : "Acompanhe tarefas diárias e semanais do jogo por personagem. Os resets seguem o horário do servidor da AE (America/New_York) - diário à meia-noite, semanal na virada de quinta para sexta.",
    addCharacterTab    : "+ Adicionar Personagem",
    promptCharacterName: "Nome do personagem:",
    promptOkButton     : "OK",
    promptCancelButton : "Cancelar",
    confirmDeleteCharacter: "Remover este personagem e seu progresso em todas as quests? Isso não pode ser desfeito.",
    confirmDeleteQuest : "Excluir esta quest para todos os personagens? Isso não pode ser desfeito.",
    noCharactersHint   : "Adicione uma aba de personagem acima para começar a acompanhar quests.",
    questNamePlaceholder: "Nome da quest",
    questJoinPlaceholder: "/join ...",
    dailyLabel         : "Diária",
    weeklyLabel        : "Semanal",
    addQuestButton     : "Adicionar Quest",
    copyButton         : "Copiar",
    copiedLabel        : "Copiado!",
    deleteButton       : "Excluir",
    renameTabTitle     : "Renomear",
    removeTabTitle     : "Remover",
    savingLabel        : "Salvando...",
    savedLabel         : "Salvo"
}
