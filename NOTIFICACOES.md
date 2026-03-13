# Sistema de Notificações - SENATEDU v2.0

## ✅ Funcionalidades Implementadas

O sistema de notificações do SENATEDU possui dois canais de comunicação integrados:

### 📱 Notificações Push (Firebase Cloud Messaging)
Envio de notificações para celulares dos alunos usando Firebase Cloud Messaging (FCM).

### 📧 Notificações por Email (SendGrid)
Envio automático de emails quando professor publica atividades EAD, usando SendGrid REST API.

---

## 📱 Notificações Push

### Recursos Disponíveis

1. **Notificações Individuais**: Envie notificações para alunos específicos
2. **Notificações por Turma**: Envie notificações para todos os alunos de uma turma
3. **Notificações por Tipo** (Admin): Envie notificações para todos os usuários de um tipo (alunos, professores, responsáveis)
4. **Histórico de Notificações**: Visualize as últimas 20 notificações enviadas
5. **Registro Automático**: Alunos são automaticamente registrados para receber notificações ao fazer login
6. **Notificações em Background**: Funciona mesmo quando o app não está aberto
7. **Notificações em Foreground**: Exibe notificações mesmo com o app aberto

## 📋 Arquivos Criados/Modificados

### Novos Arquivos
- `firebase-messaging-sw.js` - Service Worker para notificações em background
- `js/services/notifications.js` - Serviço de notificações do frontend
- `icon-192.svg` - Ícone principal das notificações
- `badge-72.svg` - Badge das notificações

### Arquivos Modificados
- `index.html` - Adicionado Firebase Messaging SDK
- `js/services/init.js` - Inicialização do messaging e service worker
- `js/app.js` - Registro automático de notificações para alunos
- `js/app-impl.js` - Interface de gerenciamento de notificações
- `functions/index.js` - Funções backend para envio de notificações

## ⚙️ Configuração Necessária

### 1. Deploy das Funções do Firebase

As funções backend precisam ser implantadas no Firebase Functions:

```powershell
# No diretório do projeto
cd functions
npm install  # Se ainda não instalou as dependências

# Voltar para o diretório raiz
cd ..

# Fazer deploy das funções
firebase deploy --only functions
```

### 2. Testar as Permissões

Certifique-se de que o domínio está autorizado no Firebase:

1. No Firebase Console, vá em **Authentication** > **Settings**
2. Na seção **Authorized domains**, adicione seu domínio se necessário

## 📱 Como Usar

### Para Administradores e Professores

1. Faça login no sistema
2. Acesse o menu **Notificações** na barra lateral
3. Escolha o tipo de notificação:
   - **Individual**: Selecione um aluno específico
   - **Por Turma**: Selecione uma turma
   - **Por Tipo** (apenas admin): Selecione alunos, professores ou responsáveis
4. Preencha o título e mensagem
5. Clique em **Enviar Notificação**
6. Acompanhe o histórico de envios na parte inferior da página

### Para Alunos

1. Faça login no sistema
2. O navegador solicitará permissão para enviar notificações (aceite)
3. As notificações aparecerão automaticamente no dispositivo
4. Clique na notificação para abrir o sistema

## 🔧 Funções Backend Disponíveis

### `sendNotificationToUser`
Envia notificação para um usuário específico.

**Parâmetros:**
- `userId`: ID do usuário
- `title`: Título da notificação
- `body`: Corpo da mensagem
- `imageUrl` (opcional): URL de uma imagem
- `icon` (opcional): URL do ícone
- `data` (opcional): Dados adicionais

**Retorno:**
```javascript
{
  success: true,
  messageId: "projects/.../messages/..."
}
```

### `sendNotificationToMultipleUsers`
Envia notificação para múltiplos usuários.

**Parâmetros:**
- `userIds`: Array de IDs de usuários
- `title`: Título da notificação
- `body`: Corpo da mensagem
- `imageUrl` (opcional): URL de uma imagem
- `icon` (opcional): URL do ícone
- `data` (opcional): Dados adicionais

