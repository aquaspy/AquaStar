function expand (keyb) {if(Array.isArray(keyb)) return keyb.join(', '); else return keyb;};
exports.helpTitle = 'Ajuda:'
exports.helpMessage = 'Estas são as keybindings adicionadas ao jogo.'
exports.helpDetail = (k) => {return expand(k.wiki) + ' - AQW Wiki\n' +
    expand(k.design)    + ' - AQW Design notes\n' +
    expand(k.account)   + ' - Account page\n' +
    expand(k.charpage)  + ' - Character (Player) lookup. Você também pode utilizar o interno do jogo.\n' +
    expand(k.cpSshot)   + ' - (Apenas char pages!) Printa a tela do char page atual.\n' +
    expand(k.newAqlite) + ' - Abre uma nova instância do Aqlite.\n' +
    expand(k.newAqw)    + ' - Abre uma instância padrão do AQW como a de aq.com/game/ (keybind sujeita a mudanças por ser temporária)\n' +
    expand(k.newTabbed) + ' - Abre uma janela com abas de browser uteis, agrupadas para não abrir muitas janelas. Usa mais memória por consequência. (300mb)\n' +
    expand(k.about)     + ' - Sobre AquaStar.\n' +
    expand(k.fullscreen)+ ' - Ativa/Desativa Fullscreen\n' +
    expand(k.sshot)     + ' - Printa a tela do jogo (apenas AQW e AQLITE). Eles são salvos em uma pasta separada dita abaixo.\n' +
    expand(k.reload)    + " - Recarregam as páginas, como em um navegador\n" +
    expand(k.reloadCache)+' - Limpa todo o cachê do jogo, alguns cookies, e recarrega a página (pode consertar bugs dentro do jogo).\n\n' +
    'Para um aqlite antigo/customizado, por favor nomeie ele para "aqlite_old.swf" e o coloque na mesma pasta da executável, dita abaixo!\n\n' +
    'Nota: ' + expand(k.help) + ' Mostra esta mensagem.';
}

exports.helpScreenshot = "Pasta dos prints: "
exports.helpAqliteOld  = "Pasta do app para o aqlite_old/aquastar.json (Pode mudar se o usuário mover o aplicativo): "
exports.helpCustomKeyPath  = "Outro local para o aquastar.json com keybinds customizadas. Veja o Readme.md para mais ajuda: "

exports.aboutTitle   = 'Sobre o AquaStar, versão: '
exports.aboutMessage = "Aquastar não seria possível sem a ajuda de:";
exports.aboutDetail  = 
    '133spider (github) por criar o AQLite em si\n' +
    'CaioFViana (github)\n' +
    'aquaspy (github)\n' +
    'Artix Entertainment (artix.com)\n' +
    'ElectronJs (electronjs.org)\n' +
    'Adobe Flash Player (adobe.com)\n' +
    'VOCÊ! (Sim, Você! Obrigado por seu apoio!)\n\n' +
    'Nota: Este não é um produto oficial da Artix. Artix Entertainment não recomenda o uso por qualquer motivo. Você está usando por sua conta e risco.\n\n' +
    'Você pode dar suas opiniões, contribuir, e seguir o projeto em: '

exports.aboutDebug       = "Informações para Debug"

exports.aboutGithubPrompt = "Releases do AquaStar"
exports.aboutClosePrompt  = "Fechar esse Popup"

exports.invalidCharpage  = "Janela de Char Page inválida";
exports.loadingCharpage  = "Carregando Char Page...";
exports.buildingCharpage = "Construindo cenário. Por favor aguarde uns segundos...";
exports.cpDone           = "PRONTO! Salvo a CP na pasta de Screenshots";
exports.doneSavedAs      = "Pronto! Salvo como ";

exports.menuBackward     = "Voltar";
exports.menuFoward       = "Avançar";
exports.menuOtherPages   = "Páginas úteis";
exports.menuOtherPages2  = "Outras páginas úteis";
exports.menuWiki         = "AQW Wiki";
exports.menuDesign       = "Design Notes";
exports.menuAccount      = "AQW Account";
exports.menuPortal       = "Portal Battleon";
exports.menuHeromart     = "Heromart";
exports.menuCalendar     = "Calendário de Eventos";
exports.menuCharpage     = "Charpages";
exports.menuGuide        = "Guia AQW (antigo mas relevante)";
exports.menuTakeShot     = "Printa a Charpage (somente CP!)";
exports.menuCopyURL      = "Copiar o link da página";
