# Manual de Telas do SENATEDU v2.0

Este manual consolida todas as telas renderizadas pelo sistema e descreve suas funcionalidades.

## Como usar este manual

1. Abra cada tela no sistema com o perfil indicado.
2. Capture o print da tela completa.
3. Salve o print no caminho sugerido em cada seção.
4. Atualize este arquivo mantendo o mesmo padrão de nomes.

## Padrão de nomenclatura dos prints

- Pasta sugerida: `docs/prints/`
- Formato: `NN-slug-da-tela.png`
- Exemplo: `01-login.png`

## 01. Login

- Tela: Login
- Rota/View: autenticação inicial
- Perfis: todos
- Funcionalidades:
  - Entrada com email e senha.
  - Recuperação de senha (Esqueci minha senha).
  - Exibição de erros de autenticação e status de convite.
- Print sugerido: `docs/prints/01-login.png`

![Tela de Login](docs/prints/01-login.png)

## 02. Dashboard

- Tela: Dashboard
- Rota/View: `dashboard`
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Visão geral com indicadores acadêmicos.
  - Calendário de eventos, provas e alertas.
  - Avisos recentes e blocos de acompanhamento.
- Print sugerido: `docs/prints/02-dashboard.png`

![Tela Dashboard](docs/prints/02-dashboard.png)

## 03. Diário

- Tela: Diário por componentes
- Rota/View: `diario`
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Resultados por turma/componente.
  - Consolidação de notas de provas e trabalhos.
  - Expansão/recolhimento por seção e turma.
- Print sugerido: `docs/prints/03-diario.png`

![Tela Diário](docs/prints/03-diario.png)

## 04. Frequência (Gestão)

- Tela: Frequência
- Rota/View: `presenca` (admin/professor/secretaria)
- Perfis: admin, professor, secretaria
- Funcionalidades:
  - Seleção de turma, componente e data.
  - Marcação de presença/falta com justificativa.
  - Upload de comprovantes, bonificação e resumo de frequência.
- Print sugerido: `docs/prints/04-frequencia-gestao.png`

![Tela Frequência Gestão](docs/prints/04-frequencia-gestao.png)

## 05. Frequência (Aluno)

- Tela: Minha Frequência
- Rota/View: `presenca` (aluno)
- Perfis: aluno
- Funcionalidades:
  - Consulta de presença individual.
  - Visualização de faltas, justificativas e histórico.
- Print sugerido: `docs/prints/05-frequencia-aluno.png`

![Tela Frequência Aluno](docs/prints/05-frequencia-aluno.png)

## 06. Relatórios

- Tela: Relatórios
- Rota/View: `relatorios`
- Perfis: admin, professor, secretaria
- Funcionalidades:
  - Painéis de desempenho acadêmico.
  - Indicadores de frequência por aluno e por turma.
  - (Admin) visões adicionais de logs e auditoria.
- Print sugerido: `docs/prints/06-relatorios.png`

![Tela Relatórios](docs/prints/06-relatorios.png)

## 07. Notificações Push

- Tela: Notificações
- Rota/View: `notificacoes`
- Perfis: admin, professor
- Funcionalidades:
  - Envio individual para aluno.
  - Envio por turma.
  - Envio por tipo de usuário (admin).
  - Histórico de notificações enviadas.
- Print sugerido: `docs/prints/07-notificacoes.png`

![Tela Notificações](docs/prints/07-notificacoes.png)

## 08. Usuários

- Tela: Usuários
- Rota/View: `usuarios`
- Perfis: admin
- Funcionalidades:
  - Gestão de usuários do sistema.
  - Promoção/rebaixamento de perfis.
  - Redefinição de senha e exclusões administrativas.
- Print sugerido: `docs/prints/08-usuarios.png`

![Tela Usuários](docs/prints/08-usuarios.png)

## 09. Turmas

- Tela: Turmas
- Rota/View: `turmas`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro e edição de turmas.
  - Gestão de turmas ativas e concluídas.
  - Acesso ao diário consolidado por turma concluída.
- Print sugerido: `docs/prints/09-turmas.png`

![Tela Turmas](docs/prints/09-turmas.png)

## 10. Alunos

- Tela: Gerenciar Alunos
- Rota/View: `alunos`
- Perfis: admin, professor, secretaria
- Funcionalidades:
  - Listagem de alunos por turma.
  - Importação por Excel e cadastro manual.
  - Ações rápidas: aviso, edição, bloqueio, reset de senha.
- Print sugerido: `docs/prints/10-alunos.png`

