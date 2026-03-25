# SENATEDU v2.0 - Sistema de Gestão Escolar

Sistema completo de gestão escolar com notificações push e email automáticas.

## 🚀 Tecnologias

- **Frontend**: HTML5, JavaScript ES6+, TailwindCSS
- **Backend**: Firebase (Firestore, Authentication, Functions, Hosting, Cloud Messaging)
- **Notificações**: Firebase Cloud Messaging (FCM)
- **Email**: SendGrid REST API
- **Storage**: Firebase Storage

## 📚 Documentação

- **[Manual Completo do Sistema](MANUAL_SISTEMA.md)** - Guia completo de uso e configuração
- **[Manual de Telas (com prints)](MANUAL_TELAS_SISTEMA.md)** - Inventário completo das telas e funcionalidades
- **[Sistema de Notificações](NOTIFICACOES.md)** - Push e Email detalhados
- **[Troubleshooting Notificações](TROUBLESHOOTING_NOTIFICACOES.md)** - Resolução de problemas
- **[Diagnóstico Celular](DIAGNOSTICO_NOTIFICACOES_CELULAR.md)** - Debug específico para mobile
- **[Multi-Escola com Isolamento Máximo](MULTI_ESCOLA_ISOLAMENTO_MAXIMO.md)** - Arquitetura e migração para múltiplas escolas

## ✅ Funcionalidades Principais

### Para Administradores
- ✅ Gestão completa de usuários (Alunos, Professores, Responsáveis)
- ✅ Gestão de turmas e matrículas
- ✅ Notificações em massa
- ✅ Logs de acesso e auditoria
- ✅ Estatísticas do sistema

### Para Professores
- ✅ Gestão de turmas
- ✅ Criação e publicação de atividades EAD
- ✅ Lançamento de notas
- ✅ Notificações para turmas
- ✅ Consulta de alunos matriculados

### Para Alunos
- ✅ Visualização de notas
- ✅ Acesso a atividades EAD
- ✅ Notificações push no celular
- ✅ Notificações por email
- ✅ Histórico escolar

## 📧 Sistema de Notificações

### Notificações Push (FCM)
- ✅ Automáticas ao publicar atividades EAD
- ✅ Funcionam em background (app fechado)
- ✅ Funcionam em foreground (app aberto)
- ✅ Envio individual, por turma ou em massa
- ✅ Histórico de envios

### Notificações por Email (SendGrid)
- ✅ Envio automático ao publicar atividades EAD
- ✅ Template profissional com visual SENATEDU
- ✅ Link direto para o sistema
- ✅ 100 emails/dia gratuitos permanente
- ✅ Status de entrega em tempo real

## 🛠️ Instalação e Deploy

### Pré-requisitos
- Node.js 20+
- Firebase CLI
- Conta Firebase (já configurada)
- Conta SendGrid (já configurada)

### Deploy Completo

```powershell
# 1. Deploy das Functions
firebase deploy --only functions

# 2. Deploy do Hosting
firebase deploy --only hosting

# 3. Deploy Completo
firebase deploy
```

### Apenas Email
```powershell
firebase deploy --only functions:sendEmailHttp
```

### Apenas Hosting
```powershell
firebase deploy --only hosting
```

## 🔧 Configuração

### Firebase Functions
7 funções deployadas em `us-central1`:
- `sendNotificationToUser` - Notificação individual
- `sendNotificationToMultipleUsers` - Múltiplos usuários
- `sendNotificationToTurma` - Turma completa
- `sendNotificationByUserType` - Por tipo de usuário
- `sendEmailHttp` - Envio de emails
- `deleteUserByUid` - Admin: deletar usuário
- `reclaimUserByEmail` - Admin: recuperar usuário

### SendGrid
- **Conta**: senateduvaledoaco@gmail.com
- **Sender verificado**: senateduvaledoaco@gmail.com
- **Trial**: Até 15/04/2026
- **Free Forever**: 100 emails/dia após trial
- **Dashboard**: https://app.sendgrid.com/

### Firebase Messaging
- **VAPID Key**: Configurada
- **Service Worker**: `firebase-messaging-sw.js`
- **Permissões**: Solicitadas automaticamente

## 📊 Monitoramento

### Logs em Tempo Real
```powershell
# Emails
gcloud functions logs read sendEmailHttp --region=us-central1

# Notificações Push
firebase functions:log --only sendNotificationToMultipleUsers

# Todos os logs
firebase functions:log
```

### Dashboards
- **Firebase Console**: https://console.firebase.google.com/
- **SendGrid Dashboard**: https://app.sendgrid.com/
- **Hosting**: https://educloud-sistema.web.app

## 🧪 Testes

