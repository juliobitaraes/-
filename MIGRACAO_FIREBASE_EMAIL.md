# 🚀 MIGRAÇÃO: EmailJS → Firebase Trigger Email Extension

## ✅ Vantagens da Migração:

- 📈 **100 e-mails/dia grátis** (SendGrid Free)
- 🔒 **Mais seguro** (servidor-side)
- ⚡ **Mais rápido** (integrado ao Firestore)
- 📊 **Rastreamento** (status de entrega)
- 🎨 **Templates HTML profissionais**

---

## 📋 PRÉ-REQUISITOS:

- ✅ Projeto Firebase ativo
- ✅ Billing habilitado (Blaze Plan - mesmo que use recursos gratuitos)
- ✅ Conta SendGrid (criar grátis)

---

## PASSO 1: Habilitar Billing no Firebase

**Se ainda não tem Blaze Plan:**

1. Acesse: https://console.firebase.google.com
2. Projeto: **educloud-sistema**
3. Clique em **⚙️ → Usage and billing**
4. Clique em **Modify plan**
5. Escolha **Blaze (Pay as you go)**
6. Adicione cartão de crédito

⚠️ **IMPORTANTE:** A extensão é GRATUITA até 100 e-mails/dia. Você não será cobrado a menos que ultrapasse limites gratuitos.

---

## PASSO 2: Criar conta SendGrid (GRATUITA)

1. **Acesse:** https://signup.sendgrid.com

2. **Preencha o formulário:**
   - Email: seu-email@gmail.com
   - Password: ********
   - Check: "I'm not a robot"
   - Sign Up

3. **Verifique seu e-mail** (clique no link recebido)

4. **Complete o questionário:**
   - Company: "SENATEDU"
   - Website: "educloud-sistema.web.app"
   - Role: "Developer"
   - Team Size: "Just me"
   - I send: "Transactional emails"
   - Clique em "Get Started"

5. **Criar API Key:**
   - Sidebar → **Settings** → **API Keys**
   - Clique em **Create API Key**
   - Name: `SENATEDU_Firebase`
   - Type: **Full Access** (ou Restricted com Mail Send permissions)
   - Clique em **Create & View**
   - **⚠️ COPIE A CHAVE AGORA** (não será mostrada novamente!)
   - Formato: `SG.xxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy`

6. **Verificar Sender Identity:**
   - Sidebar → **Settings** → **Sender Authentication**
   - **Single Sender Verification** → **Create New Sender**
   - From Name: `SENATEDU Sistema`
   - From Email: `seu-email@gmail.com` (ou domínio próprio)
   - Reply To: `seu-email@gmail.com`
   - Preencha endereço (pode ser fictício para teste)
   - **Create**
   - **Verifique o e-mail** (clique no link recebido)

---

## PASSO 3: Instalar Firebase Extension

**No terminal PowerShell:**

```powershell
# Ir para a pasta do projeto
cd C:\SENATEDU

# Instalar a extensão
npx firebase ext:install firebase/firestore-send-email --project=educloud-sistema
```

**Durante a instalação, responda:**

```
? What is your SMTP connection URI?
→ Digite: smtp://apikey:SUA_API_KEY_SENDGRID@smtp.sendgrid.net:587

? What email address do you want to use as the sender (FROM) address?
→ Digite: seu-email@gmail.com (o mesmo verificado no SendGrid)

? What is the path to the Cloud Firestore collection where email documents are saved?
→ Digite: mail (padrão)

? What email address do you want to use as the default reply-to address?
→ Digite: seu-email@gmail.com (ou deixe em branco)

? What configuration do you want to use for the extension?
→ Selecione: Use defaults (pressione Enter)
```

**⚠️ IMPORTANTE:** Substitua `SUA_API_KEY_SENDGRID` pela chave que você copiou!

Exemplo de URI completo:
```
smtp://apikey:SG.abc123xyz789...@smtp.sendgrid.net:587
```

---

## PASSO 4: Aguardar instalação (2-5 minutos)

