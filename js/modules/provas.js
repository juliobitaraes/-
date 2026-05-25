import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import {
    createProvaResultado,
    createProva,
    getComponentesByTurma,
    getProvaById,
    getProvaDocRef,
    getTurmaById,
    updateProva
} from '../services/provasRepository.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendProvas(app) {
    // ======= PROVAS / AVALIAÇÕES (migrated from app-full.js) =======
    const parseAvaliacaoDate = (value) => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        if (typeof value?.toDate === 'function') {
            const converted = value.toDate();
            if (converted instanceof Date && !Number.isNaN(converted.getTime())) return converted;
        }
        if (typeof value?.seconds === 'number') {
            const converted = new Date(value.seconds * 1000);
            if (!Number.isNaN(converted.getTime())) return converted;
        }
        const converted = new Date(value);
        return Number.isNaN(converted.getTime()) ? null : converted;
    };

    const mergeDateAndTime = (baseDate, timeValue) => {
        if (!baseDate || !timeValue) return null;
        const [hoursRaw, minutesRaw] = String(timeValue).split(':');
        const hours = parseInt(hoursRaw, 10);
        const minutes = parseInt(minutesRaw, 10);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
        const merged = new Date(baseDate);
        merged.setHours(hours, minutes, 0, 0);
        return merged;
    };

    const formatDateTimeLabel = (value) => {
        const parsed = parseAvaliacaoDate(value);
        if (!parsed) return 'data não definida';
        return parsed.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const sortResultadosByData = (resultados = []) => [...resultados].sort((left, right) => {
        const leftMs = parseAvaliacaoDate(left?.data)?.getTime() || 0;
        const rightMs = parseAvaliacaoDate(right?.data)?.getTime() || 0;
        return leftMs - rightMs;
    });

    const cloneQuestoes = (questions = []) => questions.map((question, index) => ({
        ...question,
        id: Date.now() + index,
        options: Array.isArray(question?.options) ? [...question.options] : []
    }));

    const normalizeComparableText = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const extractTituloFromLogDetalhe = (detalhes = '', tipo = 'prova') => {
        const prefix = `${tipo}:`;
        const raw = String(detalhes || '');
        if (!raw.toLowerCase().startsWith(prefix)) return raw.trim();
        return raw.slice(prefix.length).trim();
    };

    const getComparableTimestampMs = (value) => parseAvaliacaoDate(value)?.getTime() || 0;

    const resetActiveExamState = () => {
        if (app.questionTimer) clearInterval(app.questionTimer);
        app.questionTimer = null;
        app.activeExamData = null;
        app.activeExamAnswers = [];
        app.currentQuestionIndex = 0;
        app._selectedExamOption = null;
    };

    app.getAvaliacaoDisponibilidade = function(prova, options = {}) {
        if (!prova) {
            return {
                available: false,
                reason: 'not_found',
                message: 'Prova não encontrada.',
                attemptsDone: 0,
                allowed: 1,
                startAt: null,
                deadlineAt: null
            };
        }

        if (prova.concluida === true) {
            return {
                available: false,
                reason: 'concluded',
                message: 'Esta prova foi concluída e finalizada pela equipe.',
                attemptsDone: 0,
                allowed: 0,
                startAt: null,
                deadlineAt: null
            };
        }

        const resultados = Array.isArray(options.resultados) ? sortResultadosByData(options.resultados) : [];
        const attemptsDone = Number.isInteger(options.attemptsDone) ? options.attemptsDone : resultados.length;
        const allowed = typeof prova.attempts === 'number' ? prova.attempts : 1;
        const now = options.now instanceof Date ? options.now : new Date();
        const nomeAvaliacao = prova.tipo === 'atividade' ? 'atividade EAD' : 'prova';
        const startAt = prova.dataInicio
            ? parseAvaliacaoDate(prova.dataInicio)
            : (prova.horaInicio ? mergeDateAndTime(parseAvaliacaoDate(prova.dataAgendada), prova.horaInicio) : parseAvaliacaoDate(prova.dataAgendada));
        const deadlineAt = prova.dataFim
            ? parseAvaliacaoDate(prova.dataFim)
            : (prova.horaFim ? mergeDateAndTime(parseAvaliacaoDate(prova.dataAgendada), prova.horaFim) : parseAvaliacaoDate(prova.dataAgendada));

        if (startAt && now < startAt) {
            return {
                available: false,
                reason: 'before_start',
                message: `A ${nomeAvaliacao} estará disponível em ${formatDateTimeLabel(startAt)}.`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        if (deadlineAt && now > deadlineAt) {
            return {
                available: false,
                reason: 'expired',
                message: `O prazo para realizar esta ${nomeAvaliacao} encerrou em ${formatDateTimeLabel(deadlineAt)}.`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        if (allowed > 0 && attemptsDone >= allowed) {
            const notasValidas = resultados.map(r => parseFloat(r.nota)).filter(n => Number.isFinite(n));
            const notaExibida = allowed > 1
                ? (notasValidas.length > 0 ? Math.max(...notasValidas) : null)
                : (resultados[resultados.length - 1] && typeof resultados[resultados.length - 1].nota !== 'undefined' ? resultados[resultados.length - 1].nota : null);
            const notaLabel = allowed > 1 ? 'Maior nota' : 'Última nota';
            const notaMsg = notaExibida != null ? ` ${notaLabel}: ${notaExibida}.` : '';
            return {
                available: false,
                reason: 'attempt_limit',
                message: `Você atingiu o número máximo de tentativas (${allowed}).${notaMsg}`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        return {
            available: true,
            reason: 'available',
            message: '',
            attemptsDone,
            allowed,
            startAt,
            deadlineAt
        };
    };

    app.backfillProvaCreatorsIfNeeded = async function(provas = []) {
        if (!(app.perms && app.perms.isAdmin && app.perms.isAdmin())) return false;
        if (!Array.isArray(provas) || provas.length === 0) return false;

        const schoolId = store.activeSchoolId || app.currentUserData?.schoolId || app.currentUserData?.escolaId;
        if (!schoolId) return false;

        const pending = provas.filter((prova) => !String(prova?.criadoPorNome || '').trim());
        if (pending.length === 0) return false;

        const cacheKey = `provas:${schoolId}:${pending.length}`;
        if (app._provaCreatorBackfillRunning === cacheKey) return false;
        if (app._provaCreatorBackfillDone === cacheKey) return false;

        app._provaCreatorBackfillRunning = cacheKey;
        try {
            const logs = await app.getCollection('logs_acesso');
            const logsPorTipo = {
                prova: logs
                    .filter((log) => log.acao === 'prova_criada')
                    .map((log) => ({
                        ...log,
                        tituloNormalizado: normalizeComparableText(extractTituloFromLogDetalhe(log.detalhes, 'prova')),
                        dataMs: getComparableTimestampMs(log.data)
                    })),
                atividade: logs
                    .filter((log) => log.acao === 'atividade_criada')
                    .map((log) => ({
                        ...log,
                        tituloNormalizado: normalizeComparableText(extractTituloFromLogDetalhe(log.detalhes, 'atividade')),
                        dataMs: getComparableTimestampMs(log.data)
                    }))
            };

            const updates = [];
            pending.forEach((prova) => {
                const tipoBase = prova.tipo === 'atividade' ? 'atividade' : 'prova';
                const tituloNormalizado = normalizeComparableText(prova.titulo);
                if (!tituloNormalizado) return;

                const createdAtMs = getComparableTimestampMs(prova.criadoEm);
                const candidatos = logsPorTipo[tipoBase]
                    .filter((log) => log.tituloNormalizado === tituloNormalizado)
                    .sort((left, right) => {
                        const leftDelta = Math.abs((left.dataMs || 0) - createdAtMs);
                        const rightDelta = Math.abs((right.dataMs || 0) - createdAtMs);
                        return leftDelta - rightDelta;
                    });

                const melhor = candidatos[0];
                if (!melhor || !String(melhor.userNome || '').trim()) return;

                updates.push({
                    id: prova.id,
                    payload: {
                        criadoPorId: melhor.userId || null,
                        criadoPorNome: melhor.userNome || 'Usuario',
                        autorMigradoEm: firebase.firestore.FieldValue.serverTimestamp()
                    }
                });
            });

            if (updates.length === 0) {
                app._provaCreatorBackfillDone = cacheKey;
                return false;
            }

            const batchWriter = firebase.firestore().batch();
            updates.forEach(({ id, payload }) => {
                batchWriter.update(getProvaDocRef(id), payload);
            });
            await batchWriter.commit();

            app._provaCreatorBackfillDone = cacheKey;
            return true;
        } catch (error) {
            console.warn('Falha ao preencher autores antigos das provas:', error);
            return false;
        } finally {
            app._provaCreatorBackfillRunning = null;
        }
    };

    app.renderAvaliacoes = async function(container, tipo, options = {}) {
        const turmas = await app.getCollection('turmas');
        const componentes = await app.getComponentesCache();
        let provas = (await app.getCollection('provas')).filter(p => p.tipo === tipo);
        const hasSalaFilter = Object.prototype.hasOwnProperty.call(options, 'salaId');
        const turmaFilter = options.turmaId || null;
        const salaFilter = hasSalaFilter ? options.salaId : null;
        const isAluno = app.currentUserData && app.perms && app.perms.isAluno();
        const resultadosAlunoPorProva = new Map();

        if (isAluno) {
            const resultadosAluno = (await app.getCollection('provas_resultados'))
                .filter(r => r.alunoId === app.currentUserData.id);
            resultadosAluno.forEach((resultado) => {
                const lista = resultadosAlunoPorProva.get(resultado.provaId) || [];
                lista.push(resultado);
                resultadosAlunoPorProva.set(resultado.provaId, lista);
            });
        }

        if (isAluno) {
            const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId) && p.published === true);
            // Recovery provas are only visible to explicitly permitted students
            provas = provas.filter(p => {
                if (p.provaRecuperacao === true && Array.isArray(p.alunosPermitidos) && p.alunosPermitidos.length > 0) {
                    return p.alunosPermitidos.includes(app.currentUserData.id);
                }
                return true;
            });
        } else if (app.currentUserData && app.perms && app.perms.isProfessor()) {
            const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId));
        }

        if (turmaFilter) {
            provas = provas.filter(p => p.turmaId === turmaFilter);
        }
        if (tipo === 'atividade' && hasSalaFilter) {
            if (salaFilter) provas = provas.filter(p => p.salaId === salaFilter);
            else provas = provas.filter(p => !p.salaId);
        }

        if (tipo === 'prova') {
            const didBackfill = await app.backfillProvaCreatorsIfNeeded(provas);
            if (didBackfill) {
                provas = (await app.getCollection('provas')).filter(p => p.tipo === tipo);
                if (isAluno) {
                    const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
                    provas = provas.filter(p => minhasTurmas.includes(p.turmaId) && p.published === true);
                    provas = provas.filter(p => {
                        if (p.provaRecuperacao === true && Array.isArray(p.alunosPermitidos) && p.alunosPermitidos.length > 0) {
                            return p.alunosPermitidos.includes(app.currentUserData.id);
                        }
                        return true;
                    });
                } else if (app.currentUserData && app.perms && app.perms.isProfessor()) {
                    const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                    provas = provas.filter(p => minhasTurmas.includes(p.turmaId));
                }
                if (turmaFilter) {
                    provas = provas.filter(p => p.turmaId === turmaFilter);
                }
            }
        }

        const singularLabel = tipo === 'atividade' ? 'Atividade EAD' : app.capitalize(tipo);
        const titleLabel = options.title || (tipo === 'atividade' ? 'Atividades EAD' : `${app.capitalize(tipo)}s`);
        const backAction = options.backAction || '';
        const isAlunoProvasView = isAluno && tipo === 'prova';

        if (typeof app.setProvasStatusFilter !== 'function') {
            app.setProvasStatusFilter = function(filter) {
                const next = ['todas', 'ativas', 'concluidas'].includes(filter) ? filter : 'todas';
                app.provasStatusFilter = next;
                if (store.currentView === 'provas') app.renderContent();
            };
        }
        if (!app.provasStatusFilter) app.provasStatusFilter = 'todas';

        app.toggleConclusaoProva = async function(provaId, shouldConclude) {
            if (!(app.perms && app.perms.canEditAvaliacao())) {
                alert('Acesso restrito.');
                return;
            }
            const msg = shouldConclude
                ? 'Marcar esta prova como concluída? Ela irá para o painel de Provas Concluídas.'
                : 'Reabrir esta prova? Ela voltará para o painel principal de provas.';
            if (!confirm(msg)) return;
            const patch = shouldConclude
                ? { concluida: true, concluidaEm: firebase.firestore.FieldValue.serverTimestamp(), published: false }
                : { concluida: false, concluidaEm: firebase.firestore.FieldValue.delete() };
            await updateProva(provaId, patch);
            if (app.logAcesso) {
                app.logAcesso(shouldConclude ? 'prova_concluida' : 'prova_reaberta', `prova:${provaId}`);
            }
            await app.renderContent();
        };

        app.copiarProva = async function(provaId) {
            if (!(app.perms && app.perms.canEditAvaliacao())) {
                alert('Acesso restrito.');
                return;
            }
            await app.modalCriarProva('prova', provaId, { copyMode: true });
        };

        const renderAvaliacaoCard = (p, meta = {}) => {
            const canEdit = app.perms && app.perms.canEditAvaliacao();
            const isPublished = p.published === true;
            const isConcluded = p.concluida === true;
            const isRecuperacao = p.provaRecuperacao === true;
            const isDeletionBlocked = !isRecuperacao && (isPublished || p.wasPublished === true || isConcluded);
            const qtdQuestoes = (p.questions || []).length;
            const resultadosAluno = meta.resultadosAluno || (isAluno ? (resultadosAlunoPorProva.get(p.id) || []) : []);
            const resultadosOrdenados = sortResultadosByData(resultadosAluno);
            const disponibilidadeAluno = isAluno ? (meta.disponibilidadeAluno || app.getAvaliacaoDisponibilidade(p, { resultados: resultadosAluno })) : null;
            const ultimaTentativa = resultadosOrdenados[resultadosOrdenados.length - 1] || null;
            const tentativaTexto = isAluno
                ? (disponibilidadeAluno.allowed > 0
                    ? `${disponibilidadeAluno.attemptsDone}/${disponibilidadeAluno.allowed} tentativas`
                    : `${disponibilidadeAluno.attemptsDone} tentativa(s)`)
                : '';
            const compNome = componentes.find(c => c.id === p.componenteId)?.nome || 'Geral';
            const salaBadge = tipo === 'atividade' && p.salaNome
                ? `<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">${app.escapeHtml(p.salaNome)}</span>`
                : '';
            const dataBase = parseAvaliacaoDate(p.dataAgendada);
            const dataFormatada = dataBase
                ? `${dataBase.toLocaleDateString('pt-BR')} ${dataBase.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Data n/d';
            const statusBadge = isConcluded
                ? '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">Concluída</span>'
                : (isPublished
                    ? '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">Publicado</span>'
                    : '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">Rascunho</span>');
            const turmaNomeHtml = app.formatTurmaTextToHtml(p.turmaNome || 'Turma');
            const criadoPorNome = String(p.criadoPorNome || '').trim();
            const hasResultado = resultadosOrdenados.length > 0;

            let alunoFooterHtml = '';
            if (isAluno) {
                const ultimaTentativaData = ultimaTentativa ? formatDateTimeLabel(ultimaTentativa.data) : '';
                const ultimaNota = ultimaTentativa && typeof ultimaTentativa.nota !== 'undefined' ? ultimaTentativa.nota : null;
                const multiTentativas = disponibilidadeAluno && (disponibilidadeAluno.allowed === 0 || disponibilidadeAluno.allowed > 1);
                const notasValidas = resultadosOrdenados.map(r => parseFloat(r.nota)).filter(n => Number.isFinite(n));
                const maiorNota = multiTentativas && notasValidas.length > 0 ? Math.max(...notasValidas) : ultimaNota;
                const notaLabel = multiTentativas ? 'Maior nota' : 'Última nota';
                if (meta.mode === 'realizada') {
                    alunoFooterHtml = `
                        <div class="mt-3 space-y-2">
                            <div class="grid grid-cols-2 gap-2 text-xs">
                                <div class="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg p-2">
                                    <div class="font-semibold">${notaLabel}</div>
                                    <div class="text-sm">${maiorNota != null ? app.escapeHtml(String(maiorNota)) : 'N/D'}</div>
                                </div>
                                <div class="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg p-2">
                                    <div class="font-semibold">Tentativas</div>
                                    <div class="text-sm">${tentativaTexto}</div>
                                </div>
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">Realizada em ${app.escapeHtml(ultimaTentativaData || 'data não disponível')}.</div>
                            <div class="text-xs ${disponibilidadeAluno.available ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}">
                                ${disponibilidadeAluno.available ? 'Você ainda pode iniciar uma nova tentativa.' : app.escapeHtml(disponibilidadeAluno.message || 'Prova realizada.')}
                            </div>
                            <button onclick="app.iniciarProva('${p.id}')" class="w-full py-2 rounded-lg text-white ${disponibilidadeAluno.available ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400 cursor-not-allowed opacity-70'}" ${disponibilidadeAluno.available ? '' : 'disabled'}>${disponibilidadeAluno.available ? 'Nova tentativa' : 'Prova realizada'}</button>
                        </div>`;
                } else {
                    alunoFooterHtml = `
                        <div class="mt-3 space-y-2">
                            <div class="text-xs ${disponibilidadeAluno.available ? 'text-gray-500 dark:text-gray-400' : 'text-amber-700 dark:text-amber-300'}">
                                ${disponibilidadeAluno.available ? tentativaTexto : app.escapeHtml(disponibilidadeAluno.message)}
                            </div>
                            <button onclick="app.iniciarProva('${p.id}')" class="w-full py-2 rounded-lg text-white ${disponibilidadeAluno.available ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed opacity-70'}" ${disponibilidadeAluno.available ? '' : 'disabled'}>${disponibilidadeAluno.available ? `Iniciar ${singularLabel}` : (disponibilidadeAluno.reason === 'expired' ? `${singularLabel} encerrada` : (disponibilidadeAluno.reason === 'attempt_limit' ? 'Tentativas esgotadas' : 'Indisponível no momento'))}</button>
                            ${hasResultado ? `<div class="text-xs text-gray-500 dark:text-gray-400">Última realização: ${app.escapeHtml(ultimaTentativaData || 'data não disponível')}</div>` : ''}
                        </div>`;
                }
            }

            return `
                <div class="eval-card bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 relative group">
                    ${canEdit ? `
                    <div class="eval-card-actions absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-2">
                        ${tipo === 'prova' ? `
                        <button onclick="app.toggleConclusaoProva('${p.id}', ${isConcluded ? 'false' : 'true'})" class="${isConcluded ? 'text-teal-600 hover:text-teal-800' : 'text-indigo-600 hover:text-indigo-800'}" aria-label="${isConcluded ? 'Reabrir prova' : 'Concluir prova'}" title="${isConcluded ? 'Reabrir prova' : 'Marcar como concluída'}"><i class="fas ${isConcluded ? 'fa-rotate-left' : 'fa-flag-checkered'}"></i></button>
                        <button onclick="app.copiarProva('${p.id}')" class="text-sky-600 hover:text-sky-800" aria-label="Copiar prova" title="Copiar prova para outra turma"><i class="fas fa-copy"></i></button>
                        ` : ''}
                        <button onclick="app.modalCriarProva('${tipo}', '${p.id}')" class="text-blue-500 hover:text-blue-700" aria-label="Editar ${app.escapeHtml(p.titulo)}" title="Editar ${app.escapeHtml(p.titulo)}"><i class="fas fa-edit"></i></button>
                        ${isDeletionBlocked
                            ? '<span class="text-gray-400 cursor-not-allowed" aria-label="Proibido excluir prova que já foi publicada. Você pode apenas editar." title="Proibido excluir prova que já foi publicada. Você pode apenas editar."><i class="fas fa-lock"></i></span>'
                            : `<button onclick="app.deleteItem('provas', '${p.id}')" class="text-red-500 hover:text-red-700" aria-label="Excluir ${app.escapeHtml(p.titulo)}" title="Excluir ${app.escapeHtml(p.titulo)}"><i class="fas fa-trash"></i></button>`}
                    </div>` : ''}
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
                            ${qtdQuestoes}
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-white flex items-center flex-wrap gap-1">${p.titulo}${canEdit ? statusBadge : ''}${p.provaRecuperacao ? '<span class="ml-1 px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-semibold">Recuperação</span>' : ''}</h3>
                            <div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                <div>${turmaNomeHtml}</div>
                                ${criadoPorNome ? `<div>Criada por: ${app.escapeHtml(criadoPorNome)}</div>` : ''}
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="font-bold text-purple-500">${compNome}</span>${salaBadge}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-2 mb-3 bg-gray-50 dark:bg-slate-700 p-2 rounded text-xs flex items-center gap-2 dark:text-gray-300">
                        <i class="fas fa-calendar-alt"></i> ${dataFormatada}
                    </div>
                    ${isAluno ? alunoFooterHtml : `<div class="mt-2 flex flex-col gap-2">
                        <button onclick="app.downloadGabaritoPDF('${p.id}')" class="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                            <i class="fas fa-file-pdf mr-2"></i>Baixar gabarito (PDF)
                        </button>
                        <button onclick="app.downloadProvaImpressaPDF('${p.id}')" class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                            <i class="fas fa-print mr-2"></i>Baixar ${tipo === 'atividade' ? 'atividade EAD' : 'prova'} impressa (PDF)
                        </button>
                        <button onclick="app.exportarResultadosProvaExcel('${p.id}')" class="w-full py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm">
                            <i class="fas fa-file-excel mr-2"></i>Exportar resultados (Excel)
                        </button>
                        <p class="text-xs text-gray-400 text-center">${qtdQuestoes} Questões</p>
                    </div>`}
                </div>
            `;
        };

        const renderEmptyState = (message) => `
            <div class="col-span-full bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                ${message}
            </div>
        `;

        if (isAlunoProvasView) {
            const provasComMeta = provas.map((prova) => {
                const resultadosAluno = resultadosAlunoPorProva.get(prova.id) || [];
                const disponibilidadeAluno = app.getAvaliacaoDisponibilidade(prova, { resultados: resultadosAluno });
                const ultimaTentativa = sortResultadosByData(resultadosAluno).slice(-1)[0] || null;
                return { prova, resultadosAluno, disponibilidadeAluno, ultimaTentativa };
            });

            const provasEmAberto = provasComMeta
                .filter(({ resultadosAluno }) => resultadosAluno.length === 0)
                .sort((left, right) => {
                    const leftMs = parseAvaliacaoDate(left.prova.dataAgendada)?.getTime() || 0;
                    const rightMs = parseAvaliacaoDate(right.prova.dataAgendada)?.getTime() || 0;
                    return leftMs - rightMs;
                });

            const provasRealizadas = provasComMeta
                .filter(({ resultadosAluno }) => resultadosAluno.length > 0)
                .sort((left, right) => {
                    const leftMs = parseAvaliacaoDate(left.ultimaTentativa?.data)?.getTime() || 0;
                    const rightMs = parseAvaliacaoDate(right.ultimaTentativa?.data)?.getTime() || 0;
                    return rightMs - leftMs;
                });

            container.innerHTML = `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
                    <div class="flex items-center gap-3">
                        ${backAction ? `<button onclick="${backAction}" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>` : ''}
                        <h2 class="text-2xl font-bold text-gray-800 dark:text-white capitalize">${titleLabel}</h2>
                    </div>
                </div>
                <div class="space-y-8">
                    <section>
                        <div class="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas em aberto</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Provas visíveis para você. O início só é liberado quando a data de realização chegar.</p>
                            </div>
                            <span class="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold dark:bg-blue-900/30 dark:text-blue-200">${provasEmAberto.length}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${provasEmAberto.length === 0 ? renderEmptyState('Nenhuma prova em aberto.') : provasEmAberto.map(({ prova, resultadosAluno, disponibilidadeAluno }) => renderAvaliacaoCard(prova, { resultadosAluno, disponibilidadeAluno, mode: 'aberta' })).join('')}
                        </div>
                    </section>
                    <section>
                        <div class="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas realizadas</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Histórico das provas que você já realizou. Se ainda houver tentativas disponíveis, a nova tentativa fica aqui.</p>
                            </div>
                            <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-200">${provasRealizadas.length}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${provasRealizadas.length === 0 ? renderEmptyState('Você ainda não realizou nenhuma prova.') : provasRealizadas.map(({ prova, resultadosAluno, disponibilidadeAluno }) => renderAvaliacaoCard(prova, { resultadosAluno, disponibilidadeAluno, mode: 'realizada' })).join('')}
                        </div>
                    </section>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
                <div class="flex items-center gap-3">
                    ${backAction ? `<button onclick="${backAction}" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>` : ''}
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white capitalize">${titleLabel}</h2>
                </div>
                ${app.perms && app.perms.canCreateAvaliacao() ? `
                <button onclick="app.modalCriarProva('${tipo}')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-sm">
                    <i class="fas fa-plus mr-2"></i>Nova ${singularLabel}
                </button>` : ''}
            </div>
            ${!isAluno && tipo === 'prova'
                ? (() => {
                    const provasConcluidas = provas.filter((p) => p.concluida === true);
                    const provasAtivas = provas.filter((p) => p.concluida !== true);
                    const showAtivas = app.provasStatusFilter === 'todas' || app.provasStatusFilter === 'ativas';
                    const showConcluidas = app.provasStatusFilter === 'todas' || app.provasStatusFilter === 'concluidas';
                    return `
                        <div class="space-y-8">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-sm font-medium text-gray-600 dark:text-gray-300 mr-1">Filtro:</span>
                                <button onclick="app.setProvasStatusFilter('todas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'todas' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Todas</button>
                                <button onclick="app.setProvasStatusFilter('ativas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'ativas' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Ativas</button>
                                <button onclick="app.setProvasStatusFilter('concluidas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'concluidas' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Concluídas</button>
                            </div>
                            ${showAtivas ? `
                            <section>
                                <div class="flex items-center justify-between gap-3 mb-4">
                                    <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas Ativas</h3>
                                    <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-200">${provasAtivas.length}</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    ${provasAtivas.length === 0 ? renderEmptyState('Nenhuma prova ativa.') : provasAtivas.map((p) => renderAvaliacaoCard(p)).join('')}
                                </div>
                            </section>
                            ` : ''}
                            ${showConcluidas ? `
                            <section>
                                <div class="flex items-center justify-between gap-3 mb-4">
                                    <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas Concluídas</h3>
                                    <span class="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold dark:bg-indigo-900/30 dark:text-indigo-200">${provasConcluidas.length}</span>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    ${provasConcluidas.length === 0 ? renderEmptyState('Nenhuma prova concluída.') : provasConcluidas.map((p) => renderAvaliacaoCard(p)).join('')}
                                </div>
                            </section>
                            ` : ''}
                        </div>
                    `;
                })()
                : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${provas.map((p) => renderAvaliacaoCard(p)).join('')}</div>`}
        `;
    };

    app.renderDiarioPorComponentes = async function(container) {
        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        const componentesCache = await app.getComponentesCache();
        let minhasTurmas = turmasAtivas;
        if (app.perms && app.perms.isProfessor()) { minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentesCache); }
        else if (app.perms && app.perms.isAluno()) { minhasTurmas = turmasAtivas.filter(t => t.alunos && t.alunos.includes(app.currentUserData.id)); }

        if (!app.toggleDiarioSection) {
            app.toggleDiarioSection = function(contentId, buttonId) {
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

        if (!app.toggleConcluidaDiario) {
            app.toggleConcluidaDiario = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Mostrar diário' : 'Ocultar diário';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }

        if (!app.toggleDiarioTurma) {
            app.toggleDiarioTurma = function(contentId, buttonId) {
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

        const emptyMsg = minhasTurmas.length === 0 ? '<p class="text-gray-500 dark:text-gray-400">Nenhuma turma encontrada.</p>' : '';
        const notasContentId = 'diario-notas-content';
        const notasToggleId = 'diario-notas-toggle';
        const turmasNotasHtml = minhasTurmas.map(t => `<div id="dash-notas-turma-${t.id}" class="diario-skeleton mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"><div class="loading"></div></div>`).join('');

        const renderHeader = (title, contentId, toggleId) => `
            <div class="mb-6 border-t pt-8 dark:border-slate-700">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${title}</h2>
                    <button id="${toggleId}" onclick="app.toggleDiarioSection('${contentId}', '${toggleId}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-expanded="false" aria-controls="${contentId}">
                        <i class="fas fa-chevron-down mr-1"></i><span data-label>Expandir</span>
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="w-full">
                <div id="${notasContentId}" class="space-y-6">
                    ${emptyMsg}${turmasNotasHtml}
                </div>
            </div>
        `;
        for (const t of minhasTurmas) {
            const label = app.formatTurmaLabelText(t, 'Turma', true);
            app.renderTurmaResultados(t.id, label, { mode: 'notasTrabalhos', targetPrefix: 'dash-notas-turma' });
        }
    };

    // Gera PDF do conteúdo atual do manual (usa html2pdf carregado via CDN)
    app.downloadManualPDF = async function() {
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            // Prefer the manual container block if present
            const manualBlock = document.querySelector('#content-area .max-w-4xl');
            const element = manualBlock || document.getElementById('content-area');
            if (!element) return alert('Conteúdo do manual não encontrado para exportar.');
            const opt = { margin: 0.5, filename: 'Manual_SENATEDU.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            html2pdf().set(opt).from(element).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        }
    };

    app.downloadGabaritoPDF = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        let container = null;
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const componentes = await app.getComponentesCache();
            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const dataFormatada = prova.dataAgendada ? new Date(prova.dataAgendada).toLocaleString('pt-BR') : 'Data n/d';
            let turmaLabelText = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaLabelText = app.formatTurmaLabelText(turma, prova.turmaNome || 'N/D', true);
                }
            }
            const turmaLabelHtml = app.formatTurmaTextToHtml(turmaLabelText, 'N/D');
            const safe = app.escapeHtml || ((v) => String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'));
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            const questoesHtml = (prova.questions || []).map((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                const correctIdx = Number.isInteger(q.correct) ? q.correct : 0;
                const correctLetter = letters[correctIdx] || String.fromCharCode(65 + correctIdx);
                const correctText = opts[correctIdx] || '';
                const optsHtml = opts.length === 0 ? '<li>(Sem opções cadastradas)</li>' : opts.map((opt, oidx) => {
                    const letter = letters[oidx] || String.fromCharCode(65 + oidx);
                    const isCorrect = oidx === correctIdx;
                    const optText = String(opt || '').trim();
                    // Verifica se a opção já começa com a letra (ex: "A) texto")
                    const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
                    const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
                    return `<li style="margin: 2px 0;${isCorrect ? ' font-weight: 700;' : ''}">${safe(displayText)}</li>`;
                }).join('');

                // Remove a letra da resposta se ela já estiver incluída no texto
                const correctTextClean = String(correctText || '').trim();
                const correctTextDisplay = /^[A-Z]\)\s/.test(correctTextClean) 
                    ? correctTextClean.substring(3).trim() 
                    : correctTextClean;
                
                return `
                    <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
                        <div style="font-weight: 700; margin-bottom: 6px;">${idx + 1}. ${safe(q.text || '')}</div>
                        <ul style="margin: 0 0 6px 16px; padding: 0; list-style: none;">${optsHtml}</ul>
                        <div style="font-size: 12px; color: #111827;"><span style="font-weight: 700;">Resposta correta:</span> ${correctLetter}${correctTextDisplay ? ' - ' + safe(correctTextDisplay) : ''}</div>
                    </div>
                `;
            }).join('');

            container = document.createElement('div');
            container.style.background = '#ffffff';
            container.style.padding = '24px';
            container.style.width = '800px';
            container.innerHTML = `
                <div style="font-family: Arial, sans-serif; color: #111827;">
                    <div style="border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 16px;">
                        <div style="font-size: 20px; font-weight: 700;">Gabarito - ${safe(prova.titulo || 'Prova')}</div>
                        <div style="font-size: 12px; color: #374151;">Turma: ${turmaLabelHtml}</div>
                        <div style="font-size: 12px; color: #374151;">Componente: ${safe(compNome)}</div>
                        <div style="font-size: 12px; color: #374151;">Data: ${safe(dataFormatada)}</div>
                        <div style="font-size: 12px; color: #374151;">Total de questões: ${(prova.questions || []).length}</div>
                    </div>
                    ${questoesHtml}
                </div>
            `;
            document.body.appendChild(container);

            const fileBase = String(prova.titulo || 'Prova')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '');
            const filename = `Gabarito_${fileBase || 'Prova'}.pdf`;
            const opt = { margin: 0.5, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            await html2pdf().set(opt).from(container).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        } finally {
            if (container && container.parentNode) container.parentNode.removeChild(container);
        }
    };

    app.downloadProvaImpressaPDF = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        let container = null;
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const componentes = await app.getComponentesCache();
            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const dataFormatada = prova.dataAgendada ? new Date(prova.dataAgendada).toLocaleString('pt-BR') : 'Data n/d';
            let turmaLabelText = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaLabelText = app.formatTurmaLabelText(turma, prova.turmaNome || 'N/D', true);
                }
            }
            const turmaLabelHtml = app.formatTurmaTextToHtml(turmaLabelText, 'N/D');
            const safe = app.escapeHtml || ((v) => String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'));
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            const questoesHtml = (prova.questions || []).map((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                const optsHtml = opts.length === 0
                    ? '<li style="margin: 4px 0;">(Sem opções cadastradas)</li>'
                    : opts.map((opt, oidx) => {
                        const letter = letters[oidx] || String.fromCharCode(65 + oidx);
                        const optText = String(opt || '').trim();
                        const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
                        const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
                        return `<li style="margin: 4px 0;">${safe(displayText)}</li>`;
                    }).join('');

                return `
                    <div style="margin-bottom: 18px; page-break-inside: avoid;">
                        <div style="font-weight: 700; margin-bottom: 8px;">${idx + 1}. ${safe(q.text || '')}</div>
                        <ul style="margin: 0 0 0 16px; padding: 0; list-style: none;">${optsHtml}</ul>
                    </div>
                `;
            }).join('');

            container = document.createElement('div');
            container.style.background = '#ffffff';
            container.style.padding = '24px';
            container.style.width = '800px';
            container.innerHTML = `
                <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.35;">
                    <div style="border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px;">
                        <div style="font-size: 20px; font-weight: 700;">${safe(prova.titulo || 'Prova')}</div>
                        <div style="font-size: 12px; color: #374151; margin-top: 4px;">Turma: ${turmaLabelHtml}</div>
                        <div style="font-size: 12px; color: #374151;">Componente: ${safe(compNome)}</div>
                        <div style="font-size: 12px; color: #374151;">Data: ${safe(dataFormatada)}</div>
                        <div style="font-size: 12px; color: #374151;">Total de questões: ${(prova.questions || []).length}</div>
                        <div style="margin-top: 12px; font-size: 13px;"><strong>Aluno:</strong> ________________________________________________</div>
                    </div>
                    ${questoesHtml}
                </div>
            `;
            document.body.appendChild(container);

            const fileBase = String(prova.titulo || 'Prova')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '');
            const filename = `Prova_Impressa_${fileBase || 'Prova'}.pdf`;
            const opt = { margin: 0.5, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            await html2pdf().set(opt).from(container).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        } finally {
            if (container && container.parentNode) container.parentNode.removeChild(container);
        }
    };

    app.exportarResultadosProvaExcel = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }

        try {
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões cadastradas.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const [allResultados, allUsers, componentes] = await Promise.all([
                app.getCollection('provas_resultados'),
                app.getCollection('users'),
                app.getComponentesCache()
            ]);

            let turmaNome = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaNome = app.formatTurmaLabelText(turma, turmaNome, true);
                }
            }

            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const questions = prova.questions || [];
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            // Filtrar resultados desta prova (melhor tentativa quando houver múltiplas tentativas ou tentativas ilimitadas)
            const resultadosDaProva = allResultados.filter(r => r.provaId === provaId);
            const usarMelhorNota = typeof prova.attempts === 'number' && (prova.attempts === 0 || prova.attempts > 1);
            const melhorTentativaPorAluno = new Map();
            resultadosDaProva.forEach(r => {
                const prev = melhorTentativaPorAluno.get(r.alunoId);
                if (usarMelhorNota) {
                    const rNota = parseFloat(r.nota);
                    const prevNota = prev ? parseFloat(prev.nota) : -Infinity;
                    if (!prev || rNota > prevNota) melhorTentativaPorAluno.set(r.alunoId, r);
                } else {
                    const rMs = (r.data?.toDate ? r.data.toDate() : new Date(r.data?.seconds ? r.data.seconds * 1000 : r.data || 0)).getTime() || 0;
                    const prevMs = prev ? ((prev.data?.toDate ? prev.data.toDate() : new Date(prev.data?.seconds ? prev.data.seconds * 1000 : prev.data || 0)).getTime() || 0) : -1;
                    if (!prev || rMs > prevMs) melhorTentativaPorAluno.set(r.alunoId, r);
                }
            });

            if (melhorTentativaPorAluno.size === 0) return alert('Nenhum resultado encontrado para esta prova.');

            const usersMap = new Map(allUsers.map(u => [u.id, u]));

            // Cabeçalho
            const header = ['Nome do Aluno', 'Turma', 'Componente Curricular', 'Nota'];
            questions.forEach((q, idx) => {
                const label = `Q${idx + 1}`;
                header.push(`${label} - Resposta do Aluno`);
                header.push(`${label} - Gabarito`);
                header.push(`${label} - Resultado`);
            });

            // Linhas por aluno
            const rows = [];
            const sortedEntries = [...melhorTentativaPorAluno.entries()]
                .map(([alunoId, resultado]) => ({ alunoId, resultado }))
                .sort((a, b) => {
                    const nA = usersMap.get(a.alunoId)?.nome || '';
                    const nB = usersMap.get(b.alunoId)?.nome || '';
                    return nA.localeCompare(nB, 'pt-BR', { sensitivity: 'base' });
                });

            sortedEntries.forEach(({ alunoId, resultado }) => {
                const user = usersMap.get(alunoId);
                const nomeAluno = user?.nome || `Aluno (${alunoId})`;
                const nota = parseFloat(resultado.nota);
                const respostas = Array.isArray(resultado.respostas) ? resultado.respostas : [];

                const row = [nomeAluno, turmaNome, compNome, Number.isFinite(nota) ? nota.toFixed(1) : ''];

                questions.forEach((q, idx) => {
                    const correctIdx = Number.isInteger(q.correct) ? q.correct : 0;
                    const alunoIdx = respostas[idx];
                    const opts = Array.isArray(q.options) ? q.options : [];

                    const gabarito = letters[correctIdx] || String.fromCharCode(65 + correctIdx);
                    const resposta = Number.isInteger(alunoIdx)
                        ? (letters[alunoIdx] || String.fromCharCode(65 + alunoIdx))
                        : '-';
                    const acertou = Number.isInteger(alunoIdx) && alunoIdx === correctIdx ? 'CERTO' : 'ERRADO';

                    row.push(resposta);
                    row.push(gabarito);
                    row.push(acertou);
                });

                rows.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

            // Larguras de coluna
            ws['!cols'] = [
                { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 8 },
                ...questions.flatMap(() => [{ wch: 18 }, { wch: 12 }, { wch: 10 }])
            ];

            const wb = XLSX.utils.book_new();
            const sheetName = String(prova.titulo || 'Resultados').replace(/[\\\/\*\?\[\]\:]/g, '').slice(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            const fileBase = String(prova.titulo || 'Prova').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
            XLSX.writeFile(wb, `Resultados_${fileBase || 'Prova'}.xlsx`);
        } catch (err) {
            console.error('Erro ao exportar resultados:', err);
            alert('Erro ao exportar: ' + (err && err.message));
        }
    };

    app.modalCriarProva = async function(tipo, id = null, options = {}) {
        const turmas = await app.getCollection('turmas');
        const isCopyMode = options && options.copyMode === true;
        const isEditing = Boolean(id) && !isCopyMode;

        app.tempQuestoes = [];
        let provaEdit = null;
        const atividadeContext = tipo === 'atividade' && !id && !isCopyMode ? app._atividadeSalaContext : null;

        if(id) {
            provaEdit = await getProvaById(id);
            if(provaEdit) {
                app.tempQuestoes = isCopyMode ? cloneQuestoes(provaEdit.questions || []) : (provaEdit.questions || []);
            }
        }

        const turmasAtivas = turmas.filter(t => !t.concluida);
        let turmasPermitidas = turmasAtivas;
        if (app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        }
        if (isEditing && provaEdit && provaEdit.turmaId && !turmasPermitidas.some(t => t.id === provaEdit.turmaId)) {
            const turmaAtual = turmas.find(t => t.id === provaEdit.turmaId);
            if (turmaAtual) turmasPermitidas = [...turmasPermitidas, turmaAtual];
        }
        if (!isEditing && turmasPermitidas.length === 0) {
            alert('Não há turmas ativas disponíveis para cadastrar nova avaliação.');
            return;
        }
        
        const avaliacaoLabel = tipo === 'atividade' ? 'atividade EAD' : 'prova';
        const avaliacaoLabelCap = tipo === 'atividade' ? 'Atividade EAD' : 'Prova';
        const origemTurmaHtml = provaEdit ? app.formatTurmaTextToHtml(provaEdit.turmaNome || 'Turma original') : '';
        const origemCriador = provaEdit ? String(provaEdit.criadoPorNome || '').trim() : '';
        const origemData = provaEdit && provaEdit.dataAgendada ? formatDateTimeLabel(provaEdit.dataAgendada) : '';

        const content = `
            <div class="space-y-4">
                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Dados da ${avaliacaoLabel}</summary>
                    ${isCopyMode ? `
                    <div class="mt-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                        <div class="font-semibold">Você está criando uma nova prova com base nesta avaliação.</div>
                        <div><span class="font-semibold">Origem:</span> ${app.escapeHtml(provaEdit?.titulo || 'Prova')}</div>
                        <div><span class="font-semibold">Turma original:</span><div class="mt-1">${origemTurmaHtml}</div></div>
                        ${origemCriador ? `<div><span class="font-semibold">Criada por:</span> ${app.escapeHtml(origemCriador)}</div>` : ''}
                        ${origemData ? `<div><span class="font-semibold">Data:</span> ${app.escapeHtml(origemData)}</div>` : ''}
                        <div class="font-medium">Escolha outra turma para salvar a cópia.</div>
                    </div>` : ''}
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div><label class="block text-sm font-bold mb-1">Título</label><input id="prova-titulo" value="${provaEdit ? provaEdit.titulo : ''}" placeholder="Ex: ${avaliacaoLabelCap} 1 - Matematica" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Turma</label>
                            <select id="prova-turma" onchange="app.handleProvaTurmaChange(this.value)" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione...</option>
                                ${turmasPermitidas.map(t => `<option value="${t.id}" data-nome="${app.formatTurmaLabelText(t, 'Turma', true)}" ${isEditing && provaEdit && provaEdit.turmaId === t.id ? 'selected' : (atividadeContext && atividadeContext.turmaId === t.id ? 'selected' : '')}>${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Componente Curricular</label>
                            <select id="prova-comp" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione a turma primeiro...</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Data Inicial</label>
                            <input type="datetime-local" id="prova-data-inicio" value="${provaEdit ? (provaEdit.dataInicio || provaEdit.dataAgendada || '') : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Data Final</label>
                            <input type="datetime-local" id="prova-data-fim" value="${provaEdit ? (provaEdit.dataFim || '') : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Tentativas (0 = ilimitado)</label>
                            <input type="number" id="prova-attempts" min="0" value="${provaEdit ? (typeof provaEdit.attempts !== 'undefined' ? provaEdit.attempts : 1) : 1}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Valor da ${avaliacaoLabelCap} <span class="text-xs font-normal text-gray-400">(normal: máx. 60 pts | recuperação: fixo 100 pts)</span></label>
                            <input type="number" id="prova-valor" min="0" max="100" step="0.5" value="${provaEdit && provaEdit.provaRecuperacao ? 100 : (provaEdit && provaEdit.valor != null ? provaEdit.valor : 10)}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    ${tipo !== 'atividade' ? `
                    <div class="mt-3">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" id="prova-recuperacao" ${provaEdit && provaEdit.provaRecuperacao ? 'checked' : ''} onchange="app.toggleRecuperacaoAlunosPanel(this.checked)" class="w-4 h-4 accent-orange-600 rounded border-gray-300 focus:ring-orange-500">
                            <span class="text-sm font-semibold text-orange-700 dark:text-orange-400">Prova de Recuperação</span>
                            <span class="text-xs text-gray-400 dark:text-gray-500">(esta prova vale 100 pts, mas o sistema considera no máximo 60 pts)</span>
                        </label>
                    </div>
                    <div id="recuperacao-alunos-panel" class="${provaEdit && provaEdit.provaRecuperacao ? '' : 'hidden'} mt-3 border border-orange-200 dark:border-orange-800 rounded-lg p-3 bg-orange-50 dark:bg-orange-950/20">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-semibold text-orange-700 dark:text-orange-400"><i class="fas fa-users mr-1"></i>Alunos autorizados para recuperação</span>
                            <div class="flex gap-2">
                                <button type="button" onclick="app.selecionarTodosAlunosRecuperacao(true)" class="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200">Todos</button>
                                <button type="button" onclick="app.selecionarTodosAlunosRecuperacao(false)" class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200">Nenhum</button>
                            </div>
                        </div>
                        <div id="recuperacao-notify-preview" class="mb-2 text-xs text-orange-700 dark:text-orange-300 font-medium">
                            Nenhum aluno selecionado para notificação.
                        </div>
                        <div id="recuperacao-alunos-lista" class="max-h-48 overflow-y-auto space-y-1 text-sm">
                            <span class="text-xs text-gray-400 italic">Selecione uma turma para carregar os alunos.</span>
                        </div>
                    </div>` : ''}
                    ${tipo === 'atividade' ? `
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Sala</label>
                            <select id="atividade-sala" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Sala Principal</option>
                            </select>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-end">
                            Selecione a sala da turma para organizar as atividades.
                        </div>
                    </div>
                    ` : ''}
                </details>

                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Gerar com IA (local)</summary>
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            Requer servidor local em http://localhost:11435 (proxy para Ollama).
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="app.gerarQuestoesIA()" class="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">
                                <i class="fas fa-wand-magic-sparkles mr-1"></i>Gerar questoes
                            </button>
                            <button onclick="app.gerarQuestoesIAComPDF()" class="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-700">
                                <i class="fas fa-file-pdf mr-1"></i>Gerar do PDF
                            </button>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input id="ai-tema" placeholder="Tema/assunto (ex: Funcoes do 1o grau)" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <select id="ai-quantidade" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="10" selected>10 questões</option>
                            <option value="20">20 questões</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <select id="ai-dificuldade" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="facil">Facil</option>
                            <option value="media" selected>Media</option>
                            <option value="dificil">Dificil</option>
                        </select>
                        <input id="ai-modelo" placeholder="Modelo (IA)" value="llama-3.1-8b-instant" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="ai-pdf-file" type="file" accept=".pdf" class="block w-full text-xs text-gray-700 dark:text-gray-200 file:mr-2 file:py-1 file:px-3 file:border-0 file:text-xs file:font-semibold file:rounded file:bg-gray-100 dark:file:bg-slate-600 dark:file:text-white">
                    </div>
                </details>

                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Questoes</summary>
                    <div class="flex justify-between items-center mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">Edite inline e defina a correta.</div>
                        <div class="flex gap-2">
                            <button onclick="app.baixarModeloQuestoes()" class="text-xs text-blue-600 underline">Baixar Modelo Excel</button>
                            <label class="cursor-pointer bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                                <i class="fas fa-file-excel mr-1"></i> Importar Excel
                                <input type="file" hidden accept=".xlsx, .xls" onchange="app.importarQuestoesExcel(this)">
                            </label>
                        </div>
                    </div>

                    <div id="lista-questoes" class="space-y-2 mb-4 max-h-64 overflow-y-auto"></div>

                    <div class="bg-gray-50 dark:bg-slate-700 p-3 rounded-lg border dark:border-slate-600">
                        <div class="flex gap-2 mb-2">
                            <input id="q-enunciado" placeholder="Enunciado da questao..." class="flex-1 border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <input id="q-op1" placeholder="Opcao A (Correta)" class="border p-2 rounded border-green-300 dark:bg-slate-600 dark:border-green-800 dark:text-white">
                            <input id="q-op2" placeholder="Opcao B" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op3" placeholder="Opcao C" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op4" placeholder="Opcao D" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <button onclick="app.addQuestao()" class="w-full py-1 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-slate-500">+ Adicionar Manualmente</button>
                    </div>
                </details>
            </div>
        `;

        const resolvePublished = (override) => {
            if (typeof override === 'boolean') return override;
            if (isCopyMode) return false;
            if (provaEdit && typeof provaEdit.published === 'boolean') return provaEdit.published;
            return false;
        };

        const resolveWasPublished = (override) => {
            if (override === true) return true;
            if (isCopyMode) return false;
            if (provaEdit && provaEdit.wasPublished === true) return true;
            if (provaEdit && provaEdit.published === true) return true;
            return false;
        };

        const saveProva = async (publishOverride = null) => {
            const titulo = document.getElementById('prova-titulo').value;
            const select = document.getElementById('prova-turma');
            const turmaId = select.value;
            const turmaNome = select.options[select.selectedIndex]?.dataset.nome;
            const componenteId = document.getElementById('prova-comp').value;
            const compSelect = document.getElementById('prova-comp');
            const componenteNome = compSelect?.options[compSelect.selectedIndex]?.textContent?.trim() || 'Componente';
            const dataInicio = document.getElementById('prova-data-inicio').value;
            const dataFim = document.getElementById('prova-data-fim').value;
            const dataAgendada = dataInicio;
            const attemptsVal = parseInt(document.getElementById('prova-attempts').value, 10);
            const attempts = Number.isInteger(attemptsVal) && attemptsVal >= 0 ? attemptsVal : 1;
            const provaRecuperacaoEl = document.getElementById('prova-recuperacao');
            const provaRecuperacao = tipo !== 'atividade' && provaRecuperacaoEl ? provaRecuperacaoEl.checked : false;
            const valorRaw = parseFloat(document.getElementById('prova-valor')?.value);
            const valorProva = provaRecuperacao
                ? 100
                : ((!isNaN(valorRaw) && valorRaw >= 0 && valorRaw <= 60) ? valorRaw : 10);
            const alunosPermitidos = provaRecuperacao
                ? Array.from(document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked')).map(el => el.dataset.alunoId)
                : null;
            let salaId = null;
            let salaNome = null;
            if (tipo === 'atividade') {
                const salaSelect = document.getElementById('atividade-sala');
                if (salaSelect) {
                    salaId = salaSelect.value || null;
                    const salaLabel = salaSelect.options[salaSelect.selectedIndex]?.textContent || '';
                    salaNome = salaId ? salaLabel.trim() : null;
                }
            }

            if(!titulo || !turmaId || !componenteId || !dataInicio || !dataFim || app.tempQuestoes.length === 0) throw new Error("Preencha todos os dados (incluindo Data Inicial e Data Final) e adicione questões.");
            
            // Validar que todas as questões têm pelo menos 4 opções válidas
            const questoesInvalidas = app.tempQuestoes.filter((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options.filter(o => String(o || '').trim()) : [];
                if (opts.length < 4) {
                    console.warn(`Questão ${idx + 1} tem apenas ${opts.length} opções válidas:`, q.options);
                    return true;
                }
                return false;
            });
            
            if (questoesInvalidas.length > 0) {
                throw new Error(`${questoesInvalidas.length} questão(ões) com menos de 4 opções válidas. Verifique o console para detalhes.`);
            }
            
            if (new Date(dataFim) <= new Date(dataInicio)) throw new Error('A Data Final deve ser posterior à Data Inicial.');
            if (isCopyMode && provaEdit && turmaId === provaEdit.turmaId) throw new Error('Selecione outra turma para salvar a cópia da prova.');
            if (provaRecuperacao && (!Array.isArray(alunosPermitidos) || alunosPermitidos.length === 0)) {
                throw new Error('Selecione pelo menos um aluno para a prova de recuperação.');
            }

            const payload = {
                titulo, turmaId, turmaNome, componenteId, tipo, dataAgendada,
                dataInicio,
                dataFim,
                valor: valorProva,
                provaRecuperacao: provaRecuperacao,
                alunosPermitidos: alunosPermitidos,
                questions: app.tempQuestoes,
                attempts,
                published: resolvePublished(publishOverride),
                wasPublished: resolveWasPublished(publishOverride)
            };
            if (tipo === 'atividade') {
                payload.salaId = salaId;
                payload.salaNome = salaNome;
            }

            const tipoBase = tipo === 'atividade' ? 'atividade' : 'prova';
            if(isEditing) {
                await updateProva(id, payload);
                if (app.logAcesso) app.logAcesso(`${tipoBase}_editada`, `${tipoBase}:${titulo}`);
            } else {
                await createProva({
                    ...payload,
                    criadoPorId: app.currentUserData?.id || null,
                    criadoPorNome: app.currentUserData?.nome || '',
                    copiadaDeProvaId: isCopyMode ? id : null,
                    copiadaDeTitulo: isCopyMode ? (provaEdit?.titulo || '') : '',
                    copiadaDeTurmaNome: isCopyMode ? (provaEdit?.turmaNome || '') : ''
                });
                if (app.logAcesso) app.logAcesso(isCopyMode ? `${tipoBase}_copiada` : `${tipoBase}_criada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true && app.logAcesso) {
                app.logAcesso(`${tipoBase}_publicada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true) {
                // Formatar data de forma mais clara
                let dataFormatada = 'Data não definida';
                if (dataAgendada) {
                    const dataProva = new Date(dataAgendada);
                    const dataStr = dataProva.toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                    });
                    const horaStr = dataProva.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    dataFormatada = `${dataStr} às ${horaStr}`;
                }
                
                const turmaLabel = String(turmaNome || 'Turma').replace(/\n/g, ' ');
                const assunto = `${tipoBase === 'atividade' ? 'Atividade EAD' : app.capitalize(tipoBase)} publicada: ${titulo}`;
                const mensagem = `Curso: ${turmaLabel}\nComponente: ${componenteNome}\nData: ${dataFormatada}`;
                if (provaRecuperacao) {
                    const totalSelecionados = Array.isArray(alunosPermitidos) ? alunosPermitidos.length : 0;
                    const confirmMsg = totalSelecionados === 1
                        ? 'Publicar esta prova de recuperação e notificar 1 aluno selecionado?'
                        : `Publicar esta prova de recuperação e notificar ${totalSelecionados} alunos selecionados?`;
                    if (!confirm(confirmMsg)) return;
                }
                
                // Enviar notificações (email + push para celular)
                app.notifyAlunosTurma(turmaId, assunto, mensagem, { 
                    turmaNome: turmaLabel,
                    link: `${window.location.origin}/#${tipo === 'atividade' ? 'atividades' : 'provas'}`,
                    notificationType: tipo === 'atividade' ? 'atividade' : 'prova',
                    targetAlunoIds: provaRecuperacao ? alunosPermitidos : null
                });
            }
            app.renderContent();
        };

        const modalTitle = tipo === 'atividade'
            ? (isEditing ? 'Editar Atividade EAD' : (isCopyMode ? 'Copiar Atividade EAD' : 'Nova Atividade EAD'))
            : (isEditing ? `Editar ${app.capitalize(tipo)}` : (isCopyMode ? `Copiar ${app.capitalize(tipo)}` : `Nova ${app.capitalize(tipo)}`));

        app.showModal(modalTitle, content, async () => {
            await saveProva(null);
        }, {
            secondaryLabel: 'Publicar',
            secondaryClass: 'px-4 py-2 bg-emerald-600 text-white rounded-lg',
            onSecondary: async () => {
                await saveProva(true);
            }
        });

        setTimeout(() => {
            const recuperacaoEl = document.getElementById('prova-recuperacao');
            app.syncValorProvaByRecuperacao(Boolean(recuperacaoEl && recuperacaoEl.checked));
            app.updateRecuperacaoSelectionInfo();
            app.updateRecuperacaoPublishButtonLabel();
        }, 0);

        app.renderListaQuestoes();
        setTimeout(() => {
            const tituloInput = document.getElementById('prova-titulo');
            if (tituloInput) {
                tituloInput.focus();
                tituloInput.setSelectionRange(tituloInput.value.length, tituloInput.value.length);
            }
        }, 50);
        const initialTurmaId = isEditing ? (provaEdit ? provaEdit.turmaId : null) : (atividadeContext ? atividadeContext.turmaId : null);
        const initialSalaId = isEditing ? (provaEdit ? (provaEdit.salaId || null) : null) : (atividadeContext ? atividadeContext.salaId || null : null);
        const initialAlunosPermitidos = provaEdit && Array.isArray(provaEdit.alunosPermitidos) ? provaEdit.alunosPermitidos : null;
        if (initialTurmaId) {
            app.handleProvaTurmaChange(initialTurmaId, provaEdit ? provaEdit.componenteId : null, initialSalaId, initialAlunosPermitidos);
        }
    };

    app.baixarModeloQuestoes = function() {
        const data = [ { Enunciado: "Quanto é 2+2?", OpcaoA: "4", OpcaoB: "3", OpcaoC: "5", OpcaoD: "6", Correta: "A" }, { Enunciado: "Capital do Brasil?", OpcaoA: "Brasília", OpcaoB: "Rio", OpcaoC: "SP", OpcaoD: "Bahia", Correta: "A" } ];
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Questoes"); XLSX.writeFile(wb, "Modelo_Questoes_Prova.xlsx");
    };

    app.importarQuestoesExcel = function(input) {
        const file = input.files[0]; if(!file) return; const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                let imported = 0;
                json.forEach(row => {
                    if(row.Enunciado && row.OpcaoA) {
                        let correctIdx = 0; const c = String(row.Correta).toUpperCase().trim();
                        if(c === 'B') correctIdx = 1; if(c === 'C') correctIdx = 2; if(c === 'D') correctIdx = 3;
                        app.tempQuestoes.push({ id: Date.now() + Math.random(), text: row.Enunciado, options: [row.OpcaoA, row.OpcaoB, row.OpcaoC, row.OpcaoD], correct: correctIdx, timeLimit: null });
                        imported++;
                    }
                });
                app.renderListaQuestoes(); alert(`${imported} questões importadas!`); input.value = '';
            } catch(err) { alert("Erro na importação: " + err.message); }
        }; reader.readAsArrayBuffer(file);
    };

    app.completarQuantidadeQuestoesIA = async function(questions, quantidade, gerarLote) {
        const merged = Array.isArray(questions) ? [...questions] : [];
        let attempt = 0;
        const maxAttempts = 4;
        const minBatchSize = 3;

        while (merged.length < quantidade && attempt < maxAttempts) {
            const faltantes = quantidade - merged.length;
            attempt += 1;
            try {
                const loteSolicitado = Math.max(faltantes, minBatchSize);
                const extra = await gerarLote(loteSolicitado);
                if (!Array.isArray(extra) || extra.length === 0) break;
                extra.forEach(q => merged.push(q));
            } catch (err) {
                console.warn('⚠️? Falha ao complementar questões da IA:', err);
                break;
            }
        }

        return merged.slice(0, quantidade);
    };

    app.gerarQuestoesIA = async function() {
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeRaw = parseInt(document.getElementById('ai-quantidade')?.value || '10', 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'llama-3.1-8b-instant').trim();
        const quantidade = quantidadeRaw === 20 ? 20 : 10;
        const tempo = 60;

        if (!tema) return alert('Informe o tema/assunto para gerar as questoes.');
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions';

        try {
            console.log('🚀 Gerando questões com IA:', { tema, quantidade, dificuldade, tempo, modelo, endpoint });
            if (app.showToast) app.showToast('Gerando questoes com IA local...', 'info');
            const gerarLote = async (quantidadeLote) => {
                const payload = JSON.stringify({ tema, quantidade: quantidadeLote, dificuldade, tempo, modelo });
                let res = null;
                let lastError = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        res = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: payload
                        });
                        if (res.ok) break;
                    } catch (err) {
                        lastError = err;
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
                if (!res || !res.ok) {
                    let detail = '';
                    if (res) {
                        console.error('❌?❌ Resposta não OK:', res.status, res.statusText);
                        try {
                            const errPayload = await res.json();
                            console.error('❌?❌ Erro da API:', errPayload);
                            detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                        } catch {
                            try {
                                const textError = await res.text();
                                console.error('❌?❌ Erro (texto):', textError);
                                detail = `: ${textError}`;
                            } catch { detail = ''; }
                        }
                        throw new Error(`Falha no servidor IA (${res.status})${detail}`);
                    }
                    console.error('❌?❌ Sem resposta do servidor:', lastError);
                    throw new Error(`Falha no servidor IA: ${lastError ? lastError.message : 'Sem resposta'}`);
                }
                console.log('✅ Resposta OK:', res.status, res.statusText);
                const responsePayload = await res.json();
                console.log('🤖 Resposta da IA (raw):', responsePayload);
                console.log('📊 Tipo da resposta:', typeof responsePayload);
                console.log('📊 É array?:', Array.isArray(responsePayload));
                console.log('📊 Tem questions?:', responsePayload?.questions);
                return app.normalizeQuestoesIA(responsePayload);
            };

            let questions = await gerarLote(quantidade);
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, gerarLote);
            }

            console.log('✅ Questões normalizadas:', questions.length, questions);

            if (questions.length === 0) {
                console.error('❌?❌ Nenhuma questão válida retornada pela IA.');
                throw new Error('Nenhuma questao valida retornada. Verifique o console para detalhes.');
            }
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas.`, 'success');
        } catch (err) {
            console.error('Erro IA:', err);
            alert('Erro ao gerar questoes: ' + (err && err.message ? err.message : err));
        }
    };

    app.gerarQuestoesIAComPDF = async function() {
        const fileInput = document.getElementById('ai-pdf-file');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeRaw = parseInt(document.getElementById('ai-quantidade')?.value || '10', 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'llama-3.1-8b-instant').trim();
        const quantidade = quantidadeRaw === 20 ? 20 : 10;
        const tempo = 60;

        if (!file) return alert('Selecione um PDF para gerar as questoes.');
        const endpoint = localStorage.getItem('aiPdfEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions-from-pdf';

        try {
            if (app.showToast) app.showToast('Lendo PDF e gerando questoes...', 'info');
            const gerarLote = async (quantidadeLote) => {
                const form = new FormData();
                form.append('file', file);
                form.append('tema', tema);
                form.append('quantidade', String(quantidadeLote));
                form.append('dificuldade', dificuldade);
                form.append('tempo', String(tempo));
                form.append('modelo', modelo);

                let res = null;
                let lastError = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        res = await fetch(endpoint, {
                            method: 'POST',
                            body: form
                        });
                        if (res.ok) break;
                    } catch (err) {
                        lastError = err;
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
                if (!res || !res.ok) {
                    let detail = '';
                    if (res) {
                        try {
                            const errPayload = await res.json();
                            detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                        } catch {
                            try { detail = `: ${await res.text()}`; } catch { detail = ''; }
                        }
                        throw new Error(`Falha no servidor IA (${res.status})${detail}`);
                    }
                    throw new Error(`Falha no servidor IA: ${lastError ? lastError.message : 'Sem resposta'}`);
                }
                return await res.json();
            };

            let payload = await gerarLote(quantidade);
            let questions = app.normalizeQuestoesIA(payload);
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, async (faltantes) => {
                    const complementoPayload = await gerarLote(faltantes);
                    return app.normalizeQuestoesIA(complementoPayload);
                });
            }
            if (questions.length === 0) throw new Error('Nenhuma questao valida retornada.');
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            if (payload && payload.warning) {
                if (app.showToast) app.showToast(payload.warning, 'info');
                else alert(payload.warning);
            }
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas do PDF.`, 'success');
        } catch (err) {
            console.error('Erro IA PDF:', err);
            alert('Erro ao gerar questoes do PDF: ' + (err && err.message ? err.message : err));
        }
    };

    app.testarIA = async function() {
        if (!app.currentUserData || !(app.perms && app.perms.canManageSistema())) {
            return alert('Acesso restrito.');
        }
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions';
        const tempo = 60;
        const payload = JSON.stringify({
            tema: 'Teste rapido do sistema',
            quantidade: 1,
            dificuldade: 'media',
            tempo,
            modelo: 'llama-3.1-8b-instant'
        });
        try {
            if (app.showToast) app.showToast('Testando IA...', 'info');
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const errPayload = await res.json();
                    detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                } catch {
                    try { detail = `: ${await res.text()}`; } catch { detail = ''; }
                }
                throw new Error(`Falha no servidor IA (${res.status})${detail}`);
            }
            const responsePayload = await res.json();
            const questions = app.normalizeQuestoesIA(responsePayload, tempo);
            if (questions.length === 0) {
                const hint = responsePayload && responsePayload.warning
                    ? ` (${responsePayload.warning})`
                    : '';
                if (app.showToast) app.showToast(`IA respondeu, mas sem questoes validas${hint}.`, 'warning');
                else alert(`IA respondeu, mas sem questoes validas${hint}.`);
                return;
            }
            if (app.showToast) app.showToast('IA OK: resposta valida recebida.', 'success');
            else alert('IA OK: resposta valida recebida.');
        } catch (err) {
            console.error('Erro teste IA:', err);
            alert('Erro ao testar IA: ' + (err && err.message ? err.message : err));
        }
    };

    app.backupSistema = async function() {
        if (!app.currentUserData || !(app.perms && app.perms.canManageSistema())) {
            return alert('Acesso restrito.');
        }
        const collections = [
            'users',
            'turmas',
            'componentes',
            'provas',
            'provas_resultados',
            'trabalhos_notas',
            'avisos',
            'eventos_calendario',
            'materiais',
            'logs_acesso',
            'atividades_salas',
            'trabalhos_salas',
            'forum_salas'
        ];
        const backup = {
            generatedAt: new Date().toISOString(),
            collections: {},
            counts: {}
        };
        try {
            if (app.showToast) app.showToast('Gerando backup...', 'info');
            for (const name of collections) {
                try {
                    const docs = await app.getCollection(name);
                    backup.collections[name] = docs;
                    backup.counts[name] = docs.length;
                } catch (err) {
                    backup.collections[name] = { error: err && err.message ? err.message : String(err) };
                    backup.counts[name] = 0;
                }
            }
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const a = document.createElement('a');
            a.href = url;
            a.download = `senatedu-backup-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            if (app.showToast) app.showToast('Backup pronto para download.', 'success');
        } catch (err) {
            console.error('Erro backup:', err);
            alert('Erro ao gerar backup: ' + (err && err.message ? err.message : err));
        }
    };

    app.normalizeQuestoesIA = function(payload) {
        console.log('🔄 Normalizando questões IA. Payload:', payload);
        
        let data = payload;
        if (data && typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = { questions: [] }; }
        }
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
        console.log('📋 Questões raw extraídas:', raw.length, raw);
        
        const normalized = [];
        raw.forEach((q, index) => {
            console.log(`❌? Processando questão ${index + 1}:`, q);
            
            const text = (q.text || q.enunciado || '').trim();
            if (!text) {
                console.warn(`⚠️? Questão ${index + 1} sem texto/enunciado`);
                return;
            }
            
            let options = q.options || q.alternativas || q.opcoes || q.opcoesAlternativas;
            console.log(`❌? Opções encontradas para questão ${index + 1}:`, options, 'tipo:', typeof options);
            
            if (options && !Array.isArray(options) && typeof options === 'object') {
                options = Object.values(options);
                console.log(`🔄 Opções convertidas de objeto para array:`, options);
            }
            if (!Array.isArray(options)) {
                console.warn(`⚠️? Questão ${index + 1} sem opções em formato de array. Tipo encontrado:`, typeof options);
                return;
            }
            
            console.log(`📝 Opções antes de map/filter para questão ${index + 1}:`, options);
            options = options.map(o => String(o || '').trim()).filter(Boolean);
            console.log(`📝 Opções após map/filter para questão ${index + 1}:`, options, 'quantidade:', options.length);
            
            // Garantir 4 opções preenchendo com placeholders se necessário
            while (options.length < 4) {
                const idx = options.length;
                options.push(`Opção ${String.fromCharCode(65 + idx)}`);
            }
            if (options.length > 4) options = options.slice(0, 4);
            
            console.log(`✅ Opções finais para questão ${index + 1} (após garantir 4 opções):`, options);

            let correct = q.correctIndex;
            if (!Number.isInteger(correct)) {
                const c = (q.correct || q.correta || q.answer || '').toString().trim().toUpperCase();
                const idx = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(c);
                correct = idx >= 0 ? idx : 0;
            }
            if (correct < 0 || correct >= options.length) correct = 0;

            const normalizedQuestion = {
                id: Date.now() + Math.random(),
                text,
                options,
                correct,
                timeLimit: null
            };
            console.log(`✅ Questão ${index + 1} normalizada com sucesso:`, normalizedQuestion);
            normalized.push(normalizedQuestion);
        });
        
        console.log('✅ Total de questões normalizadas:', normalized.length);
        return normalized;
    };

    app.carregarComponentesSelect = async function(turmaId, targetId, selectedValue = null) {
        const target = document.getElementById(targetId);
        target.innerHTML = '<option value="">Carregando...</option>';
        if(!turmaId) { target.innerHTML = '<option value="">Selecione a turma primeiro...</option>'; return; }
        const comps = await getComponentesByTurma(turmaId);
        if(comps.length === 0) { target.innerHTML = '<option value="">Nenhum componente nesta turma</option>'; return; }
        const userId = app.currentUserData?.id;
        const isProf = app.perms && app.perms.hasRole('professor', 'secretaria');
        const filtered = comps.filter(comp => {
            if (!isProf) return true;
            const hasProfFields = Array.isArray(comp.professores)
                || Array.isArray(comp.professorIds)
                || Boolean(comp.professorId)
                || Boolean(comp.professorUid);
            if (!hasProfFields) return true;
            return app.componentHasProfessor(comp, userId);
        });
        if (filtered.length === 0) {
            target.innerHTML = '<option value="">Nenhum componente vinculado</option>';
            return;
        }
        const parseCompDate = (value) => {
            if (!value) return null;
            const parsed = app.parseDateOnly ? app.parseDateOnly(value) : new Date(value);
            if (!parsed || Number.isNaN(parsed.getTime())) return null;
            return parsed;
        };
        const sorted = [...filtered].sort((a, b) => {
            const aInicio = parseCompDate(a.dataInicio);
            const bInicio = parseCompDate(b.dataInicio);
            if (aInicio && bInicio && aInicio.getTime() !== bInicio.getTime()) {
                return aInicio - bInicio;
            }
            if (aInicio && !bInicio) return -1;
            if (!aInicio && bInicio) return 1;

            const aFim = parseCompDate(a.dataFim);
            const bFim = parseCompDate(b.dataFim);
            if (aFim && bFim && aFim.getTime() !== bFim.getTime()) {
                return aFim - bFim;
            }
            if (aFim && !bFim) return -1;
            if (!aFim && bFim) return 1;

            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
        });

        target.innerHTML = sorted
            .map(c => `<option value="${c.id}" ${selectedValue === c.id ? 'selected' : ''}>${c.nome || 'Componente'}</option>`)
            .join('');
    };

    app.carregarSalasAtividadeSelect = async function(turmaId, targetId, selectedValue = null) {
        const target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = '<option value="">Carregando...</option>';
        if (!turmaId) {
            target.innerHTML = '<option value="">Sala Principal</option>';
            return;
        }
        const salasSnap = await db.collection('atividades_salas').where('turmaId', '==', turmaId).get();
        const salas = salasSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const options = ['<option value="">Sala Principal</option>'].concat(
            salas.map(s => `<option value="${s.id}" ${selectedValue === s.id ? 'selected' : ''}>${s.nome || 'Sala'}</option>`)
        );
        target.innerHTML = options.join('');
    };

    app.handleProvaTurmaChange = function(turmaId, selectedComponenteId = null, selectedSalaId = null, preSelectedAlunosIds = null) {
        app.carregarComponentesSelect(turmaId, 'prova-comp', selectedComponenteId);
        if (document.getElementById('atividade-sala')) {
            app.carregarSalasAtividadeSelect(turmaId, 'atividade-sala', selectedSalaId);
        }
        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (recuperacaoEl && recuperacaoEl.checked) {
            app.carregarAlunosRecuperacao(turmaId, preSelectedAlunosIds);
        }
    };

    app.toggleRecuperacaoAlunosPanel = function(checked) {
        const panel = document.getElementById('recuperacao-alunos-panel');
        if (!panel) return;
        panel.classList.toggle('hidden', !checked);
        app.syncValorProvaByRecuperacao(checked);
        app.updateRecuperacaoSelectionInfo();
        if (checked) {
            const turmaSelect = document.getElementById('prova-turma');
            const turmaId = turmaSelect ? turmaSelect.value : null;
            if (turmaId) app.carregarAlunosRecuperacao(turmaId);
        }
    };

    app.syncValorProvaByRecuperacao = function(isRecuperacao) {
        const valorInput = document.getElementById('prova-valor');
        if (!valorInput) return;

        if (isRecuperacao) {
            if (!valorInput.dataset.valorNormal) {
                valorInput.dataset.valorNormal = valorInput.value || '10';
            }
            valorInput.value = '100';
            valorInput.min = '100';
            valorInput.max = '100';
            valorInput.readOnly = true;
            valorInput.classList.add('bg-gray-100', 'dark:bg-slate-600');
            return;
        }

        valorInput.min = '0';
        valorInput.max = '60';
        valorInput.readOnly = false;
        valorInput.classList.remove('bg-gray-100', 'dark:bg-slate-600');
        if (valorInput.value === '100') {
            valorInput.value = valorInput.dataset.valorNormal || '10';
        }
        delete valorInput.dataset.valorNormal;
    };

    app.updateRecuperacaoPublishButtonLabel = function() {
        const publishButton = document.querySelector('[id^="btn-s-m-"]');
        if (!publishButton) return;

        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (!recuperacaoEl || !recuperacaoEl.checked) {
            publishButton.textContent = 'Publicar';
            return;
        }

        const selectedCount = document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked').length;
        if (selectedCount <= 0) {
            publishButton.textContent = 'Publicar recuperação';
        } else if (selectedCount === 1) {
            publishButton.textContent = 'Publicar e notificar 1 aluno';
        } else {
            publishButton.textContent = `Publicar e notificar ${selectedCount} alunos`;
        }
    };

    app.updateRecuperacaoSelectionInfo = function() {
        const preview = document.getElementById('recuperacao-notify-preview');
        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (!preview || !recuperacaoEl || !recuperacaoEl.checked) {
            app.updateRecuperacaoPublishButtonLabel();
            return;
        }
        const selectedCount = document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked').length;
        if (selectedCount === 0) {
            preview.textContent = 'Nenhum aluno selecionado para notificação.';
        } else if (selectedCount === 1) {
            preview.textContent = '1 aluno será notificado ao publicar esta recuperação.';
        } else {
            preview.textContent = `${selectedCount} alunos serão notificados ao publicar esta recuperação.`;
        }
        app.updateRecuperacaoPublishButtonLabel();
    };

    app.carregarAlunosRecuperacao = async function(turmaId, preSelectedIds = null) {
        const lista = document.getElementById('recuperacao-alunos-lista');
        if (!lista) return;
        if (!turmaId) {
            lista.innerHTML = '<span class="text-xs text-gray-400 italic">Selecione uma turma para carregar os alunos.</span>';
            return;
        }
        lista.innerHTML = '<span class="text-xs text-gray-400 italic">Carregando alunos...</span>';
        try {
            const turma = await getTurmaById(turmaId);
            const alunosIds = turma?.alunos || [];
            const users = await app.getCollection('users');
            const alunos = users
                .filter(u => u.tipo === 'aluno' && alunosIds.includes(u.id))
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
            // Determine pre-selected IDs: passed param, or from provaEdit stored on closure
            let selected = Array.isArray(preSelectedIds) ? new Set(preSelectedIds) : null;
            if (!selected) {
                // Try to read from the panel's existing checked checkboxes (already loaded)
                const existing = lista.querySelectorAll('input[type=checkbox][data-aluno-id]:checked');
                if (existing.length > 0) {
                    selected = new Set(Array.from(existing).map(el => el.dataset.alunoId));
                } else {
                    selected = new Set();
                }
            }
            if (alunos.length === 0) {
                lista.innerHTML = '<span class="text-xs text-gray-400 italic">Nenhum aluno matriculado nesta turma.</span>';
                app.updateRecuperacaoSelectionInfo();
                return;
            }
            lista.innerHTML = alunos.map(a => `
                <label class="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30">
                    <input type="checkbox" data-aluno-id="${a.id}" ${selected.has(a.id) ? 'checked' : ''} class="w-4 h-4 accent-orange-600" onchange="app.updateRecuperacaoSelectionInfo()">
                    <span class="text-gray-700 dark:text-gray-200">${app.escapeHtml(a.nome || a.id)}</span>
                </label>
            `).join('');
            app.updateRecuperacaoSelectionInfo();
        } catch (err) {
            lista.innerHTML = '<span class="text-xs text-red-400">Erro ao carregar alunos.</span>';
            console.error('Erro carregarAlunosRecuperacao:', err);
        }
    };

    app.selecionarTodosAlunosRecuperacao = function(select) {
        const lista = document.getElementById('recuperacao-alunos-lista');
        if (!lista) return;
        lista.querySelectorAll('input[type=checkbox][data-aluno-id]').forEach(el => { el.checked = select; });
        app.updateRecuperacaoSelectionInfo();
    };

    app.addQuestao = function() {
        const enun = document.getElementById('q-enunciado').value; const op1 = document.getElementById('q-op1').value; const op2 = document.getElementById('q-op2').value; const op3 = document.getElementById('q-op3').value; const op4 = document.getElementById('q-op4').value;
        if(!enun || !op1 || !op2) return alert("Preencha enunciado e pelo menos 2 opções.");
        app.tempQuestoes.push({ id: Date.now(), text: enun, options: [op1, op2, op3, op4].filter(o => o), correct: 0, timeLimit: null });
        app.renderListaQuestoes();
        document.getElementById('q-enunciado').value = ''; document.getElementById('q-op1').value = ''; document.getElementById('q-op2').value = ''; document.getElementById('q-op3').value = ''; document.getElementById('q-op4').value = '';
    };

    app.renderListaQuestoes = function() {
        const div = document.getElementById('lista-questoes');
        if (!div) return; 
        const safe = app.escapeHtml || ((v) => String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;'));
        const editingIndex = Number.isInteger(app._editingQuestaoIndex) ? app._editingQuestaoIndex : -1;
        if (!app.tempQuestoes || app.tempQuestoes.length === 0) {
            div.innerHTML = '<div class="text-xs text-gray-500">Nenhuma questao adicionada.</div>';
            return;
        }
        div.innerHTML = app.tempQuestoes.map((q, i) => {
            const opts = Array.isArray(q.options) ? q.options : [];
            const isEditing = i === editingIndex;
            if (isEditing) {
                const o1 = opts[0] || '';
                const o2 = opts[1] || '';
                const o3 = opts[2] || '';
                const o4 = opts[3] || '';
                return `
                    <div class="text-sm bg-white dark:bg-slate-800 p-3 rounded border dark:border-slate-600">
                        <div class="flex items-center justify-between mb-2">
                            <div class="font-bold">Editando ${i + 1}</div>
                            <div class="flex gap-2 text-xs">
                                <button onclick="app.saveEditQuestao(${i})" data-loading-label="Salvando questao..." class="px-2 py-1 bg-emerald-600 text-white rounded">Salvar</button>
                                <button onclick="app.cancelEditQuestao()" class="px-2 py-1 bg-gray-200 dark:bg-slate-600 dark:text-white rounded">Cancelar</button>
                            </div>
                        </div>
                        <div class="mb-2">
                            <input id="edit-q-text" value="${safe(q.text || '')}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Enunciado">
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <input id="edit-q-op1" value="${safe(o1)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao A">
                            <input id="edit-q-op2" value="${safe(o2)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao B">
                            <input id="edit-q-op3" value="${safe(o3)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao C">
                            <input id="edit-q-op4" value="${safe(o4)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao D">
                        </div>
                        <div>
                            <select id="edit-q-correct" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="0" ${q.correct === 0 ? 'selected' : ''}>Correta: A</option>
                                <option value="1" ${q.correct === 1 ? 'selected' : ''}>Correta: B</option>
                                <option value="2" ${q.correct === 2 ? 'selected' : ''}>Correta: C</option>
                                <option value="3" ${q.correct === 3 ? 'selected' : ''}>Correta: D</option>
                            </select>
                        </div>
                    </div>
                `;
            }
            return `
                <div class="text-sm bg-white dark:bg-slate-800 p-2 rounded border dark:border-slate-600 flex justify-between items-center">
                    <div class="truncate flex-1">
                        <span class="font-bold mr-2">${i+1}.</span>
                        <span>${safe(q.text || '')}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                        <button onclick="app.startEditQuestao(${i})" class="text-blue-500"><i class="fas fa-pen"></i></button>
                        <button onclick="app.removeQuestao(${i})" class="text-red-500"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    };
    
    app.removeQuestao = function(index) { app.tempQuestoes.splice(index, 1); app.renderListaQuestoes(); };

    app.startEditQuestao = function(index) {
        app._editingQuestaoIndex = index;
        app.renderListaQuestoes();
    };

    app.cancelEditQuestao = function() {
        app._editingQuestaoIndex = -1;
        app.renderListaQuestoes();
    };

    app.saveEditQuestao = function(index) {
        const text = (document.getElementById('edit-q-text')?.value || '').trim();
        const op1 = (document.getElementById('edit-q-op1')?.value || '').trim();
        const op2 = (document.getElementById('edit-q-op2')?.value || '').trim();
        const op3 = (document.getElementById('edit-q-op3')?.value || '').trim();
        const op4 = (document.getElementById('edit-q-op4')?.value || '').trim();
        const correct = parseInt(document.getElementById('edit-q-correct')?.value || '0', 10);
        if (!text || !op1 || !op2 || !op3 || !op4) return alert('Preencha enunciado e 4 opcoes.');
        if (!app.tempQuestoes[index]) return;
        app.tempQuestoes[index] = {
            ...app.tempQuestoes[index],
            text,
            options: [op1, op2, op3, op4],
            correct: Number.isInteger(correct) ? correct : 0,
            timeLimit: null
        };
        app._editingQuestaoIndex = -1;
        app.renderListaQuestoes();
    };

    app.iniciarProva = async function(provaId) {
        const resultados = (await app.getCollection('provas_resultados')).filter(r => r.provaId === provaId && r.alunoId === app.currentUserData.id);
        const prova = await getProvaById(provaId);
        const nomeAvaliacaoCap = prova?.tipo === 'atividade' ? 'Atividade EAD' : 'Prova';
        if(!prova) return alert('Prova não encontrada.');
        if (app.perms && app.perms.isAluno() && prova.published !== true) return alert(`${nomeAvaliacaoCap} ainda não publicada.`);
        const disponibilidade = app.getAvaliacaoDisponibilidade(prova, { resultados });
        if (!disponibilidade.available) return alert(disponibilidade.message);
        if (!prova.questions || prova.questions.length === 0) return alert(`${nomeAvaliacaoCap} sem questões.`);
        
        // DEBUG: Log detalhado da prova carregada
        console.log('🔍 Prova carregada do banco:', {
            id: prova.id,
            titulo: prova.titulo,
            provaRecuperacao: prova.provaRecuperacao,
            qtdQuestoes: prova.questions.length,
            questao1: prova.questions[0]
        });
        
        app.activeExamData = prova; app.activeExamData.id = provaId; app.activeExamAnswers = new Array(prova.questions.length).fill(null); app.currentQuestionIndex = 0;
        app.renderPassoQuestao();
    };

    app.renderPassoQuestao = function() {
        const q = app.activeExamData.questions[app.currentQuestionIndex];
        const hasTimeLimit = Number.isInteger(q.timeLimit) && q.timeLimit > 0;
        app.timeLeft = hasTimeLimit ? q.timeLimit : null;
        app._selectedExamOption = null;
        const content = document.getElementById('content-area');
        const finalizarLabel = app.activeExamData?.tipo === 'atividade' ? 'Finalizar Atividade EAD' : 'Finalizar Prova';
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        
        // DEBUG: Log detalhado das opções
        console.log(`🔍 Renderizando questão ${app.currentQuestionIndex + 1}:`, {
            text: q.text,
            optionsCount: (q.options || []).length,
            options: q.options,
            optionsEmpty: (q.options || []).every(o => !String(o || '').trim())
        });
        
        const optionsHtml = (q.options || []).map((opt, idx) => {
            const letter = letters[idx] || String.fromCharCode(65 + idx);
            const optText = String(opt || '').trim();
            const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
            const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
            return `<div class="exam-option p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition select-none" onclick="app.selectExamOption(${idx})"><div class="flex items-center gap-3"><div class="exam-option-circle w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 transition-all"><div class="exam-option-dot w-3 h-3 bg-blue-600 rounded-full hidden"></div></div><span class="text-gray-700 dark:text-gray-300 font-medium">${displayText}</span></div></div>`;
        }).join('');
        content.innerHTML = `<div class="max-w-2xl mx-auto min-h-[80vh] flex flex-col justify-center"><div class="mb-6 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400"><span>Questão ${app.currentQuestionIndex + 1} de ${app.activeExamData.questions.length}</span>${hasTimeLimit ? `<span class="font-mono font-bold text-xl text-blue-600 dark:text-blue-400" id="timer-display">${app.timeLeft}s</span>` : ''}</div>${hasTimeLimit ? `<div class="w-full bg-gray-200 rounded-full h-2 mb-6 dark:bg-slate-700 overflow-hidden"><div id="timer-bar" class="bg-blue-600 h-2 rounded-full timer-bar" style="width: 100%"></div></div>` : ''}<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border dark:border-slate-700 mb-6 fade-in"><h3 class="text-xl font-bold mb-6 dark:text-white leading-relaxed">${q.text}</h3><div class="space-y-3">${optionsHtml}</div></div><button id="btn-proxima" onclick="app.proximaQuestao()" class="w-full py-4 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 shadow-lg transition transform active:scale-95">${app.currentQuestionIndex === app.activeExamData.questions.length - 1 ? finalizarLabel : 'Próxima Questão'}</button></div>`;
        if(app.questionTimer) clearInterval(app.questionTimer);
        if (hasTimeLimit) {
            const timerDisplay = document.getElementById('timer-display'); const timerBar = document.getElementById('timer-bar'); const totalTime = app.timeLeft;
            app.questionTimer = setInterval(() => { app.timeLeft--; if (timerDisplay) timerDisplay.textContent = app.timeLeft + 's'; const pct = (app.timeLeft / totalTime) * 100; if (timerBar) timerBar.style.width = pct + '%'; if (pct < 30 && timerBar) timerBar.classList.replace('bg-blue-600', 'bg-red-500'); if (app.timeLeft <= 0) { app.proximaQuestao(true); } }, 1000);
        } else {
            app.questionTimer = null;
        }
    };

    app.proximaQuestao = function(forced = false) {
        clearInterval(app.questionTimer);
        const selectedIdx = (app._selectedExamOption !== null && app._selectedExamOption !== undefined) ? app._selectedExamOption : null;
        if (forced && selectedIdx === null) { app.activeExamAnswers[app.currentQuestionIndex] = -1; app.showToast('Tempo esgotado!', 'error'); }
        else if (selectedIdx === null) { if(!confirm('Tem certeza que deseja pular sem responder?')) { app.renderPassoQuestao(); return; } app.activeExamAnswers[app.currentQuestionIndex] = -1; }
        else { app.activeExamAnswers[app.currentQuestionIndex] = selectedIdx; }
        if (app.currentQuestionIndex < app.activeExamData.questions.length - 1) { app.currentQuestionIndex++; app.renderPassoQuestao(); } else { app.finalizarProva(); }
    };

    app.selectExamOption = function(idx) {
        app._selectedExamOption = idx;
        const options = document.querySelectorAll('.exam-option');
        options.forEach(function(el, i) {
            const circle = el.querySelector('.exam-option-circle');
            const dot = el.querySelector('.exam-option-dot');
            if (i === idx) {
                el.classList.add('border-blue-600', 'bg-blue-50');
                el.classList.remove('border-gray-200');
                if (circle) { circle.classList.add('border-blue-600', 'bg-blue-100'); circle.classList.remove('border-gray-300'); }
                if (dot) dot.classList.remove('hidden');
            } else {
                el.classList.remove('border-blue-600', 'bg-blue-50');
                el.classList.add('border-gray-200');
                if (circle) { circle.classList.remove('border-blue-600', 'bg-blue-100'); circle.classList.add('border-gray-300'); }
                if (dot) dot.classList.add('hidden');
            }
        });
    };

    app.finalizarProva = async function() {
        if (!app.activeExamData || !app.activeExamData.id) return;
        let acertos = 0;
        app.activeExamData.questions.forEach((q, i) => { if (app.activeExamAnswers[i] === q.correct) acertos++; });
        const valorProva = parseFloat(app.activeExamData.valor) || 10;
        const notaBruta = (acertos / app.activeExamData.questions.length) * valorProva;
        const nota = app.activeExamData.provaRecuperacao ? Math.min(60, notaBruta) : notaBruta;
        document.getElementById('content-area').innerHTML = `<div class="flex flex-col items-center justify-center h-[60vh]"><div class="loading border-blue-600 border-4 w-16 h-16 mb-4"></div><p>Enviando respostas...</p></div>`;
        try {
            const provaAtual = await getProvaById(app.activeExamData.id);
            if (!provaAtual) throw new Error('A prova não está mais disponível.');
            const resultados = (await app.getCollection('provas_resultados')).filter(r => r.provaId === app.activeExamData.id && r.alunoId === app.currentUserData.id);
            const disponibilidade = app.getAvaliacaoDisponibilidade(provaAtual, { resultados });

            if (!disponibilidade.available) {
                resetActiveExamState();
                alert(disponibilidade.message);
                app.renderContent();
                return;
            }

            await createProvaResultado({
                provaId: app.activeExamData.id,
                alunoId: app.currentUserData.id,
                nota: nota.toFixed(1),
                respostas: app.activeExamAnswers
            });
            if (app.logAcesso) {
                const tipoBase = app.activeExamData.tipo === 'atividade' ? 'atividade' : 'prova';
                const detalhe = app.activeExamData.titulo ? `${tipoBase}:${app.activeExamData.titulo}` : `${tipoBase}:${app.activeExamData.id}`;
                app.logAcesso(`${tipoBase}_realizada`, detalhe);
            }
            const avaliacaoFinalizada = app.activeExamData?.tipo === 'atividade' ? 'Atividade EAD' : 'Prova';
            resetActiveExamState();
            alert(`${avaliacaoFinalizada} Finalizada!\n\nVocê acertou ${acertos} de ${provaAtual.questions.length}.\nNota Final: ${nota.toFixed(1)}`);
            app.renderContent();
        } catch (error) {
            console.error('Erro ao finalizar prova:', error);
            resetActiveExamState();
            alert(`Erro ao finalizar prova: ${error.message || error}`);
            app.renderContent();
        }
    };

    // keep minimal placeholders for other features so callers don't fail
}