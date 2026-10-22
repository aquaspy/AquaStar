function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    doneSavedAs: "Pronto! Salvo como ",
    recording: "GRAVANDO",
    alreadyRecording: "Você já está gravando em alguma outra janela!"
}

exports.dialogMessages = {
    helpTitle   :"Ajuda:",
    helpMessage :"Atalhos e recursos do AquaStar NEO.",
    helpClosePrompt: "Fechar",
    helpDetail(k) {return 'AquaStar NEO (app)\n' +
        expand(k.help) + ' - Mostra esta ajuda.\n' +
        expand(k.settings)  + ' - Abre as Configurações (Geral / plugin ativo / Atalhos).\n' +
        expand(k.about)     + ' - Sobre o AquaStar NEO.\n' +
        expand(k.fullscreen)+ ' - Ativa/desativa tela cheia.\n' +
        expand(k.sshot)     + ' - Salva um print da janela de jogo em foco.\n' +
        expand(k.record)    + ' - Grava a tela do jogo. Use de novo para parar.\n' +
        expand(k.reload)    + ' - Recarrega a página atual.\n' +
        expand(k.reloadCache)+' - Limpa cache/dados da página e recarrega.\n' +
        expand(k.forward)   + ' / ' + expand(k.backward) + ' - Histórico em janelas de navegação.\n\n' +
        'Atalhos do plugin ativo (se houver) aparecem abaixo.';
    },
    helpScreenshot     : "Pasta dos prints: ",
    helpAppDataPath     : "Pasta AppData para aquastar.json e SWF local opcional (pode mudar se o usuário mover o app): ",
    helpCustomKeyPath  : "",

    aboutTitle     : "Sobre o AquaStar NEO, versão: ",
    aboutMessage   : "AquaStar NEO é um shell Flash com plugins por jogo.",
    aboutDetail    :
        "Agradecimentos:\naquaspy{pluginCredits}\nTauri\nAdobe Flash Player\ne você pelo apoio.\n\nOs plugins de jogos não são produtos oficiais de suas publicadoras; use por sua conta e risco.\n\nProjeto / releases: ",
    aboutDebug     : "Informações para Debug",

    aboutGithubPrompt : "Releases do AquaStar NEO",
    aboutClosePrompt  : "Fechar esse Popup"
}

exports.menuMessages = {
    menuBackward: "Voltar",
    menuFoward: "Avançar",
    menuCopyURL: "Copiar o link da página",
    menuReloadPage: "Recaregar a página",
    menuSettings: "Configurações",
    menuTakeGameShot: "Salvar Print do Jogo",
    menuRecord: "Gravar Tela do Jogo",
    menuReloadCache: "Recarregar e Limpar Cache",
    menuFullscreen: "Tela Cheia",
    menuHelp: "Ajuda",
    menuAbout: "Sobre AquaStar NEO"
}