**Retorno:**
```javascript
{
  success: 5,
  failed: 1,
  noToken: 2,
  disabled: 0,
  errors: [...]
}
```

### `sendNotificationToTurma`
Envia notificação para todos os alunos de uma turma.

**Parâmetros:**
- `turmaId`: ID da turma
- `title`: Título da notificação
- `body`: Corpo da mensagem
- `imageUrl` (opcional): URL de uma imagem
- `icon` (opcional): URL do ícone
- `data` (opcional): Dados adicionais

### `sendNotificationByUserType`
Envia notificação para todos os usuários de um tipo (admin only).

**Parâmetros:**
- `userType`: Tipo de usuário ('aluno', 'professor', 'admin', 'responsavel')
- `title`: Título da notificação
- `body`: Corpo da mensagem
- `imageUrl` (opcional): URL de uma imagem
- `icon` (opcional): URL do ícone
- `data` (opcional): Dados adicionais

## 🗄️ Estrutura de Dados

### Coleção `fcmTokens`
Armazena os tokens FCM dos dispositivos.

```javascript
{
  token: "string",
  userId: "string",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  device: {
    userAgent: "string",
    platform: "string",
    language: "string"
  }
}
```

### Coleção `notifications`
Armazena o histórico de notificações enviadas.

```javascript
{
  userId: "string",
  title: "string",
  body: "string",
  sentAt: Timestamp,
  sentBy: "string",
  messageId: "string",
  status: "sent"
}
```

### Campo em `users`
Campos adicionados aos documentos de usuários:

```javascript
{
  fcmToken: "string",
  fcmTokenUpdatedAt: Timestamp,
  notificationsEnabled: boolean
}
```

## 🔐 Segurança e Permissões

- Apenas usuários autenticados podem enviar notificações
- Professores só podem enviar para suas próprias turmas
- Apenas administradores podem enviar notificações em massa por tipo
- Tokens inválidos são automaticamente removidos
- Usuários podem desabilitar notificações (futuro: adicionar na interface de configurações)

## 📊 Monitoramento

Para monitorar as notificações enviadas:

1. **Firebase Console**:
   - Cloud Messaging > Metrics
   - Ver estatísticas de entrega

2. **Firestore**:
   - Coleção `notifications` - histórico de envios
   - Coleção `fcmTokens` - tokens ativos

---

## 📧 Sistema de Email (SendGrid)

### ✅ Funcionalidades

1. **Envio Automático**: Emails enviados automaticamente ao publicar atividades EAD
2. **Template Profissional**: Email com visual SENATEDU
3. **Link Direto**: Botão para acessar o sistema
4. **API REST**: SendGrid REST API (mais confiável que SMTP)
5. **Limite Gratuito**: 100 emails/dia permanente

### 📧 Configuração SendGrid

**Já configurado!** Sistema usa:
- **Conta**: senateduvaledoaco@gmail.com
- **Sender verificado**: senateduvaledoaco@gmail.com
- **API Key**: Configurada nas Firebase Functions
- **Trial**: Até 15/04/2026 (depois continua com 100/dia grátis)

### 🧪 Testar Envio de Email

1. Acesse **Cadastro** no menu lateral
2. Role até **Sistema de Email**
3. Clique em **Enviar Email de Teste**
4. Verifique caixa de entrada (e spam)

### 📊 Monitorar Emails

**Console do Navegador (F12):**
```javascript
📧 Enviando e-mails para X alunos...
✅ E-mails enviados: X sucesso, 0 falhas
```

**SendGrid Dashboard:**
- Acesse: https://app.sendgrid.com/
- **Activity** > Email Activity
- **Statistics** > Gráficos de envio

**Logs da Função:**
```powershell
gcloud functions logs read sendEmailHttp --region=us-central1 --limit=20
```

### 🔧 Função `sendEmailHttp`

**Endpoint:** `https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp`

**Método:** POST  
**Autenticação:** Bearer Token (Firebase ID Token)

