# 🔑 Como Configurar a VAPID Key do Firebase

## ❌ Problema Identificado

```
InvalidAccessError: Failed to execute 'subscribe' on 'PushManager': 
The provided applicationServerKey is not valid.
```

**Causa:** A chave VAPID (Voluntary Application Server Identification) configurada no código está inválida ou não corresponde ao projeto Firebase.

---

## ✅ Solução Passo a Passo

### 1. Acessar o Firebase Console

Abra o link abaixo no navegador:

```
https://console.firebase.google.com/project/educloud-sistema/settings/cloudmessaging
```

Ou navegue manualmente:
- Acesse: https://console.firebase.google.com
- Selecione o projeto: **educloud-sistema**
- Vá em: **Configurações** (⚙️) → **Configurações do projeto**
- Clique na aba: **Cloud Messaging**

---

### 2. Localizar Web Push Certificates

Role a página até encontrar a seção:

**"Web Push certificates"** ou **"Certificados Web Push"**

---

### 3. Gerar ou Obter a Chave

#### Cenário A: Não existe nenhuma chave

1. Clique no botão: **"Generate key pair"** (Gerar par de chaves)
2. Aguarde a geração
3. Uma nova chave será exibida

#### Cenário B: Já existe uma chave

1. A chave já estará visível na tela
2. Ela começa com "B..." (exemplo: `BLUrbuundjlwx...`)
3. Use essa chave existente

---

### 4. Copiar a Chave VAPID

1. Localize o campo **"Key pair"** (Par de chaves)
2. Clique no ícone de **copiar** 📋 ao lado da chave
3. A chave deve ter aproximadamente **88 caracteres**

**Exemplo de formato:**
```
BLUrbuundjlwxicJT2ybFwKZwC1YFqtWEt8TjKuMFMe7stPRIvnFsp8eQh95i1tKDNnetxNu0tQff1l3SZXI--5U
```

---

### 5. Configurar no Código

Abra o arquivo:

```
js/config/firebase.js
```

Localize a linha:

```javascript
export const FIREBASE_VAPID_KEY = 'COLE_AQUI_A_VAPID_KEY_DO_FIREBASE_CONSOLE';
```

Substitua por:

```javascript
export const FIREBASE_VAPID_KEY = 'SUA_CHAVE_COPIADA_AQUI';
```

**Exemplo:**

```javascript
export const FIREBASE_VAPID_KEY = 'BLUrbuundjlwxicJT2ybFwKZwC1YFqtWEt8TjKuMFMe7stPRIvnFsp8eQh95i1tKDNnetxNu0tQff1l3SZXI--5U';
```

---

### 6. Salvar e Testar

1. **Salve** o arquivo `firebase.js`
2. **Recarregue** completamente a página (Ctrl + Shift + R ou Ctrl + F5)
3. Tente **ativar as notificações** novamente
4. O erro deve desaparecer! ✅

---

## 🔍 Verificações Adicionais

### Verifique se as APIs estão ativas

No Google Cloud Console, certifique-se de que estas APIs estão **ATIVADAS**:

1. **Firebase Cloud Messaging API**
2. **FCM Registration API**

Acesse: https://console.cloud.google.com/apis/dashboard?project=educloud-sistema

---

### Verifique o Domínio Autorizado

No Firebase Console → Cloud Messaging → **Domain verification**, certifique-se de que o domínio está autorizado:

```
educloud-sistema.web.app
educloud-sistema.firebaseapp.com
```

Adicione também se estiver testando localmente:
```
localhost
```

---

## 🐛 Se o Erro Persistir

### Limpar Cache e Storage

1. Abra as **Ferramentas do Desenvolvedor** (F12)
2. Vá em **Application** → **Storage**
3. Clique em **Clear site data**
4. Recarregue a página

### Verificar Service Worker

1. Abra as **Ferramentas do Desenvolvedor** (F12)
2. Vá em **Application** → **Service Workers**
3. Clique em **Unregister** ao lado do service worker
4. Recarregue a página
5. O service worker será registrado novamente

### Verificar Console para Erros

1. Abra o console (F12 → Console)
2. Procure por mensagens de erro em vermelho
3. Verifique se há erros relacionados a:
   - VAPID key
   - Service Worker
   - Firebase Messaging

---

## 📝 Notas Importantes

- ⚠️ **Não compartilhe** a VAPID key publicamente em repositórios Git públicos (embora ela possa ser vista no código do frontend)
- ⚠️ A VAPID key deve ser a **mesma** em todos os ambientes (desenvolvimento, produção)
- ⚠️ Se gerar uma **nova** chave VAPID, os tokens FCM antigos **não funcionarão mais**
- ⚠️ O domínio deve estar em **HTTPS** (exceto localhost)

---

## ✅ Checklist Final

- [ ] Acessei o Firebase Console
- [ ] Copiei a VAPID Key correta do projeto
- [ ] Colei a chave no arquivo `js/config/firebase.js`
- [ ] Salvei o arquivo
- [ ] Recarreguei a página completamente
- [ ] As notificações agora funcionam! 🎉

---

## 🆘 Suporte

Se após seguir todos os passos o erro persistir, compartilhe:

1. A mensagem de erro completa exibida
2. Print da seção "Web Push certificates" do Firebase Console
3. Confirmação de que a chave foi colada corretamente

---

**Última atualização:** 13 de fevereiro de 2026