exports.settingsMessages = {
    title: "AquaStar NEO - Configurações",
    heading: "Configurações",
    description: "Configure o AquaStar NEO e o plugin ativo. As mudanças são salvas no arquivo abaixo; algumas opções precisam de reinício para ter efeito.",
    descriptionGeneral: "Seleção de plugin, override do jogo primário, gravação e opções de runtime.",
    descriptionPlugin: "Opções fornecidas pelo plugin ativo.",
    descriptionKeybinds: "Clique em \"Gravar\" e pressione uma nova combinação de teclas para alterar um atalho. Reinicie o AquaStar NEO para aplicar mudanças de atalhos.",
    saveLocationLabel: "Salvando em: ",
    saveButton: "Salvar Alterações",
    resetAllButton: "Restaurar Tudo ao Padrão",
    restartButton: "Reiniciar o AquaStar NEO Agora",
    closeButton: "Fechar",
    recordButton: "Gravar",
    recordingLabel: "Pressione as teclas... (Esc para cancelar)",
    resetButton: "Restaurar",
    savedMessage: "Salvo! Reinicie o AquaStar NEO se alguma mudança exigir.",
    macOnlyLabel: " (somente macOS)",
    labels: {
        about: "Sobre o AquaStar NEO",
        fullscreen: "Ativar/Desativar Fullscreen",
        sshot: "Printar a Janela do Jogo",
        reload: "Recarregar a Página",
        reloadCache: "Recarregar e Limpar o Cachê",
        forward: "Avançar",
        backward: "Voltar",
        help: "Mostrar a Ajuda",
        settings: "Abrir Configurações (esta tela)",
        record: "Gravar a Tela do Jogo"
    },
    tabGeneral: "Geral",
    tabKeybinds: "Atalhos",
    tabPluginFallback: "Plugin ativo",
    pluginSettingsEmpty: "Este plugin não tem configurações extras.",
    keybindsAppHeading: "App",
    keybindsGameHeading: "Jogo",
    optionsHeading: "Opções gerais",
    optionLabels: {
        appLanguage: "Idioma",
        customUrl: "URL customizada do jogo",
        recordingFormat: "Formato de Gravação",
        renderMode: "Renderizador de Flash",
        ruffleQuality: "Qualidade do Ruffle",
        showGameMenu: "Mostrar menu acima das janelas do jogo",
        enableDevTools: "Ativar DevTools"
    },
    optionHints: {
        appLanguage: "Idioma da interface do AquaStar NEO e do plugin ativo. É preciso reiniciar depois de mudar.",
        customUrl: "Carrega uma URL de SWF diferente do jogo primário do plugin ativo. Deixe vazio para o padrão do plugin. Ignorada se um arquivo SWF local (abaixo) estiver ativo.",
        recordingFormat: "Formato do arquivo ao gravar a tela do jogo (Ctrl+J). MP4 não está disponível nesta versão do Electron.",
        renderMode: "Qual runtime Flash carrega as janelas de jogo do plugin ativo. Ao trocar para Ruffle, reinicie para aplicar.",
        ruffleQuality: "Qualidade de renderização do Ruffle. Alta é a mais nítida; Baixa desliga o anti-aliasing e é bem mais rápida em GPUs fracas ou sem aceleração. Vale para janelas de jogo abertas depois da mudança.",
        showGameMenu: "Mostra uma barra de menu acima das janelas de jogo com os mesmos comandos dos atalhos. Desative se preferir só teclado.",
        enableDevTools: "Abre o console de DevTools automaticamente ao iniciar."
    },
    languageChoiceLabels: {
        system: "Padrão do sistema",
        "en-US": "English",
        "pt-BR": "Português (Brasil)"
    },
    customSwfHeading: "Override do jogo primário",
    customSwfLabel: "Arquivo SWF local",
    customSwfHint: "Substitui o jogo primário do plugin ativo por um .swf local — tem prioridade sobre a URL customizada acima. Só tem efeito depois de reiniciar o AquaStar NEO.",
    customSwfActiveLabel: "Ativo: ",
    customSwfInactiveLabel: "Não definido — usando o jogo primário do plugin ativo.",
    customSwfChooseButton: "Escolher Arquivo...",
    customSwfRemoveButton: "Remover",
    customSwfRemoveConfirm: "Remover o arquivo SWF customizado? O AquaStar NEO voltará ao jogo primário do plugin ativo depois de reiniciar.",
    customSwfChosenMessage: "Arquivo SWF customizado definido. Reinicie o AquaStar NEO para usá-lo.",
    customSwfRemovedMessage: "Arquivo SWF customizado removido. Reinicie o AquaStar NEO para aplicar.",
    optionWarnings: {
        renderMode: "Ruffle é um emulador de Flash experimental e de código aberto. Pode ser mais lento, menos estável, ou se comportar diferente do Flash Player real, principalmente em salas cheias. Trocar mesmo assim?",
        enableDevTools: "Esta opção é para desenvolvedores. Players normalmente não precisam dela. Ativar mesmo assim?"
    },
    pluginsHeading: "Plugins",
    pluginsActiveLabel: "Plugin ativo",
    pluginsActiveHint: "Somente um plugin pode estar ativo. Alterá-lo exige reiniciar o AquaStar NEO.",
    pluginsRestartHint: "Reinicie o AquaStar NEO para aplicar a troca de plugin ativo.",
    pluginsRestartPrompt: "O plugin ativo foi alterado. Reiniciar o AquaStar NEO agora para aplicar?",
    pluginsEmptyLabel: "Nenhum plugin encontrado.",
    pluginsSourceBundled: "empacotado",
    pluginsSourceLocal: "local",
    pluginsEnableLocalLabel: "Carregar plugins locais do AppData",
    pluginsEnableLocalHint: "Procura plugins em AppData/AquaStar/plugins. Plugins locais rodam no mesmo processo, com acesso total ao app depois de você confiar neles.",
    pluginsAllowOverrideLabel: "Permitir que plugins locais substituam ids empacotados",
    pluginsAllowOverrideHint: "Se um plugin local reutilizar um id empacotado, preferir a cópia local. Sem isso, conflitos mantêm o plugin empacotado.",
    pluginsTrustHeading: "Confiar em plugins locais",
    pluginsTrustHint: "Plugins locais sem confiança não são ativados. Confiar concede todas as permissões pedidas por aquele plugin.",
    pluginsTrustLabel: "Confiar",
    pluginsLocalDirLabel: "Pasta de plugins locais: ",
    pluginsCollisionLabel: "Notas da descoberta:"
}