A extensão será instalada automaticamente. Você verá:

```
✔ Installing extension...
✔ Configuring extension...
✔ Extension installed successfully!

📦 Extension: firestore-send-email
📍 Location: us-central1
```

---

## PASSO 5: Testar manualmente no Firestore

**No console do navegador (F12):**

```javascript
// Teste 1: E-mail simples
firebase.firestore().collection('mail').add({
  to: 'seu-email@gmail.com',
  message: {
    subject: '🧪 Teste Firebase Extension',
    text: 'Este é um teste do novo sistema de e-mails!',
    html: '<h1>Funciona!</h1><p>Este é um teste do novo sistema de e-mails!</p>'
  }
}).then(() => {
  console.log('✅ E-mail adicionado à fila!');
  console.log('Verifique sua caixa de entrada em 10-30 segundos.');
});

// Verificar status
setTimeout(() => {
  firebase.firestore().collection('mail')
    .orderBy('delivery.startTime', 'desc')
    .limit(1)
    .get()
    .then(snap => {
      const doc = snap.docs[0];
      console.log('Status do e-mail:', doc.data().delivery);
    });
}, 15000);
```

**Aguarde 10-30 segundos** e verifique:
- ✅ Caixa de Entrada
- ⚠️ Spam/Lixo Eletrônico

---

## PASSO 6: Atualizar código do sistema

Agora vou atualizar o código para usar a nova extensão em vez do EmailJS.

**Arquivos que serão modificados:**
- `js/services/email.js` - Nova função usando Firestore

---

## 📊 Monitoramento

**Ver e-mails enviados:**
```javascript
// Console do navegador
firebase.firestore().collection('mail')
  .orderBy('delivery.startTime', 'desc')
  .limit(10)
  .get()
  .then(snap => {
    snap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`
        📧 Para: ${data.to}
        📋 Assunto: ${data.message.subject}
        ✅ Status: ${data.delivery?.state || 'PENDING'}
        ⏰ Enviado: ${data.delivery?.startTime?.toDate() || 'Aguardando...'}
      `);
    });
  });
```

**Dashboard SendGrid:**
- https://app.sendgrid.com/email_activity
- Veja todos os e-mails enviados, abertos, clicados, etc.

---

## 🔥 Limites e Custos

### **SendGrid Free Tier:**
- ✅ 100 e-mails/dia **GRÁTIS**
- ✅ Todos os recursos básicos

### **SendGrid Essentials ($19.95/mês):**
- 📈 50.000 e-mails/mês
- 📊 Analytics avançados
- 🆘 Suporte por e-mail

### **Custos Firebase:**
- ✅ Extensão: **GRATUITA**
- ✅ Firestore writes: Dentro do free tier (50k/dia)
- ✅ Cloud Functions: Dentro do free tier (2M invocações/mês)

**Total: R$ 0,00/mês se enviar < 100 e-mails/dia** ✅

---

## 🆘 Troubleshooting

### **E-mail não chega:**
1. Verifique Spam/Lixo
2. Confirme que verificou o Sender no SendGrid
3. Veja logs: Firebase Console → Functions → Logs
4. Verifique documento em `mail` collection (campo `delivery`)

### **Erro "Invalid SMTP credentials":**
- API Key do SendGrid está correta?
- URI está no formato: `smtp://apikey:SUA_CHAVE@smtp.sendgrid.net:587`

### **Erro "Sender identity not verified":**
- Vá em SendGrid → Sender Authentication
- Verifique o e-mail que foi enviado
- Aguarde até 10 minutos após verificação

---

## ✅ PRÓXIMOS PASSOS

Após confirmar que o teste manual funcionou:

1. ✅ Eu atualizo o código para usar a extensão
2. ✅ Remove dependência do EmailJS
3. ✅ Testa envio automático ao publicar atividade EAD
4. ✅ Configura templates HTML profissionais (opcional)

---

**Execute o PASSO 3 (instalação) agora e me avise quando terminar!** 🚀

**Última atualização:** 14/02/2026 00:30
