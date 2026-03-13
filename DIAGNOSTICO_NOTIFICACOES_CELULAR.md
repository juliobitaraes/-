# 🔍 DIAGNÓSTICO COMPLETO DE NOTIFICAÇÕES NO CELULAR

## 📱 COMO USAR:

1. **Abra o site no celular** (Chrome Android)
2. **Faça login** como aluno
3. **Abra o DevTools** (uma das opções):
   - **Opção A (USB):** Conecte celular no PC → `chrome://inspect#devices` → "Inspect"
   - **Opção B (Eruda):** Adicione `?debug=1` na URL → Console no celular
4. **Copie e cole cada script abaixo** no Console
5. **Anote os resultados** para cada teste

---

## 🧪 TESTE 1: Verificar Permissões de Notificações

```javascript
console.log('═══ TESTE 1: PERMISSÕES ═══');
console.log('Notification API disponível:', 'Notification' in window);
console.log('Permissão atual:', Notification.permission);
console.log('Service Worker disponível:', 'serviceWorker' in navigator);

if (Notification.permission === 'denied') {
  console.error('❌ NOTIFICAÇÕES BLOQUEADAS!');
  console.log('📋 Solução:');
  console.log('1. Menu Chrome → Configurações → Site settings → Notifications');
  console.log('2. Procure este site e altere para "Permitir"');
} else if (Notification.permission === 'granted') {
  console.log('✅ Permissões OK');
} else {
  console.warn('⚠️ Permissão não solicitada ainda');
}
```

**✅ RESULTADO ESPERADO:** `Permissão atual: "granted"`
**❌ SE APARECER "denied":** Vá em Configurações do Chrome → Site settings → Notificações → Permitir

---

## 🧪 TESTE 2: Verificar Service Worker

```javascript
console.log('═══ TESTE 2: SERVICE WORKER ═══');

navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Total de SWs registrados:', regs.length);
  
  if (regs.length === 0) {
    console.error('❌ NENHUM SERVICE WORKER REGISTRADO!');
    console.log('📋 Solução: Recarregue a página e ative notificações');
  } else {
    regs.forEach((reg, i) => {
      console.log(`\n📦 Service Worker ${i + 1}:`);
      console.log('  Scope:', reg.scope);
      console.log('  Estado do active:', reg.active?.state);
      console.log('  Script URL:', reg.active?.scriptURL);
      
      if (reg.active?.state === 'activated') {
        console.log('  ✅ ATIVO E FUNCIONANDO');
      } else {
        console.warn('  ⚠️ NÃO ESTÁ ATIVO!');
      }
    });
  }
});

// Verificar se está esperando mensagens
navigator.serviceWorker.ready.then(reg => {
  console.log('\n✅ Service Worker PRONTO para receber mensagens');
}).catch(err => {
  console.error('❌ Erro ao verificar SW:', err);
});
```

**✅ RESULTADO ESPERADO:** 
- `Total de SWs registrados: 1`
- `Estado do active: "activated"`
- `✅ ATIVO E FUNCIONANDO`

**❌ SE APARECER "não está ativo":** Execute o próximo teste para reativar

---

## 🧪 TESTE 3: Reativar Service Worker (se necessário)

```javascript
console.log('═══ TESTE 3: REATIVAR SERVICE WORKER ═══');

navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Removendo Service Workers antigos...');
  regs.forEach(reg => reg.unregister());
  console.log('✅ Removidos. RECARREGUE A PÁGINA AGORA!');
});

// Depois de recarregar, ative notificações novamente
```

**📋 APÓS EXECUTAR:** Recarregue a página (F5) e clique em "Ativar Notificações"

---

## 🧪 TESTE 4: Testar Notificação LOCAL (sem Firebase)

```javascript
console.log('═══ TESTE 4: NOTIFICAÇÃO LOCAL ═══');

if (Notification.permission !== 'granted') {
  console.error('❌ Permissões não concedidas!');
} else {
  navigator.serviceWorker.ready.then(registration => {
    console.log('📤 Enviando notificação de teste local...');
    
    registration.showNotification('🔔 Teste LOCAL', {
      body: 'Se você VER ESTA notificação, o problema é no FCM/Token.\nSe NÃO VER, o problema é nas permissões do Android.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
      tag: 'test-local'
    }).then(() => {
      console.log('✅ Notificação local enviada com sucesso!');
      console.log('👀 Verifique a bandeja de notificações do celular');
    }).catch(err => {
      console.error('❌ Erro ao enviar notificação local:', err);
    });
  }).catch(err => {
    console.error('❌ Service Worker não está pronto:', err);
  });
}
```

**🎯 INTERPRETAÇÃO:**
- **SE A NOTIFICAÇÃO APARECER:** ✅ Permissões OK → Problema é no FCM/Token
- **SE NÃO APARECER:** ❌ Problema é nas configurações do Android/Chrome

