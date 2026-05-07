# 🔍 GUIA DE DEBUG - NOTIFICAÇÕES PUSH

## ✅ O que já verificamos:

1. **VAPID Key configurada corretamente**
2. **Token FCM sendo gerado e salvo**
3. **Firebase Functions implantadas e funcionando** (código 200)
4. **Firestore rules permitem leitura do token**
5. **Service Worker registrado e ativo**

## 🎯 PRÓXIMOS PASSOS DE DEBUG:

### PASSO 1: Testar com logs em tempo real

1. **Abrir 2 terminais lado a lado:**
   - Terminal 1: Rodar o comando `npx firebase functions:log`
   - Terminal 2: Manter aberto o DevTools do navegador (F12)

2. **No navegador:**
   - Abrir DevTools (F12)
   - Ir para a aba "Console"
   - Filtrar por "Notificação" ou "sendNotification"

3. **Clicar no botão "Testar"**

4. **Verificar simultaneamente:**
   - ✅ Console do navegador deve mostrar logs detalhados (15+ linhas)
   - ✅ Terminal deve mostrar novos logs com emojis (📤 e ✅)
   - ✅ Notificação deve aparecer no dispositivo

### PASSO 2: Verificar o que está acontecendo

Quando clicar em "Testar", você deve ver no console do navegador:

```
🔔 Iniciando teste de notificação...
📋 Dados do usuário atualizados...
✅ Token encontrado: eF4a...
📞 Chamando Firebase Function...
✅ Resposta da função: { success: true, messageId: "..." }
🎉 Notificação enviada com sucesso!
```

E no terminal do Firebase (logs da function):

```
📤 Enviando notificação para: { userId: "xxx", token: "eF4a...", title: "Teste", body: "..." }
✅ Notificação enviada com sucesso! messageId: projects/educloud-sistema/messages/...
```

### PASSO 3: Identificar o problema

**Se aparecer NO CONSOLE mas NÃO NO DISPOSITIVO:**

Possíveis causas:
1. **FCM enviou mas dispositivo não recebeu:**
   - Verificar conexão de internet do dispositivo
   - Verificar se o celular está em modo economia de energia
   - Verificar se o Chrome tem permissão de notificações
   - Verificar se notificações não estão bloqueadas nas configurações do Android

2. **Service Worker não está processando:**
   - Abrir DevTools → Application → Service Workers
   - Verificar se está "Activated and is running"
   - Clicar em "Update" para forçar atualização

3. **Token expirou:**
   - Desativar notificações
   - Ativar novamente (gera novo token)
   - Testar novamente

**Se NÃO aparecer NO CONSOLE:**

Significa que há erro no cliente antes de chamar a função:
1. Verificar erros no console (linhas vermelhas)
2. Verificar se o userId está correto
3. Verificar se a função está autenticada

**Se aparecer ERRO no terminal:**

Significa que a função executou mas falhou:
1. Verificar a mensagem de erro específica
2. Token inválido = desativar/ativar notificações
3. Permissão negada = verificar configurações do FCM no Firebase Console

### PASSO 4: Teste manual do Service Worker

Abrir DevTools → Console e executar:

```javascript
// Verificar se o service worker está registrado
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker:', reg);
  console.log('Estado:', reg.active?.state);
});

// Testar notificação diretamente do service worker
Notification.requestPermission().then(permission => {
  if (permission === 'granted') {
    new Notification('Teste Manual', {
      body: 'Se esta notificação aparecer, o problema é no FCM',
      icon: '/icon-192.png'
    });
  }
});
```

- **Se a notificação manual APARECER:** O problema é no envio do FCM (token ou configuração)
- **Se a notificação manual NÃO APARECER:** O problema é nas permissões do navegador

### PASSO 5: Verificar permissões no Android

Se estiver usando Chrome no Android:

1. **Configurações do Android:**
   - Configurações → Apps → Chrome → Notificações
   - Verificar se notificações estão ATIVADAS

2. **Configurações do Site:**
   - Chrome → Menu (3 pontos) → Configurações
   - Site settings → Notifications
   - Verificar se o site está na lista de PERMITIDOS

3. **Modo Economia de Energia:**
   - Desativar modo economia de bateria
   - Adicionar Chrome na lista de apps não restritos

## 📊 CHECKLIST DE DEBUG:

- [ ] Console do navegador mostra todos os 15+ logs
- [ ] Terminal do Firebase mostra 📤 Enviando e ✅ Sucesso
- [ ] Service Worker está "Activated and is running"
- [ ] Notificação manual (Notification API) funciona
- [ ] Permissões do Chrome estão ativadas
- [ ] Internet do celular está funcionando
- [ ] Modo economia de bateria está desativado
- [ ] Token FCM foi gerado recentemente (< 1 dia)

## 🔧 COMANDOS ÚTEIS:

```powershell
# Ver logs em tempo real
npx firebase functions:log

# Ver últimas 50 linhas
npx firebase functions:log | Select-Object -Last 50

# Filtrar apenas erros
npx firebase functions:log | Select-String "error|Error|ERROR"

# Ver status das functions
npx firebase functions:list

# Redeployar function específica
npx firebase deploy --only functions:sendNotificationToUser
```

## 📱 TESTE ALTERNATIVO (Firebase Console):

1. Abrir Firebase Console: https://console.firebase.google.com
2. Ir em Cloud Messaging
3. Enviar teste de notificação
4. Colar o token FCM do usuário
5. Se funcionar = problema no código; se não funcionar = problema no dispositivo

## 🆘 SE NADA FUNCIONAR:

1. **Deletar e reativar notificações:**
   ```javascript
   // No console do navegador
   window.store.updateUserData({ notificationsEnabled: false, fcmToken: null })
   ```

2. **Limpar service worker:**
   - DevTools → Application → Service Workers → Unregister
   - Recarregar página (F5)
   - Ativar notificações novamente

3. **Testar em outro navegador/dispositivo:**
   - Chrome Desktop
   - Chrome Android
   - Firefox (não suporta FCM nativamente)
   - Edge

---

**Última atualização:** 13/02/2026 22:15
