# Checklist Rápido de Ambiente para Deploy SENATEDU

## 1. Instalar Node.js (LTS)
Acesse: https://nodejs.org/pt-br/download/
- Baixe e instale a versão LTS (recomendado para a maioria dos usuários)
- Após instalar, feche e reabra o PowerShell

## 2. Instalar Firebase CLI
```powershell
npm install -g firebase-tools
```

## 3. Fazer login no Firebase
```powershell
firebase login
```

## 4. Confirmar projeto ativo
No diretório do projeto SENATEDU:
```powershell
firebase use
```

## 5. (Opcional) Instalar Google Cloud CLI
Se você usa deploy/logs do Cloud Run ou gcloud:
- Baixe: https://cloud.google.com/sdk/docs/install
- Instale normalmente
- Depois, rode:
```powershell
gcloud auth login
gcloud config set project educloud-sistema
```

## 6. Testar ambiente
```powershell
node -v
npm -v
firebase --version
gcloud --version # (se usar gcloud)
```

## 7. Fazer deploy
```powershell
firebase deploy --only functions
firebase deploy --only hosting
```

Pronto! Se algum comando der erro, copie a mensagem e me envie para análise.