---

## 🧪 TESTE 5: Verificar Token FCM Salvo

```javascript
console.log('═══ TESTE 5: TOKEN FCM ═══');

const userId = window.app?.currentUserData?.id;
if (!userId) {
  console.error('❌ Usuário não está logado!');
} else {
  window.db.collection('users').doc(userId).get().then(doc => {
    const user = doc.data();
    console.log('👤 Usuário:', user.nome);
    console.log('📧 Email:', user.email);
    console.log('🔔 Notificações habilitadas:', user.notificationsEnabled);
    console.log('🎫 Token FCM presente:', !!user.fcmToken);
    
    if (user.fcmToken) {
      console.log('Token (primeiros 30 caracteres):', user.fcmToken.substring(0, 30) + '...');
      console.log('Tamanho do token:', user.fcmToken.length, 'caracteres');
      
      if (user.fcmToken.length < 100) {
        console.warn('⚠️ Token parece inválido (muito curto)');
      } else {
        console.log('✅ Token parece válido');
      }
    } else {
      console.error('❌ NENHUM TOKEN SALVO!');
      console.log('📋 Solução: Clique em "Ativar Notificações"');
    }
  }).catch(err => {
    console.error('❌ Erro ao buscar usuário:', err);
  });
}
```

**✅ RESULTADO ESPERADO:**
- `Notificações habilitadas: true`
- `Token FCM presente: true`
- `Token parece válido`

**❌ SE NÃO TIVER TOKEN:** Desative e reative as notificações

---

## 🧪 TESTE 6: Obter Novo Token FCM

```javascript
console.log('═══ TESTE 6: GERAR NOVO TOKEN ═══');

import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js').then(({ initializeApp }) => {
  import('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js').then(({ getMessaging, getToken }) => {
    
    const firebaseConfig = {
      apiKey: "AIzaSyChnKOxAQH9RqSYmvcf3zYmajg3p5LCogc",
      authDomain: "educloud-sistema.firebaseapp.com",
      projectId: "educloud-sistema",
      storageBucket: "educloud-sistema.firebasestorage.app",
      messagingSenderId: "279645366191",
      appId: "1:279645366191:web:df16df577ccc959a4f315a"
    };
    
    const vapidKey = 'BLUrbuundjIwxicJT2ybFwKZwC1YFqtWEt8TjKuMFMe7stPRIvnFsp8eQh95i1tKDNnetxNu0tQff1l3SZXl--5U';
    
    console.log('🔄 Solicitando novo token...');
    
    navigator.serviceWorker.ready.then(registration => {
      const messaging = getMessaging();
      
      getToken(messaging, { 
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration 
      })
      .then(token => {
        console.log('✅ NOVO TOKEN GERADO!');
        console.log('Token:', token.substring(0, 30) + '...');
        console.log('\n📋 Copie este token e salve:');
        console.log(token);
        console.log('\n💾 Agora salve no banco:');
        console.log(`
const userId = '${window.app?.currentUserData?.id}';
window.db.collection('users').doc(userId).update({
  fcmToken: '${token}',
  notificationsEnabled: true
}).then(() => {
  console.log('✅ Token salvo!');
  location.reload();
});
        `);
      })
      .catch(err => {
        console.error('❌ Erro ao gerar token:', err);
        console.log('Código do erro:', err.code);
        console.log('Mensagem:', err.message);
      });
    });
  });
});
```

**📋 APÓS OBTER O TOKEN:** Copie o comando no final e execute para salvar o novo token

---

## 🧪 TESTE 7: Enviar Notificação de Teste via Backend

```javascript
console.log('═══ TESTE 7: TESTE COMPLETO VIA BACKEND ═══');

const userId = window.app?.currentUserData?.id;
if (!userId) {
  console.error('❌ Usuário não está logado!');
} else {
  console.log('📤 Enviando notificação de teste via Firebase Function...');
  
  const sendNotification = firebase.functions().httpsCallable('sendNotificationToUser');
  
  sendNotification({
    userId: userId,
    title: '🧪 TESTE COMPLETO - Sistema SENATEDU',
    body: 'Esta é uma notificação de teste do diagnóstico. Se você recebeu, ESTÁ FUNCIONANDO! 🎉',
    icon: '/icon-192.png',
    data: {
      type: 'test',
      timestamp: new Date().toISOString()
    }
  })
  .then(result => {
    console.log('✅ Resposta do servidor:', result.data);
    
    if (result.data.success) {
      console.log('✅ NOTIFICAÇÃO ENVIADA AO FCM!');
      console.log('Message ID:', result.data.messageId);
      console.log('\n👀 Verifique seu celular nos próximos 10 segundos...');
      console.log('\n💡 Se não chegou:');
      console.log('1. Token pode estar expirado (rode TESTE 6)');
      console.log('2. Conexão pode estar instável');
      console.log('3. Modo economia de bateria ativo');
      console.log('4. Chrome pode estar bloqueado pelo Android');
    } else {
      console.error('❌ Falha:', result.data.reason, result.data.message);
      
      if (result.data.reason === 'no-token') {
        console.log('📋 Solução: Clique em "Ativar Notificações"');
      }
    }
  })
  .catch(err => {
    console.error('❌ Erro ao enviar:', err);
    console.log('Código:', err.code);
    console.log('Mensagem:', err.message);
  });
}
```

