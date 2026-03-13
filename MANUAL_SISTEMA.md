<div align="center">

# 📚 Manual do Sistema SENATEDU v2.0

### Sistema Completo de Gestão Escolar com Notificações Inteligentes

![Status](https://img.shields.io/badge/status-em_produção-success?style=for-the-badge)
![Version](https://img.shields.io/badge/versão-2.0-blue?style=for-the-badge)
![Firebase](https://img.shields.io/badge/firebase-v10-orange?style=for-the-badge&logo=firebase)
![SendGrid](https://img.shields.io/badge/sendgrid-100%2Fdia-green?style=for-the-badge)

[🚀 Início Rápido](#guia-de-uso) • [📱 Push Notifications](#notificações-push) • [📧 Email](#notificações-por-email) • [🔧 Configuração](#configuração-inicial) • [🐛 Troubleshooting](#troubleshooting)

</div>

---

## 📑 Índice

<details open>
<summary><b>Clique para expandir/recolher</b></summary>

- [📋 Visão Geral](#visão-geral)
- [🔔 Sistema de Notificações](#sistema-de-notificações)
  - [📱 Notificações Push](#notificações-push)
  - [📧 Notificações por Email](#notificações-por-email)
- [⚙️ Configuração Inicial](#configuração-inicial)
- [📖 Guia de Uso](#guia-de-uso)
  - [👨‍🏫 Como Professor](#como-professor)
  - [👨‍💼 Como Administrador](#como-administrador)
- [🔌 Funções Backend](#funções-backend)
- [🛠️ Troubleshooting](#troubleshooting)
- [📊 Estrutura de Dados](#estrutura-de-dados)
- [🔒 Segurança](#segurança-e-permissões)
- [📈 Monitoramento](#monitoramento-e-analytics)

</details>

---

## 📋 Visão Geral

<div align="center">

### 🎯 SENATEDU - Gestão Escolar Moderna

</div>

O **SENATEDU v2.0** é uma plataforma completa de gestão escolar que integra comunicação instantânea com alunos, professores e responsáveis através de múltiplos canais.

### ✨ Recursos Principais

| Recurso | Tecnologia | Status |
|---------|-----------|--------|
| 📱 **Notificações Push** | Firebase Cloud Messaging (FCM) | ✅ Ativo |
| 📧 **Email Automático** | SendGrid REST API | ✅ Ativo |
| 📊 **Gestão de Turmas** | Firebase Firestore | ✅ Ativo |
| 👥 **Controle de Acesso** | Firebase Authentication | ✅ Ativo |
| ☁️ **Backend Serverless** | Firebase Functions | ✅ Ativo |

### 🎨 Tecnologias Utilizadas

```mermaid
graph LR
    A[Frontend] --> B[Firebase Auth]
    A --> C[Firestore]
    A --> D[Cloud Functions]
    D --> E[FCM Push]
    D --> F[SendGrid Email]
    B --> G[JWT Tokens]
```

---

## 🔔 Sistema de Notificações

<div align="center">

### 🚀 Comunicação em Tempo Real com Alunos e Professores

</div>

---

### 📱 Notificações Push

> **💡 Dica:** As notificações push funcionam mesmo com o app fechado, garantindo que mensagens importantes cheguem instantaneamente aos alunos.

#### ✨ Funcionalidades

<table>
<tr>
<td width="50%">

**📤 Tipos de Envio**
- ✅ Individual (1 aluno)
- ✅ Por Turma (todos da turma)
- ✅ Em Massa (admin)
- ✅ Por Tipo de Usuário

</td>
<td width="50%">

**🎯 Capacidades**
- ✅ Background (app fechado)
- ✅ Foreground (app aberto)
- ✅ Histórico completo
- ✅ Logs detalhados

</td>
</tr>
</table>

#### 👨‍🏫 Como Usar (Professores/Admin)

```mermaid
graph TD
    A[Menu Notificações] --> B{Escolher Tipo}
    B -->|Individual| C[Selecionar Aluno]
    B -->|Por Turma| D[Selecionar Turma]
    B -->|Em Massa| E[Selecionar Tipo]
    C --> F[Preencher Mensagem]
    D --> F
    E --> F
    F --> G[Enviar]
    G --> H[✅ Entregue!]
```

**Passo a Passo:**
1. 📂 Acesse o menu **Notificações** na barra lateral
2. 🎯 Escolha o tipo de envio:
   - **Individual**: Selecione um aluno específico
   - **Por Turma**: Selecione uma turma completa
   - **Por Tipo** (admin): Alunos/Professores/Responsáveis
3. ✍️ Preencha título e mensagem
4. 🚀 Clique em **Enviar Notificação**

> **⚠️ Atenção:** Certifique-se de que os alunos aceitaram as permissões de notificação no navegador.

#### 👨‍🎓 Para Alunos

**Ativação em 4 Passos:**

| Passo | Ação | Resultado |
|-------|------|----------|
| 1️⃣ | Fazer login no sistema | Acesso ao dashboard |
| 2️⃣ | Aceitar permissão de notificações | Popup do navegador |
| 3️⃣ | Token FCM registrado automaticamente | Sistema pronto |
| 4️⃣ | Receber notificações | ✅ Configurado |

> **📌 Nota:** As notificações aparecerão automaticamente no canto da tela. Clique para abrir o sistema diretamente.

---

### 📧 Notificações por Email

<div align="center">

![SendGrid](https://img.shields.io/badge/SendGrid-REST_API-00B9FF?style=flat-square&logo=sendgrid)
![Limite](https://img.shields.io/badge/limite-100%2Fdia_free-green?style=flat-square)
![Status](https://img.shields.io/badge/status-202_accepted-success?style=flat-square)

</div>

> **🎉 Novidade v2.0:** Sistema de emails totalmente automático com templates profissionais e rastreamento completo!

#### ✨ Funcionalidades Implementadas

<table>
<tr>
<td width="33%" align="center">

**⚡ Automático**

Envio instantâneo ao publicar provas

</td>
<td width="33%" align="center">

**🎨 Profissional**

Template visual SENATEDU com cores da marca

</td>
<td width="33%" align="center">

**📊 Rastreável**

Logs e dashboard de entrega

</td>
</tr>
</table>

**Recursos Incluídos:**
- ✉️ Envio automático quando professor publica prova
- 📧 Template HTML responsivo com visual SENATEDU
- 🔗 Link direto para acessar o sistema
- 📊 Informações da turma no corpo do email
- ⚡ API SendGrid REST (100 emails/dia gratuitos permanentemente)
- 📈 Rastreamento de entrega e abertura

#### 🔄 Fluxo Automático

```mermaid
sequenceDiagram
    participant P as Professor
    participant S as Sistema
    participant F as Firebase Function
    participant SG as SendGrid API
    participant A as Alunos
    
    P->>S: Publica/Atualiza Prova
    S->>F: Trigger sendEmailHttp
    S->>A: 📱 Push Notification
    F->>SG: POST /v3/mail/send
    SG->>A: 📧 Email HTML
    A->>S: 🔗 Clica no link
```

**Processo:**
1. 📝 Professor publica/atualiza uma prova
2. 🚀 Sistema envia automaticamente:
   - 📱 Notificação push para celulares
   - 📧 Email para todos os alunos da turma
3. 📬 Alunos recebem email contendo:
   - ✉️ Assunto da notificação
   - 🏫 Nome da turma
   - 🔗 Link direto para o sistema
   - 🎨 Template visual profissional

#### 🧪 Testar Sistema de Email

> **💡 Dica:** Use o botão de teste antes de publicar provas para verificar se tudo está funcionando.

**Teste em 4 Cliques:**

```
1. Menu Lateral → 📂 Cadastro
2. Rolar até → 📧 Sistema de Email
3. Clicar em → 🧪 Enviar Email de Teste
4. Verificar → 📬 Caixa de entrada (e spam)
```

#### 📊 Monitoramento de Envios

**No Console do Navegador (F12):**
```javascript
📧 Enviando e-mails para 4 alunos...
✅ E-mails enviados: 4 sucesso, 0 falhas
```

**No SendGrid Dashboard:**

<div align="center">

📊 **[Acessar Dashboard SendGrid](https://app.sendgrid.com/)** 📊

</div>

| Seção | Função | O que Ver |
|-------|--------|----------|
| **Activity** | Email Activity | Status de cada email enviado |
| **Statistics** | Gráficos | Estatísticas de envio/entrega |
| **Suppressions** | Bloqueios | Emails bounced/bloqueados |

**Status Possíveis:**
- ✅ **Delivered** - Email entregue com sucesso
- ⚠️ **Bounced** - Email inválido ou inexistente
- 🚫 **Dropped** - Bloqueado pelo SendGrid
- ⏳ **Deferred** - Aguardando retry
- 📬 **Processed** - Aceito para entrega (Status 202)

#### ⚙️ Controle de Emails

**Emails habilitados por padrão**. Para ajustar:

<table>
<tr>
<td width="50%">

**🚫 Desabilitar Temporariamente**
```javascript
localStorage.setItem('sendEmails', 'false');
// Emails não serão enviados
```

</td>
<td width="50%">

**✅ Reabilitar**
```javascript
localStorage.setItem('sendEmails', 'true');
// Volta ao normal
```

</td>
</tr>
</table>

> **📌 Nota:** Essa configuração é local do navegador. Cada usuário pode ter sua preferência.

---

## ⚙️ Configuração Inicial

<div align="center">

### 🚀 Setup Completo do Sistema

</div>

> **⚠️ Importante:** A maioria das configurações já está pronta! Esta seção é para referência e troubleshooting.

---

### 1️⃣ Firebase Functions

**📦 Deploy das Funções Backend**

```mermaid
graph LR
    A[Instalar] --> B[Configurar]
    B --> C[Deploy]
    C --> D[✅ Pronto]
```

**Comandos:**

```powershell
# 📍 Navegar para pasta functions
cd functions

# 📦 Instalar dependências
npm install

# 🔙 Voltar para raiz do projeto
cd ..

# 🚀 Deploy de todas as funções
firebase deploy --only functions

# ⚡ Ou deploy apenas de email (mais rápido)
firebase deploy --only functions:sendEmailHttp
```

**Funções Deployadas:**

| Função | Tipo | Descrição | Região |
|---------|------|-----------|-------|
| `sendNotificationToUser` | Callable | Push para 1 usuário | us-central1 |
| `sendNotificationToMultipleUsers` | Callable | Push para múltiplos | us-central1 |
| `sendNotificationToTurma` | Callable | Push para turma | us-central1 |
| `sendNotificationByUserType` | Callable | Push por tipo | us-central1 |
| `sendEmailHttp` | HTTP | 📧 Envio de emails | us-central1 |
| `deleteUserByUid` | Callable | Admin: deletar | us-central1 |
| `reclaimUserByEmail` | Callable | Admin: recuperar | us-central1 |

---

### 2️⃣ SendGrid (Email)

<div align="center">

![SendGrid](https://img.shields.io/badge/Status-Configurado-success?style=for-the-badge&logo=sendgrid)

**🎉 Já Configurado e Pronto para Usar!**

</div>

**📊 Detalhes da Conta:**

| Item | Valor | Status |
|------|-------|--------|
| **Email Sender** | senateduvaledoaco@gmail.com | ✅ Verificado |
| **API Key** | Configurada nas funções | 🔒 Protegida |
| **Trial** | Até 15/04/2026 | ⏳ Ativo |
| **Free Forever** | 100 emails/dia | ♾️ Permanente |
| **Sender Status** | Verified | ✅ OK |

**📊 Acessar Dashboard:**

<div align="center">

🔗 **[https://app.sendgrid.com/](https://app.sendgrid.com/)** 🔗

**Login:** senateduvaledoaco@gmail.com

</div>

**Seções úteis no Dashboard:**
- 📊 **Statistics** → Gráficos de envio e entrega
- 📝 **Activity** → Histórico detalhado de cada email
- 🔒 **Sender Authentication** → Status de verificação
- ⚠️ **Suppressions** → Emails bloqueados/bounced

> **💡 Dica:** Verifique o dashboard regularmente para monitorar a saúde do sistema de emails.

---

### 3️⃣ Firebase Messaging (Push)

<div align="center">

![FCM](https://img.shields.io/badge/Firebase-Cloud_Messaging-orange?style=for-the-badge&logo=firebase)

**✅ Sistema Push Totalmente Configurado**

</div>

**Arquivos Necessários (Já no Projeto):**

```
✅ firebase-messaging-sw.js  → Service Worker para background
✅ js/services/notifications.js → Lógica de notificações
✅ VAPID Key → Configurada no Firebase Console
✅ Permissões → Solicitadas automaticamente
```

**Como Funciona:**
1. 👤 Aluno faz login
2. 🔔 Sistema solicita permissão de notificações
3. 🎯 Token FCM gerado e salvo no Firestore
4. ✅ Pronto para receber notificações!

---

### 4️⃣ Cadastro de Alunos

> **⚠️ IMPORTANTE:** Para que alunos recebam emails, o campo de email DEVE estar preenchido!

**📝 Processo de Cadastro com Email:**

```mermaid
graph TD
    A[Cadastrar Aluno] --> B{Email Preenchido?}
    B -->|Sim| C[✅ Receberá Emails]
    B -->|Não| D[⚠️ Só Push Notifications]
    C --> E[Sistema Completo]
    D --> F[Parcial]
```

**Passo a Passo:**

<table>
<tr>
<th>Passo</th>
<th>Ação</th>
<th>Onde</th>
</tr>
<tr>
<td>🔹 1</td>
<td>Acessar gestão de alunos</td>
<td>Menu <b>Alunos</b></td>
</tr>
<tr>
<td>🔹 2</td>
<td>Criar novo ou editar existente</td>
<td>Botão <b>Novo Aluno</b> ou <b>Editar</b></td>
</tr>
<tr>
<td>🔹 3</td>
<td>Preencher campo <b>Email</b></td>
<td>Formulário de cadastro</td>
</tr>
<tr>
<td>🔹 4</td>
<td>Salvar alterações</td>
<td>Botão <b>Salvar</b></td>
</tr>
<tr>
<td>✅ 5</td>
<td>Aluno pronto para receber emails!</td>
<td>-</td>
</tr>
</table>

**Formato Válido de Email:**
```
✅ aluno@example.com
✅ joao.silva@escola.edu.br
✅ maria_2024@hotmail.com
❌ aluno@
❌ @example.com
❌ aluno sem arroba
```

---

## 📚 Guia de Uso

<div align="center">

### 🎯 Manual Prático para Professores e Administradores

</div>

---

### 👨‍🏫 Como Professor

<div align="center">

![Professor](https://img.shields.io/badge/Perfil-Professor-blue?style=for-the-badge)

</div>

#### 📝 Publicar Prova com Notificações Automáticas

> **⚡ Automático:** Ao salvar uma prova, o sistema envia notificações push E emails para todos os alunos da turma!

**📋 Processo Completo:**

```mermaid
graph LR
    A[📖 Criar Prova] --> B[✍️ Preencher Dados]
    B --> C[💾 Salvar]
    C --> D{🚀 Sistema}
    D -->|Automático| E[📱 Push]
    D -->|Automático| F[📧 Email]
    E --> G[✅ Alunos Notificados]
    F --> G
```

<table>
<tr>
<th>Passo</th>
<th>Ação</th>
<th>Resultado</th>
</tr>
<tr>
<td><b>1️⃣</b></td>
<td>Menu <b>Provas</b> → Nova Prova</td>
<td>Formulário de criação</td>
</tr>
<tr>
<td><b>2️⃣</b></td>
<td>Preencher campos obrigatórios</td>
<td>Título, turma, data, conteúdo</td>
</tr>
<tr>
<td><b>3️⃣</b></td>
<td>Clicar em <code>Salvar</code> ou <code>Atualizar</code></td>
<td>Prova salva no sistema</td>
</tr>
<tr>
<td><b>🚀</b></td>
<td><b>Automático:</b> Sistema envia notificações</td>
<td>📱 Push + 📧 Email</td>
</tr>
<tr>
<td><b>✅</b></td>
<td>Alunos notificados e podem acessar</td>
<td>Histórico registrado</td>
</tr>
</table>

#### 📊 Verificar Envios (Console do Navegador)

**Abrir Console:** Pressione `F12` > Aba **Console**

**Mensagens Esperadas:**

```javascript
// 📧 EMAILS
📧 Enviando e-mails para 4 alunos...
✅ E-mails enviados: 4 sucesso, 0 falhas

// 📱 PUSH NOTIFICATIONS  
📱 Enviando notificações push para 4 alunos...
✅ Notificações push enviadas: { success: 4, failed: 0 }

// 📊 RESUMO
✅ Notificações enviadas com sucesso!
```

**Interpretando os Resultados:**

| Status | Signif ado | Ação |
|--------|-----------|------|
| `success: 4` | 4 alunos notificados | ✅ Tudo OK |
| `failed: 1` | 1 falhou | ⚠️ Verificar logs |
| `noToken: 2` | 2 sem token FCM | 📌 Alunos não aceitaram push |
| `0 alunos` | Turma vazia | ⚠️ Matricular alunos |

#### 📬 Enviar Notificação Manual Personalizada

**Quando Usar:**
- 📌 Avisos importantes para a turma
- 📅 Lembrete de prazos
- 📢 Informações extras sobre provas/atividades

**Passo a Passo:**

```
1. Menu Lateral → 🔔 Notificações
2. Tipo de Envio → 🏫 Por Turma
3. Selecionar Turma → Escolher da lista
4. Título → Ex: "Lembrete de Prova"
5. Mensagem → Escrever conteúdo personalizado
6. Botão → 🚀 Enviar Notificação
7. Confirmação → ✅ Notificações enviadas!
```

> **💡 Dica:** As notificações manuais também enviam push E email automaticamente!

---

### 👨‍💼 Como Administrador

<div align="center">

![Admin](https://img.shields.io/badge/Perfil-Administrador-red?style=for-the-badge)
![Privilégios](https://img.shields.io/badge/Acesso-Total-gold?style=for-the-badge)

</div>

#### 📢 Gerenciar Notificações em Massa

> **🔒 Exclusivo Admin:** Envio para TODOS os usuários de um tipo específico.

**Tipos Disponíveis:**

<table>
<tr>
<td width="33%" align="center">

**👨‍🎓 Alunos**

Todos os alunos cadastrados

</td>
<td width="33%" align="center">

**👨‍🏫 Professores**

Todo corpo docente

</td>
<td width="33%" align="center">

**👨‍👩‍👧 Responsáveis**

Todos os pais/responsáveis

</td>
</tr>
</table>

**🚀 Processo de Envio em Massa:**

```mermaid
graph TD
    A[Menu Notificações] --> B[Selecionar "Por Tipo"]
    B --> C{Escolher Público}
    C -->|Alunos| D[Todos Alunos]
    C -->|Professores| E[Todos Professores]
    C -->|Responsáveis| F[Todos Responsáveis]
    D --> G[Escrever Mensagem]
    E --> G
    F --> G
    G --> H[Enviar]
    H --> I[✅ Notificado!]
```

**Exemplos de Uso:**

| Cenário | Público | Exemplo de Mensagem |
|---------|---------|--------------------|
| Manutenção | 👥 Todos | "Sistema em manutenção amanhã 15h-17h" |
| Reunião | 👨‍👩‍👧 Responsáveis | "Reunião de pais dia 20/02 às 19h" |
| Capacitação | 👨‍🏫 Professores | "Workshop de tecnologia dia 18/02" |
| Feriado | 👨‍🎓 Alunos | "Não haverá aula dia 21/02 - Feriado" |

#### 📊 Monitorar Sistema

**🔥 Firebase Functions Logs**

```powershell
# 📧 Logs da função de email (recomendado)
firebase functions:log --only sendEmailHttp

# 📊 Logs com gcloud (mais detalhado)
gcloud functions logs read sendEmailHttp --region=us-central1 --limit=20

# 📱 Logs de notificações push
firebase functions:log --only sendNotificationToMultipleUsers

# 📜 Todos os logs de todas as funções
firebase functions:log
```

**Exemplo de Saída (Success):**
```
FUNCTION NAME: sendEmailHttp
TIME: 2026-02-14T05:26:03.123Z
SEVERITY: INFO
MESSAGE: ✅ Email enviado via SendGrid API! Status: 202
         Aceitos: ["aluno@example.com"]
         Rejeitados: []
```

**🌐 Dashboards Online**

<table>
<tr>
<th>Plataforma</th>
<th>URL</th>
<th>O que Monitorar</th>
</tr>
<tr>
<td>📧 <b>SendGrid</b></td>
<td><a href="https://app.sendgrid.com/">app.sendgrid.com</a></td>
<td>• Email Activity<br>• Statistics<br>• Suppressions</td>
</tr>
<tr>
<td>🔥 <b>Firebase Console</b></td>
<td><a href="https://console.firebase.google.com/">console.firebase.google.com</a></td>
<td>• Cloud Messaging Metrics<br>• Firestore Data<br>• Functions Logs</td>
</tr>
<tr>
<td>🌐 <b>Hosting</b></td>
<td><a href="https://educloud-sistema.web.app">educloud-sistema.web.app</a></td>
<td>• Site em produção<br>• Performance</td>
</tr>
</table>

**📊 Métricas Importantes:**

<div align="center">

| Métrica | Onde Ver | Meta |
|---------|---------|------|
| 📧 Taxa de Entrega | SendGrid > Statistics | > 95% |
| 📱 Push Success Rate | Firebase > Cloud Messaging | > 90% |
| ⚡ Function Errors | Firebase > Functions > Logs | < 1% |
| ⏱️ Tempo de Resposta | Firebase > Functions > Metrics | < 2s |

</div>

---

## 🔌 Funções Backend

<div align="center">

### 🚀 API Firebase Functions - Documentação Técnica

![Firebase Functions](https://img.shields.io/badge/Firebase-Functions-orange?style=for-the-badge&logo=firebase)
![Region](https://img.shields.io/badge/região-us--central1-blue?style=for-the-badge)

</div>

---

### 📱 Notificações Push

#### 🎯 `sendNotificationToUser`

<div align="center">

**Envia notificação push para um usuário específico**

</div>

**📄 Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|--------------|----------|
| `userId` | string | ✅ | ID do usuário no Firestore |
| `title` | string | ✅ | Título da notificação |
| `body` | string | ✅ | Conteúdo da mensagem |
| `icon` | string | ❌ | URL do ícone (padrão: `/icon-192.png`) |
| `data` | object | ❌ | Dados extras (turmaId, type, url, etc) |

**💻 Exemplo de Uso:**

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const sendNotification = httpsCallable(functions, 'sendNotificationToUser');

// Enviar notificação
const result = await sendNotification({
  userId: 'xSeQ7zitlkPc...',
  title: 'Nova Prova Disponível',
  body: 'Prova de Matemática foi publicada para 2º Ano A',
  icon: '/icon-192.png',
  data: {
    turmaId: 'turma123',
    type: 'prova',
    url: '/provas',
    timestamp: Date.now()
  }
});

console.log(result.data);
// { success: true, messageId: 'projects/...' }
```

**⚙️ Retorno:**

```typescript
{
  success: boolean,      // true se enviado
  messageId?: string,    // ID da mensagem FCM
  error?: string         // Mensagem de erro (se falhar)
}
```

---

#### 👥 `sendNotificationToMultipleUsers`

<div align="center">

**Envia notificação push para múltiplos usuários**

</div>

**📄 Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|--------------|----------|
| `userIds` | string[] | ✅ | Array com IDs dos usuários |
| `title` | string | ✅ | Título da notificação |
| `body` | string | ✅ | Conteúdo da mensagem |
| `icon` | string | ❌ | URL do ícone |
| `data` | object | ❌ | Dados extras |

**💻 Exemplo de Uso:**

```javascript
const sendNotificationToMultiple = httpsCallable(
  functions,
  'sendNotificationToMultipleUsers'
);

const result = await sendNotificationToMultiple({
  userIds: ['user1', 'user2', 'user3', 'user4'],
  title: 'Aviso Importante',
  body: 'Reunião de pais amanhã às 19h no auditório',
  icon: '/icon-192.png',
  data: {
    type: 'aviso',
    date: '2026-02-15',
    location: 'auditório'
  }
});

console.log(result.data);
```

**⚙️ Retorno Detalhado:**

```typescript
{
  success: number,       // Quantidade enviada com sucesso
  failed: number,        // Quantidade que falhou
  noToken: number,       // Usuários sem token FCM
  disabled: number,      // Usuários com notificações desabilitadas
  details: {
    successful: string[],  // IDs dos usuários notificados
    failed: string[]       // IDs que falharam
  }
}
```

**📈 Exemplo de Retorno:**
```json
{
  "success": 5,
  "failed": 1,
  "noToken": 2,
  "disabled": 0,
  "details": {
    "successful": ["user1", "user2", "user3", "user4", "user5"],
    "failed": ["user6"]
  }
}
```

---

#### 🏫 `sendNotificationToTurma`

<div align="center">

**Envia notificação para todos os alunos de uma turma**

</div>

**📄 Parâmetros:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|--------------|----------|
| `turmaId` | string | ✅ | ID da turma no Firestore |
| `title` | string | ✅ | Título da notificação |
| `body` | string | ✅ | Conteúdo da mensagem |
| `icon` | string | ❌ | URL do ícone |
| `data` | object | ❌ | Dados extras |

**💻 Exemplo de Uso:**

```javascript
const sendNotificationToTurma = httpsCallable(
  functions,
  'sendNotificationToTurma'
);

const result = await sendNotificationToTurma({
  turmaId: 'turma_2ano_a_manha',
  title: 'Nova Atividade Disponível',
  body: 'Atividade de História sobre Brasil Colônia já está disponível',
  data: {
    type: 'atividade',
    materia: 'Historia',
    prazo: '2026-02-20'
  }
});
```

> **💡 Dica:** A função busca automaticamente todos os alunos matriculados na turma.

---

#### 👥 `sendNotificationByUserType`

<div align="center">

**Envia notificação para todos de um tipo de usuário**

![Admin Only](https://img.shields.io/badge/Acesso-Admin_Only-red?style=flat-square)

</div>

**📄 Parâmetros:**

| Campo | Tipo | Obrigatório | Valores Possíveis |
|-------|------|--------------|-------------------|
| `userType` | string | ✅ | `aluno`, `professor`, `admin`, `responsavel` |
| `title` | string | ✅ | Título da notificação |
| `body` | string | ✅ | Conteúdo da mensagem |
| `icon` | string | ❌ | URL do ícone |
| `data` | object | ❌ | Dados extras |

**💻 Exemplo de Uso:**

```javascript
const sendNotificationByUserType = httpsCallable(
  functions,
  'sendNotificationByUserType'
);

// Avisar todos os alunos
const result = await sendNotificationByUserType({
  userType: 'aluno',
  title: 'Manutenção Programada',
  body: 'Sistema ficará offline amanhã das 15h às 17h para atualizações',
  data: {
    type: 'sistema',
    date: '2026-02-15',
    duration: '2h'
  }
});
```

> **⚠️ Atenção:** Esta função envia para TODOS os usuários do tipo. Use com cautela!

---

### 📧 Notificações por Email

#### 🌐 `sendEmailHttp`

<div align="center">

**Função HTTP para envio de emails via SendGrid REST API**

![Type](https://img.shields.io/badge/Type-HTTP_Function-blue?style=flat-square)
![Auth](https://img.shields.io/badge/Auth-Bearer_Token-green?style=flat-square)

</div>

**🔗 Endpoint:**
```
https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp
```

**🔒 Autenticação:**
- **Tipo:** Bearer Token
- **Token:** Firebase ID Token do usuário autenticado
- **Header:** `Authorization: Bearer <token>`

**📄 Request:**

```http
POST /sendEmailHttp HTTP/1.1
Host: us-central1-educloud-sistema.cloudfunctions.net
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "to": "aluno@example.com",
  "subject": "Nova Prova - Matemática",
  "html": "<h1>Prova publicada</h1><p>Acesse o sistema...</p>",
  "replyTo": "senateduvaledoaco@gmail.com"
}
```

**Parâmetros do Body:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|--------------|----------|
| `to` | string \| string[] | ✅ | Email(s) destinatário(s) |
| `subject` | string | ✅ | Assunto do email |
| `html` | string | ✅ | Conteúdo HTML do email |
| `replyTo` | string | ❌ | Email para resposta |

**✅ Response (Success - 200):**

```json
{
  "success": true,
  "messageId": "sent",
  "accepted": ["aluno@example.com"],
  "rejected": []
}
```

**❌ Response (Error - 500):**

```json
{
  "error": "Falha ao enviar email",
  "message": "SendGrid API error: 401",
  "details": "Invalid API Key"
}
```

**💻 Exemplo JavaScript (Frontend):**

```javascript
import { getAuth } from 'firebase/auth';

async function sendEmail(to, subject, htmlContent) {
  try {
    // 🔒 Obter token de autenticação
    const auth = getAuth();
    const user = auth.currentUser;
    const idToken = await user.getIdToken();
    
    // 🚀 Fazer requisição
    const response = await fetch(
      'https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: to,
          subject: subject,
          html: htmlContent,
          replyTo: 'senateduvaledoaco@gmail.com'
        })
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Email enviado!', result);
      return true;
    } else {
      console.error('❌ Erro:', result);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Exceção:', error);
    return false;
  }
}

// 📋 Uso
await sendEmail(
  'aluno@example.com',
  'Nova Prova Disponível',
  '<h1>Matemática</h1><p>Acesse o sistema para fazer a prova.</p>'
);
```

**🎯 Uso Simplificado (Com Helper):**

```javascript
import { sendNotificationEmailV2 } from './services/email.js';

await sendNotificationEmailV2(
  'aluno@example.com',       // Email do aluno
  'João Silva',              // Nome do aluno
  'Nova Prova Disponível',   // Título
  'Prova de Matemática',     // Mensagem
  {
    turma: '2º Ano A - Manhã',
    link: 'https://educloud-sistema.web.app'
  }
);
```

> **💡 Dica:** Use `sendNotificationEmailV2()` que já formata o HTML automaticamente com o template SENATEDU.

---

## 🛠️ Troubleshooting

<div align="center">

### 🔧 Guia de Resolução de Problemas

![Support](https://img.shields.io/badge/Suporte-24%2F7-success?style=for-the-badge)

</div>

> **💡 Dica:** Use Ctrl+F para localizar rapidamente o problema específico.

---

### 📧 Problema: Emails não chegam

<div align="center">

![Issue](https://img.shields.io/badge/Tipo-Email-blue?style=flat-square)
![Prioridade](https://img.shields.io/badge/Prioridade-Alta-red?style=flat-square)

</div>

#### 🔍 Diagnóstico Rápido

| ✅ Check | Comando/Ação | O que Verificar |
|---------|--------------|----------------|
| **1️⃣ Logs** | `gcloud functions logs read sendEmailHttp --region=us-central1 --limit=20` | Status 202? |
| **2️⃣ Dashboard** | [app.sendgrid.com](https://app.sendgrid.com/) | Email aparece? |
| **3️⃣ Spam** | Verificar pasta Spam | Email foi para spam? |
| **4️⃣ Cadastro** | Menu Alunos > Editar | Email preenchido? |
| **5️⃣ Teste** | Bot button "Enviar Email de Teste" | Funciona? |

#### 1️⃣ Verificar Logs da Função

```powershell
# 📋 Ver últimos 20 logs
gcloud functions logs read sendEmailHttp --region=us-central1 --limit=20

# 🔴 Ver apenas erros
gcloud functions logs read sendEmailHttp --region=us-central1 --severity=ERROR
```

**✅ Status Esperado (SUCCESS):**
```log
FUNCTION: sendEmailHttp
TIME: 2026-02-14T05:26:03.123Z
SEVERITY: INFO
MESSAGE: ✅ Email enviado via SendGrid API! Status: 202
         Aceitos: ["aluno@example.com"]
         Rejeitados: []
```

> **📌 Nota:** Status **202** = SendGrid aceitou o email para entrega.

**❌ Possíveis Erros:**

<table>
<tr>
<th>Status Code</th>
<th>Significado</th>
<th>Solução</th>
</tr>
<tr>
<td><code>401</code></td>
<td>API Key inválida</td>
<td>Verificar API Key no código da função</td>
</tr>
<tr>
<td><code>403</code></td>
<td>Sender não verificado</td>
<td>Verificar sender em app.sendgrid.com</td>
</tr>
<tr>
<td><code>429</code></td>
<td>Limite atingido</td>
<td>Aguardar reset (meia-noite UTC) ou upgrade</td>
</tr>
<tr>
<td><code>500</code></td>
<td>Erro no SendGrid</td>
<td>Verificar status do SendGrid</td>
</tr>
</table>

#### 2️⃣ Verificar SendGrid Dashboard

<div align="center">

🔗 **[Acessar Dashboard SendGrid](https://app.sendgrid.com/)** 🔗

</div>

**Navegação:**
```
SendGrid Dashboard
  └─ Activity
      └─ Email Activity
          └─ Buscar por email do aluno
```

**Status Possíveis:**

| Status | Emoji | Significado | Ação |
|--------|-------|------------|------|
| **Delivered** | ✅ | Email entregue com sucesso | Nenhuma |
| **Bounced** | ⚠️ | Email inválido ou inexistente | Corrigir o email |
| **Dropped** | 🚫 | Bloqueado pelo SendGrid | Verificar suppressions |
| **Deferred** | ⏳ | Aguardando retry | Aguardar |
| **Processed** | 📮 | Aceito para entrega | Normal (Status 202) |
| **Spam Report** | ⚠️ | Marcado como spam | Melhorar template |

#### 3️⃣ Verificar Pasta de Spam

> **💡 Dica:** Emails automáticos podem ir para spam nas primeiras vezes. Peça aos alunos para marcarem como "Não é spam".

**Como Evitar Spam:**
- ✅ Sender verificado (já configurado)
- ✅ Template profissional com HTML válido
- ✅ Link para site HTTPS
- ✅ Texto claro e objetivo
- ✅ ReplyTo configurado

#### 4️⃣ Verificar Email Cadastrado

```mermaid
graph LR
    A[Menu Alunos] --> B[Editar Aluno]
    B --> C{Campo Email?}
    C -->|Preenchido| D[✅ OK]
    C -->|Vazio| E[❌ Preencher]
    E --> F[Salvar]
    F --> D
```

**Formato Válido:**
- ✅ `aluno@example.com`
- ✅ `joao.silva@escola.edu.br`
- ❌ `aluno@` (incompleto)
- ❌ `@example.com` (sem nome)
- ❌ `aluno sem arroba` (inválido)

#### 5️⃣ Testar com Botão de Teste

**Localização:**
```
Menu → 📂 Cadastro
  └─ Rolar até "Sistema de Email"
      └─ 🧪 Botão "Enviar Email de Teste"
```

**O que acontece:**
1. Sistema envia email para SEU email cadastrado
2. Console mostra logs em tempo real
3. Você recebe email em segundos
4. Se funcionar aqui → Problema está nos dados dos alunos

#### ⚡ Solução Rápida

**Se tudo está correto mas não chega:**

1. **Limpar cache do navegador** (Ctrl+Shift+Del)
2. **Redesenhar função:**
   ```powershell
   firebase deploy --only functions:sendEmailHttp
   ```
3. **Aguardar 2-3 minutos** (propagação)
4. **Testar novamente**

---

### 📱 Problema: Notificações Push não chegam

<div align="center">

![Issue](https://img.shields.io/badge/Tipo-Push-orange?style=flat-square)
![Prioridade](https://img.shields.io/badge/Prioridade-Média-yellow?style=flat-square)

</div>

#### 🔍 Diagnóstico Rápido

<table>
<tr>
<th>Check</th>
<th>Como Verificar</th>
<th>Solução</th>
</tr>
<tr>
<td>Permissão</td>
<td>Console: <code>Notification.permission</code></td>
<td>Deve ser <code>"granted"</code></td>
</tr>
<tr>
<td>Token FCM</td>
<td>Console: <code>localStorage.getItem('fcmToken')</code></td>
<td>String grande (150+ chars)</td>
</tr>
<tr>
<td>Service Worker</td>
<td>DevTools → Application → Service Workers</td>
<td><code>firebase-messaging-sw.js</code> ativo</td>
</tr>
<tr>
<td>Firestore</td>
<td>Firestore → Collection <code>fcmTokens</code></td>
<td>Documento com userId existe</td>
</tr>
</table>

#### 1️⃣ Verificar Permissão do Navegador

**No Console (F12):**
```javascript
console.log('Permissão:', Notification.permission);
// Resultado deve ser: "granted"
```

**Valores Possíveis:**

| Valor | Significado | Solução |
|-------|------------|---------|
| `"granted"` | ✅ Permitido | OK |
| `"denied"` | ❌ Negado | Instruir usuário a habilitar |
| `"default"` | ⚠️ Não pediu ainda | Recarregar página |

**Como Habilitar Manualmente:**

**Chrome:**
```
1. Clicar no 🔒 (cadeado) ao lado da URL
2. Configurações do site
3. Notificações → Permitir
4. Recarregar página (F5)
```

**Edge:**
```
1. Configurações (⋯) → Configurações
2. Cookies e permissões do site
3. Notificações
4. Adicionar site e Permitir
```

#### 2️⃣ Verificar Token FCM

**No Console:**
```javascript
const token = localStorage.getItem('fcmToken');
console.log('Token FCM:', token);
console.log('Tamanho:', token?.length);
// Tamanho esperado: 150-200 caracteres
```

**❌ Se NÃO houver token:**
```javascript
// Forçar registro de novo token
localStorage.removeItem('fcmToken');
location.reload();
// Aceitar permissão quando solicitado
```

#### 3️⃣ Verificar Service Worker

**DevTools → Application → Service Workers**

**✅ Esperado:**
```
firebase-messaging-sw.js
Status: ● Activated and running
```

**❌ Se NOT registrado:**
```javascript
// No console
navigator.serviceWorker.register('/firebase-messaging-sw.js')
  .then(reg => console.log('✅ Service Worker registrado', reg))
  .catch(err => console.error('❌ Erro:', err));
```

#### 4️⃣ Limpar Cache Completo

> **⚠️ Atenção:** Isto vai deslogar o usuário.

```javascript
// No console do navegador (DevTools)
async function limparTudo() {
  // Limpar cache
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    await caches.delete(name);
    console.log('🗑️ Cache removido:', name);
  }
  
  // Limpar localStorage
  localStorage.clear();
  console.log('🗑️ LocalStorage limpo');
  
  // Desregistrar service workers
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    await reg.unregister();
    console.log('🗑️ Service Worker removido');
  }
  
  console.log('✅ Limpeza completa! Recarregando página...');
  
  // Recarregar
  setTimeout(() => location.reload(), 2000);
}

limparTudo();
```

---

### ⚠️ Erro: "nodemailer.createTransporter is not a function"

<div align="center">

![Status](https://img.shields.io/badge/Status-RESOLVIDO-success?style=flat-square)
![Versão](https://img.shields.io/badge/Fix-v2.0-blue?style=flat-square)

</div>

> **✅ RESOLVIDO:** O sistema agora usa **SendGrid REST API** diretamente, não mais Nodemailer/SMTP.

**Se ainda aparecer:**

```powershell
# Redesenhar função com código atualizado
firebase deploy --only functions:sendEmailHttp

# Aguardar 2-3 minutos
# Testar novamente
```

**Confirmação de Fix:**
- ✅ Função usa `fetch()` em vez de `nodemailer.createTransport()`
- ✅ POST direto para `https://api.sendgrid.com/v3/mail/send`
- ✅ Sem dependências SMTP
- ✅ Mais rápido e confiável

---

### 🚫 Erro: "CORS policy blocked"

<div align="center">

![Status](https://img.shields.io/badge/Status-RESOLVIDO-success?style=flat-square)

</div>

> **✅ RESOLVIDO:** Função HTTP configurada com CORS manual e IAM público.

**Se ainda aparecer:**

#### 1️⃣ Verificar IAM Permissions

```powershell
# Adicionar permissão pública (se necessário)
gcloud functions add-iam-policy-binding sendEmailHttp `
  --region=us-central1 `
  --member=allUsers `
  --role=roles/cloudfunctions.invoker
```

#### 2️⃣ Verificar Headers CORS na Função

**Código esperado em `functions/index.js`:**
```javascript
exports.sendEmailHttp = functions.https.onRequest(async (req, res) => {
  // ✅ CORS Headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // ✅ Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  
  // ... resto do código
});
```

#### 3️⃣ Testar com curl

```powershell
# Obter token (login no sistema primeiro)
$TOKEN = "seu-firebase-id-token"

# Testar função
curl -X POST `
  -H "Authorization: Bearer $TOKEN" `
  -H "Content-Type: application/json" `
  -d '{\"to\":\"teste@example.com\",\"subject\":\"Teste\",\"html\":\"<h1>Teste</h1>\"}' `
  https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp
```

---

### 📊 Limite de Emails Atingido

<div align="center">

![Limite](https://img.shields.io/badge/Free_Tier-100%2Fdia-green?style=flat-square)

</div>

**SendGrid Free Tier:**
- **Trial (30 dias):** 100 emails/dia
- **Após trial:** 100 emails/dia **permanente** gratuito

#### 🔍 Verificar Uso Atual

**Dashboard SendGrid:**
```
https://app.sendgrid.com/
  └─ Dashboard
      └─ Statistics
          └─ Ver envios do dia
```

**Se atingir limite (429 Error):**

| Solução | Tempo | Custo |
|---------|-------|-------|
| **Aguardar reset** | Meia-noite UTC | Grátis |
| **Upgrade Essential** | Imediato | $19.95/mês (50K emails) |
| **Upgrade Pro** | Imediato | $89.95/mês (1.5M emails) |

#### 🛑 Desabilitar Emails Temporariamente

**No console do navegador:**
```javascript
// Desabilitar
localStorage.setItem('sendEmails', 'false');
console.log('✅ Emails desabilitados');

// Reabilitar depois
localStorage.setItem('sendEmails', 'true');
console.log('✅ Emails reabilitados');
```

> **📌 Nota:** Push notifications continuarão funcionando normalmente.

---

## 📊 Estrutura de Dados

<div align="center">

### 🗃️ Schema do Firestore

![Firestore](https://img.shields.io/badge/Database-Firestore-orange?style=for-the-badge&logo=firebase)

</div>

---

### Collection: `users`

**Propósito:** Armazena dados de todos os usuários do sistema

```typescript
interface User {
  id: string;                     // ID do documento (= userId)
  nome: string;                   // Nome completo
  email: string;                  // Email válido
  tipo: UserType;                 // "aluno" | "professor" | "admin" | "responsavel"
  fcmToken?: string;              // Token FCM para push notifications
  fcmTokenUpdatedAt?: Timestamp;  // Última atualização do token
  notificationsEnabled: boolean;  // Push habilitado?
  emailNotifications?: boolean;   // Email habilitado?
  createdAt: Timestamp;           // Data de criação
  updatedAt: Timestamp;           // Última atualização
}
```

**Exemplo:**
```json
{
  "id": "gfi1UshvuQPKch9ZqwmIhyKkJn02",
  "nome": "João Silva",
  "email": "joao.silva@example.com",
  "tipo": "aluno",
  "fcmToken": "eXpU9j2Rf8g:APA91bH...",
  "fcmTokenUpdatedAt": Timestamp(2026, 2, 14, 10, 30),
  "notificationsEnabled": true,
  "emailNotifications": true,
  "createdAt": Timestamp(2026, 1, 15),
  "updatedAt": Timestamp(2026, 2, 14)
}
```

**Índices:**
- ✅ `tipo` (Ascending) - Para queries por tipo
- ✅ `email` (Ascending) - Para busca por email

---

### Collection: `fcmTokens`

**Propósito:** Gerenciamento de tokens FCM para push notifications

```typescript
interface FCMToken {
  token: string;                  // Token FCM (ID do documento)
  userId: string;                 // Referência ao usuário
  createdAt: Timestamp;           // Primeira geração
  updatedAt: Timestamp;           // Última atualização
  device: {
    userAgent: string;            // Navigator userAgent
    platform: string;             // "Win32" | "MacIntel" | "Linux" etc
    language: string;             // "pt-BR" | "en-US" etc
  };
  lastUsed?: Timestamp;           // Último envio bem-sucedido
  valid: boolean;                 // Token ainda válido?
}
```

**Exemplo:**
```json
{
  "token": "eXpU9j2Rf8g:APA91bH3xT4...",
  "userId": "gfi1UshvuQPKch9ZqwmIhyKkJn02",
  "createdAt": Timestamp(2026, 2, 14, 10, 30),
  "updatedAt": Timestamp(2026, 2, 14, 15, 45),
  "device": {
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "platform": "Win32",
    "language": "pt-BR"
  },
  "lastUsed": Timestamp(2026, 2, 14, 15, 45),
  "valid": true
}
```

**Índices:**
- ✅ `userId` (Ascending) - Para buscar tokens de um usuário
- ✅ `valid` (Ascending) - Para filtrar tokens válidos

---

### Collection: `notifications`

**Propósito:** Histórico de todas as notificações enviadas

```typescript
interface Notification {
  id: string;                     // ID auto-gerado
  userId: string;                 // Destinatário
  title: string;                  // Título
  body: string;                   // Mensagem
  type: string;                   // "prova" | "atividade" | "aviso" etc
  sentAt: Timestamp;              // Quando foi enviado
  sentBy: string;                 // Quem enviou (userId)
  messageId?: string;             // ID da mensagem FCM
  emailSent?: boolean;            // Email também foi enviado?
  status: string;                 // "sent" | "failed" | "pending"
  data?: object;                  // Dados extras
  read: boolean;                  // Lida pelo usuário?
  readAt?: Timestamp;             // Quando foi lida
}
```

**Exemplo:**
```json
{
  "id": "notif_abc123",
  "userId": "gfi1UshvuQPKch9ZqwmIhyKkJn02",
  "title": "Nova Prova Disponível",
  "body": "Prova de Matemática - 2º Ano A",
  "type": "prova",
  "sentAt": Timestamp(2026, 2, 14, 15, 30),
  "sentBy": "prof_xyz789",
  "messageId": "projects/educloud-sistema/messages/0:1234567890",
  "emailSent": true,
  "status": "sent",
  "data": {
    "turmaId": "turma_2ano_a",
    "provaId": "prova_mat_2026_02_14"
  },
  "read": false
}
```

**Índices:**
- ✅ `userId`, `sentAt` (Descending) - Para histórico do usuário
- ✅ `sentBy`, `sentAt` (Descending) - Para histórico do remetente
- ✅ `status` (Ascending) - Para filtrar por status

---

### Collection: `email_logs`

**Propósito:** Logs de emails enviados (opcional)

```typescript
interface EmailLog {
  id: string;
  to: string | string[];
  subject: string;
  sentAt: Timestamp;
  sentBy: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
  sendgridStatus?: number;        // 202, 401, 429 etc
}
```

---

## 🔒 Segurança e Permissões

<div align="center">

### 🛡️ Protocolos de Segurança

![Security](https://img.shields.io/badge/Security-Enterprise_Grade-success?style=for-the-badge)

</div>

---

### 📱 Notificações Push

<table>
<tr>
<th width="30%">🔒 Controle</th>
<th>Implementação</th>
</tr>
<tr>
<td><b>Autenticação</b></td>
<td>• Apenas usuários autenticados Firebase<br>• Verificação de <code>context.auth</code> nas funções callable<br>• JWT tokens com expiração</td>
</tr>
<tr>
<td><b>Autorização</b></td>
<td>• Professores: Apenas para suas turmas<br>• Admin: Acesso total<br>• Alunos: Não podem enviar</td>
</tr>
<tr>
<td><b>Validação</b></td>
<td>• Tokens FCM validados antes do envio<br>• Tokens inválidos removidos automaticamente<br>• Rate limiting no FCM</td>
</tr>
<tr>
<td><b>Logs</b></td>
<td>• Todas as notificações registradas<br>• Auditoria completa de envios<br>• Rastreamento de remetentes</td>
</tr>
</table>

**Regras Firestore (`firestore.rules`):**
```javascript
// Usuários podem ler seus próprios dados
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId || isAdmin();
}

// Apenas backend pode escrever tokens
match /fcmTokens/{token} {
  allow read: if isAuthenticated();
  allow write: if false; // Apenas via funções
}

// Notificações só visíveis para destinatário
match /notifications/{notifId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow write: if false; // Apenas via funções
}
```

---

### 📧 Emails

<table>
<tr>
<th width="30%">🔒 Controle</th>
<th>Implementação</th>
</tr>
<tr>
<td><b>Autenticação</b></td>
<td>• Bearer Token (Firebase ID Token) obrigatório<br>• Verificação com <code>admin.auth().verifyIdToken()</code><br>• Função pública mas protegida por auth</td>
</tr>
<tr>
<td><b>API Key</b></td>
<td>• SendGrid API Key protegida no backend<br>• Nunca exposta ao frontend<br>• Armazenada em variável de ambiente (opcional)</td>
</tr>
<tr>
<td><b>Rate Limiting</b></td>
<td>• SendGrid: 100 emails/dia (Free Tier)<br>• Proteção contra abuso<br>• Status 429 se limite atingido</td>
</tr>
<tr>
<td><b>CORS</b></td>
<td>• Headers configurados manualmente<br>• <code>Access-Control-Allow-Origin: *</code><br>• Preflight OPTIONS suportado</td>
</tr>
<tr>
<td><b>Validação</b></td>
<td>• Validação de formato de email<br>• Sanitização de HTML<br>• Limite de tamanho de payload</td>
</tr>
</table>

**Código de Segurança (`functions/index.js`):**
```javascript
exports.sendEmailHttp = functions.https.onRequest(async (req, res) => {
  // ✅ CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  // ✅ Autenticação
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    // ✅ Verificar token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('✅ Usuário autenticado:', decodedToken.uid);
    
    // ✅ Lógica de envio...
    
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
});
```

---

### 🛡️ IAM Permissions

**Funções HTTP Públicas:**
```powershell
# sendEmailHttp - Pública mas requer Bearer Token
gcloud functions add-iam-policy-binding sendEmailHttp `
  --region=us-central1 `
  --member=allUsers `
  --role=roles/cloudfunctions.invoker
```

**Funções Callable (Automático):**
- Firebase SDK gerencia permissões automaticamente
- Apenas usuários autenticados podem chamar
- Não precisa configurar IAM

---

## 📊 Monitoramento e Analytics

<div align="center">

### 🔍 Ferramentas de Observabilidade

![Monitoring](https://img.shields.io/badge/Monitoring-Real--time-blue?style=for-the-badge)

</div>

---

### 🔥 Firebase Console

<div align="center">

**[https://console.firebase.google.com/](https://console.firebase.google.com/)**

</div>

#### 📱 Cloud Messaging

**Caminho:** `Cloud Messaging > Metrics`

**Métricas Disponíveis:**

| Métrica | Descrição | Quando Verificar |
|---------|-----------|------------------|
| **Sent** | Mensagens enviadas | Diário |
| **Delivered** | Entregues com sucesso | Após envios |
| **Opened** | Notificações abertas | Engajamento |
| **Conversion** | Ações tomadas | ROI |

**Gráficos:**
- 📈 Envios ao longo do tempo
- 🟺 Taxa de entrega por plataforma
- 🔔 Horários de maior engajamento

#### 🔌 Functions

**Caminho:** `Functions > Logs`

**Filtros Úteis:**
```
Função: sendEmailHttp
Severity: ERROR
Time: Last 24 hours
```

**Métricas:**
- ⚡ Invocações por minuto
- ⏱️ Tempo de execução médio
- ❌ Taxa de erro
- 💰 Custo estimado

#### 🗃️ Firestore

**Caminho:** `Firestore Database > Data`

**Coleções para Monitorar:**

<table>
<tr>
<th>Coleção</th>
<th>O que Verificar</th>
<th>Alerta Se</th>
</tr>
<tr>
<td><code>notifications</code></td>
<td>Histórico de envios</td>
<td>Muitos <code>status: "failed"</code></td>
</tr>
<tr>
<td><code>fcmTokens</code></td>
<td>Tokens ativos</td>
<td>Muitos <code>valid: false</code></td>
</tr>
<tr>
<td><code>users</code></td>
<td>Usuários sem email</td>
<td>> 20% sem email cadastrado</td>
</tr>
</table>

---

### 📧 SendGrid Dashboard

<div align="center">

**[https://app.sendgrid.com/](https://app.sendgrid.com/)**

</div>

#### 📊 Statistics (Estatísticas)

**Caminho:** `Dashboard > Statistics`

**Gráficos Principais:**

<table>
<tr>
<td width="50%">

**📧 Volume**
- Emails enviados (hoje)
- Emails do mês
- Limite restante
- Tendência (7 dias)

</td>
<td width="50%">

**🎯 Performance**
- Taxa de entrega (%)
- Taxa de abertura (%)
- Bounces (%)
- Spam reports (%)

</td>
</tr>
</table>

**KPIs Ideais:**
```
✅ Entrega: > 95%
✅ Bounce: < 3%
✅ Spam: < 0.1%
⚠️ Alerta se: Bounce > 5% ou Spam > 1%
```

#### 📝 Activity (Atividade)

**Caminho:** `Activity > Email Activity`

**Busca Avançada:**
```
Filtrar por:
  • Email do destinatário
  • Assunto
  • Data/hora
  • Status (delivered, bounced, etc)
  • Tipo de evento (processed, delivered, opened)
```

**Eventos Rastreados:**
| Evento | Descrição | Quando Ocorre |
|--------|-----------|---------------|
| `processed` | SendGrid recebeu | Imediato (Status 202) |
| `delivered` | Email entregue | 1-30 segundos |
| `opened` | Destinatário abriu | Quando abrir |
| `clicked` | Link clicado | Quando clicar |
| `bounced` | Email retornou | Se inválido |
| `dropped` | Bloqueado | Se na lista de supressão |
| `spam_report` | Marcado spam | Se usuário reportar |

---

### 💻 Logs via CLI

#### Firebase Functions Logs

```powershell
# 🔥 Ver logs de todas as funções
firebase functions:log

# 📧 Apenas sendEmailHttp
firebase functions:log --only sendEmailHttp

# ⏱️ Última 1 hora
firebase functions:log --since 1h

# 🔴 Apenas erros
firebase functions:log --only sendEmailHttp --severity error
```

#### Google Cloud Logs (Mais Detalhado)

```powershell
# 📊 Ver últimos 20 logs
gcloud functions logs read sendEmailHttp --region=us-central1 --limit=20

# 🔄 Logs em tempo real (streaming)
gcloud functions logs read sendEmailHttp --region=us-central1 --tail

# 🔴 Apenas erros
gcloud functions logs read sendEmailHttp --region=us-central1 --severity=ERROR

# 📅 Últimas 24 horas
gcloud functions logs read sendEmailHttp --region=us-central1 --start-time="2026-02-14T00:00:00Z"

# 🔍 Buscar texto específico
gcloud functions logs read sendEmailHttp --region=us-central1 --filter="textPayload:aluno@example.com"
```

#### Exemplos de Saída

**✅ Success:**
```log
LEVEL: INFO
TIME: 2026-02-14T15:30:45.123Z
FUNCTION: sendEmailHttp
REGION: us-central1
EXECUTION_ID: abc123def456

✅ Email enviado via SendGrid API! Status: 202
Destinatários aceitos: ["aluno@example.com"]
Destinatários rejeitados: []
MessageId: sent
```

**❌ Error:**
```log
LEVEL: ERROR
TIME: 2026-02-14T15:31:10.456Z
FUNCTION: sendEmailHttp

❌ Erro ao enviar email: SendGrid API error
Status Code: 401
Mensagem: Invalid API Key
Destinatário: invalido@example.com
```

---

### 🚨 Alertas e Notificações

**Configurar no Firebase Console:**

1. **Performance Alerts:**
   - Functions > Métricas > Criar Alerta
   - Condição: Erro rate > 5%
   - Notificar: Email do admin

2. **Budget Alerts:**
   - Project Settings > Usage and Billing
   - Criar alerta de orçamento
   - Notificar antes de 80% do limite

**SendGrid Alerts:**
- Settings > Alerts
- Configurar:
  * High bounce rate (> 5%)
  * Spam reports (> 1%)
  * Approaching limit (> 80%)

---

## 🚀 Próximos Passos Sugeridos

<div align="center">

### 💡 Roadmap de Funcionalidades

</div>

---

### ✅ v2.1 - Preferências de Usuário

**Objetivo:** Dar controle aos usuários sobre notificações

#### Funcionalidades:

<table>
<tr>
<td width="50%">

**📧 Preferências de Email**
- ☐ Ativar/desativar emails
- ☐ Escolher tipos de email
  - Provas
  - Atividades
  - Avisos gerais
- ☐ Frequência (instantâneo/diário)

</td>
<td width="50%">

**📱 Preferências de Push**
- ☐ Ativar/desativar push
- ☐ Escolher tipos de push
- ☐ Horários silenciosos
- ☐ Não perturbe

</td>
</tr>
</table>

**Interface:**
```
Configurações > Notificações

[☑] Receber notificações push
[☑] Receber emails

Tipos de Notificação:
  [☑] Provas publicadas
  [☑] Notas lançadas
  [☐] Avisos gerais
  [☐] Lembretes

Horário Silencioso:
  Das [22:00] até [07:00]
```

---

### 📅 v2.2 - Notificações Automáticas

**Objetivo:** Automatizar mais processos de comunicação

#### Triggers Automáticos:

| Evento | Notificação | Quando |
|--------|----------------|--------|
| 📝 Prova publicada | Push + Email | Imediato | ✅ Implementado |
| 📊 Notas lançadas | Push + Email | Ao salvar notas |
| 📅 Lembrete de prova | Push | 1 dia antes |
| 📚 Atividade vencendo | Email | 3 dias antes |
| ✅ Tarefa completa | Push | Ao completar |
| 🎉 Aniversário | Email | No dia |

---

### 🎨 v2.3 - Templates de Email

**Objetivo:** Personalização visual dos emails

#### Recursos:

- ☐ **Editor Visual**
  - Drag & Drop de componentes
  - Preview em tempo real
  - Teste de envio

- ☐ **Variáveis Dinâmicas**
  ```html
  Olá {{nome_aluno}},
  
  A prova de {{materia}} da turma {{turma}}
  foi publicada pelo professor {{nome_professor}}.
  
  Data: {{data_prova}}
  Horário: {{horario}}
  ```

- ☐ **Biblioteca de Templates**
  - Prova publicada
  - Notas disponíveis
  - Lembrete
  - Aviso geral
  - Feriado/Evento

---

### 📊 v2.4 - Analytics Avançado

**Objetivo:** Insights sobre engajamento

#### Métricas:

<table>
<tr>
<td width="50%">

**📧 Email Analytics**
- Taxa de abertura por tipo
- Taxa de clique (CTR)
- Melhor horário de envio
- Dispositivos mais usados
- Preferências de formato

</td>
<td width="50%">

**📱 Push Analytics**
- Taxa de entrega
- Taxa de abertura
- Tempo médio para abrir
- Conversao (ações tomadas)
- Opt-out rate

</td>
</tr>
</table>

**Dashboard:**
```
📊 Analytics > Notificações

Últimos 30 dias:

📧 Emails
  • Enviados: 1.234
  • Entregues: 1.189 (96.3%)
  • Abertos: 847 (71.2%)
  • Clicados: 523 (43.9%)

📱 Push
  • Enviados: 2.456
  • Entregues: 2.398 (97.6%)
  • Abertos: 1.876 (78.2%)
  • Ações: 1.234 (51.5%)

📈 Tendências: ↑ Engajamento +12% vs mês passado
```

---

### 🔔 v2.5 - Agendamento

**Objetivo:** Marcar notificações para envio futuro

#### Funcionalidades:

- ☐ **Agendar Envio**
  ```
  Criar Notificação
  
  Título: [Reunião de Pais]
  Mensagem: [...]
  
  📅 Enviar em: [2026-02-20] às [19:00]
  
  [Agendar]  [Enviar Agora]
  ```

- ☐ **Recorrência**
  - Diário
  - Semanal
  - Mensal
  - Personalizado

- ☐ **Gestão de Agendados**
  - Lista de pendentes
  - Editar/cancelar
  - Log de enviados

---

## 📚 Suporte e Documentação

<div align="center">

### 🔗 Links Úteis e Recursos

</div>

---

### 📝 Documentação Oficial

<table>
<tr>
<th width="30%">Tecnologia</th>
<th width="50%">Link</th>
<th width="20%">Idioma</th>
</tr>
<tr>
<td>🔥 <b>Firebase</b></td>
<td>
  • <a href="https://firebase.google.com/docs">Documentação Geral</a><br>
  • <a href="https://firebase.google.com/docs/cloud-messaging">Cloud Messaging</a><br>
  • <a href="https://firebase.google.com/docs/functions">Cloud Functions</a><br>
  • <a href="https://firebase.google.com/docs/firestore">Firestore</a>
</td>
<td>EN / PT</td>
</tr>
<tr>
<td>📧 <b>SendGrid</b></td>
<td>
  • <a href="https://docs.sendgrid.com/">API Documentation</a><br>
  • <a href="https://docs.sendgrid.com/api-reference/mail-send/mail-send">Mail Send API</a><br>
  • <a href="https://sendgrid.com/en-us/solutions/email-api/email-marketing-api">Best Practices</a>
</td>
<td>EN</td>
</tr>
<tr>
<td>🌐 <b>Web APIs</b></td>
<td>
  • <a href="https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API">Notifications API</a><br>
  • <a href="https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API">Service Workers</a><br>
  • <a href="https://web.dev/push-notifications-overview/">Push Notifications Guide</a>
</td>
<td>EN / PT</td>
</tr>
</table>

---

### 👥 Suporte Técnico

<table>
<tr>
<th>Serviço</th>
<th>Canal</th>
<th>SLA</th>
</tr>
<tr>
<td>🔥 <b>Firebase</b></td>
<td>
  • <a href="https://firebase.google.com/support">Support Portal</a><br>
  • <a href="https://stackoverflow.com/questions/tagged/firebase">Stack Overflow</a> (#firebase)<br>
  • Console do Firebase > Support
</td>
<td>Free: Community<br>Blaze: Email 24-48h</td>
</tr>
<tr>
<td>📧 <b>SendGrid</b></td>
<td>
  • <a href="https://support.sendgrid.com/">Support Center</a><br>
  • Email: support@sendgrid.com<br>
  • Live Chat (planos pagos)
</td>
<td>Free: Email 2-3 dias<br>Paid: 24h</td>
</tr>
<tr>
<td>👨‍💻 <b>Comunidade</b></td>
<td>
  • <a href="https://stackoverflow.com/">Stack Overflow</a><br>
  • <a href="https://github.com/firebase/">Firebase GitHub</a><br>
  • Reddit r/Firebase
</td>
<td>Instantâneo</td>
</tr>
</table>

---

### 🧠 Recursos de Aprendizado

**Vídeos e Tutoriais:**
- 🎥 [Firebase YouTube Channel](https://www.youtube.com/firebase)
- 🎥 [SendGrid Academy](https://sendgrid.com/resource-category/academy/)
- 🎓 [Google Cloud Skills Boost](https://www.cloudskillsboost.google/)

**Cursos:**
- 📚 [Firebase Learn](https://firebase.google.com/learn)
- 📚 [Web.dev](https://web.dev/learn/)
- 📚 [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Learn)

**Blogs:**
- 📝 [Firebase Blog](https://firebase.blog/)
- 📝 [SendGrid Blog](https://sendgrid.com/blog/)

---

## 📝 Changelog

<div align="center">

### 📅 Histórico de Versões

![Version](https://img.shields.io/badge/vers%C3%A3o_atual-2.0-blue?style=for-the-badge)

</div>

---

### 🎉 v2.0 (14/02/2026) - Email System

<div align="center">

![Major Update](https://img.shields.io/badge/update-major-red?style=flat-square)

**Sistema de Emails Completo Implementado**

</div>

#### ✨ Novidades

<table>
<tr>
<td width="50%">

**📧 Emails Automáticos**
- ✅ Integração SendGrid REST API
- ✅ Envio automático ao publicar provas
- ✅ Template HTML profissional
- ✅ 100 emails/dia gratuitos

</td>
<td width="50%">

**🔧 Melhorias Técnicas**
- ✅ Função HTTP `sendEmailHttp`
- ✅ CORS configurado manualmente
- ✅ Autenticação Bearer Token
- ✅ Logs detalhados

</td>
</tr>
</table>

#### 🐛 Correções

- ✅ **CORS Bloqueado**: Configurado headers manuais + IAM público
- ✅ **Nodemailer Issue**: Migrado para SendGrid REST API direto
- ✅ **Status 403**: Adicionada permissão `allUsers` no IAM
- ✅ **Token Expiration**: Implementada renovação automática

#### 📚 Documentação

- ✅ Manual completo atualizado (este documento)
- ✅ NOTIFICACOES.md com seção de emails
- ✅ README.md com overview do projeto
- ✅ Troubleshooting expandido

#### 💻 Código

**Arquivos Modificados:**
```
functions/
  └─ index.js                 (+200 linhas)
      └─ exports.sendEmailHttp

js/services/
  └─ email.js                 (+110 linhas)
      ├─ sendEmailViaFunction()
      └─ sendNotificationEmailV2()

js/
  └─ app-impl.js              (~50 linhas modificadas)
      └─ notifyAlunosTurma() com emails
```

**Dependências Adicionadas:**
```json
{
  "cors": "^2.8.6",
  "node-fetch": "^2.7.0",
  "nodemailer": "^6.9.7"  // (instalado mas não usado)
}
```

---

### 🚀 v1.7 (13/02/2026) - Push Notifications

<div align="center">

![Feature](https://img.shields.io/badge/update-feature-green?style=flat-square)

**Sistema de Notificações Push Completo**

</div>

#### ✨ Novidades

- ✅ **Firebase Cloud Messaging** integrado
- ✅ **Service Worker** para notificações em background
- ✅ **4 Funções Backend:**
  - `sendNotificationToUser`
  - `sendNotificationToMultipleUsers`
  - `sendNotificationToTurma`
  - `sendNotificationByUserType`
- ✅ **Histórico de notificações** (Firestore)
- ✅ **Gerenciamento de tokens FCM**
- ✅ **Interface de envio** para professores

#### 📚 Documentação

- ✅ NOTIFICACOES.md criado
- ✅ Troubleshooting guides
- ✅ Diagnóstico para celular

---

### 📊 v1.6 e anteriores

<details>
<summary><b>Ver versões antigas</b></summary>

#### v1.6 (01/02/2026)
- Sistema de provas
- Lançamento de notas
- Gestão de turmas

#### v1.5 (15/01/2026)
- Autenticação Firebase
- Perfis de usuário (Admin, Professor, Aluno)
- Dashboard personalizado

#### v1.0 (01/01/2026)
- Lançamento inicial
- CRUD básico de alunos e professores

</details>

---

<div align="center">

## 🎉 Fim do Manual

---

**Sistema SENATEDU v2.0**

📖 Manual Completo | 🔥 Firebase + SendGrid | 🚀 Produção

**Última Atualização:** 14 de Fevereiro de 2026

---

[![Firebase](https://img.shields.io/badge/Firebase-v10-orange?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![SendGrid](https://img.shields.io/badge/SendGrid-REST_API-00B9FF?style=flat-square&logo=sendgrid)](https://sendgrid.com/)
[![Status](https://img.shields.io/badge/status-em_produção-success?style=flat-square)](https://educloud-sistema.web.app)
[![Version](https://img.shields.io/badge/versão-2.0-blue?style=flat-square)]()

**[Firebase Console](https://console.firebase.google.com/)** • **[SendGrid Dashboard](https://app.sendgrid.com/)** • **[Site em Produção](https://educloud-sistema.web.app)**

---

<sub>Desenvolvido com ❤️ para a Educação</sub>

</div>
