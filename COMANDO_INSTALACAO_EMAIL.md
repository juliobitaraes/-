# 🚀 INSTALAÇÃO FIREBASE TRIGGER EMAIL - COMANDO PRONTO

## ⚠️ IMPORTANTE: Execute este comando EXATAMENTE como está abaixo

```powershell
npx firebase ext:install firebase/firestore-send-email --project=educloud-sistema
```

---

## 📋 RESPOSTAS PARA AS PERGUNTAS DA INSTALAÇÃO:

Durante a instalação, o Firebase CLI vai fazer várias perguntas. Use as respostas abaixo:

### **1. SMTP Connection URI:**
```
smtp://apikey:REDACTED
```

### **2. Email address for sender (FROM):**
```
Seu e-mail verificado no SendGrid (o outro Gmail que você configurou)
```

### **3. Firestore collection path:**
```
mail
```
(Deixe o padrão)

### **4. Reply-to email address (opcional):**
```
Pressione ENTER para deixar em branco
```
(Ou coloque o mesmo e-mail do FROM)

### **5. Do you want to use advanced configuration?**
```
n
```
(Não)

### **6. Which billing account?**
```
Selecione sua conta/projeto (se perguntado)
```

### **7. Which Cloud Functions location?**
```
us-central1
```
(Ou a região mais próxima - us-central1 é recomendado)

---

## ✅ CHECKLIST ANTES DE EXECUTAR:

- [x] SendGrid API Key criada ✅
- [x] Sender Identity verificado no SendGrid
- [ ] Firebase projeto está no Blaze Plan (billing habilitado)*
- [ ] Firebase CLI está autenticado (`firebase login`)

*Se não estiver no Blaze Plan, será solicitado durante instalação

---

## 🎯 EXECUTE AGORA:

**1. Copie e cole o comando no PowerShell:**

```powershell
npx firebase ext:install firebase/firestore-send-email --project=educloud-sistema
```

**2. Aguarde download e configuração** (pode demorar 1-2 minutos)

**3. Responda as perguntas** usando as respostas acima

**4. Aguarde instalação finalizar** (2-5 minutos)

---

## 📊 VOCÊ VERÁ:

```
i  extensions: ensuring required API cloudresourcemanager.googleapis.com is enabled...
✔ extensions: required API cloudresourcemanager.googleapis.com is enabled
? What is your SMTP connection URI?
```

**Cole a URI acima!**

---

## 🆘 Se aparecer erro de billing:

```
Error: This project must be on the Blaze (pay-as-you-go) plan to use extensions.
```

**Execute:**
```powershell
# Abrir console do Firebase no navegador
start https://console.firebase.google.com/project/educloud-sistema/usage
```

E clique em "Modify Plan" → Escolha "Blaze" → Adicione cartão

⚠️ **NÃO SERÁ COBRADO** se ficar nos limites gratuitos (você ficará).

---

**EXECUTE O COMANDO AGORA e me avise quando aparecer a primeira pergunta!** 🚀