### Testar Email
1. Login no sistema
2. Menu **Cadastro**
3. Seção **Sistema de Email**
4. Botão **Enviar Email de Teste**

### Testar Push
1. Login como Professor/Admin
2. Menu **Notificações**
3. Escolher tipo de envio
4. Preencher e enviar

### Testar Automático
1. Login como Professor
2. Menu **Atividades EAD**
3. Criar/Editar atividade EAD
4. Salvar (notificações enviadas automaticamente)

## 🐛 Troubleshooting

### Email não chega
1. Verificar logs: `gcloud functions logs read sendEmailHttp --region=us-central1 --limit=10`
2. Verificar SendGrid Dashboard: https://app.sendgrid.com/
3. Verificar pasta de Spam
4. Verificar email cadastrado do aluno
5. Testar com botão "Enviar Email de Teste"

### Push não chega
1. Verificar permissão do navegador
2. Verificar token FCM no Firestore
3. Verificar Service Worker registrado
4. Limpar cache e recarregar
5. Aceitar permissão novamente

Consulte [MANUAL_SISTEMA.md](MANUAL_SISTEMA.md) para troubleshooting completo.

## 📁 Estrutura do Projeto

```
SENATEDU/
├── index.html                      # Página principal
├── firebase.json                   # Config Firebase
├── firebase-messaging-sw.js        # Service Worker
├── firestore.rules                 # Regras de segurança
│
├── css/
│   └── styles.css                  # Estilos do sistema
│
├── js/
│   ├── app.js                      # Inicialização
│   ├── app-impl.js                 # Lógica principal (6700+ linhas)
│   ├── auth.js                     # Autenticação
│   ├── store.js                    # State management
│   │
│   ├── components/
│   │   ├── calendar.js             # Componente calendário
│   │   └── modal.js                # Componente modal
│   │
│   ├── config/
│   │   └── firebase.js             # Config Firebase
│   │
│   ├── services/
│   │   ├── db.js                   # Firestore helpers
│   │   ├── email.js                # Serviço de email
│   │   ├── init.js                 # Inicialização serviços
│   │   ├── notifications.js        # Serviço notificações
│   │   └── permissions.js          # Gerenciamento permissões
│   │
│   ├── utils/
│   │   └── helpers.js              # Funções auxiliares
│   │
│   └── views/
│       └── index.js                # Gerenciamento de views
│
├── functions/
│   ├── index.js                    # Firebase Functions
│   └── package.json                # Dependencies
│
└── docs/
    ├── MANUAL_SISTEMA.md           # Manual completo
    ├── NOTIFICACOES.md             # Guia de notificações
    └── *.md                        # Outros guias
```

## 🔐 Segurança

- ✅ Autenticação Firebase
- ✅ Regras Firestore restritivas
- ✅ Functions com validação de auth
- ✅ HTTPS obrigatório
- ✅ CORS configurado
- ✅ API Keys protegidas no backend
- ✅ Tokens com expiração

## 📈 Limites e Quotas

### Firebase (Spark Plan - Free)
- ✅ Storage: 5GB
- ✅ Functions: 125K invocações/mês
- ✅ Firestore: 50K reads/dia, 20K writes/dia
- ✅ Cloud Messaging: Ilimitado

### SendGrid (Free)
- ✅ Trial: 100 emails/dia (30 dias)
- ✅ Forever: 100 emails/dia permanente
- ✅ Upgrade: Planos pagos disponíveis

## 🎯 Roadmap

### v2.1 (Planejado)
- [ ] Preferências de notificações por usuário
- [ ] Notificações para atividades EAD
- [ ] Lembretes automáticos de atividades EAD
- [ ] Templates de email personalizáveis
- [ ] Analytics de engajamento

### v2.2 (Futuro)
- [ ] App mobile nativo
- [ ] Integração com WhatsApp
- [ ] Notificações SMS
- [ ] Sistema de mensagens internas
- [ ] Chat em tempo real

## 📞 Suporte

- **Documentação**: Consulte os arquivos .md na pasta raiz
- **Firebase**: https://firebase.google.com/support
- **SendGrid**: https://support.sendgrid.com/

## 📝 Changelog

### v2.0 (14/02/2026)
- ✅ Sistema de emails via SendGrid REST API
- ✅ Notificações automáticas ao publicar atividades EAD
- ✅ Botão de teste de email
- ✅ Documentação completa
- ✅ Correção de CORS e permissões

### v1.7 (13/02/2026)
- ✅ Sistema de notificações push FCM
- ✅ Service Worker para background
- ✅ Histórico de notificações
- ✅ Funções backend para envio

---

**Desenvolvido para**: Gestão Escolar  
**Última Atualização**: 14/02/2026  
**Versão**: 2.0  
**Status**: ✅ Em Produção
