exports.helpTitle = 'Ajuda:'
exports.helpMessage = 'Estas são as keybindings adicionadas ao jogo.'
exports.helpDetail = 
exports.helpDetail = (k) => {return k.wiki + ' - AQW Wiki\n' +
    k.design    + ' - AQW Design notes\n' +
    k.account   + ' - Account page\n' +
    k.charpage  + ' - Character (Player) lookup. Você também pode utilizar o interno do jogo.\n' +
    k.cpSshot   + ' - (Apenas char pages!) Printa a tela do char page atual.\n' +
    k.newAqlite + ' - Abre uma nova instância do Aqlite.\n' +
    k.newAqw    + ' - Abre uma instância padrão do AQW como a de aq.com/game/ (keybind sujeita a mudanças por ser temporária)\n' +
    k.newTabbed + ' - Abre uma janela com abas de browser uteis, agrupadas para não abrir muitas janelas. Usa mais memória por consequência. (300mb)\n' +
    k.about     + ' - Sobre AquaStar.\n' +
    k.fullscreen+ ' - Ativa/Desativa Fullscreen\n' +
    k.sshot     + ' - Printa a tela do jogo (apenas AQW e AQLITE). Eles são salvos em uma pasta separada dita abaixo.\n' +
    k.reloadcache+' - Limpa todo o cachê do jogo, alguns cookies, e recarrega a página (pode consertar bugs dentro do jogo).\n\n' +
    'Para um aqlite antigo/customizado, por favor nomeie ele para "aqlite_old.swf" e o coloque na mesma pasta da executável, dita abaixo!\n\n' +
    'Nota: ' + k.help.join(', ') + ' Mostra esta mensagem.';
}

exports.helpScreenshot = "Pasta dos prints: "
exports.helpAqliteOld  = "Pasta do app para o aqlite_old (Pode mudar se o usuário mover o aplicativo): "

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

