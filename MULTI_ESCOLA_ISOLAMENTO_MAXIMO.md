# Multi-Escola com Isolamento Maximo

Este projeto foi preparado para operar em modo multi-escola com isolamento forte por caminho de dados:

- Firestore: `schools/{schoolId}/...`
- Storage: `schools/{schoolId}/...`
- Cloud Functions: todas as operacoes sensiveis exigem `schoolId`
- UID global com acesso total: `xSeQ7zitlkdWfYRW0IBbQoCS0yF3`
- Escola atual (padrao ativa): `SENATB072`

## 1. Modelo de dados recomendado

Para cada escola:

- `schools/{schoolId}`: metadados da escola
- `schools/{schoolId}/members/{uid}`: vinculo e papel (`tipo`: admin, professor, secretaria, aluno)
- `schools/{schoolId}/users/{uid}`: perfil do usuario naquela escola
- `schools/{schoolId}/turmas/{id}`
- `schools/{schoolId}/componentes/{id}`
- `schools/{schoolId}/materiais/{id}`
- `schools/{schoolId}/provas/{id}`
- `schools/{schoolId}/provas_resultados/{id}`
- `schools/{schoolId}/presencas/{id}`
- `schools/{schoolId}/notifications/{id}`
- `schools/{schoolId}/logs_acesso/{id}`

## 2. Regras de acesso aplicadas

- Usuario comum: so acessa dados da(s) escola(s) onde possui documento em `members/{uid}`.
- Admin de escola: gerencia usuarios e dados da propria escola.
- UID global (`xSeQ7zitlkdWfYRW0IBbQoCS0yF3`): bypass total para todas as escolas.
- Estrutura legada fora de `schools/{schoolId}`: bloqueada por padrao.

## 3. Storage com isolamento

- Arquivos anexados devem ficar em `schools/{schoolId}/...`.
- Leitura: apenas membros da escola.
- Escrita: admin/professor/secretaria da escola.
- Upload do proprio aluno: permitido em `schools/{schoolId}/alunos/{uid}/...`.

## 4. Functions com isolamento

As funcoes callable agora exigem `schoolId` no `data`:

- `deleteUserByUid`
- `sendNotificationToUser`
- `sendNotificationToMultipleUsers`
- `sendNotificationToTurma`
- `sendNotificationByUserType`
- `sendEmail`

Para `sendEmailHttp`, enviar `schoolId` no corpo (`req.body.schoolId`) ou header `x-school-id`.

## 5. Separacao de infraestrutura por escola (maximo isolamento real)

Para isolamento maximo de verdade (fisico), use um projeto Firebase por escola:

1. Criar 1 projeto Firebase por escola (`senatedu-escola-a`, `senatedu-escola-b`, ...).
2. Deploy do mesmo codigo em cada projeto, mantendo a mesma politica de regras.
3. Provisionar o mesmo UID global em cada projeto para operacao cross-school:
   - UID: `xSeQ7zitlkdWfYRW0IBbQoCS0yF3`
4. Nunca compartilhar bucket, Firestore ou Auth entre escolas diferentes.

Resultado: mesmo em caso de configuracao indevida em uma escola, nao ha impacto em dados das outras.

## 6. Checklist de migracao

1. Criar `schools/{schoolId}` para a escola atual.
2. Migrar colecoes legadas para `schools/{schoolId}/...`.
3. Criar `members/{uid}` para todos os usuarios.
4. Atualizar frontend para usar `schoolId` ativo em todas as queries.
5. Atualizar chamadas de Functions para sempre enviar `schoolId`.
6. Migrar anexos para paths de `schools/{schoolId}/...`.
7. Executar testes de tentativa de acesso cruzado entre escolas.