![Tela Alunos](docs/prints/10-alunos.png)

## 11. Materiais Didáticos

- Tela: Materiais
- Rota/View: `materiais`
- Perfis: admin, professor, secretaria, aluno (consulta)
- Funcionalidades:
  - Organização por turma, componente e tipo de arquivo.
  - Upload de arquivos e links (YouTube/web).
  - Acesso rápido para download/abertura dos materiais.
- Print sugerido: `docs/prints/11-materiais.png`

![Tela Materiais](docs/prints/11-materiais.png)

## 12. Provas

- Tela: Provas
- Rota/View: `provas`
- Perfis: admin, professor, aluno (resolução)
- Funcionalidades:
  - Criação e publicação de provas.
  - Controle de rascunho/publicado.
  - Download de gabarito e versão impressa (professor/admin).
  - Início de prova para aluno.
- Print sugerido: `docs/prints/12-provas.png`

![Tela Provas](docs/prints/12-provas.png)

## 13. Atividades EAD

- Tela: Atividades EAD
- Rota/View: `atividades`
- Perfis: admin, professor, aluno
- Funcionalidades:
  - Cadastro e gestão de atividades EAD.
  - Execução de atividade pelo aluno.
  - Integração com envio automático de notificações.
- Print sugerido: `docs/prints/13-atividades-ead.png`

![Tela Atividades EAD](docs/prints/13-atividades-ead.png)

## 14. Trabalhos (Seleção de Turma)

- Tela: Trabalhos - Seleção
- Rota/View: `trabalhos` (entrada)
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Seleção de turma/sala para acesso aos trabalhos.
  - Navegação para chat de trabalhos.
- Print sugerido: `docs/prints/14-trabalhos-selecao.png`

![Tela Trabalhos Seleção](docs/prints/14-trabalhos-selecao.png)

## 15. Trabalhos (Chat/Sala)

- Tela: Trabalhos - Sala de Chat
- Rota/View: chat de `trabalhos`
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Conversa por turma/sala.
  - Envio de arquivos e mensagens.
  - Edição e exclusão de mensagens com permissão.
- Print sugerido: `docs/prints/15-trabalhos-chat.png`

![Tela Trabalhos Chat](docs/prints/15-trabalhos-chat.png)

## 16. Fórum (Seleção de Turma)

- Tela: Fórum - Seleção
- Rota/View: `forum` (entrada)
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Acesso ao fórum geral, por turma ou colaboradores.
  - Navegação para salas de discussão.
- Print sugerido: `docs/prints/16-forum-selecao.png`

![Tela Fórum Seleção](docs/prints/16-forum-selecao.png)

## 17. Fórum (Chat/Sala)

- Tela: Fórum - Sala de Discussão
- Rota/View: chat de `forum`
- Perfis: admin, professor, secretaria, aluno
- Funcionalidades:
  - Discussões por sala.
  - Compartilhamento de anexos e mensagens.
  - Edição, moderação e exclusão conforme permissão.
- Print sugerido: `docs/prints/17-forum-chat.png`

![Tela Fórum Chat](docs/prints/17-forum-chat.png)

## 18. Contas Financeiras

- Tela: Contas
- Rota/View: `contas_financeiras`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro de contas financeiras da escola.
  - Saldo inicial e controle por conta.
- Print sugerido: `docs/prints/18-contas-financeiras.png`

![Tela Contas Financeiras](docs/prints/18-contas-financeiras.png)

## 19. Receitas

- Tela: Receitas
- Rota/View: `receitas`
- Perfis: admin, secretaria
- Funcionalidades:
  - Lançamento de entradas.
  - Filtros, ordenação e exportação de dados.
- Print sugerido: `docs/prints/19-receitas.png`

![Tela Receitas](docs/prints/19-receitas.png)

## 20. Despesas

- Tela: Despesas
- Rota/View: `despesas`
- Perfis: admin, secretaria
- Funcionalidades:
  - Lançamento de saídas.
  - Controle de vencimento, quitação e categorias.
- Print sugerido: `docs/prints/20-despesas.png`

![Tela Despesas](docs/prints/20-despesas.png)

## 21. Movimentações Financeiras

- Tela: Movimentações
- Rota/View: `movimentacoes_financeiras`
- Perfis: admin, secretaria
- Funcionalidades:
  - Transferências e movimentações entre contas.
  - Rastreabilidade por data, categoria e forma de pagamento.
- Print sugerido: `docs/prints/21-movimentacoes-financeiras.png`

![Tela Movimentações Financeiras](docs/prints/21-movimentacoes-financeiras.png)

