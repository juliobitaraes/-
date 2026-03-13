import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendRelatorios(app) {
    app.renderRelatorios = async function(container) {
        const canView = app.currentUserData && app.perms && app.perms.canViewRelatorios();
        if (!canView) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito.</div>';
            return;
        }
        const showAccess = app.perms && app.perms.canViewAccessLogs();
        if (!app.toggleRelatorioSection) {
            app.toggleRelatorioSection = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Expandir' : 'Recolher';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }
        container.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';

        const logsRaw = showAccess ? await app.getCollection('logs_acesso') : [];
        const turmas = await app.getCollection('turmas');
        const componentes = await app.getCollection('componentes');
        const users = await app.getCollection('users');
        const provas = await app.getCollection('provas');
        const resultados = await app.getCollection('provas_resultados');
        const notasTrabalhos = await app.getCollection('trabalhos_notas');
        const profMap = new Map(users.filter(u => ['professor', 'secretaria'].includes(u.tipo)).map(u => [u.id, u.nome]));
        const cronogramaRows = [];
        const turmasPermitidas = app.perms && app.perms.hasRole('professor', 'secretaria')
            ? app.filterTurmasByProfessor(turmas, componentes)
            : turmas;
        const turmasPermitidasIds = new Set(turmasPermitidas.map(t => t.id));

        turmasPermitidas.forEach(t => {
            const profIdsTurma = Array.isArray(t.professores) ? t.professores : [];
            const profsFromTurma = profIdsTurma.map(id => profMap.get(id)).filter(Boolean);
            const comps = componentes.filter(c => c.turmaId === t.id);
            if (comps.length === 0) {
                const profTexto = profsFromTurma.length > 0 ? profsFromTurma.join(', ') : 'Sem professor';
                cronogramaRows.push({
                    Curso: app.formatTurmaLabelText(t, 'Turma', true),
                    Componente: '-',
                    'Data Inicio': '-',
                    'Data Fim': '-',
                    Professores: profTexto
                });
                return;
            }
            comps.forEach(c => {
                const profIdsComp = Array.isArray(c.professores) ? c.professores : [];
                const profsFromComp = profIdsComp.map(id => profMap.get(id)).filter(Boolean);
                const profTexto = profsFromComp.length > 0
                    ? profsFromComp.join(', ')
                    : (profsFromTurma.length > 0 ? profsFromTurma.join(', ') : 'Sem professor');
                cronogramaRows.push({
                    Curso: app.formatTurmaLabelText(t, 'Turma', true),
                    Componente: c.nome || 'Componente',
                    'Data Inicio': c.dataInicio ? app.formatDateOnly(c.dataInicio) : 'Sem datas',
                    'Data Fim': c.dataFim ? app.formatDateOnly(c.dataFim) : 'Sem datas',
                    Professores: profTexto
                });
            });
        });
        const normalizeDate = (raw) => {
            if (!raw) return null;
            if (typeof raw.toDate === 'function') return raw.toDate();
            if (raw.seconds) return new Date(raw.seconds * 1000);
            const parsed = new Date(raw);
            return isNaN(parsed) ? null : parsed;
        };
        const logs = logsRaw.map(l => {
            const dt = normalizeDate(l.data || l.dataISO || l.dataHora);
            return {
                ...l,
                _date: dt,
                _dateStr: dt ? dt.toLocaleDateString('pt-BR') : '-',
                _timeStr: dt ? dt.toLocaleTimeString('pt-BR') : '-'
            };
        }).sort((a, b) => (b._date ? b._date.getTime() : 0) - (a._date ? a._date.getTime() : 0));

        const tipos = ['todos', 'admin', 'professor', 'aluno'];
        const acoes = Array.from(new Set(logs.map(l => l.acao).filter(Boolean))).sort();
        const stats = logs.reduce((acc, l) => {
            const key = l.userTipo || 'indefinido';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const provasMap = new Map(provas.map(p => [p.id, p]));
        const componentesMap = new Map(componentes.map(c => [c.id, c.nome || 'Componente']));
        const turmasMap = new Map(turmas.map(t => [t.id, app.formatTurmaLabelText(t, 'Turma', true)]));
        const alunosMap = new Map(users.filter(u => u.tipo === 'aluno').map(u => [u.id, u.nome || 'Aluno']));

        const notasEntries = [];
        resultados.forEach(r => {
            const prova = provasMap.get(r.provaId);
            if (!prova) return;
            if (!turmasPermitidasIds.has(prova.turmaId)) return;
            const nota = parseFloat(r.nota);
            if (!Number.isFinite(nota)) return;
            notasEntries.push({
                turmaId: prova.turmaId,
                componenteId: prova.componenteId,
                alunoId: r.alunoId,
                nota
            });
        });
        notasTrabalhos.forEach(n => {
            if (!turmasPermitidasIds.has(n.turmaId)) return;
            const nota = parseFloat(n.nota);
            if (!Number.isFinite(nota)) return;
            notasEntries.push({
                turmaId: n.turmaId,
                componenteId: n.componenteId,
                alunoId: n.alunoId,
                nota
            });
        });

        const accumulate = (entries, key) => entries.reduce((acc, item) => {
            const id = item[key];
            if (!id) return acc;
            if (!acc.has(id)) acc.set(id, { total: 0, count: 0 });
            const row = acc.get(id);
            row.total += item.nota;
            row.count += 1;
            return acc;
        }, new Map());

        const buildAvgList = (map, labelMap) => Array.from(map.entries())
            .map(([id, v]) => ({
                label: labelMap.get(id) || 'Indefinido',
                value: v.count > 0 ? v.total / v.count : 0
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);

        const turmasAvg = buildAvgList(accumulate(notasEntries, 'turmaId'), turmasMap);
        const compsAvg = buildAvgList(accumulate(notasEntries, 'componenteId'), componentesMap);
        const alunosAvg = buildAvgList(accumulate(notasEntries, 'alunoId'), alunosMap);

        const renderBarList = (items, colorClass) => {
            if (!items.length) return '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>';
            return `<div class="space-y-2">${items.map(item => {
                const pct = Math.max(0, Math.min(100, (item.value / 10) * 100));
                return `
                    <div class="flex items-center gap-3">
                        <div class="w-40 text-xs text-gray-600 dark:text-gray-400 truncate">${app.escapeHtml(item.label)}</div>
                        <div class="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded">
                            <div class="h-2 rounded ${colorClass}" style="width: ${pct}%"></div>
                        </div>
                        <div class="w-12 text-xs text-gray-600 dark:text-gray-400 text-right">${item.value.toFixed(1)}</div>
                    </div>
                `;
            }).join('')}</div>`;
        };

        const rendimentosSection = `
            <div class="mt-10">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-chart-line text-purple-600"></i> Rendimentos</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Medias por turmas, componentes e alunos.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="rendimentos-toggle" onclick="app.toggleRelatorioSection('rendimentos-body','rendimentos-toggle')" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm text-sm" aria-expanded="false">
                            <i class="fas fa-chevron-down mr-2"></i><span data-label>Expandir</span>
                        </button>
                    </div>
                </div>
                <div id="rendimentos-body" class="hidden">
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                            <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Turmas</h3>
                            ${renderBarList(turmasAvg, 'bg-blue-600')}
                        </div>
                        <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                            <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Componentes</h3>
                            ${renderBarList(compsAvg, 'bg-purple-600')}
                        </div>
                        <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                            <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Alunos</h3>
                            ${renderBarList(alunosAvg, 'bg-emerald-600')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        const acessoSection = showAccess ? `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-chart-bar text-blue-600"></i> Relatorios de Acesso</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Usuarios, professores e alunos com data, hora e atividades.</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="app.exportRelatoriosExcel(app._relatoriosFiltrados || [])" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm text-sm"><i class="fas fa-file-excel mr-2"></i>Exportar Excel</button>
                    <button id="relatorios-acesso-toggle" onclick="app.toggleRelatorioSection('relatorios-acesso-body','relatorios-acesso-toggle')" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm text-sm" aria-expanded="false">
                        <i class="fas fa-chevron-down mr-2"></i><span data-label>Expandir</span>
                    </button>
                </div>
            </div>
            <div id="relatorios-acesso-body" class="hidden">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <div class="text-xs text-gray-500">Administradores</div>
                        <div class="text-xl font-bold text-gray-800 dark:text-white">${stats.admin || 0}</div>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <div class="text-xs text-gray-500">Professores</div>
                        <div class="text-xl font-bold text-gray-800 dark:text-white">${stats.professor || 0}</div>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <div class="text-xs text-gray-500">Alunos</div>
                        <div class="text-xl font-bold text-gray-800 dark:text-white">${stats.aluno || 0}</div>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                        <div class="text-xs text-gray-500">Total</div>
                        <div class="text-xl font-bold text-gray-800 dark:text-white">${logs.length}</div>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mb-6">
                    <div class="flex flex-col gap-3">
                        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                            <input id="rel-busca" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Buscar por usuario ou atividade">
                            <select id="rel-tipo" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                ${tipos.map(t => `<option value="${t}">${t === 'todos' ? 'Todos os tipos' : app.capitalize(t)}</option>`).join('')}
                            </select>
                            <select id="rel-acao" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="todos">Todas as acoes</option>
                                <option value="atividade_realizada">Atividade EAD Realizada</option>
                                ${acoes.map(a => `<option value="${a}">${a}</option>`).join('')}
                            </select>
                            <input id="rel-data-inicio" type="date" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <input id="rel-data-fim" type="date" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div class="flex justify-end">
                            <button onclick="app.limparFiltrosRelatorios()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-sm text-sm">
                                <i class="fas fa-eraser mr-2"></i>Limpar Filtros
                            </button>
                        </div>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="px-4 py-3 border-b dark:border-slate-700 flex justify-between items-center">
                        <h3 class="font-semibold text-gray-800 dark:text-white">Registros</h3>
                        <span id="rel-total" class="text-xs text-gray-500">0 resultados</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
                                <tr>
                                    <th class="p-3 text-xs uppercase tracking-wider">Data</th>
                                    <th class="p-3 text-xs uppercase tracking-wider">Hora</th>
                                    <th class="p-3 text-xs uppercase tracking-wider">Usuario</th>
                                    <th class="p-3 text-xs uppercase tracking-wider">Tipo</th>
                                    <th class="p-3 text-xs uppercase tracking-wider">Atividade</th>
                                    <th class="p-3 text-xs uppercase tracking-wider">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody id="rel-rows" class="dark:text-gray-300"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        ` : '';

        const cronogramaSection = `
            <div class="mt-10">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-calendar-alt text-emerald-600"></i> Cronograma dos Cursos</h2>
                        <p class="text-sm text-gray-500 dark:text-gray-400">Cursos, componentes curriculares, datas e professores.</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="app.exportRelatoriosExcel(app._cronogramaRows || [], 'Cronograma_Cursos.xlsx')" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm text-sm"><i class="fas fa-file-excel mr-2"></i>Exportar Excel</button>
                        <button id="cronograma-toggle" onclick="app.toggleRelatorioSection('cronograma-body','cronograma-toggle')" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 shadow-sm text-sm" aria-expanded="false">
                            <i class="fas fa-chevron-down mr-2"></i><span data-label>Expandir</span>
                        </button>
                    </div>
                </div>
                <div id="cronograma-body" class="hidden">
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 mb-6">
                        <div class="flex flex-col gap-3">
                            <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                                <input id="cronograma-busca" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Buscar curso, componente ou professor">
                                <select id="cronograma-curso" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option value="todos">Todos os cursos</option>
                                    ${Array.from(new Set(cronogramaRows.map(r => r.Curso).filter(Boolean))).sort().map(c => `<option value="${app.escapeHtml(c)}">${app.escapeHtml(c)}</option>`).join('')}
                                </select>
                                <select id="cronograma-prof" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option value="todos">Todos os professores</option>
                                    ${Array.from(new Set(cronogramaRows.flatMap(r => String(r.Professores || '').split(',').map(p => p.trim())).filter(Boolean))).sort().map(p => `<option value="${app.escapeHtml(p)}">${app.escapeHtml(p)}</option>`).join('')}
                                </select>
                                <input id="cronograma-inicio" type="date" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <input id="cronograma-fim" type="date" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            </div>
                            <div class="flex justify-end">
                                <button onclick="app.limparFiltrosCronograma()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow-sm text-sm">
                                    <i class="fas fa-eraser mr-2"></i>Limpar Filtros
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full text-left">
                                <thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
                                    <tr>
                                        <th class="p-3 text-xs uppercase tracking-wider">Curso</th>
                                        <th class="p-3 text-xs uppercase tracking-wider">Componente</th>
                                        <th class="p-3 text-xs uppercase tracking-wider">Data Inicio</th>
                                        <th class="p-3 text-xs uppercase tracking-wider">Data Fim</th>
                                        <th class="p-3 text-xs uppercase tracking-wider">Professores</th>
                                    </tr>
                                </thead>
                                <tbody id="cronograma-rows" class="dark:text-gray-300"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = acessoSection + rendimentosSection + cronogramaSection;

        const buscaEl = document.getElementById('rel-busca');
        const tipoEl = document.getElementById('rel-tipo');
        const acaoEl = document.getElementById('rel-acao');
        const inicioEl = document.getElementById('rel-data-inicio');
        const fimEl = document.getElementById('rel-data-fim');
        const rowsEl = document.getElementById('rel-rows');
        const totalEl = document.getElementById('rel-total');

        const renderRows = () => {
            if (!rowsEl || !totalEl) return;
            const term = (buscaEl?.value || '').trim().toLowerCase();
            const tipo = tipoEl?.value || 'todos';
            const acao = acaoEl?.value || 'todos';
            const dtIni = inicioEl?.value ? new Date(inicioEl.value + 'T00:00:00') : null;
            const dtFim = fimEl?.value ? new Date(fimEl.value + 'T23:59:59') : null;

            const filtrados = logs.filter(l => {
                if (tipo !== 'todos' && l.userTipo !== tipo) return false;
                if (acao !== 'todos' && l.acao !== acao) return false;
                if (dtIni && (!l._date || l._date < dtIni)) return false;
                if (dtFim && (!l._date || l._date > dtFim)) return false;
                if (!term) return true;
                const haystack = `${l.userNome || ''} ${l.acao || ''} ${l.detalhes || ''}`.toLowerCase();
                return haystack.includes(term);
            });

            // Função para formatar nome da ação de forma amigável
            const formatarAcao = (acao) => {
                const mapeamento = {
                    'atividade_realizada': 'Atividade EAD Realizada',
                    'prova_realizada': 'Prova Realizada',
                    'atividade_criada': 'Atividade Criada',
                    'atividade_editada': 'Atividade Editada',
                    'atividade_excluida': 'Atividade Excluída',
                    'prova_criada': 'Prova Criada',
                    'prova_editada': 'Prova Editada',
                    'prova_excluida': 'Prova Excluída',
                    'login': 'Login',
                    'logout': 'Logout',
                    'navegar': 'Navegação',
                    'turma_excluida': 'Turma Excluída',
                    'componente_editado': 'Componente Editado',
                    'aluno_cadastrado': 'Aluno Cadastrado'
                };
                return mapeamento[acao] || acao;
            };

            app._relatoriosFiltrados = filtrados.map(l => ({
                Data: l._dateStr,
                Hora: l._timeStr,
                Usuario: l.userNome || 'Usuario',
                Tipo: l.userTipo || 'indefinido',
                Atividade: formatarAcao(l.acao) || '-',
                Detalhes: l.detalhes || '-'
            }));

            if (filtrados.length === 0) {
                rowsEl.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-sm text-gray-500">Nenhum registro encontrado.</td></tr>';
                totalEl.textContent = '0 resultados';
                return;
            }

            rowsEl.innerHTML = filtrados.map(l => {
                const nome = app.escapeHtml(l.userNome || 'Usuario');
                const detalhes = app.escapeHtml(l.detalhes || '-');
                const atividadeOriginal = l.acao || '-';
                const atividade = app.escapeHtml(formatarAcao(atividadeOriginal));
                return `
                    <tr class="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                        <td class="p-3 text-sm">${l._dateStr}</td>
                        <td class="p-3 text-sm">${l._timeStr}</td>
                        <td class="p-3 text-sm font-medium">${nome}</td>
                        <td class="p-3 text-sm">${app.capitalize(l.userTipo || 'indefinido')}</td>
                        <td class="p-3 text-sm">${atividade}</td>
                        <td class="p-3 text-sm text-gray-500 dark:text-gray-400">${detalhes}</td>
                    </tr>
                `;
            }).join('');
            totalEl.textContent = `${filtrados.length} resultado(s)`;
        };

        const cronogramaBusca = document.getElementById('cronograma-busca');
        const cronogramaCurso = document.getElementById('cronograma-curso');
        const cronogramaProf = document.getElementById('cronograma-prof');
        const cronogramaInicio = document.getElementById('cronograma-inicio');
        const cronogramaFim = document.getElementById('cronograma-fim');
        const cronogramaEl = document.getElementById('cronograma-rows');

        const renderCronograma = () => {
            const term = (cronogramaBusca?.value || '').trim().toLowerCase();
            const curso = cronogramaCurso?.value || 'todos';
            const prof = cronogramaProf?.value || 'todos';
            const dtIni = cronogramaInicio?.value ? new Date(cronogramaInicio.value + 'T00:00:00') : null;
            const dtFim = cronogramaFim?.value ? new Date(cronogramaFim.value + 'T23:59:59') : null;

            const filtrados = cronogramaRows.filter(r => {
                if (curso !== 'todos' && r.Curso !== curso) return false;
                if (prof !== 'todos' && !String(r.Professores || '').includes(prof)) return false;
                if (dtIni || dtFim) {
                    const dInicio = app.parseDateOnly(r['Data Inicio']);
                    if (dtIni && (!dInicio || dInicio < dtIni)) return false;
                    if (dtFim && (!dInicio || dInicio > dtFim)) return false;
                }
                if (!term) return true;
                const haystack = `${r.Curso || ''} ${r.Componente || ''} ${r.Professores || ''}`.toLowerCase();
                return haystack.includes(term);
            });

            app._cronogramaRows = filtrados;
            if (!cronogramaEl) return;
            cronogramaEl.innerHTML = filtrados.map(r => `
                <tr class="border-b last:border-0 border-gray-100 dark:border-slate-700">
                    <td class="p-3">${app.escapeHtml(r.Curso || '')}</td>
                    <td class="p-3">${app.escapeHtml(r.Componente || '')}</td>
                    <td class="p-3">${app.escapeHtml(r['Data Inicio'] || '')}</td>
                    <td class="p-3">${app.escapeHtml(r['Data Fim'] || '')}</td>
                    <td class="p-3">${app.escapeHtml(r.Professores || '')}</td>
                </tr>
            `).join('');
        };

        if (cronogramaBusca) cronogramaBusca.addEventListener('input', renderCronograma);
        if (cronogramaCurso) cronogramaCurso.addEventListener('change', renderCronograma);
        if (cronogramaProf) cronogramaProf.addEventListener('change', renderCronograma);
        if (cronogramaInicio) cronogramaInicio.addEventListener('change', renderCronograma);
        if (cronogramaFim) cronogramaFim.addEventListener('change', renderCronograma);
        renderCronograma();

        if (showAccess && buscaEl && tipoEl && acaoEl && inicioEl && fimEl) {
            [buscaEl, tipoEl, acaoEl, inicioEl, fimEl].forEach(el => el.addEventListener('input', renderRows));
            renderRows();
        }
    };

    app.limparFiltrosRelatorios = function() {
        const buscaEl = document.getElementById('rel-busca');
        const tipoEl = document.getElementById('rel-tipo');
        const acaoEl = document.getElementById('rel-acao');
        const inicioEl = document.getElementById('rel-data-inicio');
        const fimEl = document.getElementById('rel-data-fim');
        
        if (buscaEl) buscaEl.value = '';
        if (tipoEl) tipoEl.value = 'todos';
        if (acaoEl) acaoEl.value = 'todos';
        if (inicioEl) inicioEl.value = '';
        if (fimEl) fimEl.value = '';
        
        // Trigger the filter update
        if (buscaEl) buscaEl.dispatchEvent(new Event('input'));
    };

    app.limparFiltrosCronograma = function() {
        const cronogramaBusca = document.getElementById('cronograma-busca');
        const cronogramaCurso = document.getElementById('cronograma-curso');
        const cronogramaProf = document.getElementById('cronograma-prof');
        const cronogramaInicio = document.getElementById('cronograma-inicio');
        const cronogramaFim = document.getElementById('cronograma-fim');
        
        if (cronogramaBusca) cronogramaBusca.value = '';
        if (cronogramaCurso) cronogramaCurso.value = 'todos';
        if (cronogramaProf) cronogramaProf.value = 'todos';
        if (cronogramaInicio) cronogramaInicio.value = '';
        if (cronogramaFim) cronogramaFim.value = '';
        
        // Trigger the filter update
        if (cronogramaBusca) cronogramaBusca.dispatchEvent(new Event('input'));
    };

    app.renderUsuarios = async function(container) {
        if (!app.currentUserData || !(app.perms && app.perms.canManageUsuarios())) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito.</div>';
            return;
        }
        const allUsers = (await app.getCollection('users'))
            .filter(u => ['admin', 'professor', 'secretaria'].includes(u.tipo))
            .sort((a, b) => (a.tipo === b.tipo
                ? String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
                : (a.tipo === 'admin' ? -1 : 1)));

        container.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-users-cog text-blue-600"></i> Usuários</h2>
                <div class="flex flex-wrap gap-2">
                    <button onclick="app.modalAdmin()" class="px-3 py-2 bg-blue-700 text-white rounded text-sm hover:bg-blue-800">Novo Administrador</button>
                    <button onclick="app.modalProfessor()" class="px-3 py-2 bg-blue-700 text-white rounded text-sm hover:bg-blue-800">Novo Professor</button>
                    <button onclick="app.modalSecretaria()" class="px-3 py-2 bg-blue-700 text-white rounded text-sm hover:bg-blue-800">Nova Secretaria</button>
                </div>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <table class="w-full text-left">
                    <thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
                        <tr>
                            <th class="p-3">Nome</th>
                            <th class="p-3">Email</th>
                            <th class="p-3">Tipo</th>
                            <th class="p-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300">
                        ${allUsers.map(u => {
                            const isAdmin = u.tipo === 'admin';
                            const isProfessor = u.tipo === 'professor';
                            const isSecretaria = u.tipo === 'secretaria';
                            const tipoLabel = isAdmin ? 'Administrador' : (isProfessor ? 'Professor' : 'Secretaria');
                            return `
                                <tr>
                                    <td class="p-3">${u.nome}</td>
                                    <td class="p-3">${u.email}</td>
                                    <td class="p-3">${tipoLabel}</td>
                                    <td class="p-3 text-right">
                                        ${isProfessor ? `<button onclick="app.promoverProfessor('${u.id}')" class="text-green-600 hover:text-green-800 mr-3" title="Promover a Administrador"><i class="fas fa-user-shield"></i></button>` : ''}
                                        <button onclick="app.sendPasswordReset('${u.email}')" class="text-yellow-500 hover:text-yellow-700 mr-3" title="Redefinir Senha"><i class="fas fa-key"></i></button>
                                        ${isAdmin ? `<button onclick="app.modalAdmin('${u.id}')" class="text-blue-600 dark:text-blue-400 mr-2"><i class="fas fa-edit"></i></button>` : (isProfessor ? `<button onclick="app.modalProfessor('${u.id}')" class="text-blue-600 dark:text-blue-400 mr-2"><i class="fas fa-edit"></i></button>` : `<button onclick="app.modalSecretaria('${u.id}')" class="text-blue-600 dark:text-blue-400 mr-2"><i class="fas fa-edit"></i></button>`)}
                                        ${isAdmin ? `<button onclick="app.demoverAdmin('${u.id}')" class="text-orange-500 mr-3" title="Rebaixar para Professor"><i class="fas fa-user-minus"></i></button>` : ''}
                                        <button onclick="app.deleteUsuario('${u.id}')" class="text-red-500 dark:text-red-400"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    };

    app.confirmConcluirTurma = function(turmaId, turmaLabel) {
        if (!turmaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canConcluirTurma && app.perms.canConcluirTurma())) {
            return alert('Acesso restrito.');
        }
        const safeLabel = app.escapeHtml(turmaLabel || 'Turma');
        const content = `
            <div class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p>Deseja concluir a turma <strong>${safeLabel}</strong>?</p>
                <p>Essa ação move o diário para a área de Turmas Concluídas e não afeta os dados registrados.</p>
            </div>
        `;
        app.showModal('Concluir Turma', content, async () => {
            await db.collection('turmas').doc(turmaId).update({
                concluida: true,
                concluidaEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (app.logAcesso) app.logAcesso('turma_concluida', safeLabel);
            app.renderContent();
        }, {
            confirmLabel: 'Concluir',
            confirmClass: 'px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700'
        });
    };

    app.confirmReabrirTurma = function(turmaId, turmaLabel) {
        if (!turmaId) return;
        const safeLabel = app.escapeHtml(turmaLabel || 'Turma');
        const content = `
            <div class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p>Deseja reabrir a turma <strong>${safeLabel}</strong>?</p>
                <p>Essa ação move o diário de volta para a sessão de Diário.</p>
            </div>
        `;
        app.showModal('Reabrir Turma', content, async () => {
            await db.collection('turmas').doc(turmaId).update({
                concluida: false,
                concluidaEm: firebase.firestore.FieldValue.delete(),
                reabertaEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (app.logAcesso) app.logAcesso('turma_reaberta', safeLabel);
            app.renderContent();
        }, {
            confirmLabel: 'Reabrir',
            confirmClass: 'px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800'
        });
    };

}