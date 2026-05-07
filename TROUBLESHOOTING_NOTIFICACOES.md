# 🐛 Troubleshooting - Notificações Não Chegam no Celular

## ❌ Problema Relatado

**Sintomas:**
- ✅ Diagnóstico mostra todos os itens OK
- ✅ Mensagem "Notificações ativadas e funcionando" aparece
- ✅ Mensagem "Notificação de teste enviada. Verifique seu Dispositivo" aparece
- ❌ **MAS a notificação não chega no celular**

---

## 🔍 Causas Possíveis

### 1. Firebase Functions Não Deployado

**Problema:** As funções do Firebase não foram enviadas para produção.

**Como verificar:**
```bash
firebase functions:log --limit 10
```

**Solução:**
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

**Tempo estimado:** 3-5 minutos

---

### 2. Service Worker Não Está Recebendo

**Problema:** O service worker está desatualizado ou com erro.

**Como verificar:**
1. Abra DevTools (F12)
2. Vá em **Application** → **Service Workers**
3. Verifique se há erros

**Solução:**
1. Clique em **Unregister**
2. Recarregue a página (Ctrl + F5)
3. Ative notificações novamente

---

### 3. Token FCM Expirado ou Inválido

**Problema:** O token salvado no banco não é mais válido.

**Como verificar no Console:**
```javascript
// Abra o console do navegador (F12) e execute:
const userId = app.currentUserData.id;
const doc = await db.collection('users').doc(userId).get();
console.log('Token:', doc.data().fcmToken);
console.log('Enabled:', doc.data().notificationsEnabled);
```

**Solução:**
1. Vá em Cadastro → Notificações
2. Clique em "Ativar Notificações" novamente
3. Teste novamente

---

### 4. Firebase Cloud Messaging API Não Ativa

**Problema:** A API do FCM não está habilitada no Google Cloud.

**Como verificar:**
1. Acesse: https://console.cloud.google.com/apis/dashboard?project=educloud-sistema
2. Busque por "Firebase Cloud Messaging API"
3. Verifique se está **ENABLED** (ativada)

**Solução:**
1. Se não estiver ativa, clique em "ENABLE"
2. Aguarde 1-2 minutos
3. Teste novamente

**APIs Necessárias:**
- ✅ Firebase Cloud Messaging API
- ✅ FCM Registration API
- ✅ Cloud Functions API

---

### 5. Permissão Bloqueada no Navegador/Sistema

**Problema:** O navegador ou sistema operacional bloqueou notificações.

**Como verificar no Android:**
1. Configurações → Apps → Chrome/Firefox
2. Notificações
3. Verifique se está permitido

**Como verificar no iOS:**
1. Ajustes → Safari
2. Configurações para Sites
3. Notificações
4. Permitir para educloud-sistema.web.app

**Solução:**
1. Permita notificações nas configurações do sistema
2. Recarregue a página
3. Ative notificações novamente

---

### 6. Firestore Rules Bloqueando Escrita

**Problema:** As regras de segurança não permitem salvar o token.

**Como verificar:**
```bash
# Verificar logs do Firestore
firebase deploy --only firestore:rules
```

**Solução:** As regras já foram corrigidas no último deploy.

---

### 7. Conexão de Rede / Firewall

**Problema:** Firewall corporativo ou bloqueio de rede.

**Como verificar:**
```javascript
// No console (F12):
fetch('https://fcm.googleapis.com/fcm/send')
  .then(r => console.log('FCM acessível:', r.status))
  .catch(e => console.error('FCM bloqueado:', e));
```

**Solução:**
- Use outra rede (dados móveis, outra WiFi)
- Teste em modo anônimo
- Verifique configurações de firewall

---

## 📋 Checklist de Verificação

Execute este checklist passo a passo:

### Backend (Firebase Functions)

```bash
# 1. Verificar se Functions estão deployadas
firebase functions:list

# 2. Ver logs das Functions
firebase functions:log --limit 20

# 3. Fazer deploy das Functions
cd functions
npm install
cd ..
node deploy-rules.js  # ou: firebase deploy --only functions
```

