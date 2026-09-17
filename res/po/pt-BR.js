function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};

exports.titleMessages = {
    invalidCharpage: "Janela de Char Page inválida",
    loadingCharpage: "Carregando Char Page...",
    buildingCharpage: "Construindo cenário. Por favor aguarde uns segundos...",
    cpDone: "PRONTO! Salvo a CP na pasta de Screenshots",
    doneSavedAs: "Pronto! Salvo como ",
    recording: "GRAVANDO",
    alreadyRecording: "Você já está gravando em alguma outra janela!"
}

exports.dialogMessages = {
    helpTitle   :"Ajuda:",
    helpMessage :"Atalhos e recursos do AquaStar.",
    helpDetail(k) {return expand(k.help) + ' - Mostra esta ajuda.\n' +
        expand(k.settings)  + ' - Abre as Configurações.\n' +
        expand(k.about)     + ' - Sobre AquaStar.\n' +
        expand(k.fullscreen)+ ' - Ativa/desativa tela cheia.\n' +
        expand(k.sshot)     + ' - Salva um print da janela do jogo.\n' +
        expand(k.record)    + ' - Grava a tela do jogo. Use de novo para parar.\n' +
        expand(k.reload)    + ' - Recarrega a página atual.\n' +
        expand(k.reloadCache)+' - Limpa o cache e dados do jogo, então recarrega a página.\n\n' +
        'Nota: ' + expand(k.help) + ' mostra esta mensagem.';
    },
    helpScreenshot     : "Pasta dos prints: ",
    helpAqliteOld      : "Pasta do app para o aqlite_old/aquastar.json (Pode mudar se o usuário mover o aplicativo): ",
    helpCustomKeyPath  : "",

    aboutTitle     : "Sobre o AquaStar, versão: ",
    aboutMessage   : "Aquastar não seria possível sem a ajuda de:",
    aboutDetail    :
        "133spider (github) por criar o AQLite em si\naquaspy (github)\nbiglavis (github) Por desenvolver a extensão WikiView\nArtix Entertainment (artix.com)\nElectronJs (electronjs.org)\nAdobe Flash Player (adobe.com)\nVOCÊ! (Sim, Você! Obrigado por seu apoio!)\n\nNota: Este não é um produto oficial da Artix. Artix Entertainment não recomenda o uso por qualquer motivo. Você está usando por sua conta e risco.\n\nVocê pode dar suas opiniões, contribuir, e seguir o projeto em: ",
    aboutDebug     : "Informações para Debug",

    aboutGithubPrompt : "Releases do AquaStar",
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
    menuAbout: "Sobre AquaStar"
}

