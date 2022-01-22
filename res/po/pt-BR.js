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
        expand(k.reloadCache)+' - Limpa todo o cachê do jogo, alguns cookies, e recarrega a página (pode consertar bugs dentro do jogo).\n\n' +
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
        'CaioFViana (github)\n' +
        'aquaspy (github)\n' +
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
    menuGuide        : "Guia AQW",
    menuReddit       : "AQW Subreddit",
    menuTwitter      : "Twitter da Alina",
    menuTakeShot     : "Printa a Charpage (somente CP!)",
    menuCopyURL      : "Copiar o link da página",
    menuReloadPage   : "Recaregar a página",
}
