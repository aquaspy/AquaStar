# AquaStar Tools (Web)

Fonte da build estática do AquaStar Tools. Ela mantém as telas do desktop como
fonte única: a build copia os HTMLs atuais e injeta bridges web que simulam os
mesmos contratos dos preloads Electron.

## Escopo

- Lembretes de quests;
- Lista de tarefas;
- Estratégias de Ultra Bosses, incluindo timers dentro da página;
- armazenamento local, exportação e importação de backup JSON.

Inventário/BuyBack não fará parte da versão web. Por isso, as Estratégias não
mostrarão contagens sincronizadas de itens ou banco. Atalhos globais do desktop
também não existem no navegador: os timers continuam utilizáveis pela interface e
qualquer atalho futuro só poderá funcionar enquanto a página estiver em foco.

## Dados

Os dados ficam no `localStorage` do navegador sob uma única chave versionada.
Eles não são enviados a servidor algum e pertencem ao navegador + domínio atual.
O painel inicial oferece exportação/importação para cópia de segurança e migração
entre computadores. A importação substitui os dados web atuais após validação.

## Estrutura planejada

```
web/
  landing.html           # landing page do AquaStar Tools
  bridges/               # mocks web dos preloads Electron
```

## Hospedagem local para desenvolvimento

Execute `npm run web:build`. O resultado é `web-dist/`, pronto para ser usado
como artefato do GitHub Pages. Não há dependências JavaScript novas.

Para testar localmente, execute `npm run web:preview` e abra
`http://127.0.0.1:4173/`. Não abra a landing ou as ferramentas por `file://`:
o navegador bloqueia os `fetch()` usados para carregar traduções e defaults.

## Compatibilidade com o desktop

As bridges preservam os mesmos formatos de dados do desktop, mas guardam cada
ferramenta em `localStorage`. A exportação/importação de backup será adicionada à
landing page em seguida, sem alterar as telas reaproveitadas.

## Estado atual da migração

A build atual reaproveita integralmente Lembretes, To-Do e Estratégia. Lembretes
recebe os mesmos defaults curados; To-Do começa vazio; Estratégia recebe os
defaults de potes e timers. Inventário sincronizado continua fora da web. O
atalho de timer usa `Alt+Shift+U` enquanto a página estiver em foco.