exports.settingsMessages = {
    title: "AquaStar - Configurações",
    heading: "Configurações",
    description: "Configure o AquaStar e o plugin ativo. As mudanças são salvas no arquivo abaixo; algumas opções precisam de reinício para ter efeito.",
    descriptionGeneral: "Seleção de plugin, override do jogo primário, gravação e opções de runtime.",
    descriptionPlugin: "Opções fornecidas pelo plugin ativo.",
    descriptionKeybinds: "Clique em \"Gravar\" e pressione uma nova combinação de teclas para alterar um atalho. Reinicie o AquaStar para aplicar mudanças de atalhos.",
    saveLocationLabel: "Salvando em: ",
    saveButton: "Salvar Alterações",
    resetAllButton: "Restaurar Tudo ao Padrão",
    restartButton: "Reiniciar o AquaStar Agora",
    closeButton: "Fechar",
    recordButton: "Gravar",
    recordingLabel: "Pressione as teclas... (Esc para cancelar)",
    resetButton: "Restaurar",
    savedMessage: "Salvo! Reinicie o AquaStar se alguma mudança exigir.",
    macOnlyLabel: " (somente macOS)",
    charpageOnly: " (somente char pages)",
    labels: {
        about: "Sobre o AquaStar",
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
        customUrl: "URL customizada do jogo",
        recordingFormat: "Formato de Gravação",
        renderMode: "Renderizador de Flash",
        ruffleUpdateChannel: "Canal de Atualização do Ruffle",
        ruffleAutoUpdate: "Baixar atualizações automaticamente",
        showGameMenu: "Mostrar menu acima das janelas do jogo",
        enableDevTools: "Ativar DevTools"
    },
    optionHints: {
        customUrl: "Carrega uma URL de SWF diferente do jogo primário do plugin ativo. Deixe vazio para o padrão do plugin. Ignorada se um arquivo SWF local (abaixo) estiver ativo.",
        recordingFormat: "Formato do arquivo ao gravar a tela do jogo (Ctrl+J). MP4 não está disponível nesta versão do Electron.",
        renderMode: "Qual runtime Flash carrega as janelas de jogo do plugin ativo. Ao trocar para Ruffle, reinicie para aplicar.",
        ruffleUpdateChannel: "Latest usa a versão estável mais recente do Ruffle. Nightly inclui mudanças experimentais mais novas. Para aplicar uma troca de canal, feche o AquaStar completamente e abra-o novamente; não use somente o botão Reiniciar.",
        ruffleAutoUpdate: "Verifica o canal selecionado em segundo plano sempre que o AquaStar abre. O download é aplicado depois de reiniciar.",
        showGameMenu: "Mostra uma barra de menu acima das janelas de jogo com os mesmos comandos dos atalhos. Desative se preferir só teclado.",
        enableDevTools: "Abre o console de DevTools automaticamente ao iniciar."
    },
    customSwfHeading: "Override do jogo primário",
    customSwfLabel: "Arquivo SWF local",
    customSwfHint: "Substitui o jogo primário do plugin ativo por um .swf local — tem prioridade sobre a URL customizada acima. Só tem efeito depois de reiniciar o AquaStar.",
    customSwfActiveLabel: "Ativo: ",
    customSwfInactiveLabel: "Não definido — usando o jogo primário do plugin ativo.",
    customSwfChooseButton: "Escolher Arquivo...",
    customSwfRemoveButton: "Remover",
    customSwfRemoveConfirm: "Remover o arquivo SWF customizado? O AquaStar voltará ao jogo primário do plugin ativo depois de reiniciar.",
    customSwfChosenMessage: "Arquivo SWF customizado definido. Reinicie o AquaStar para usá-lo.",
    customSwfRemovedMessage: "Arquivo SWF customizado removido. Reinicie o AquaStar para aplicar.",
    ruffleHeading: "Atualizações do Ruffle",
    ruffleStatusLabel: "Ruffle selecionado na inicialização",
    ruffleLoadedLabel: "Selecionado na inicialização: ",
    ruffleConfiguredChannelLabel: "Canal de atualização configurado: ",
    ruffleLatestLabel: "Latest (Estável)",
    ruffleNightlyLabel: "Nightly (Experimental)",
    ruffleFallbackLabel: "Fallback empacotado: ",
    ruffleInactiveLabel: "O Ruffle não está ativo; Flash Player está selecionado.\n",
    ruffleDownloadedLabel: "Versão baixada",
    ruffleBundledLabel: "Fallback empacotado",
    ruffleUpdateLabel: "Atualizar Ruffle",
    ruffleUpdateHint: "Baixa a versão web self-hosted do canal selecionado na release oficial do GitHub do Ruffle. Estável é recomendada; Nightly é experimental. Reinicie para aplicar.",
    ruffleUpdateButton: "Baixar Atualização",
    ruffleDownloadingMessage: "Baixando atualização do Ruffle...",
    ruffleUpdatedMessage: "Atualização do Ruffle baixada. Reinicie o AquaStar para aplicar.",
    ruffleAlreadyCurrentMessage: "O Ruffle já está atualizado.",
    ruffleBundledAlreadyCurrentMessage: "O Ruffle empacotado já é a versão estável mais recente.",
    ruffleUpdateFailedMessage: "Não foi possível atualizar o Ruffle: ",
    ruffleRestoreLabel: "Restaurar Ruffle empacotado",
    ruffleRestoreHint: "Remove os arquivos de Ruffle baixados no próximo reinício e usa a versão que veio com o AquaStar.",
    ruffleRestoreButton: "Restaurar Versão Empacotada",
    ruffleRestoreConfirm: "Restaurar a versão do Ruffle que veio com o AquaStar? Os arquivos de Ruffle baixados serão removidos depois de reiniciar.",
    ruffleRestoreMessage: "O Ruffle empacotado será restaurado ao reiniciar o AquaStar.",
    optionWarnings: {
        renderMode: "Ruffle é um emulador de Flash experimental e de código aberto. Pode ser mais lento, menos estável, ou se comportar diferente do Flash Player real, principalmente em salas cheias. Trocar mesmo assim?",
        enableDevTools: "Esta opção é para desenvolvedores. Players normalmente não precisam dela. Ativar mesmo assim?"
    },
    pluginsHeading: "Plugins",
    pluginsActiveLabel: "Plugin ativo",
    pluginsActiveHint: "Somente um plugin pode estar ativo. Alterá-lo exige reiniciar o AquaStar.",
    pluginsRestartHint: "Reinicie o AquaStar para aplicar a troca de plugin ativo.",
    pluginsRestartPrompt: "O plugin ativo foi alterado. Reiniciar o AquaStar agora para aplicar?",
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