### Frontend (Navegador)

1. [ ] Abrir DevTools (F12) → Console
2. [ ] Ir em Cadastro → Notificações
3. [ ] Clicar em "Ativar Notificações"
4. [ ] Verificar console para erros
5. [ ] Clicar em "Testar"
6. [ ] Verificar console para logs:
   - `📤 Enviando notificação via Firebase Function...`
   - `📬 Resultado do envio: { success: true }`
   - `✅ Message ID: xxx`

### Banco de Dados

```javascript
// Execute no Console (F12):
const userId = app.currentUserData.id;
const doc = await db.collection('users').doc(userId).get();
const data = doc.data();
console.log('FCM Token:', data.fcmToken ? 'OK' : 'AUSENTE');
console.log('Notifications Enabled:', data.notificationsEnabled);
console.log('Token length:', data.fcmToken?.length);
```

✅ **Token deve ter ~150+ caracteres**
✅ **notificationsEnabled deve ser `true` ou `undefined`**

---

## 🧪 Testes Manuais

### Teste 1: Notificação Local

```javascript
// No console (F12), execute:
if (Notification.permission === 'granted') {
  new Notification('🔔 Teste Local', {
    body: 'Se você vê isto, notificações locais funcionam',
    icon: '/icon-192.png'
  });
}
```

✅ Se apareceu: Navegador/sistema permitem notificações
❌ Se não apareceu: Problema nas permissões do sistema

### Teste 2: Firebase Function Direta

```javascript
// No console (F12), execute:
const userId = app.currentUserData.id;
const fn = firebase.functions().httpsCallable('sendNotificationToUser');
fn({
  userId: userId,
  title: 'Teste Manual',
  body: 'Teste direto via console',
  icon: '/icon-192.png'
}).then(r => console.log('Resultado:', r.data))
  .catch(e => console.error('Erro:', e));
```

**Resultados esperados:**

✅ **Sucesso:**
```json
{
  "success": true,
  "messageId": "projects/..."
}
```

❌ **Sem token:**
```json
{
  "success": false,
  "reason": "no-token",
  "message": "Usuário não possui token FCM registrado"
}
```

❌ **Função não encontrada:**
```
Error: functions/not-found
```
**Solução:** Deploy das Functions

---

## 🚀 Script de Deploy Automático

Salve como `deploy-all.js`:

```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');

console.log('🚀 Deploy completo do SENATEDU...\n');

try {
  console.log('1/3 📜 Deploy das Firestore Rules...');
  execSync('npx firebase deploy --only firestore:rules', { stdio: 'inherit' });
  
  console.log('\n2/3 ⚡ Deploy das Functions...');
  execSync('npx firebase deploy --only functions', { stdio: 'inherit' });
  
  console.log('\n3/3 🌐 Deploy do Hosting...');
  execSync('npx firebase deploy --only hosting', { stdio: 'inherit' });
  
  console.log('\n✅ Deploy completo concluído!');
} catch (error) {
  console.error('\n❌ Erro no deploy:', error.message);
  process.exit(1);
}
```

Execute:
```bash
node deploy-all.js
```

---

## 📞 Suporte

Se após seguir todos os passos o problema persistir:

1. **Copie os logs do console** (F12 → Console → Botão direito → Save as...)
2. **Tire print da tela de diagnóstico**
3. **Execute os testes manuais** e copie resultados
4. **Verifique os logs do Firebase Functions:**
   ```bash
   firebase functions:log --limit 50
   ```

Compartilhe essas informações para análise detalhada.

---

## ✅ Solução Mais Comum

**90% dos casos:** Firebase Functions não está deployado.

**Solução rápida:**
```bash
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -Force
cd functions
npm install
cd ..
npx firebase deploy --only functions
```

Aguarde 3-5 minutos e teste novamente! 🎉

---

**Última atualização:** 13 de fevereiro de 2026
