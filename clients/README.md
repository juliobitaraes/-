# Configuração por cliente (venda para outra escola)

Cada arquivo `clients/<clientId>.json` guarda as credenciais Firebase/EmailJS e o
`schoolId` padrão de um cliente. Use `tools/set-client.js` para aplicar essas
credenciais aos arquivos `js/config/firebase.js` e `js/config/school.js` (e às
cópias em `web/js/config/`) antes de fazer o deploy para aquele cliente.

## Cadastrar um novo cliente
1. Copie `clients/_template.json` para `clients/<clientId>.json`.
2. Preencha com as credenciais do projeto Firebase do cliente (Configurações do
   projeto → Seus apps → Config) e a VAPID key (Cloud Messaging).
3. Rode:
   ```powershell
   node tools/set-client.js <clientId>
   ```
4. Faça o deploy apontando para o projeto do cliente:
   ```powershell
   firebase deploy --project <firebaseProjectId>
   ```

## Trocar de cliente localmente
```powershell
node tools/set-client.js educloud-sistema
```

Os arquivos gerados (`js/config/firebase.js`, `js/config/school.js` e as
cópias em `web/js/config/`) são sobrescritos a cada execução — não edite-os
manualmente, edite o JSON do cliente em `clients/`.
