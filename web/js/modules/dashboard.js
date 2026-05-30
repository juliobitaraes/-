import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendDashboard(app) {
    const DASHBOARD_PRAZO_DENSITY_KEY = 'dashboard:prazoDensity';

    if (!app.getDashboardPrazoDensity) {
        app.getDashboardPrazoDensity = function() {
            const saved = String(localStorage.getItem(DASHBOARD_PRAZO_DENSITY_KEY) || '').toLowerCase();
            return saved === 'compact' ? 'compact' : 'normal';
        };
    }

    if (!app.setDashboardPrazoDensity) {
        app.setDashboardPrazoDensity = function(mode) {
            const next = mode === 'compact' ? 'compact' : 'normal';
            localStorage.setItem(DASHBOARD_PRAZO_DENSITY_KEY, next);
            if (store.currentView === 'dashboard') app.renderContent();
        };
    }

    if (!app.toggleDashboardPrazoDensity) {
        app.toggleDashboardPrazoDensity = function() {
            const current = app.getDashboardPrazoDensity();
            app.setDashboardPrazoDensity(current === 'compact' ? 'normal' : 'compact');
        };
    }

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
        const allTurmasMap = new Map(allTurmas.map(t => [t.id, app.formatTurmaLabelText(t, 'Turma', true)]));
        let minhasTurmas = turmasAtivas; let meusIdsTurmas = [];
        if (app.perms && app.perms.hasRole('professor', 'secretaria')) { minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentes); }
        else if (app.perms && app.perms.isAluno()) { minhasTurmas = turmasAtivas.filter(t => t.alunos && t.alunos.includes(app.currentUserData.id)); }
        meusIdsTurmas = minhasTurmas.map(t => t.id);

        const provas = await app.getCollection('provas');
        let provasRelevantes = provas
            .filter(p => meusIdsTurmas.includes(p.turmaId))
            .filter(p => p.published === true);
        if (app.perms && app.perms.isAluno()) {
            provasRelevantes = provasRelevantes.filter((p) => {
                if (p.provaRecuperacao === true && Array.isArray(p.alunosPermitidos) && p.alunosPermitidos.length > 0) {
                    return p.alunosPermitidos.includes(app.currentUserData.id);
                }
                return true;
            });
        }
        const eventosAdmin = await app.getCollection('eventos_calendario');
        const normalizeTipo = (tipo) => String(tipo || '').trim().toLowerCase();
        const eventosAdminNormalizados = eventosAdmin
            .filter((e) => {
                if (!e.turmaId) return true;
                if (app.perms && app.perms.isAdmin()) return true;
                return meusIdsTurmas.includes(e.turmaId);
            })
            .map(e => ({
                ...e,
                titulo: e.titulo,
                tipo: normalizeTipo(e.tipo),
                dataAgendada: e.data,
                turmaNome: e.turmaId ? (allTurmasMap.get(e.turmaId) || e.turmaNome || 'Turma') : 'Geral'
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
        const componentesCalendarioRelevantes = componentesRelevantes;
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
        const componentesEventos = app.buildComponentRangeEvents(componentesCalendarioRelevantes, turmasMap, view.month, view.year, feriadosSet);
        const todosEventos = [...provasRelevantes, ...eventosAdminNormalizados, ...componentesEventos];
        const eventosAlertas = [...provasRelevantes, ...eventosAdminNormalizados, ...componentesEventos];
        todosEventos.sort((a,b) => new Date(a.dataAgendada || 0) - new Date(b.dataAgendada || 0));
        app._calendarEventsCache = todosEventos;
        app._calendarBaseCache = {
            provasRelevantes,
            eventosAdminNormalizados,
            componentesRelevantes: componentesCalendarioRelevantes,
            feriadosSet,
            turmasMap
        };

        const today = new Date();
        const eventosAlertasFuturos = eventosAlertas
            .filter((p) => {
                if (!p.dataAgendada) return false;
                const dataP = new Date(p.dataAgendada);
                const diff = dataP - today;
                return diff >= 0;
            });
        const proximosAlertas = (() => {
            const proximosComponentes = new Map();
            const demaisEventos = [];
            eventosAlertasFuturos.forEach((evento) => {
                if (evento.tipo !== 'componente') {
                    demaisEventos.push(evento);
                    return;
                }

                const componenteKey = evento.componenteId || `${evento.turmaNome || 'turma'}::${evento.titulo || 'componente'}`;
                const dataMs = new Date(evento.dataAgendada || 0).getTime();
                const existente = proximosComponentes.get(componenteKey);
                if (!existente || dataMs < existente.dataMs) {
                    proximosComponentes.set(componenteKey, { evento, dataMs });
                }
            });

            return [...demaisEventos, ...Array.from(proximosComponentes.values()).map((entry) => entry.evento)]
                .sort((a, b) => new Date(a.dataAgendada || 0) - new Date(b.dataAgendada || 0));
        })();
        const proximosAlertasVisiveis = app.perms && app.perms.isAluno()
            ? proximosAlertas.slice(0, 10)
            : proximosAlertas;

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

        const prazoDensity = app.getDashboardPrazoDensity();
        const prazoIsCompact = prazoDensity === 'compact';
        const prazoListSpacingClass = prazoIsCompact ? 'space-y-2' : 'space-y-3';
        const prazoCardPaddingClass = prazoIsCompact ? 'p-2.5' : 'p-3';
        const prazoTrashPosClass = prazoIsCompact ? 'top-1.5 right-1.5' : 'top-2 right-2';
        const prazoTrashIconClass = prazoIsCompact ? 'text-xs' : '';
        const prazoTitleClass = prazoIsCompact ? 'text-[13px] leading-5' : 'text-sm';
        const prazoMetaClass = prazoIsCompact ? 'text-[11px]' : 'text-xs';
        const prazoBottomMarginClass = prazoIsCompact ? 'mt-1.5' : 'mt-2';
        const prazoToggleLabel = prazoIsCompact ? 'Compacto' : 'Normal';
        const prazoToggleIcon = prazoIsCompact ? 'fa-compress' : 'fa-expand';
        const prazoListMaxHeightClass = prazoIsCompact ? 'max-h-[400px]' : 'max-h-[500px]';

        let htmlCalendar = `
            <style>
                .dashboard-prazos-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(100, 116, 139, 0.35) transparent;
                }
                .dashboard-prazos-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .dashboard-prazos-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .dashboard-prazos-scroll::-webkit-scrollbar-thumb {
                    background: rgba(100, 116, 139, 0.35);
                    border-radius: 9999px;
                }
                .dashboard-prazos-scroll::-webkit-scrollbar-thumb:hover {
                    background: rgba(100, 116, 139, 0.55);
                }
            </style>
            <div class="mb-10 flex flex-col gap-6">
                <div class="w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold flex items-center gap-2 dark:text-white"><i class="fas fa-calendar-alt text-blue-600"></i> Agenda Acadêmica</h2>
                        ${app.perms && app.perms.canManageSistema() ? `<button onclick="app.modalEventoCalendario()" class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full border border-gray-300 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600"><i class="fas fa-cog"></i> Gerenciar Agenda</button>` : ''}
                    </div>
                    <div id="dashboard-calendar-body">
                        ${app.generateCalendarHTML(todosEventos, view.month, view.year)}
                    </div>
                </div>
                <div class="w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
                    <div class="flex items-center justify-between gap-2 mb-4">
                        <h2 class="text-xl font-bold flex items-center gap-2 dark:text-white"><i class="fas fa-bell text-red-500"></i> Próximos Prazos</h2>
                        <button onclick="app.toggleDashboardPrazoDensity()" class="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:border-slate-600" title="Alternar densidade da lista">
                            <i class="fas ${prazoToggleIcon} mr-1"></i>${prazoToggleLabel}
                        </button>
                    </div>
                    <div class="dashboard-prazos-scroll ${prazoListSpacingClass} ${prazoListMaxHeightClass} overflow-y-auto pr-1">
                        ${proximosAlertasVisiveis.length === 0 ? '<p class="text-gray-500 text-sm italic">Nenhuma atividade agendada.</p>' : proximosAlertasVisiveis.map(p => { const dataP = new Date(p.dataAgendada); const diffMs = dataP - today; const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); let alertClass = 'border-l-4 border-blue-500'; let icon = 'fa-calendar-day text-blue-500'; let urgencyText = 'No Prazo'; let urgencyColor = 'text-blue-600'; const isGreenType = ['evento', 'feriado', 'recesso'].includes(p.tipo); const isComponente = p.tipo === 'componente'; if (isGreenType) { alertClass = 'border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20'; icon = p.tipo === 'feriado' ? 'fa-umbrella-beach text-green-600' : (p.tipo === 'recesso' ? 'fa-pause-circle text-green-600' : 'fa-calendar-check text-green-600'); urgencyText = p.tipo === 'feriado' ? 'Feriado' : (p.tipo === 'recesso' ? 'Recesso' : 'Evento'); urgencyColor = 'text-green-600'; if (diffDias < 1) { alertClass = 'border-l-4 border-green-600 bg-green-100 dark:bg-green-900/30'; urgencyColor = 'text-green-800 font-bold'; } else if (diffDias <= 3) { alertClass = 'border-l-4 border-green-600 bg-green-50 dark:bg-green-900/25'; urgencyColor = 'text-green-700 font-bold'; } } else if (isComponente) { alertClass = 'border-l-4 border-teal-500 bg-teal-50 dark:bg-teal-900/20'; icon = 'fa-book text-teal-600'; urgencyText = diffDias < 1 ? 'Componente em curso' : (diffDias <= 3 ? `Inicia em ${diffDias} dias` : 'Componente ativa'); urgencyColor = 'text-teal-700 font-bold'; } else { if(diffDias < 1) { alertClass = 'border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 pulse-alert'; icon = 'fa-exclamation-circle text-red-500'; urgencyText = 'URGENTE: É Hoje!'; urgencyColor = 'text-red-600 font-bold'; } else if (diffDias <= 3) { alertClass = 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'; icon = 'fa-clock text-yellow-500'; urgencyText = `Atenção: ${diffDias} dias`; urgencyColor = 'text-yellow-600 font-bold'; } } const showHour = !(p.tipo === 'feriado' || p.tipo === 'recesso' || p.tipo === 'componente'); const dataLabel = showHour ? `${dataP.toLocaleDateString()} ${dataP.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : dataP.toLocaleDateString(); const tituloEvento = p.provaRecuperacao ? `${p.titulo} (Recuperação)` : p.titulo; return `<div class="${alertClass} ${prazoCardPaddingClass} rounded shadow-sm bg-white dark:bg-slate-700 transition relative group">${app.perms && app.perms.canManageSistema() && (p.tipo === 'feriado' || p.tipo === 'recesso' || p.tipo === 'evento') ? `<button onclick="app.deleteItem('eventos_calendario', '${p.id}')" class="absolute ${prazoTrashPosClass} text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><i class="fas fa-trash ${prazoTrashIconClass}"></i></button>` : ''}<div class="flex justify-between items-start gap-2"><div><h4 class="font-bold ${prazoTitleClass} dark:text-white">${tituloEvento}</h4><p class="${prazoMetaClass} text-gray-500 dark:text-gray-300">${p.turmaNome} • ${isComponente ? 'Componente curricular' : app.capitalize(p.tipo)}</p></div><i class="fas ${icon} ${prazoIsCompact ? 'text-sm' : ''}"></i></div><div class="${prazoBottomMarginClass} flex justify-between items-center ${prazoMetaClass}"><span class="font-mono text-gray-600 dark:text-gray-400">${dataLabel}</span><span class="${urgencyColor}">${urgencyText}</span></div></div>`; }).join('')}
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
            return `<div class="relative bg-white dark:bg-slate-800 rounded-xl shadow-sm border-l-4 ${borderClass} p-5 hover:shadow-md transition flex flex-col h-full">${canEdit ? `<div class="absolute top-3 right-3 flex gap-2"><button onclick="app.modalAviso('${aviso.id}')" class="text-gray-400 hover:text-blue-500"><i class="fas fa-pen text-xs"></i></button><button onclick="app.deleteItem('avisos', '${aviso.id}')" class="text-gray-400 hover:text-red-500"><i class="fas fa-trash text-xs"></i></button></div>` : ''}<div class="flex items-center gap-2 mb-2"><span class="badge ${badgeClass}">${badgeText}</span><span class="text-xs text-gray-400">${dataFormatada}</span></div><h3 class="font-bold text-lg text-gray-800 dark:text-white mb-2 leading-tight">${aviso.titulo}</h3><p class="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-line flex-grow mb-4">${aviso.conteudo}</p><div class="pt-3 border-t dark:border-slate-700 flex items-center justify-between"><div class="flex items-center gap-2 text-xs text-gray-400"><div class="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center font-bold">${aviso.autorNome ? aviso.autorNome.charAt(0) : '?'}</div><span>${aviso.autorNome || 'Admin'}</span></div>${app.perms && app.perms.isAluno() ? `${alunoLeu ? `<span class="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"><i class="fas fa-check-circle"></i> Lido em ${new Date(alunoLeu.data).toLocaleDateString()}</span>` : `<button onclick="app.marcarLeitura('${aviso.id}')" class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded transition">Marcar como Lido</button>`}` : (app.perms && app.perms.isProfessor() && isColab ? `${profLeu ? `<span class="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"><i class="fas fa-check-circle"></i> Lido em ${new Date(profLeu.data).toLocaleDateString()}</span>` : `<button onclick="app.marcarLeitura('${aviso.id}')" class="text-xs bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 px-3 py-1 rounded transition">Confirmar leitura</button>`}` : `<button onclick="app.verLeituras('${aviso.id}')" data-aviso-leituras="${aviso.id}" class="text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 flex items-center gap-1"><i class="fas fa-eye"></i> ${countLeituras} Leituras</button>`)}</div></div>`;
        }).join('');

        let htmlFinance = '';
        if (app.perms && ['admin', 'secretaria'].includes(store.currentUserData?.tipo) &&
            (app.isSectionEnabledForCurrentSchool('receitas') || app.isSectionEnabledForCurrentSchool('despesas'))) {
            try { htmlFinance = await app.renderFinanceSummaryWidget(); } catch (e) { htmlFinance = ''; }
        }

        container.innerHTML = htmlCalendar + '<div class="w-full flex flex-col gap-6">' + '<div class="w-full">' + htmlAvisos + '</div>' + htmlFinance + htmlSistema + '</div>';
    };

}