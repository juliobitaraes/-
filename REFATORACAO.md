# Refatoração SENATEDU

## Status Atual (10/05/2026)

### Fase 1 iniciada: desacoplamento do modulo de alunos

Mudancas realizadas:

1. Criado repositorio dedicado em `js/services/alunosRepository.js` para encapsular persistencia de alunos/turmas.
2. `js/modules/alunos.js` foi ajustado para usar funcoes do repositorio em vez de chamadas diretas `db.collection(...)`.
3. Fluxos cobertos nesta primeira extracao:
    - importacao de alunos por Excel
    - criacao/edicao de aluno
    - vinculacao/desvinculacao de aluno em turmas
    - bloqueio/desbloqueio de acesso

Beneficio imediato:

- Reducao de acoplamento entre UI e banco no dominio de alunos, preparando o terreno para testes e novas extracoes nos modulos `usuarios.js` e `provas.js`.

### Fase 2 concluida: diario com repositorio dedicado

Mudancas realizadas:

1. Criado `js/services/diarioRepository.js` para leitura/escrita de dados do diario.
2. `js/modules/diario.js` passou a usar funcoes de repositorio para:
    - leitura de turma e aluno
    - busca de componentes por turma
    - lancamento de nota manual
    - ajuste de nota de prova
    - exclusao de nota manual

Beneficio imediato:

- Menos acoplamento de regras de tela com detalhes de persistencia no dominio de notas.

### Fase 3 concluida: usuarios quebrado por subdominio (notificacoes)

Mudancas realizadas:

1. Extraido subdominio de notificacoes para `js/modules/usuariosNotificacoes.js`.
2. `js/modules/usuarios.js` ficou focado nos demais fluxos administrativos.
3. Integracao adicionada em `js/app-impl.js` com `extendUsuariosNotificacoes(app)`.

Beneficio imediato:

- Reducao de tamanho e responsabilidade do modulo de usuarios, facilitando manutencao incremental.

### Testes de servico adicionados para repositorios

1. Novo arquivo `tests/repositories.service.test.mjs` cobrindo helpers de payload de `alunosRepository` e `diarioRepository`.
2. Observacao tecnica: execucao direta via `node --test` no ambiente atual falha por configuracao global de modulo (ESM em `.js` sem `type: module` no escopo de execucao dos testes).

### Atualizacao da etapa de testes (10/05/2026)

Mudancas realizadas:

1. Criado nucleo compartilhado ESM em `js/services/frequenciaCore.mjs`.
2. Criado nucleo compartilhado ESM em `js/services/repositoryPayloadsCore.mjs`.
3. `js/services/frequencia.js` passou a reexportar funcoes do core ESM.
4. Testes passaram a importar os arquivos `.mjs` diretamente.

Resultado:

- Execucao com `node --test` concluida com sucesso (8 testes passando).

### Extracao adicional em Provas

Mudancas realizadas:

1. Criado `js/services/provasRepository.js`.
2. `js/modules/provas.js` passou a usar repositorio em pontos-chave:
    - leitura de prova para edicao/copia
    - persistencia de criacao/edicao de prova
    - carregamento de componentes por turma

Atualizacao desta etapa:

3. Exportacao de PDF/Excel em Provas passou a ler prova/turma via repositorio.
4. Fluxo de realizacao da prova (inicio/finalizacao) passou a usar repositorio para validar prova atual e salvar resultado (`provas_resultados`).
5. Backfill de autores antigos, conclusao/reabertura e demais leituras de prova/turma no modulo `provas.js` migradas para repositorio (`ProvasRepository`).

Resultado desta rodada:

- `js/modules/provas.js` ficou sem chamadas diretas `db.collection('provas')` e `db.collection('turmas')`.

### Extracao adicional em Usuarios (subdominio Turmas)

Mudancas realizadas:

1. Criado `js/modules/usuariosTurmas.js` com `renderTurmas` e toggles relacionados.
2. `renderTurmas` foi removido de `js/modules/usuarios.js`.
3. Integracao adicionada em `js/app-impl.js` com `extendUsuariosTurmas(app)`.

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
