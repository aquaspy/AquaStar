# Launcher AquaStar 3.0

Status: implementado no launcher Tauri em `desktop/ui/`. A prévia original permanece como referência visual.

A interface padrão e a prévia usam inglês (en-US), conforme solicitado pelo usuário. O idioma desta documentação não define o idioma do produto. Os menus nativos e as ferramentas mantêm sua localização existente; os novos textos do launcher usam inglês.

> Nota (3.1): a próxima direção está em [launcher-3.1-plugins-preview.html](launcher-3.1-plugins-preview.html). O launcher passa a listar cada plugin na barra lateral e a desenhar a página de cada um a partir do que o plugin declara (jogos com seu player por plataforma, ferramentas, links e buscas). Só as preferências globais do AquaStar ficam fixas. O comando `launcher_model` já fornece esses dados; a interface publicada ainda é a do 3.0.

## Objetivo

Dar destaque ao jogo e reduzir a quantidade de controles disputando atenção. O launcher continua disponível para ferramentas e páginas enquanto o jogo roda em outra janela. A decoração e os controles da janela continuam nativos do sistema.

## Direção visual

Azul profundo no fundo, superfícies com diferenças discretas de luminosidade e ciano para navegação e foco. O botão principal usa o laranja atual, com texto escuro. O logo existente identifica o produto; nenhuma fonte, imagem ou biblioteca externa é necessária. Não há animação contínua, vídeo de fundo, blur nem transparência da janela.

A prévia original está em [launcher-3.0-preview.html](launcher-3.0-preview.html). O aplicativo real usa os comandos existentes para jogar, abrir ferramentas e sites e salvar preferências.

## Organização

| Área | Conteúdo | Comportamento existente preservado |
| --- | --- | --- |
| Jogar | AQW e DragonFable; um botão principal; seleção de player | `play`, disponibilidade por sistema, player preferido e acompanhamento do processo |
| Ferramentas | Inventário, lembretes, tarefas e estratégia | `open_tool` e os mesmos arquivos de perfil |
| Páginas úteis | Links agrupados, pesquisa na wiki e consulta de personagem | Manifesto do jogo, allowlist e janelas de site existentes |
| Preferências | Qualidade, backend gráfico, ocultar launcher e acesso às configurações completas | Comandos de settings e defaults por plataforma |

Em uma janela normal, a navegação fica à esquerda. Em larguras menores, vira uma linha acima do conteúdo. A página inicial contém a área de jogo e atalhos curtos para ferramentas; a lista completa de sites não ocupa metade da janela inicial.

O player escolhido aparece ao lado de Jogar. Flash permanece disponível nos sistemas suportados, sem competir visualmente com o player preferido. As opções de gráficos continuam vindo de `ruffle_settings`; não se oferece Vulkan/OpenGL no macOS só porque existem em outra plataforma.

## Estados que precisam de desenho e teste

- Inicialização, pronto, abrindo player, jogo aberto, download de player e falha de abertura.
- Player indisponível, computador sem rede e configurações ainda carregando.
- Mostrar o launcher novamente quando o jogo fechar, inclusive após falha do player.
- Uma mensagem de status por operação, sem repetir a explicação sobre ocultar a janela.
- Sem exibir login, contagem de inventário ou status de servidor que o backend não forneça.

O status deve usar `aria-live="polite"`. Erros permanecem visíveis e não dependem apenas da cor. Uma ação em andamento desabilita apenas os controles que entrariam em conflito com ela.

## Compatibilidade

- Reutilizar HTML sem framework e o logo atual. Não adicionar downloads de fontes ou assets na abertura.
- Usar Grid, Flexbox e media queries com layouts simples. Não depender de `:has`, container queries, subgrid, backdrop-filter ou APIs recentes para funções essenciais.
- Preservar barra de título, menus nativos, atalhos e tamanho inicial atual da janela. Não implementar controles próprios de fechar/minimizar.
- Links vêm do manifesto; textos novos têm inglês como padrão e entram nos catálogos en-US e pt-BR. O layout suporta traduções maiores sem cortar rótulos.
- Todos os controles funcionam por teclado. Foco visível, labels associados e contraste de pelo menos 4.5:1 no texto comum são critérios de aceitação.
- Testar zoom de 100%, 125%, 150% e 200%, janela 900×860 e janela maximizada. Permitir rolagem vertical em vez de esconder ações.
- Manter DMA-BUF/fontconfig no Linux, capabilities e CSP. Nenhum requisito novo de sistema ou backend gráfico.

## Implementação em etapas

1. Revisar a prévia e escolher a organização visual antes de alterar o launcher real.
2. Aplicar estrutura e estilos em `desktop/ui/index.html` e `style.css`. Adaptar os seletores de `main.js` e preservar as chamadas existentes.
3. Integrar estados, traduções e ações. Validar cada ferramenta, link, preferência e comportamento de encerramento do player.
4. Atualizar o smoke visual para localizar a ação principal sem depender de textos em inglês. Preservar a distinção atual entre os botões de abrir jogo e os links.
5. Comparar abertura e memória do launcher antes/depois em builds release, com os mesmos players e perfil. Sem prometer ganho numérico a partir de uma prévia estática.
6. Validar WebView2, WKWebView e WebKitGTK antes de incluir a interface na stable.

## Fora deste escopo

Embedding de player, alterações nos SWFs, novos sistemas de login, notícias remotas, telemetria, sincronização extra e substituição dos arquivos de perfil. A correção de dimensionamento do Flash na linha Electron 2.1.1-rc deve permanecer independente desta interface.

A instância AQW Testing foi removida por ser obsoleta. Não aparece em botões, menus, preferências ou ajuda, e Alt+Q deixa de ter essa ação nas linhas 2.x e 3.x.

## Verificação da implementação

Em 17 de outubro de 2026, a interface real passou por um teste de interação no WebKitGTK 2.52, com respostas locais para os comandos Tauri. O teste verificou seleção de jogo e player, prevenção de lançamentos duplicados, recuperação após erro, ferramentas, grupos de páginas, pesquisa e preferências. Também verificou a ausência de rolagem horizontal nas quatro áreas, a 900 px e com zoom de 200%, além da página inicial em larguras de 640 e 400 px e zoom de 125% e 150%.

O executável release também abriu com os comandos Tauri reais em um perfil temporário separado. A captura dessa execução está em [launcher-3.0-implemented.png](launcher-3.0-implemented.png). A build local usa o perfil release e os players fixados no manifesto. O teste de interface com respostas locais não substitui login, jogo e sincronização com a conta. A validação visual em WKWebView/macOS e WebView2/Windows permanece necessária antes da stable.