**🎯 INTERPRETAÇÃO:**
- **`success: true` + Message ID retornado:** Notificação foi aceita pelo FCM
- **Se ainda não chegar:** Problema é no dispositivo/rede, não no código

---

## 🧪 TESTE 8: Verificar Logs do Service Worker

```javascript
console.log('═══ TESTE 8: LOGS DO SERVICE WORKER ═══');

// Adicionar listener para mensagens do SW
navigator.serviceWorker.addEventListener('message', (event) => {
  console.log('📨 Mensagem recebida do Service Worker:', event.data);
});

// Verificar se o SW está processando mensagens
navigator.serviceWorker.ready.then(registration => {
  console.log('🔍 Enviando mensagem de teste ao SW...');
  
  registration.active.postMessage({
    type: 'TEST_CONNECTION',
    timestamp: Date.now()
  });
  
  console.log('✅ Mensagem enviada. Aguardando resposta...');
  console.log('ℹ️ Abra também: chrome://serviceworker-internals/');
  console.log('   Procure por firebase-messaging-sw.js');
  console.log('   Clique em "Start" e "Inspect" para ver logs internos');
});
```

---

## 📊 CHECKLIST DE DIAGNÓSTICO

Marque o que está OK:

- [ ] **TESTE 1:** Permissão = "granted"
- [ ] **TESTE 2:** Service Worker ativo
- [ ] **TESTE 3:** SW reativado (se necessário)
- [ ] **TESTE 4:** Notificação local APARECEU
- [ ] **TESTE 5:** Token FCM está salvo
- [ ] **TESTE 6:** Novo token gerado (se necessário)
- [ ] **TESTE 7:** Backend retornou success: true
- [ ] **TESTE 8:** SW está processando mensagens

---

## 🔧 SOLUÇÕES POR PROBLEMA

### ❌ Se TESTE 4 (notificação local) NÃO APARECE:

**Problema:** Permissões do Android/Chrome

**Soluções:**

1. **Configurações do Chrome:**
   ```
   Chrome → Menu (⋮) → Configurações → Notificações
   → Verificar se estão ATIVADAS
   ```

2. **Configurações do Site:**
   ```
   Menu (⋮) → Informações do site → Permissões → Notificações
   → Alterar para "Permitir"
   ```

3. **Configurações do Android:**
   ```
   Configurações → Apps → Chrome → Notificações
   → ATIVAR todas as categorias
   ```

4. **Modo Economia de Bateria:**
   ```
   Configurações → Bateria → Economia de bateria
   → DESATIVAR ou adicionar Chrome às exceções
   ```

5. **Limpar cache e dados:**
   ```
   Chrome → Configurações → Privacidade → Limpar dados
   → Marcar "Cookies" e "Cache" → Limpar
   ```

---

### ✅ Se TESTE 4 APARECE mas TESTE 7 NÃO:

**Problema:** Token FCM expirado ou inválido

**Solução:**

1. **Desativar notificações:**
   ```javascript
   const userId = window.app?.currentUserData?.id;
   window.db.collection('users').doc(userId).update({
     fcmToken: null,
     notificationsEnabled: false
   });
   ```

2. **Recarregar página:** F5

3. **Ativar novamente:** Botão "Ativar Notificações"

4. **Testar novamente:** Botão "Testar"

---

### 🌐 Se NADA FUNCIONA:

**Teste em outro dispositivo/navegador:**

- ✅ Chrome Desktop (Windows/Mac/Linux)
- ✅ Edge Desktop
- ✅ Chrome Android (outro celular)
- ❌ Safari (não suporta FCM)
- ❌ Firefox Mobile (suporte limitado)

**Se funcionar em Desktop mas não no celular:**
→ Problema é no Android/Chrome mobile, não no código

---

## 📞 SUPORTE

Se após todos os testes não funcionar, copie e envie:

1. Resultado de TODOS os testes (1 a 8)
2. Modelo do celular e versão do Android
3. Versão do Chrome (chrome://version)
4. Screenshots das configurações de notificações

---

**Última atualização:** 13/02/2026 21:15
