# Refatoração SENATEDU

## Estrutura Atual

```
SENATEDU/
├── index.html              # HTML principal
├── css/
│   └── styles.css          # Estilos globais
├── js/
│   ├── app.js              # Entry point: cria app, configura auth/routing, chama extendApp(app)
│   ├── app-impl.js         # Coordenador: importa e delega para os módulos (27 linhas)
│   ├── auth.js             # Módulo de autenticação
│   ├── store.js            # Estado global reativo
│   ├── config/
│   │   └── firebase.js     # Configuração Firebase e EmailJS
│   ├── services/
│   │   ├── init.js         # Inicialização Firebase/EmailJS/Storage
│   │   ├── db.js           # Funções Firestore (batch, collection)
│   │   ├── email.js        # Envio de e-mails (sendNotificationEmailV2)
│   │   ├── notifications.js# Push notifications (FCM)
│   │   └── permissions.js  # Verificações de permissão (isAdmin, isProfessor, etc.)
│   ├── components/
│   │   ├── modal.js        # Modal e Toast
│   │   └── calendar.js     # Calendário
│   ├── utils/
│   │   └── helpers.js      # capitalize, escapeHtml, parseDateOnly, etc.
│   ├── views/
│   │   └── index.js        # Views auxiliares
│   └── modules/            # Módulos de domínio
│       ├── utils.js         # Helpers de turma, notificações, logs
│       ├── provas.js        # Provas, questões, PDF, fluxo de exame
│       ├── alunos.js        # Gestão de alunos, CRUD
│       ├── materiais.js     # Materiais didáticos
│       ├── comunicacao.js   # Avisos e eventos de calendário
│       ├── chat.js          # Chat/Fórum por turma
│       ├── diario.js        # Diário de notas, exportação, SIGOP
│       ├── calendario.js    # Calendário do dashboard
│       ├── dashboard.js     # Dashboard principal
│       ├── relatorios.js    # Relatórios de acesso e cronograma
│       └── usuarios.js      # Usuários, notificações push, CRUD admin
```

## O que foi feito

1. **CSS** – Estilos movidos de `<style>` para `css/styles.css`
2. **app-full.js deletado** – 3579 linhas de código morto removidas (nunca foi importado)
3. **Módulos de domínio** – `app-impl.js` (7017 linhas) dividido em 11 módulos temáticos em `js/modules/`
4. **Coordenador** – `app-impl.js` agora tem apenas 27 linhas, importando e chamando cada módulo
5. **Bug corrigido** – `rendimentosSection` em relatórios agora é incluído no HTML renderizado

## Padrão dos módulos

Cada módulo em `js/modules/` segue este padrão:

```js
import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };

export function extendXxx(app) {
    app.someMethod = function() { ... };
    app.anotherMethod = async function() { ... };
}
```

Todos os métodos são anexados ao objeto `app` central. Chamadas cruzadas funcionam porque os módulos são estendidos em ordem no coordenador.

## Funcionalidades adicionadas

- **Valor da prova** – Campo `valor` (0-60 pts) ao criar prova; usado no cálculo da nota final
- **Nota SIGOP** – Coluna `Total/2` arredondado para múltiplo de 0,05 (visível apenas para admin/professor)
- **Gerenciar Notas** – Edição de nota de prova aceita até 60 pontos
- **Diário** – Removido título "Diário de Notas e Trabalhos" e botão "Expandir" desnecessário