## 22. Categorias Financeiras

- Tela: Categorias
- Rota/View: `categorias_financeiras`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro e manutenção de categorias de receita/despesa.
  - Organização dos lançamentos financeiros.
- Print sugerido: `docs/prints/22-categorias-financeiras.png`

![Tela Categorias Financeiras](docs/prints/22-categorias-financeiras.png)

## 23. Metas Financeiras

- Tela: Metas
- Rota/View: `metas_financeiras`
- Perfis: admin, secretaria
- Funcionalidades:
  - Definição de metas com valor alvo e prazo.
  - Acompanhamento de progresso e aportes.
- Print sugerido: `docs/prints/23-metas-financeiras.png`

![Tela Metas Financeiras](docs/prints/23-metas-financeiras.png)

## 24. Orçamentos Financeiros

- Tela: Orçamentos
- Rota/View: `orcamentos_financeiros`
- Perfis: admin, secretaria
- Funcionalidades:
  - Planejamento orçamentário mensal.
  - Comparativo entre previsto e realizado.
- Print sugerido: `docs/prints/24-orcamentos-financeiros.png`

![Tela Orçamentos Financeiros](docs/prints/24-orcamentos-financeiros.png)

## 25. Estoque

- Tela: Estoque Escolar
- Rota/View: `estoque`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro de itens e níveis mínimos.
  - Entrada/saída de estoque.
  - Histórico de movimentações por item.
- Print sugerido: `docs/prints/25-estoque.png`

![Tela Estoque](docs/prints/25-estoque.png)

## 26. Fornecedores

- Tela: Fornecedores
- Rota/View: `fornecedores`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro e edição de fornecedores.
  - Vínculo com produtos e compras operacionais.
- Print sugerido: `docs/prints/26-fornecedores.png`

![Tela Fornecedores](docs/prints/26-fornecedores.png)

## 27. Produtos

- Tela: Produtos
- Rota/View: `produtos`
- Perfis: admin, secretaria
- Funcionalidades:
  - Cadastro de produtos e controle de status.
  - Integração com fornecedores e estoque.
- Print sugerido: `docs/prints/27-produtos.png`

![Tela Produtos](docs/prints/27-produtos.png)

## 28. Cadastro (Perfil)

- Tela: Meu Cadastro
- Rota/View: `cadastro`
- Perfis: todos
- Funcionalidades:
  - Atualização de dados pessoais e contato.
  - Teste de email para validação de entrega.
  - (Aluno) gerenciamento de notificações push no celular.
- Print sugerido: `docs/prints/28-cadastro.png`

![Tela Cadastro](docs/prints/28-cadastro.png)

## 29. Manual Interno

- Tela: Manual
- Rota/View: `manual`
- Perfis: conforme menu por perfil
- Funcionalidades:
  - Exibição do manual consolidado em HTML.
  - Conteúdo de uso, configuração e troubleshooting.
- Print sugerido: `docs/prints/29-manual-interno.png`

![Tela Manual Interno](docs/prints/29-manual-interno.png)

## 30. Escolas (Super Admin Global)

- Tela: Escolas
- Rota/View: `escolas`
- Perfis: super admin global
- Funcionalidades:
  - Visão geral das escolas cadastradas.
  - Configuração de recursos por escola.
  - Gestão de opções de sidebar e feature flags.
- Print sugerido: `docs/prints/30-escolas.png`

![Tela Escolas](docs/prints/30-escolas.png)

## Checklist final de cobertura

- [ ] 01-login
- [ ] 02-dashboard
- [ ] 03-diario
- [ ] 04-frequencia-gestao
- [ ] 05-frequencia-aluno
- [ ] 06-relatorios
- [ ] 07-notificacoes
- [ ] 08-usuarios
- [ ] 09-turmas
- [ ] 10-alunos
- [ ] 11-materiais
- [ ] 12-provas
- [ ] 13-atividades-ead
- [ ] 14-trabalhos-selecao
- [ ] 15-trabalhos-chat
- [ ] 16-forum-selecao
- [ ] 17-forum-chat
- [ ] 18-contas-financeiras
- [ ] 19-receitas
- [ ] 20-despesas
- [ ] 21-movimentacoes-financeiras
- [ ] 22-categorias-financeiras
- [ ] 23-metas-financeiras
- [ ] 24-orcamentos-financeiros
- [ ] 25-estoque
- [ ] 26-fornecedores
- [ ] 27-produtos
- [ ] 28-cadastro
- [ ] 29-manual-interno
- [ ] 30-escolas
