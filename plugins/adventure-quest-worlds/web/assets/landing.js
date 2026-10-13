const content = {
  pt: {
    navFeatures: 'Recursos',
    navTools: 'Ferramentas',
    navHow: 'Como funciona',
    eyebrow: 'Companheiro para AdventureQuest Worlds',
    hero: 'Seu AQW, <em>mais organizado.</em>',
    lead: 'AquaStar reúne launcher, utilitários e ferramentas de planejamento em uma experiência focada, privada e feita para o ritmo do jogo.',
    explore: 'Explorar ferramentas',
    github: 'Ver no GitHub',
    featuresTitle: 'Tudo que importa, no mesmo lugar.',
    featuresLead: 'Recursos pensados para reduzir atrito, não para tirar o foco do jogo.',
    toolsTitle: 'Use do seu jeito.',
    toolsLead: 'O aplicativo desktop acompanha sua sessão; as ferramentas web funcionam em qualquer navegador.',
    desktop: 'AquaStar Desktop',
    desktopLead: 'Launcher com Flash nativo, WikiView, captura, gravação, Char Page Studio e ferramentas integradas.',
    web: 'AquaStar Tools',
    webLead: 'Lembretes, lista de tarefas e estratégias de Ultra Bosses, salvos localmente no navegador.',
    reminders: 'Lembretes',
    todo: 'Lista de Tarefas',
    strategy: 'Ultra Bosses',
    howTitle: 'Comece em poucos passos.',
    howLead: 'Sem conta, sem servidor e sem depender de terceiros para os dados das ferramentas.',
    faqTitle: 'Perguntas frequentes',
    footer: 'Projeto comunitário, não oficial da Artix Entertainment.',
    features: [
      [
        '◈',
        'Flash nativo e Ruffle',
        'Escolha Flash Player nativo ou Ruffle; o Ruffle também pode ser atualizado para testar versões novas.'
      ],
      ['⌕', 'Inventário sincronizado', 'Consulte inventário e BuyBack com sincronização da conta.'],
      ['◉', 'Captura e gravação', 'Salve prints e gravações das suas sessões.'],
      ['✦', 'Char Page Studio', 'Monte Char Pages, cenários e GIFs com controles dedicados.'],
      ['✓', 'Lembretes e To‑Do', 'Acompanhe resets, farms, drops e objetivos por personagem.'],
      ['◌', 'Estratégia', 'Planeje grupos, papéis e timers para Ultra Bosses.'],
      ['⌘', 'Atalhos personalizados', 'Defina keybinds para as ações que fazem sentido no seu fluxo.'],
      ['↗', 'Janelas importantes', 'Abra rapidamente as principais telas do AquaStar por atalhos.'],
      ['⌕', 'Prévia da wiki', 'Passe o cursor sobre links da wiki para visualizar a página antes de abri-la.']
    ],
    steps: [
      ['Baixe o AquaStar', 'Use o desktop para jogar com os recursos do launcher.'],
      ['Abra uma ferramenta', 'Escolha Lembretes, To‑Do ou Ultra Bosses na web.'],
      [
        'Mantenha seus dados',
        'No desktop, os dados ficam na pasta AppData/AquaStar. Na web, ficam no localStorage do navegador.'
      ]
    ],
    faq: [
      ['Preciso criar uma conta?', 'Não. As ferramentas web funcionam sem conta e salvam dados neste navegador.'],
      [
        'As ferramentas web substituem o jogo?',
        'Não. Elas são utilitários de planejamento; o jogo continua no AquaStar Desktop.'
      ],
      [
        'Onde ficam os dados?',
        'No AquaStar Desktop, os dados ficam na pasta AppData/AquaStar. Nas ferramentas web, ficam no localStorage do navegador.'
      ]
    ]
  },
  en: {
    navFeatures: 'Features',
    navTools: 'Tools',
    navHow: 'How it works',
    eyebrow: 'AdventureQuest Worlds companion',
    hero: 'Your AQW, <em>better organized.</em>',
    lead: 'AquaStar brings a launcher, utilities and planning tools into a focused, private experience built around the game.',
    explore: 'Explore tools',
    github: 'View on GitHub',
    featuresTitle: 'Everything that matters, together.',
    featuresLead: 'Features made to remove friction, not distract you from the game.',
    toolsTitle: 'Use it your way.',
    toolsLead: 'The desktop app follows your session; web tools work in any browser.',
    desktop: 'AquaStar Desktop',
    desktopLead: 'Launcher with native Flash, WikiView, capture, recording, Char Page Studio and integrated tools.',
    web: 'AquaStar Tools',
    webLead: 'Reminders, To-Do and Ultra Boss strategy tools stored locally in your browser.',
    reminders: 'Reminders',
    todo: 'To-Do List',
    strategy: 'Ultra Bosses',
    howTitle: 'Start in a few steps.',
    howLead: 'No account, server, or third-party dependency required for tool data.',
    faqTitle: 'Frequently asked questions',
    footer: 'Community project, not affiliated with Artix Entertainment.',
    features: [
      [
        '◈',
        'Native Flash and Ruffle',
        'Choose native Flash Player or Ruffle; Ruffle can also be updated to test newer versions.'
      ],
      ['⌕', 'Synced inventory', 'Check inventory and BuyBack with account synchronization.'],
      ['◉', 'Capture and recording', 'Save screenshots and recordings from sessions.'],
      ['✦', 'Char Page Studio', 'Build Char Pages, scenes and GIFs with dedicated controls.'],
      ['✓', 'Reminders and To‑Do', 'Track resets, farms, drops and goals per character.'],
      ['◌', 'Strategy', 'Plan groups, roles and timers for Ultra Bosses.'],
      ['⌘', 'Custom keybindings', 'Set keybinds for the actions that fit your workflow.'],
      ['↗', 'Important windows', 'Open AquaStar’s main screens quickly with shortcuts.'],
      ['⌕', 'Wiki previews', 'Hover wiki links to preview a page before opening it.']
    ],
    steps: [
      ['Download AquaStar', 'Use the desktop app to play with launcher features.'],
      ['Open a tool', 'Choose Reminders, To-Do or Ultra Bosses on the web.'],
      [
        'Keep your data',
        'In AquaStar Desktop, data is stored in AppData/AquaStar. In web tools, it is stored in browser localStorage.'
      ]
    ],
    faq: [
      ['Do I need an account?', 'No. Web tools work without an account and save data in this browser.'],
      ['Do web tools replace the game?', 'No. They are planning utilities; the game remains in AquaStar Desktop.'],
      [
        'Where is data stored?',
        'In AquaStar Desktop, data is stored in the AppData/AquaStar folder. In web tools, it is stored in browser localStorage.'
      ]
    ]
  }
};

let language = localStorage.getItem('aquastar-language') || 'pt';
const byId = (id) => document.getElementById(id);

function renderCards(items, template) {
  return items.map(template).join('');
}
function render() {
  const text = content[language];
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en-US';
  document.querySelectorAll('[data-i]').forEach((element) => {
    element.innerHTML = text[element.dataset.i];
  });
  byId('featureGrid').innerHTML = renderCards(
    text.features,
    ([icon, title, body]) =>
      `<article class="card"><span class="icon">${icon}</span><h3>${title}</h3><p>${body}</p></article>`
  );
  byId('steps').innerHTML = renderCards(
    text.steps,
    ([title, body]) => `<article class="step"><strong>${title}</strong><p>${body}</p></article>`
  );
  byId('faq').innerHTML = renderCards(
    text.faq,
    ([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`
  );
  byId('language').textContent = language === 'pt' ? 'EN' : 'PT';
  document.title = `AquaStar — ${language === 'pt' ? 'companheiro AQW' : 'AQW companion'}`;
}

byId('language').addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  localStorage.setItem('aquastar-language', language);
  render();
});
render();