**Request:**
```json
{
  "to": "aluno@example.com",
   "subject": "Nova Atividade EAD - Matemática",
   "html": "<h1>Atividade EAD</h1><p>Conteúdo...</p>",
  "replyTo": "senateduvaledoaco@gmail.com"
}
```

**Response (200 - Success):**
```json
{
  "success": true,
  "messageId": "sent",
  "accepted": ["aluno@example.com"],
  "rejected": []
}
```

### ⚙️ Configurações

**Habilitar/Desabilitar Emails:**
```javascript
// Desabilitar
localStorage.setItem('sendEmails', 'false');

// Habilitar (padrão)
localStorage.setItem('sendEmails', 'true');
```

---

## 🐛 Troubleshooting

### Emails

#### Emails não chegam

1. **Verificar Status SendGrid:**
   ```powershell
   gcloud functions logs read sendEmailHttp --region=us-central1 --limit=10
   ```
   Status esperado: `✅ Email enviado via SendGrid API! Status: 202`

2. **Verificar SendGrid Dashboard:**
   - https://app.sendgrid.com/ > Email Activity
   - Status possíveis: Delivered, Bounced, Dropped, Deferred

3. **Verificar Spam:**
   - Emails automáticos podem ir para pasta de spam

4. **Verificar Email Cadastrado:**
   - Menu Alunos > Editar
   - Campo Email deve estar preenchido

5. **Testar Função:**
   - Use botão "Enviar Email de Teste"

#### Erro: "Failed to fetch" ou 500

1. **Verificar Autenticação:**
   ```javascript
   await firebase.auth().currentUser.getIdToken();
   ```

2. **Verificar CORS:**
   ```powershell
   gcloud functions add-iam-policy-binding sendEmailHttp --region=us-central1 --member=allUsers --role=roles/cloudfunctions.invoker
   ```

3. **Redesploy Função:**
   ```powershell
   firebase deploy --only functions:sendEmailHttp
   ```

#### Limite Atingido

- **Trial**: 100 emails/dia
- **Após trial**: 100 emails/dia permanente
- **Solução**: Upgrade no SendGrid ou aguardar reset (meia-noite UTC)

---

### Notificações Push

#### Notificações não chegam
1. Verificar se a VAPID key está configurada corretamente
2. Verificar se o usuário concedeu permissão no navegador
3. Verificar se o token FCM está salvo no Firestore
4. Verificar console do navegador para erros
5. Verificar logs das Firebase Functions

### Service Worker não registra
1. Verificar se o domínio usa HTTPS (obrigatório, exceto localhost)
2. Verificar se o arquivo `firebase-messaging-sw.js` está na raiz
3. Limpar cache do navegador e service workers antigos

### Token não salva no Firestore
1. Verificar regras de segurança do Firestore
2. Verificar logs do console do navegador
3. Verificar se o usuário está autenticado

## 🚀 Próximos Passos Sugeridos

1. **Interface de Configurações do Usuário**:
   - Permitir alunos ativarem/desativarem notificações
   - Escolher tipos de notificações que desejam receber

2. **Notificações Automáticas**:
   - ✅ Enviar notificação quando nova atividade EAD é publicada (implementado)
   - Enviar notificação quando nova atividade EAD é disponibilizada
   - Enviar notificação de lembrete antes de atividades EAD

3. **Templates de Email**:
   - Criar templates reutilizáveis
   - Personalização com variáveis
   - Editor visual

4. **Analytics**:
   - Taxa de abertura das notificações
   - Taxa de abertura de emails
   - Melhor horário para enviar
   - Engajamento por tipo de notificação

## 📞 Suporte

Para problemas ou dúvidas:
- Consulte a documentação do Firebase Cloud Messaging
- Consulte a documentação do SendGrid
- Verifique os logs das Firebase Functions
- Consulte o console do navegador para erros JavaScript
- Acesse o arquivo **MANUAL_SISTEMA.md** para guia completo

---

**Data de Implementação**: 13/02/2026 (Push) | 14/02/2026 (Email)  
**Versão do Sistema**: SENATEDU v2.0  
**Tecnologias**: Firebase FCM + SendGrid REST API
