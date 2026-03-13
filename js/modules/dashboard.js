import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendDashboard(app) {
    app.renderDashboard = async function(container) {
        if (!app.toggleDashboardSection) {
            app.toggleDashboardSection = function(contentId, buttonId) {
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
        const allTurmas = await app.getCollection('turmas');
        const turmasAtivas = allTurmas.filter(t => !t.concluida);
        const componentes = await app.getComponentesCache();
        let minhasTurmas = turmasAtivas; let meusIdsTurmas = [];
        if (app.perms && app.perms.hasRole('professor', 'secretaria')) { minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentes); }
        else if (app.perms && app.perms.isAluno()) { minhasTurmas = turmasAtivas.filter(t => t.alunos && t.alunos.includes(app.currentUserData.id)); }
        meusIdsTurmas = minhasTurmas.map(t => t.id);

        const provas = await app.getCollection('provas');
        let provasRelevantes = provas
            .filter(p => meusIdsTurmas.includes(p.turmaId))
            .filter(p => p.published === true);
        const eventosAdmin = await app.getCollection('eventos_calendario');
        const normalizeTipo = (tipo) => String(tipo || '').trim().toLowerCase();
        const eventosAdminNormalizados = eventosAdmin.map(e => ({
            ...e,
            titulo: e.titulo,
            tipo: normalizeTipo(e.tipo),
            dataAgendada: e.data,
            turmaNome: 'Geral'
        }));
        const view = app.ensureCalendarView();
        const turmasMap = new Map(turmasAtivas.map(t => [t.id, app.formatTurmaLabelText(t, 'Turma', true)]));
        const componentMatchesUser = (comp) => {
            if (app.perms && app.perms.isAdmin()) return true;
            const userId = app.currentUserData.id;
            const hasProfFields = Array.isArray(comp.professores)
                || Array.isArray(comp.professorIds)
                || Boolean(comp.professorId)
                || Boolean(comp.professorUid);
            const hasAlunoFields = Array.isArray(comp.alunos)
                || Array.isArray(comp.alunoIds)
                || Array.isArray(comp.alunosIds);

            if (app.perms && app.perms.hasRole('professor', 'secretaria')) {
                if (!hasProfFields) return true;
                return app.componentHasProfessor(comp, userId);
            }

            if (app.perms && app.perms.isAluno()) {
                if (!hasAlunoFields) return true;
                if (Array.isArray(comp.alunos) && comp.alunos.includes(userId)) return true;
                if (Array.isArray(comp.alunoIds) && comp.alunoIds.includes(userId)) return true;
                if (Array.isArray(comp.alunosIds) && comp.alunosIds.includes(userId)) return true;
                return false;
            }

            return false;
        };
        const componentesRelevantes = componentes
            .filter(c => meusIdsTurmas.includes(c.turmaId))
            .filter(componentMatchesUser);
        const toDateKey = (value) => {
            if (!value) return null;
            const parsed = app.parseDateOnly(value);
            if (!parsed || Number.isNaN(parsed)) return null;
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
        };
        const feriadosSet = new Set(
            eventosAdminNormalizados
                .filter(e => e.tipo === 'feriado' || e.tipo === 'recesso')
                .map(e => toDateKey(e.dataAgendada))
                .filter(Boolean)
        );
        const componentesEventos = app.buildComponentRangeEvents(componentesRelevantes, turmasMap, view.month, view.year, feriadosSet);
        const todosEventos = [...provasRelevantes, ...eventosAdminNormalizados, ...componentesEventos];
        const eventosAlertas = [...provasRelevantes, ...eventosAdminNormalizados];
        todosEventos.sort((a,b) => new Date(a.dataAgendada || 0) - new Date(b.dataAgendada || 0));
        app._calendarEventsCache = todosEventos;
        app._calendarBaseCache = {
            provasRelevantes,
            eventosAdminNormalizados,
            componentesRelevantes,
            feriadosSet,
            turmasMap
        };

        const today = new Date();
        const proximosAlertas = eventosAlertas
            .filter(p => { if (!p.dataAgendada) return false; const dataP = new Date(p.dataAgendada); const diff = dataP - today; return diff >= 0; })
            .sort((a, b) => new Date(a.dataAgendada || 0) - new Date(b.dataAgendada || 0));

        const todosAvisos = (await app.getCollection('avisos')).sort((a,b) => b.criadoEm - a.criadoEm);
        const avisosVisiveis = todosAvisos.filter(aviso => {
            if (app.perms && app.perms.isAdmin()) return true;
            if (aviso.tipo === 'geral') return true;
            if (aviso.tipo === 'colaboradores' && app.perms && app.perms.hasRole('admin', 'professor')) return true;
            if (aviso.tipo === 'aluno' && app.perms && app.perms.isProfessor()) return true;
            if (aviso.tipo === 'aluno' && app.perms && app.perms.isAluno() && aviso.alunoId === app.currentUserData.id) return true;
            if (aviso.tipo === 'turma' && meusIdsTurmas.includes(aviso.turmaId)) return true;
            if (app.perms && app.perms.isProfessor() && aviso.autorId === app.currentUserData.id) return true;
            return false;
        });

        let htmlRendimentos = '';
        if (app.perms && app.perms.hasRole('admin', 'professor')) {
            const resultados = await app.getCollection('provas_resultados');
            const notasTrabalhos = await app.getCollection('trabalhos_notas');
            const users = await app.getCollection('users');
            const allowedTurmas = new Set(meusIdsTurmas);
            const provasMap = new Map(provas.map(p => [p.id, p]));
            const componentesMap = new Map(componentes.map(c => [c.id, c.nome || 'Componente']));
            const turmasMap = new Map(turmasAtivas.map(t => [t.id, app.formatTurmaLabelText(t, 'Turma', true)]));
            const alunosMap = new Map(users.filter(u => u.tipo === 'aluno').map(u => [u.id, u.nome || 'Aluno']));

            const notasEntries = [];
            const toMillis = (value) => {
                if (!value) return 0;
                if (typeof value.toDate === 'function') {
                    const d = value.toDate();
                    return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
                }
                if (typeof value.seconds === 'number') return value.seconds * 1000;
                const d = new Date(value);
                const ms = d.getTime();
                return Number.isFinite(ms) ? ms : 0;
            };
            resultados.forEach(r => {
                const prova = provasMap.get(r.provaId);
                if (!prova) return;
                if (!allowedTurmas.has(prova.turmaId)) return;
                const nota = parseFloat(r.nota);
                if (!Number.isFinite(nota)) return;
                notasEntries.push({
                    turmaId: prova.turmaId,
                    componenteId: prova.componenteId,
                    alunoId: r.alunoId,
                    nota,
                    dataMs: toMillis(r.data) || toMillis(prova.dataAgendada)
                });
            });
            notasTrabalhos.forEach(n => {
                if (!allowedTurmas.has(n.turmaId)) return;
                const nota = parseFloat(n.nota);
                if (!Number.isFinite(nota)) return;
                notasEntries.push({
                    turmaId: n.turmaId,
                    componenteId: n.componenteId,
                    alunoId: n.alunoId,
                    nota,
                    dataMs: toMillis(n.criadoEm)
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

            const buildAvgList = (map, labelMap, fallbackLabel = 'Indefinido', dropMissingLabel = false) => Array.from(map.entries())
                .map(([id, v]) => ({
                    label: labelMap.get(id) || fallbackLabel,
                    value: v.count > 0 ? v.total / v.count : 0,
                    _hasLabel: labelMap.has(id)
                }))
                .filter((item) => !(dropMissingLabel && !item._hasLabel))
                .map(({ label, value }) => ({ label, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 12);

            const turmasAvg = buildAvgList(accumulate(notasEntries, 'turmaId'), turmasMap, 'Turma removida');

            const compsTurmaMap = notasEntries.reduce((acc, item) => {
                if (!item.turmaId || !item.componenteId) return acc;
                const key = `${item.turmaId}::${item.componenteId}`;
                if (!acc.has(key)) acc.set(key, { total: 0, count: 0 });
                const row = acc.get(key);
                row.total += item.nota;
                row.count += 1;
                return acc;
            }, new Map());

            const compsPorTurmaGrouped = Array.from(compsTurmaMap.entries()).reduce((acc, [key, v]) => {
                const [turmaId, compId] = key.split('::');
                if (!turmaId) return acc;
                if (!componentesMap.has(compId)) return acc;
                if (!acc.has(turmaId)) acc.set(turmaId, []);
                acc.get(turmaId).push({
                    label: componentesMap.get(compId) || 'Componente removido',
                    value: v.count > 0 ? v.total / v.count : 0
                });
                return acc;
            }, new Map());

            const compsPorTurmaAvg = Array.from(compsPorTurmaGrouped.entries())
                .map(([turmaId, items]) => ({
                    turmaId,
                    turmaLabel: (turmasMap.get(turmaId) || 'Turma removida').replace(/\n/g, ' '),
                    items: items.sort((a, b) => b.value - a.value).slice(0, 8)
                }))
                .sort((a, b) => a.turmaLabel.localeCompare(b.turmaLabel, 'pt-BR', { sensitivity: 'base' }));

            const validAlunosIds = new Set(users.filter(u => u.tipo === 'aluno').map(u => u.id));
            const alunosPorCurso = minhasTurmas
                .map(t => ({
                    label: app.formatTurmaLabelText(t, 'Turma', true).replace(/\n/g, ' '),
                    value: (t.alunos || []).filter(id => validAlunosIds.has(id)).length
                }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 12);

            const alunosPorCursoMap = notasEntries.reduce((acc, item) => {
                if (!item.turmaId || !item.alunoId) return acc;
                if (!acc.has(item.turmaId)) acc.set(item.turmaId, new Map());
                const alunosMapByTurma = acc.get(item.turmaId);
                if (!alunosMapByTurma.has(item.alunoId)) alunosMapByTurma.set(item.alunoId, { total: 0, count: 0, componentes: new Map() });
                const alunoData = alunosMapByTurma.get(item.alunoId);
                alunoData.total += item.nota;
                alunoData.count += 1;
                if (item.componenteId) {
                    if (!alunoData.componentes.has(item.componenteId)) alunoData.componentes.set(item.componenteId, 0);
                    alunoData.componentes.set(item.componenteId, alunoData.componentes.get(item.componenteId) + item.nota);
                }
                return acc;
            }, new Map());

            const alunosClassificadosPorCurso = Array.from(alunosPorCursoMap.entries())
                .map(([turmaId, alunosMapByTurma]) => {
                    const cursoLabel = (turmasMap.get(turmaId) || 'Turma removida').replace(/\n/g, ' ');
                    const ranking = Array.from(alunosMapByTurma.entries())
                        .map(([alunoId, stats]) => ({
                            alunoId,
                            alunoNome: alunosMap.get(alunoId) || 'Aluno removido',
                            media: stats.count > 0 ? (stats.total / stats.count) : 0,
                            totalGeral: stats.total,
                            componentes: Array.from(stats.componentes.entries())
                                .map(([componenteId, total]) => ({
                                    componenteId,
                                    componenteNome: componentesMap.get(componenteId) || 'Componente',
                                    total
                                }))
                                .sort((a, b) => {
                                    if (b.total !== a.total) return b.total - a.total;
                                    return a.componenteNome.localeCompare(b.componenteNome, 'pt-BR', { sensitivity: 'base' });
                                })
                        }))
                        .sort((a, b) => {
                            if (b.media !== a.media) return b.media - a.media;
                            return a.alunoNome.localeCompare(b.alunoNome, 'pt-BR', { sensitivity: 'base' });
                        })
                        .slice(0, 12);
                    return { turmaId, cursoLabel, ranking };
                })
                .sort((a, b) => a.cursoLabel.localeCompare(b.cursoLabel, 'pt-BR', { sensitivity: 'base' }));

            const turmaComponenteAtualMap = notasEntries.reduce((acc, item) => {
                if (!item.turmaId || !item.componenteId) return acc;
                const prev = acc.get(item.turmaId);
                const dataMs = Number.isFinite(item.dataMs) ? item.dataMs : 0;
                if (!prev || dataMs > prev.dataMs) {
                    acc.set(item.turmaId, { componenteId: item.componenteId, dataMs });
                }
                return acc;
            }, new Map());

            const alunosPorComponenteAtual = alunosClassificadosPorCurso
                .map((group) => {
                    const atual = turmaComponenteAtualMap.get(group.turmaId);
                    if (!atual || !atual.componenteId) return null;

                    const notasAtualComp = notasEntries.filter(entry => entry.turmaId === group.turmaId && entry.componenteId === atual.componenteId);
                    if (!notasAtualComp.length) return null;

                    const ultimoRegistroPorAluno = notasAtualComp.reduce((acc, entry) => {
                        if (!entry.alunoId) return acc;
                        const prev = acc.get(entry.alunoId);
                        const entryData = Number.isFinite(entry.dataMs) ? entry.dataMs : 0;
                        const prevData = prev && Number.isFinite(prev.dataMs) ? prev.dataMs : 0;
                        if (!prev || entryData > prevData || (entryData === prevData && entry.nota > prev.nota)) {
                            acc.set(entry.alunoId, entry);
                        }
                        return acc;
                    }, new Map());

                    const ranking = Array.from(ultimoRegistroPorAluno.entries())
                        .map(([alunoId, entry]) => ({
                            alunoId,
                            alunoNome: alunosMap.get(alunoId) || 'Aluno removido',
                            nota: Number.isFinite(entry.nota) ? entry.nota : 0
                        }))
                        .sort((a, b) => {
                            if (b.nota !== a.nota) return b.nota - a.nota;
                            return a.alunoNome.localeCompare(b.alunoNome, 'pt-BR', { sensitivity: 'base' });
                        })
                        .slice(0, 12);

                    return {
                        turmaId: group.turmaId,
                        cursoLabel: group.cursoLabel,
                        componenteNome: componentesMap.get(atual.componenteId) || 'Componente',
                        ranking
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.cursoLabel.localeCompare(b.cursoLabel, 'pt-BR', { sensitivity: 'base' }));

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

            const renderBarListScaled = (items, colorClass, options = {}) => {
                if (!items.length) return '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>';
                const maxValue = Number.isFinite(options.maxValue) && options.maxValue > 0
                    ? options.maxValue
                    : Math.max(...items.map(item => item.value), 1);
                const formatValue = options.formatValue || ((v) => String(v));
                return `<div class="space-y-2">${items.map(item => {
                    const pct = Math.max(0, Math.min(100, (item.value / maxValue) * 100));
                    return `
                        <div class="flex items-center gap-3">
                            <div class="w-40 text-xs text-gray-600 dark:text-gray-400 truncate">${app.escapeHtml(item.label)}</div>
                            <div class="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded">
                                <div class="h-2 rounded ${colorClass}" style="width: ${pct}%"></div>
                            </div>
                            <div class="w-12 text-xs text-gray-600 dark:text-gray-400 text-right">${formatValue(item.value)}</div>
                        </div>
                    `;
                }).join('')}</div>`;
            };

            const renderPieChart = (items) => {
                if (!items.length) return '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>';
                const total = items.reduce((sum, item) => sum + item.value, 0);
                if (!Number.isFinite(total) || total <= 0) {
                    return '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>';
                }
                const colors = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#84cc16'];
                let cursor = 0;
                const slices = items.map((item, idx) => {
                    const pct = (item.value / total) * 100;
                    const start = cursor;
                    const end = cursor + pct;
                    cursor = end;
                    return {
                        label: item.label,
                        value: item.value,
                        pct,
                        color: colors[idx % colors.length],
                        start,
                        end
                    };
                });
                const gradient = slices.map(s => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`).join(', ');
                const legend = slices.map(s => `
                    <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${s.color}"></span>
                            <span class="truncate">${app.escapeHtml(s.label)}</span>
                        </div>
                        <span>${Math.round(s.pct)}% • ${Math.round(s.value)}</span>
                    </div>
                `).join('');
                return `
                    <div class="flex flex-col md:flex-row items-center gap-4">
                        <div class="w-40 h-40 rounded-full" style="background: conic-gradient(${gradient});"></div>
                        <div class="flex-1 w-full space-y-2">${legend}</div>
                    </div>
                `;
            };

            const renderAlunosPorCurso = (groups) => {
                if (!groups.length) return '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>';
                return `
                    <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        ${groups.map(group => {
                            if (!group.ranking.length) return '';
                            return `
                                <div class="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                                    <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">${app.escapeHtml(group.cursoLabel)}</h4>
                                    <h5 class="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">${app.escapeHtml(group.componenteNome)}</h5>
                                    <div class="space-y-1.5">
                                        ${group.ranking.map((aluno, idx) => {
                                            return `
                                                <div class="flex items-center justify-between gap-2 text-xs">
                                                    <div class="flex items-center gap-2 min-w-0 flex-1">
                                                        <span class="w-5 text-center font-bold text-gray-500 dark:text-gray-400">${idx + 1}</span>
                                                        <span class="truncate text-gray-700 dark:text-gray-200">${app.escapeHtml(aluno.alunoNome)}</span>
                                                    </div>
                                                    <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" title="Nota">
                                                        Nota: ${aluno.nota.toFixed(1)}
                                                    </span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            };

            htmlRendimentos = `
                <div class="w-full mt-2">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-chart-line text-purple-600"></i> Rendimentos</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Medias por turmas e componentes por turma, com total de alunos por curso.</p>
                        </div>
                    </div>
                    <div id="dash-rendimentos-body">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                                <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Media das Turmas</h3>
                                ${renderBarList(turmasAvg, 'bg-blue-600')}
                            </div>
                            <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                                <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Componentes por Turma</h3>
                                ${compsPorTurmaAvg.length === 0 ? '<p class="text-sm text-gray-500 dark:text-gray-400">Sem dados para exibir.</p>' : `
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        ${compsPorTurmaAvg.map(t => `
                                            <div class="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                                                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">${app.escapeHtml(t.turmaLabel)}</h4>
                                                ${renderBarList(t.items, 'bg-purple-600')}
                                            </div>
                                        `).join('')}
                                    </div>
                                `}
                            </div>
                            <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                                <h3 class="font-semibold text-gray-800 dark:text-white mb-3">Alunos por Curso</h3>
                                ${renderPieChart(alunosPorCurso)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        let htmlSistema = '';
        if (app.perms && app.perms.canManageSistema()) {
            htmlSistema = `
                <div class="w-full mt-2">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-server text-slate-700"></i> Sistema</h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400">Backup da base de dados e ferramentas administrativas.</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="app.backupSistema()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm text-sm"><i class="fas fa-download mr-2"></i>Backup da Base</button>
                            <button onclick="app.testarIA()" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 shadow-sm text-sm"><i class="fas fa-robot mr-2"></i>Testar IA</button>
                        </div>
                    </div>
                </div>
            `;
        }

        let htmlCalendar = `
            <div class="mb-10 flex flex-col lg:flex-row gap-6">
                <div class="w-full lg:flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold flex items-center gap-2 dark:text-white"><i class="fas fa-calendar-alt text-blue-600"></i> Agenda Acadêmica</h2>
                        ${app.perms && app.perms.canManageSistema() ? `<button onclick="app.modalEventoCalendario()" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full border border-gray-300 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600"><i class="fas fa-cog"></i> Gerenciar Agenda</button>` : ''}
                    </div>
                    <div id="dashboard-calendar-body">
                        ${app.generateCalendarHTML(todosEventos, view.month, view.year)}
                    </div>
                </div>
                <div class="w-full lg:w-1/3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <h2 class="text-xl font-bold mb-4 flex items-center gap-2 dark:text-white"><i class="fas fa-bell text-red-500"></i> Próximos Prazos</h2>
                    <div class="space-y-3 max-h-[300px] overflow-y-auto">
                        ${proximosAlertas.length === 0 ? '<p class="text-gray-500 text-sm italic">Nenhuma atividade agendada.</p>' : proximosAlertas.slice(0,5).map(p => { const dataP = new Date(p.dataAgendada); const diffMs = dataP - today; const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); let alertClass = 'border-l-4 border-blue-500'; let icon = 'fa-calendar-day text-blue-500'; let urgencyText = 'No Prazo'; let urgencyColor = 'text-blue-600'; const isGreenType = ['evento', 'feriado', 'recesso'].includes(p.tipo); if (isGreenType) { alertClass = 'border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20'; icon = p.tipo === 'feriado' ? 'fa-umbrella-beach text-green-600' : (p.tipo === 'recesso' ? 'fa-pause-circle text-green-600' : 'fa-calendar-check text-green-600'); urgencyText = p.tipo === 'feriado' ? 'Feriado' : (p.tipo === 'recesso' ? 'Recesso' : 'Evento'); urgencyColor = 'text-green-600'; if (diffDias < 1) { alertClass = 'border-l-4 border-green-600 bg-green-100 dark:bg-green-900/30'; urgencyColor = 'text-green-800 font-bold'; } else if (diffDias <= 3) { alertClass = 'border-l-4 border-green-600 bg-green-50 dark:bg-green-900/25'; urgencyColor = 'text-green-700 font-bold'; } } else { if(diffDias < 1) { alertClass = 'border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 pulse-alert'; icon = 'fa-exclamation-circle text-red-500'; urgencyText = 'URGENTE: É Hoje!'; urgencyColor = 'text-red-600 font-bold'; } else if (diffDias <= 3) { alertClass = 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'; icon = 'fa-clock text-yellow-500'; urgencyText = `Atenção: ${diffDias} dias`; urgencyColor = 'text-yellow-600 font-bold'; } } const showHour = !(p.tipo === 'feriado' || p.tipo === 'recesso'); const dataLabel = showHour ? `${dataP.toLocaleDateString()} ${dataP.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : dataP.toLocaleDateString(); return `<div class="${alertClass} p-3 rounded shadow-sm bg-white dark:bg-slate-700 transition relative group">${app.perms && app.perms.canManageSistema() && (p.tipo === 'feriado' || p.tipo === 'recesso' || p.tipo === 'evento') ? `<button onclick="app.deleteItem('eventos_calendario', '${p.id}')" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><i class="fas fa-trash"></i></button>` : ''}<div class="flex justify-between items-start"><div><h4 class="font-bold text-sm dark:text-white">${p.titulo}</h4><p class="text-xs text-gray-500 dark:text-gray-300">${p.turmaNome} • ${app.capitalize(p.tipo)}</p></div><i class="fas ${icon}"></i></div><div class="mt-2 flex justify-between items-center text-xs"><span class="font-mono text-gray-600 dark:text-gray-400">${dataLabel}</span><span class="${urgencyColor}">${urgencyText}</span></div></div>`; }).join('')}
                    </div>
                </div>
            </div>`;

        let htmlAvisos = `<div class="mb-10"><div class="flex justify-between items-center mb-4"><h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-bullhorn text-yellow-500"></i> Quadro de Avisos</h2>${app.perms && app.perms.canCreateAviso() ? `<button onclick="app.modalAviso()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 shadow-sm text-sm font-medium"><i class="fas fa-plus mr-2"></i>Novo Aviso</button>` : ''}</div>${avisosVisiveis.length === 0 ? '<div class="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-center text-gray-500 italic">Nenhum aviso no momento.</div>' : ''}<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
        htmlAvisos += avisosVisiveis.map(aviso => {
            const isGeral = aviso.tipo === 'geral';
            const isColab = aviso.tipo === 'colaboradores';
            const isAluno = aviso.tipo === 'aluno';
            const canEdit = app.perms && app.perms.canEditAviso(aviso);
            const dataFormatada = aviso.criadoEm ? new Date(aviso.criadoEm.seconds * 1000).toLocaleDateString('pt-BR') : 'Data n/d';
            const leituras = aviso.leituras || [];
            const alunoLeu = app.perms && app.perms.isAluno() && leituras.find(l => (l.userId || l.alunoId) === app.currentUserData.id);
            const profLeu = app.perms && app.perms.isProfessor() && isColab && leituras.find(l => (l.userId || l.alunoId) === app.currentUserData.id);
            const countLeituras = leituras.length;
            const badgeText = isGeral ? 'GERAL' : (isColab ? 'COLABORADORES' : (isAluno ? `ALUNO: ${aviso.alunoNome || 'Aluno'}` : (aviso.turmaNome || 'Turma')));
            const badgeClass = isGeral ? 'badge-yellow' : (isAluno ? 'badge-purple' : 'badge-blue');
            const borderClass = isGeral ? 'border-yellow-400' : (isAluno ? 'border-purple-500' : 'border-blue-500');
            return `<div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-sm border-l-4 ${borderClass} p-5 hover:shadow-md transition flex flex-col h-full">${canEdit ? `<div class="absolute top-3 right-3 flex gap-2"><button onclick="app.modalAviso('${aviso.id}')" class="text-gray-400 hover:text-blue-500"><i class="fas fa-pen text-xs"></i></button><button onclick="app.deleteItem('avisos', '${aviso.id}')" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash text-xs"></i></button></div>` : ''}<div class="flex items-center gap-2 mb-2"><span class="badge ${badgeClass}">${badgeText}</span><span class="text-xs text-gray-400">${dataFormatada}</span></div><h3 class="font-bold text-lg text-gray-800 dark:text-white mb-2 leading-tight">${aviso.titulo}</h3><p class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-line flex-grow mb-4">${aviso.conteudo}</p><div class="pt-3 border-t dark:border-slate-700 flex items-center justify-between"><div class="flex items-center gap-2 text-xs text-gray-400"><div class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center font-bold">${aviso.autorNome ? aviso.autorNome.charAt(0) : '?'}</div><span>${aviso.autorNome || 'Admin'}</span></div>${app.perms && app.perms.isAluno() ? `${alunoLeu ? `<span class="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"><i class="fas fa-check-circle"></i> Lido em ${new Date(alunoLeu.data).toLocaleDateString()}</span>` : `<button onclick="app.marcarLeitura('${aviso.id}')" class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded transition">Marcar como Lido</button>`}` : (app.perms && app.perms.isProfessor() && isColab ? `${profLeu ? `<span class="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"><i class="fas fa-check-circle"></i> Lido em ${new Date(profLeu.data).toLocaleDateString()}</span>` : `<button onclick="app.marcarLeitura('${aviso.id}')" class="text-xs bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 px-3 py-1 rounded transition">Confirmar leitura</button>`}` : `<button onclick="app.verLeituras('${aviso.id}')" class="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 flex items-center gap-1"><i class="fas fa-eye"></i> ${countLeituras} Leituras</button>`)}</div></div>`;
        }).join('');

        container.innerHTML = htmlCalendar + '<div class="w-full flex flex-col gap-6">' + '<div class="w-full">' + htmlAvisos + '</div>' + htmlRendimentos + htmlSistema + '</div>';
    };

}