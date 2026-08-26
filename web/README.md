# AquaStar Tools (Web)

Base estática para hospedar ferramentas do AquaStar sem o jogo, Electron, Flash ou
Inventário. O diretório `web/` pode ser servido diretamente por qualquer host de
arquivos estáticos; `index.html` é a raiz pública.

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
  index.html             # raiz hospedável e navegação
  app.js                 # shell, backup e rotas
  assets/app.css         # tema compartilhado
  shared/storage.js      # estado versionado no localStorage
  reminders/             # migração incremental da tela de Lembretes
  todo/                  # migração incremental da Lista de Tarefas
  ultra-bosses/          # Estratégias sem integração de Inventário
```

## Hospedagem local para desenvolvimento

Use qualquer servidor estático na pasta do repositório e abra `/web/`. Não é
necessário instalar dependências JavaScript novas para esta base.

## Compatibilidade com o desktop

O formato de backup web é deliberadamente separado dos JSONs internos do
Electron. Quando as três telas estiverem migradas, um importador de dados do
desktop poderá ser incluído de forma explícita, sem depender dos caminhos locais
ou do IPC do aplicativo.
